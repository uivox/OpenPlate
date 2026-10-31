/**
 * Offline product pack: products sold in Germany from Open Food Facts, downloaded once, so barcodes
 * and product search work without a connection. Pure: no React Native imports (the download and the
 * storage are in packStore(.web).ts).
 *
 * How a pack is made and trusted:
 * - `.github/workflows/offline-pack.yml` filters Open Food Facts' weekly export (scripts/build-offline-pack.mjs,
 *   using `packRow` below), signs a manifest with an Ed25519 key that only exists as a GitHub secret, and
 *   publishes both to the `offline-pack` branch.
 * - The app downloads the signed manifest, checks the signature against PACK_PUBLIC_KEY, then downloads
 *   the product file and checks its size and SHA-512 against the manifest. Only then is it saved. A changed
 *   file, a fake manifest or an older pack (replayed to roll back fixes) is refused.
 * - Every row is checked again when it is used (barcode, nutrients), like data straight from Open Food Facts.
 *
 * File format (UTF-8, one product per line, tab-separated, most scanned first):
 *   code  name  brands  stores  unit(g|ml)  servingGrams  servingLabel  kcal protein carbs fat sugar fiber satFat salt  searchText
 * Empty fields are unknown values. `searchText` is name, brands and stores folded by `foldSearch`.
 *
 * Data: Open Food Facts, Open Database License (ODbL) 1.0. The pack is a derived database under the same licence.
 */
import { checkBarcode } from './barcode';
import { base64ToBytes, utf8, verifyEd25519 } from './ed25519';
import { checkPer100, MAX_KCAL_PER_100G } from './labelScan';
import { parseRetailer, RETAILERS } from './openFoodFacts';
import type { Food, Nutrients } from './types';

/**
 * Public half of the pack signing key (base64, 32 bytes); the private half exists only as the
 * OFFLINE_PACK_PRIVATE_KEY secret of the `offline-pack` environment. A new key needs a new release with
 * its public half here (docs/CONTRIBUTING.md → "Offline product pack"). Empty: the app says the pack isn't available.
 */
export const PACK_PUBLIC_KEY: string = 'JOBYr/V8FeuFt8Cr8OO8LV1/Hcw6a49bCZQuWJzGmH8=';

export const PACK_COUNTRY = 'de';
/** Where the pack workflow publishes (the `offline-pack` branch). raw.githubusercontent.com allows browser requests (CORS). */
export const PACK_BASE_URL = 'https://raw.githubusercontent.com/uivox/Tellerwerk/offline-pack/';
export const PACK_MANIFEST_URL = `${PACK_BASE_URL}${PACK_COUNTRY}/manifest.json`;
export const PACK_FORMAT = 1;
/** Hard limits; the builder stays below them. */
export const MAX_PACK_BYTES = 40 * 1024 * 1024;
export const MAX_PACK_ROWS = 600_000;
export const PACK_FIELDS = 16;

export type PackFailure = 'not_configured' | 'offline' | 'server' | 'signature' | 'corrupt' | 'older' | 'too_large' | 'storage';

export class PackError extends Error {
  constructor(public reason: PackFailure, detail?: string) {
    super(detail ? `${reason}: ${detail}` : reason);
    this.name = 'PackError';
  }
}

export interface PackManifest {
  format: number;
  country: string;
  /** When the pack was built (ISO date-time, UTC). */
  created: string;
  rows: number;
  bytes: number;
  /** SHA-512 of the product file, lowercase hex. */
  sha512: string;
  /** Path of the product file below PACK_BASE_URL, e.g. "de/products-0123456789abcdef.txt". */
  file: string;
  source: string;
  license: string;
}

/* ---------- Text folding (shared by the builder and the app) ---------- */

/** Everything but letters (Latin, Greek, Cyrillic) and digits; no `\p{…}` classes, so older engines read it too. */
const LETTERS_DIGITS = /[^a-z0-9\u00df-\u024f\u0370-\u03ff\u0400-\u04ff]+/g;

/** Lowercase, no accents, ß → ss, only letters and digits separated by single spaces. */
export function foldSearch(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .replace(LETTERS_DIGITS, ' ')
    .trim();
}

/** Text from outside for one field: no tabs, line breaks or control characters, short. */
export function cleanField(s: string | undefined, max: number): string {
  if (!s) return '';
  const t = s
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029<>]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return t.length > max ? t.slice(0, max).trim() : t;
}

/* ---------- Building rows (scripts/build-offline-pack.mjs) ---------- */

const numField = (v: string | undefined): number | undefined => {
  if (v === undefined || v.trim() === '') return undefined;
  const n = Number(v.trim().replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
};
const fmt = (n: number | undefined) => (n === undefined ? '' : String(Math.round(n * 100) / 100));

/**
 * Brand names from `brands_tags` ("xx:nutella,xx:Ferrero" → "nutella, Ferrero"). The export has no
 * `brands` column any more (since 2026; `brands_en` holds the names), so the tags are the last fallback.
 */
function brandsFromTags(tags: string | undefined): string {
  return (tags ?? '')
    .split(',')
    .map((t) => t.replace(/^[a-z]{2}:/, '').trim())
    .filter(Boolean)
    .join(', ');
}

/**
 * One line of the pack from a row of Open Food Facts' CSV export (columns by name), or null when
 * the product is left out: invalid barcode, no name, missing calories/protein/carbs/fat, or values
 * that don't fit together. Returns the product's scan count too, for ordering.
 */
export function packRow(rec: Record<string, string | undefined>): { code: string; line: string; scans: number } | null {
  const check = checkBarcode(rec.code ?? '');
  if (!check.ok) return null;
  const name = cleanField(rec.product_name_de || rec.product_name || rec.generic_name_de || rec.generic_name, 120);
  if (!name || !/[a-zA-Z\u00c0-\u024f\u0370-\u04ff]/.test(name)) return null;

  const kcalField = numField(rec['energy-kcal_100g']);
  const kj = numField(rec['energy-kj_100g']) ?? numField(rec['energy_100g']);
  const kcal = kcalField !== undefined && kcalField >= 0 && kcalField <= MAX_KCAL_PER_100G ? kcalField : kj !== undefined ? kj / 4.184 : undefined;
  const protein = numField(rec.proteins_100g);
  const carbs = numField(rec.carbohydrates_100g);
  const fat = numField(rec.fat_100g);
  if (kcal === undefined || protein === undefined || carbs === undefined || fat === undefined) return null;
  const sodium = numField(rec.sodium_100g);
  const per100: Nutrients = {
    kcal,
    protein,
    carbs,
    fat,
    sugar: numField(rec.sugars_100g),
    fiber: numField(rec.fiber_100g),
    satFat: numField(rec['saturated-fat_100g']),
    salt: numField(rec.salt_100g) ?? (sodium !== undefined ? sodium * 2.5 : undefined),
  };
  const checked = checkPer100(per100);
  if (!checked.per100 || checked.issues.length) return null;

  const quantity = rec.quantity ?? '';
  const unit = /\b\d+([.,]\d+)?\s*(ml|cl|l)\b/i.test(quantity) ? 'ml' : 'g';
  const servingG = numField(rec.serving_quantity);
  const serving = servingG !== undefined && servingG > 0 && servingG <= 2000 ? servingG : undefined;
  const brands = cleanField(rec.brands || rec.brands_en || brandsFromTags(rec.brands_tags), 80);
  const stores = cleanField(rec.stores, 60);
  const fields = [
    check.code,
    name,
    brands,
    stores,
    unit,
    fmt(serving),
    serving !== undefined ? cleanField(rec.serving_size, 30) : '',
    fmt(per100.kcal),
    fmt(per100.protein),
    fmt(per100.carbs),
    fmt(per100.fat),
    fmt(per100.sugar),
    fmt(per100.fiber),
    fmt(per100.satFat),
    fmt(per100.salt),
    foldSearch(`${name} ${brands} ${stores}`),
  ];
  const scans = numField(rec.unique_scans_n) ?? 0;
  return { code: check.code, line: fields.join('\t'), scans: scans > 0 ? scans : 0 };
}

/* ---------- Reading rows ---------- */

const optional = (v: string) => {
  if (v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};

/** A food from one pack line; undefined when the line is broken or its values don't pass the checks. */
export function foodFromPackLine(line: string): Food | undefined {
  const f = line.split('\t');
  if (f.length !== PACK_FIELDS) return undefined;
  const [code, name, brands, , unit, servingG, servingLabel] = f;
  const check = checkBarcode(code);
  if (!check.ok || !name) return undefined;
  const per100: Nutrients = { kcal: Number(f[7]), protein: Number(f[8]), carbs: Number(f[9]), fat: Number(f[10]) };
  if ([f[7], f[8], f[9], f[10]].some((v) => v === '')) return undefined;
  const extra = { sugar: optional(f[11]), fiber: optional(f[12]), satFat: optional(f[13]), salt: optional(f[14]) };
  for (const [k, v] of Object.entries(extra)) if (v !== undefined) (per100 as unknown as Record<string, number>)[k] = v;
  const checked = checkPer100(per100);
  if (!checked.per100) return undefined;
  const u: 'g' | 'ml' = unit === 'ml' ? 'ml' : 'g';
  const sg = Number(servingG);
  return {
    id: `off:${check.code}`,
    source: 'off',
    name: cleanField(name, 120),
    brand: cleanField(brands.split(',')[0], 80) || undefined,
    barcode: check.code,
    per100: checked.per100,
    unit: u,
    servings: servingG && sg > 0 && sg <= 2000 ? [{ label: cleanField(servingLabel, 30) || `${sg} ${u}`, grams: sg }] : [],
  };
}

/* ---------- The loaded pack ---------- */

const MAX_CANDIDATES = 400;

/** The pack in memory: the text as one string, plus line offsets and a sorted barcode index. */
export class PackIndex {
  private starts: Int32Array;
  private codes: Float64Array;
  private order: Int32Array;

  constructor(private text: string) {
    let n = 0;
    for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) n++;
    if (text.length && !text.endsWith('\n')) n++;
    if (n > MAX_PACK_ROWS) throw new PackError('too_large');
    this.starts = new Int32Array(n + 1);
    this.codes = new Float64Array(n);
    let pos = 0;
    for (let r = 0; r < n; r++) {
      this.starts[r] = pos;
      const tab = text.indexOf('\t', pos);
      const code = tab === -1 ? '' : text.slice(pos, tab);
      if (!/^\d{8,14}$/.test(code)) throw new PackError('corrupt', `line ${r + 1}`);
      this.codes[r] = Number(code);
      const nl = text.indexOf('\n', pos);
      pos = nl === -1 ? text.length : nl + 1;
    }
    this.starts[n] = pos;
    const order = Array.from({ length: n }, (_, i) => i);
    // Equal codes keep file order, so the most scanned entry wins.
    order.sort((a, b) => this.codes[a] - this.codes[b] || a - b);
    this.order = Int32Array.from(order);
  }

  get size(): number {
    return this.codes.length;
  }

  private line(r: number): string {
    const end = this.starts[r + 1];
    return this.text.slice(this.starts[r], this.text[end - 1] === '\n' ? end - 1 : end);
  }

  /** The product for a barcode (leading zeros don't matter, as in `sameBarcode`). */
  lookup(input: string): Food | undefined {
    const check = checkBarcode(input);
    if (!check.ok) return undefined;
    const want = Number(check.code);
    let lo = 0;
    let hi = this.order.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const v = this.codes[this.order[mid]];
      if (v < want) lo = mid + 1;
      else if (v > want) hi = mid - 1;
      else {
        // first of equal codes
        let first = mid;
        while (first > 0 && this.codes[this.order[first - 1]] === want) first--;
        return foodFromPackLine(this.line(this.order[first]));
      }
    }
    return undefined;
  }

  private rowAt(pos: number): number {
    let lo = 0;
    let hi = this.codes.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.starts[mid] <= pos) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  /**
   * Products whose name, brand or store contains every word of the query. The most scanned come
   * first, names that start with the query and products of an asked-for supermarket ("lidl skyr") before others.
   */
  search(query: string, limit = 30): Food[] {
    if (!this.codes.length) return [];
    const { retailer, rest } = parseRetailer(query);
    const words = foldSearch(retailer ? rest : query)
      .split(' ')
      .filter((w) => w.length >= 2);
    if (!words.length) return [];
    const anchor = [...words].sort((a, b) => b.length - a.length)[0];
    const phrase = words.join(' ');
    const hits: { row: number; score: number }[] = [];
    let lastRow = -1;
    for (let pos = this.text.indexOf(anchor); pos !== -1 && hits.length < MAX_CANDIDATES; pos = this.text.indexOf(anchor, pos + 1)) {
      const row = this.rowAt(pos);
      if (row === lastRow) continue;
      const line = this.line(row);
      const searchStart = this.starts[row] + line.lastIndexOf('\t') + 1;
      if (pos < searchStart) {
        // the word appeared in another column; jump to this line's search text
        pos = searchStart - 1;
        continue;
      }
      lastRow = row;
      const hay = line.slice(line.lastIndexOf('\t') + 1);
      if (!words.every((w) => hay.includes(w))) continue;
      let score = 0;
      if (hay.startsWith(phrase)) score += 2;
      if (words.every((w) => hay.startsWith(w) || hay.includes(` ${w}`))) score += 1;
      if (retailer && retailerMatch(retailer, line)) score += 4;
      hits.push({ row, score });
    }
    hits.sort((a, b) => b.score - a.score || a.row - b.row);
    const out: Food[] = [];
    for (const h of hits) {
      const f = foodFromPackLine(this.line(h.row));
      if (f) out.push(f);
      if (out.length >= limit) break;
    }
    return out;
  }
}

function retailerMatch(r: (typeof RETAILERS)[number], line: string): boolean {
  const f = line.split('\t');
  const parts = (s: string) => foldSearch(s.replace(/,/g, ' , ')).split(' , ').map((p) => p.trim());
  const brands = parts(f[2] ?? '');
  const stores = parts(f[3] ?? '');
  const has = (needles: string[], hay: string[]) => needles.some((n) => n && hay.some((p) => p === n || p.startsWith(`${n} `)));
  return has(r.names, stores) || has(r.names, brands) || has(r.brands.map(foldSearch), brands);
}

/* ---------- Manifest and signature ---------- */

const FILE_PATH = /^de\/products-[0-9a-f]{16}\.txt$/;

/**
 * Checks a downloaded manifest envelope `{ "signed": "<manifest JSON>", "signature": "<base64>" }`:
 * the signature by `publicKey` over exactly the `signed` text, then every field of the manifest.
 */
export function readEnvelope(raw: unknown, publicKey: string, now = Date.now()): PackManifest {
  if (!publicKey) throw new PackError('not_configured');
  const key = base64ToBytes(publicKey);
  if (!key || key.length !== 32) throw new PackError('not_configured', 'bad public key');
  const env = raw as { signed?: unknown; signature?: unknown } | null;
  if (!env || typeof env !== 'object' || typeof env.signed !== 'string' || typeof env.signature !== 'string') throw new PackError('signature', 'envelope');
  if (env.signed.length > 4096) throw new PackError('signature', 'manifest too long');
  const sig = base64ToBytes(env.signature);
  if (!sig || sig.length !== 64 || !verifyEd25519(key, utf8(env.signed), sig)) throw new PackError('signature');

  let m: Record<string, unknown>;
  try {
    m = JSON.parse(env.signed) as Record<string, unknown>;
  } catch {
    throw new PackError('corrupt', 'manifest');
  }
  const created = typeof m.created === 'string' ? Date.parse(m.created) : NaN;
  const ok =
    m.format === PACK_FORMAT &&
    m.country === PACK_COUNTRY &&
    Number.isFinite(created) &&
    created <= now + 24 * 3600_000 &&
    Number.isInteger(m.rows) &&
    (m.rows as number) > 0 &&
    Number.isInteger(m.bytes) &&
    (m.bytes as number) > 0 &&
    typeof m.sha512 === 'string' &&
    /^[0-9a-f]{128}$/.test(m.sha512) &&
    typeof m.file === 'string' &&
    FILE_PATH.test(m.file) &&
    m.file === `de/products-${(m.sha512 as string).slice(0, 16)}.txt`;
  if (!ok) throw new PackError('corrupt', 'manifest fields');
  if ((m.bytes as number) > MAX_PACK_BYTES || (m.rows as number) > MAX_PACK_ROWS) throw new PackError('too_large');
  return {
    format: PACK_FORMAT,
    country: PACK_COUNTRY,
    created: new Date(created).toISOString(),
    rows: m.rows as number,
    bytes: m.bytes as number,
    sha512: m.sha512 as string,
    file: m.file as string,
    source: typeof m.source === 'string' ? cleanField(m.source, 60) : 'Open Food Facts',
    license: typeof m.license === 'string' ? cleanField(m.license, 60) : 'ODbL 1.0',
  };
}

/* ---------- Install ---------- */

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** A product file that was downloaded to a temporary place, not yet kept. */
export interface DownloadedPack {
  text: string;
  /** SHA-512 of the file's bytes, lowercase hex. */
  sha512: string;
  bytes: number;
  /** Keeps it as the installed pack, with the manifest envelope it was checked against. */
  commit(envelopeJson: string): Promise<void>;
  discard(): Promise<void>;
}

export type DownloadFn = (url: string, onProgress: (received: number) => void, signal?: AbortSignal) => Promise<DownloadedPack>;

export interface RemotePack {
  manifest: PackManifest;
  envelopeJson: string;
}

/** The newest signed manifest on the server. */
export async function fetchRemoteManifest(publicKey: string, fetchImpl: FetchLike, now = Date.now()): Promise<RemotePack> {
  if (!publicKey) throw new PackError('not_configured');
  let res: Response;
  try {
    res = await fetchImpl(PACK_MANIFEST_URL, { headers: { Accept: 'application/json' }, cache: 'no-store' });
  } catch {
    throw new PackError('offline');
  }
  if (res.status === 404) throw new PackError('not_configured', 'no pack published yet');
  if (!res.ok) throw new PackError('server', String(res.status));
  const envelopeJson = await res.text();
  if (envelopeJson.length > 16_384) throw new PackError('corrupt', 'envelope too long');
  let raw: unknown;
  try {
    raw = JSON.parse(envelopeJson);
  } catch {
    throw new PackError('corrupt', 'envelope');
  }
  return { manifest: readEnvelope(raw, publicKey, now), envelopeJson };
}

/**
 * Downloads, checks and keeps the pack described by `remote`. Refuses a pack older than the installed one.
 * Nothing is kept unless size, SHA-512 and every line check out.
 */
export async function installPack(
  remote: RemotePack,
  installed: PackManifest | null,
  download: DownloadFn,
  onProgress: (received: number) => void = () => {},
  signal?: AbortSignal,
): Promise<{ manifest: PackManifest; index: PackIndex }> {
  const { manifest } = remote;
  if (installed && Date.parse(manifest.created) < Date.parse(installed.created)) throw new PackError('older');
  const file = await download(`${PACK_BASE_URL}${manifest.file}`, onProgress, signal);
  try {
    if (file.bytes !== manifest.bytes) throw new PackError('corrupt', `size ${file.bytes} ≠ ${manifest.bytes}`);
    if (file.sha512.toLowerCase() !== manifest.sha512) throw new PackError('corrupt', 'checksum');
    const index = new PackIndex(file.text);
    if (index.size !== manifest.rows) throw new PackError('corrupt', `rows ${index.size} ≠ ${manifest.rows}`);
    await file.commit(remote.envelopeJson);
    return { manifest, index };
  } catch (e) {
    await file.discard().catch(() => {});
    throw e;
  }
}

/**
 * Reads the installed pack back: the stored envelope is checked again (signature and the file's hash
 * were checked on install; the hash isn't recomputed on every start, the file lives in app storage).
 */
export function openInstalled(envelopeJson: string, text: string, publicKey: string): { manifest: PackManifest; index: PackIndex } {
  let raw: unknown;
  try {
    raw = JSON.parse(envelopeJson);
  } catch {
    throw new PackError('corrupt', 'stored envelope');
  }
  const manifest = readEnvelope(raw, publicKey, Number.MAX_SAFE_INTEGER);
  const index = new PackIndex(text);
  if (index.size !== manifest.rows) throw new PackError('corrupt', 'stored rows');
  return { manifest, index };
}
