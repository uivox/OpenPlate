// Builds the signed offline product pack for Germany from Open Food Facts' CSV export.
//
// Usage (in .github/workflows/offline-pack.yml; the logic modules must be compiled first with
// `npx tsc -p tests/tsconfig.json`):
//   curl -fsSL https://static.openfoodfacts.org/data/en.openfoodfacts.org.products.csv.gz | gzip -dc \
//     | OFFLINE_PACK_PRIVATE_KEY="$(cat key.pem)" node scripts/build-offline-pack.mjs out
//
// Reads the tab-separated export from stdin, keeps products sold in Germany whose barcode, name and
// nutrition pass the same checks the app uses (src/lib/offlinePack.ts → packRow), orders them by how
// often they are scanned, and writes:
//   out/de/products-<sha512 prefix>.txt   the products, one per line
//   out/de/manifest.json                  { signed: "<manifest>", signature: "<Ed25519, base64>" }
//   out/README.md                         licence and attribution (ODbL)
// Before writing, it checks the result exactly as the app will: signature against the public key in
// the app, size, hash, every line. A key that doesn't match the app's stops the build.
import { createHash, createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const out = process.argv[2] ?? 'out';
const lib = await import(pathToFileURL(join(process.cwd(), '.test-build/src/lib/offlinePack.js')).href);
const { packRow, readEnvelope, PackIndex, PACK_PUBLIC_KEY, PACK_FORMAT, PACK_COUNTRY, MAX_PACK_BYTES, MAX_PACK_ROWS, foodFromPackLine } = lib;

/** Stay well below the app's hard limits. */
const TARGET_BYTES = Math.min(MAX_PACK_BYTES - 4 * 1024 * 1024, 32 * 1024 * 1024);
const TARGET_ROWS = Math.min(MAX_PACK_ROWS - 50_000, 500_000);
/** Fewer products than this means the export or the filter broke; don't publish a nearly empty pack. */
const MIN_ROWS = 20_000;

const pem = process.env.OFFLINE_PACK_PRIVATE_KEY ?? '';
if (!pem.trim()) {
  console.error('OFFLINE_PACK_PRIVATE_KEY is not set (see docs/CONTRIBUTING.md → Offline product pack).');
  process.exit(1);
}
const privateKey = createPrivateKey(pem);
const publicKey = createPublicKey(privateKey).export({ format: 'der', type: 'spki' }).subarray(-32).toString('base64');
if (publicKey !== PACK_PUBLIC_KEY) {
  console.error(`The signing key doesn't belong to the app. PACK_PUBLIC_KEY in src/lib/offlinePack.ts must be: ${publicKey}`);
  process.exit(1);
}

const COLUMNS = [
  'code', 'product_name', 'product_name_de', 'generic_name', 'generic_name_de', 'brands', 'brands_en', 'brands_tags', 'stores', 'quantity',
  'serving_size', 'serving_quantity', 'countries_tags', 'unique_scans_n',
  'energy-kcal_100g', 'energy-kj_100g', 'energy_100g', 'proteins_100g', 'carbohydrates_100g', 'fat_100g',
  'sugars_100g', 'fiber_100g', 'saturated-fat_100g', 'salt_100g', 'sodium_100g',
];

const best = new Map(); // code → { line, scans }
let header = null;
let idx = {};
let total = 0;
let germany = 0;
let skippedBroken = 0;

/** One line of the export. Returns false to stop (format changed). */
function handleLine(raw) {
  if (!header) {
    header = raw.split('\t');
    for (const c of COLUMNS) idx[c] = header.indexOf(c);
    for (const required of ['code', 'product_name', 'countries_tags', 'proteins_100g', 'carbohydrates_100g', 'fat_100g']) {
      if (idx[required] === -1) {
        console.error(`The export has no "${required}" column; its format changed.`);
        process.exit(1);
      }
    }
    return;
  }
  total++;
  // Cheap pre-check before splitting ~200 columns: most products aren't sold in Germany.
  if (!raw.includes('en:germany')) return;
  const f = raw.split('\t');
  if (f.length !== header.length) {
    skippedBroken++;
    return;
  }
  if (!f[idx.countries_tags].split(',').includes('en:germany')) return;
  germany++;
  const rec = {};
  for (const c of COLUMNS) if (idx[c] !== -1) rec[c] = f[idx[c]];
  const row = packRow(rec);
  if (!row) return;
  // Keyed by number: `row.code` is a slice of the 64 KB chunk it came from, and keeping it would keep
  // that whole chunk in memory (V8 sliced strings), so the export would pile up. Barcodes have at most
  // 14 digits, well within exact integers. `row.line` is a fresh string (joined).
  const key = Number(row.code);
  const prev = best.get(key);
  if (!prev || row.scans > prev.scans) best.set(key, { line: row.line, scans: row.scans });
}

// The unpacked export is about 10 GB. Reading stdin chunk by chunk with `for await` keeps the pipe's
// backpressure: the next chunk is only read once this one is processed, so memory stays flat.
// (readline's async iterator buffers lines without limit when the input is faster than the loop; that
// ran out of memory in CI.) A line is never kept beyond MAX_LINE characters.
const MAX_LINE = 4 * 1024 * 1024;
const decoder = new TextDecoder('utf-8');
let rest = '';
let tooLong = false;
for await (const chunk of process.stdin) {
  const text = rest + decoder.decode(chunk, { stream: true });
  let start = 0;
  for (let nl = text.indexOf('\n', start); nl !== -1; nl = text.indexOf('\n', start)) {
    const line = text.charCodeAt(nl - 1) === 13 ? text.slice(start, nl - 1) : text.slice(start, nl);
    if (tooLong) {
      tooLong = false;
      skippedBroken++;
    } else handleLine(line);
    start = nl + 1;
  }
  rest = text.slice(start);
  if (rest.length > MAX_LINE) {
    rest = '';
    tooLong = true;
  }
}
rest += decoder.decode();
if (rest && !tooLong) handleLine(rest);

const rows = [...best.entries()].sort((a, b) => b[1].scans - a[1].scans || a[0] - b[0]);
const lines = [];
let bytes = 0;
for (const [, r] of rows) {
  const size = Buffer.byteLength(r.line) + 1;
  if (bytes + size > TARGET_BYTES || lines.length >= TARGET_ROWS) break;
  lines.push(r.line);
  bytes += size;
}
if (lines.length < MIN_ROWS) {
  console.error(`Only ${lines.length} products passed (of ${germany} sold in Germany, ${total} in total). Not publishing.`);
  process.exit(1);
}

const text = `${lines.join('\n')}\n`;
const body = Buffer.from(text, 'utf8');
const sha512 = createHash('sha512').update(body).digest('hex');
const file = `${PACK_COUNTRY}/products-${sha512.slice(0, 16)}.txt`;
const manifest = {
  format: PACK_FORMAT,
  country: PACK_COUNTRY,
  created: new Date().toISOString(),
  rows: lines.length,
  bytes: body.length,
  sha512,
  file,
  source: 'Open Food Facts',
  license: 'ODbL 1.0',
};
const signed = JSON.stringify(manifest);
const signature = sign(null, Buffer.from(signed, 'utf8'), privateKey).toString('base64');
const envelope = `${JSON.stringify({ signed, signature, key: publicKey })}\n`;

// Check the result the way the app will, before anything is written.
const checked = readEnvelope(JSON.parse(envelope), PACK_PUBLIC_KEY);
if (checked.sha512 !== sha512 || checked.rows !== lines.length) throw new Error('manifest check failed');
const index = new PackIndex(text);
if (index.size !== lines.length) throw new Error('index check failed');
let unreadable = 0;
for (const l of lines) if (!foodFromPackLine(l)) unreadable++;
if (unreadable) throw new Error(`${unreadable} lines the app can't read`);
const sample = lines[0].split('\t')[0];
if (!index.lookup(sample)) throw new Error('lookup check failed');

mkdirSync(join(out, PACK_COUNTRY), { recursive: true });
writeFileSync(join(out, file), body);
writeFileSync(join(out, PACK_COUNTRY, 'manifest.json'), envelope);
writeFileSync(
  join(out, 'README.md'),
  [
    '# OpenPlate offline product pack',
    '',
    `Built ${manifest.created} by the "Offline product pack" workflow of OpenPlate. Products sold in Germany with complete,`,
    'plausible nutrition, most scanned first. The OpenPlate app downloads these files on request and checks the',
    'Ed25519 signature in `de/manifest.json` before using them.',
    '',
    'Data: © Open Food Facts contributors, https://world.openfoodfacts.org, available under the',
    'Open Database License (ODbL) 1.0: https://opendatacommons.org/licenses/odbl/1-0/.',
    'This pack is a derived database and is made available under the same licence. Individual contents of the',
    'database are under the Database Contents License: https://opendatacommons.org/licenses/dbcl/1-0/.',
    '',
  ].join('\n'),
);

// The export's columns change now and then (`brands` became `brands_en`); say so when a field goes empty.
const share = (col) => lines.filter((l) => l.split('\t')[col] !== '').length / lines.length;
const brandShare = share(2);
const storeShare = share(3);
for (const [name, v] of [['brand', brandShare], ['store', storeShare]]) {
  if (v < 0.05) console.log(`::warning title=Offline pack::Only ${(v * 100).toFixed(1)} % of products have a ${name}; the export's columns may have changed.`);
}

const summary = [
  `Offline pack: ${lines.length.toLocaleString('en')} products, ${(body.length / 1024 / 1024).toFixed(1)} MB`,
  `(export rows ${total.toLocaleString('en')}, sold in Germany ${germany.toLocaleString('en')}, passed the checks ${best.size.toLocaleString('en')}, broken lines ${skippedBroken})`,
  `With brand ${(brandShare * 100).toFixed(0)} %, with store ${(storeShare * 100).toFixed(0)} %`,
  `File ${file}`,
].join('\n');
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary.replace(/\n/g, '  \n')}\n`);
