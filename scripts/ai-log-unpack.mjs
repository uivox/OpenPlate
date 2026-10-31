// Unpacks AI answer log exports (AI settings → AI answer log → Export) for an evaluation.
// Usage:
//   node scripts/ai-log-unpack.mjs [export.json …] [--out eval/data]
// Without files, every *.json in eval/inbox/ is read. Records from all exports are merged by id
// (the newest export wins), so overlapping exports are fine. Writes, under the output folder:
//   cases/<id>/record.json, cases/<id>/photo-0.jpg …   one folder per AI answer
//   cases.jsonl                                       every record on one line, without photos
//   summary.md                                        numbers per prompt version and model, worst cases
// eval/ is git-ignored: it holds personal meal photos. See .claude/skills/ai-eval/SKILL.md.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const args = process.argv.slice(2);
let out = 'eval/data';
const files = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--out') out = args[++i];
  else files.push(args[i]);
}
if (!files.length && existsSync('eval/inbox')) {
  for (const f of readdirSync('eval/inbox')) if (f.endsWith('.json')) files.push(join('eval/inbox', f));
}
if (!files.length) {
  console.error('No export files. Put tellerwerk-ai-log-*.json into eval/inbox/ or pass them as arguments.');
  process.exit(1);
}

const SAFE_ID = /^[\w-]{1,64}$/;
const casesDir = join(out, 'cases');
mkdirSync(casesDir, { recursive: true });

/* ---------- Merge ---------- */

// Records already unpacked earlier stay part of the data set.
const byId = new Map();
for (const id of readdirSync(casesDir)) {
  const p = join(casesDir, id, 'record.json');
  if (SAFE_ID.test(id) && existsSync(p)) {
    const r = JSON.parse(readFileSync(p, 'utf8'));
    byId.set(id, { record: r, exportedAt: r._exportedAt ?? '' });
  }
}

let added = 0;
let updated = 0;
for (const file of files) {
  const data = JSON.parse(readFileSync(file, 'utf8'));
  if (data?.app !== 'OpenPlate' || data?.kind !== 'ai-log' || !Array.isArray(data.records)) {
    console.error(`${file}: not a Tellerwerk AI log export, skipped.`);
    continue;
  }
  for (const raw of data.records) {
    if (!raw || !SAFE_ID.test(raw.id ?? '')) continue;
    const prev = byId.get(raw.id);
    if (prev && prev.exportedAt >= data.exportedAt) continue;
    const { photos = [], ...record } = raw;
    record._exportedAt = data.exportedAt;
    const dir = join(casesDir, raw.id);
    mkdirSync(dir, { recursive: true });
    record._photos = [];
    photos.forEach((b64, i) => {
      if (typeof b64 !== 'string') return;
      const name = `photo-${i}.jpg`;
      writeFileSync(join(dir, name), Buffer.from(b64, 'base64'));
      record._photos.push(name);
    });
    // A newer export without photos (they were trimmed) keeps the photos already unpacked.
    if (!record._photos.length && prev) record._photos = prev.record._photos ?? [];
    writeFileSync(join(dir, 'record.json'), JSON.stringify(record, null, 2));
    if (prev) updated++;
    else added++;
    byId.set(raw.id, { record, exportedAt: data.exportedAt });
  }
}

const records = [...byId.values()].map((x) => x.record).sort((a, b) => a.createdAt - b.createdAt);
writeFileSync(join(out, 'cases.jsonl'), records.map((r) => JSON.stringify(r)).join('\n') + '\n');

/* ---------- Numbers ---------- */

const median = (xs) => {
  const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const pct = (x) => (x === null ? '–' : `${Math.round(x * 100)} %`);
const num = (x, d = 1) => (x === null ? '–' : x.toFixed(d));
const share = (part, all) => (all ? part / all : null);

/** Final grams per AI item: the diary as it is now wins over what was saved (later edits count). */
function mealItems(r) {
  const ai = r.ai?.items ?? [];
  const outItems = r.outcome?.items ?? [];
  const now = new Map((r.diaryNow ?? []).map((d) => [d.entryId, d]));
  return ai.map((a, i) => {
    const o = outItems[i];
    let grams = o?.kept ? o.grams : 0;
    let kept = !!o?.kept;
    let editedLater = false;
    if (o?.entryId && now.has(o.entryId)) {
      const d = now.get(o.entryId);
      if (!d.exists) {
        kept = false;
        grams = 0;
        editedLater = true;
      } else if (d.grams !== o.grams) {
        grams = d.grams;
        editedLater = true;
      }
    }
    const renamed = !!o && o.name.trim().toLowerCase() !== a.name.trim().toLowerCase();
    return { ai: a, grams, kept, renamed, editedLater, name: o?.name ?? a.name };
  });
}

function mealCase(r) {
  const items = mealItems(r);
  const aiKcal = items.reduce((s, it) => s + it.ai.kcal, 0);
  const finalKcal = items.reduce((s, it) => s + (it.kept && it.ai.grams > 0 ? (it.ai.kcal * it.grams) / it.ai.grams : 0), 0);
  const gramErrors = items.filter((it) => it.kept && it.ai.grams > 0).map((it) => Math.abs(it.grams - it.ai.grams) / it.ai.grams);
  return {
    items,
    aiKcal,
    finalKcal,
    kcalError: finalKcal > 0 ? Math.abs(aiKcal - finalKcal) / finalKcal : null,
    gramErrors,
    removed: items.filter((it) => !it.kept).length,
    renamed: items.filter((it) => it.renamed).length,
    editedLater: items.some((it) => it.editedLater),
  };
}

const FIELDS = [
  ['kcal', 1],
  ['protein', 0.1],
  ['carbs', 0.1],
  ['fat', 0.1],
  ['sugar', 0.1],
  ['fiber', 0.1],
  ['satFat', 0.1],
  ['salt', 0.01],
];

function labelCase(r) {
  const ai = r.ai?.per100 ?? null;
  const saved = r.outcome?.per100 ?? null;
  const fields = {};
  let changed = 0;
  let maxRel = 0;
  if (ai && saved) {
    for (const [f, tol] of FIELDS) {
      const a = ai[f];
      const s = saved[f];
      if (a === undefined && s === undefined) continue;
      const diff = a === undefined || s === undefined ? null : Math.abs(a - s);
      // The form rounds AI values to one decimal (kcal to whole numbers): smaller changes are rounding.
      const isChanged = diff === null ? true : diff > tol + 1e-9;
      fields[f] = { ai: a, saved: s, diff, changed: isChanged };
      if (isChanged) {
        changed++;
        if (diff !== null) maxRel = Math.max(maxRel, diff / Math.max(Math.abs(s), 1));
        else maxRel = Math.max(maxRel, 1);
      }
    }
  }
  const norm = (x) => (x ?? '').trim().toLowerCase();
  return {
    fields,
    changed,
    maxRel,
    nameChanged: !!r.outcome && norm(r.ai?.name ?? r.known?.name) !== norm(r.outcome.name),
    unitChanged: !!r.outcome && r.ai?.unit !== r.outcome.unit,
  };
}

const groupKey = (r) => `${r.kind} · ${r.promptVersion} · ${r.answeredBy ? `${r.answeredBy.provider}/${r.answeredBy.model}` : 'no answer'}`;
const groups = new Map();
for (const r of records) {
  const k = groupKey(r);
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(r);
}

const caseLink = (r) => `[${r.id}](cases/${r.id}/record.json)`;
const photoLinks = (r) => (r._photos ?? []).map((p, i) => `[photo ${i + 1}](cases/${r.id}/${p})`).join(' ');
const tagCounts = (rs) => {
  const c = {};
  for (const r of rs) for (const t of r.rating?.tags ?? []) c[t] = (c[t] ?? 0) + 1;
  return Object.entries(c)
    .sort((a, b) => b[1] - a[1])
    .map(([t, n]) => `${t} ${n}`)
    .join(', ') || '–';
};
const latency = (rs) => median(rs.flatMap((r) => (r.attempts ?? []).filter((a) => a.ok).map((a) => a.ms / 1000)));
const day = (ms) => new Date(ms).toISOString().slice(0, 10);

const lines = [];
lines.push('# AI answer log: summary', '');
lines.push(
  `${records.length} answers from ${records.length ? day(records[0].createdAt) : '–'} to ${records.length ? day(records[records.length - 1].createdAt) : '–'}. ` +
    `Generated by scripts/ai-log-unpack.mjs on ${new Date().toISOString().slice(0, 10)}.`,
  '',
);
lines.push(
  'Meal photos: the user can only change grams, names and which items to keep, so the kcal error comes from portion size and removed items; ' +
    '“values off” tags and notes are the only signal for wrong kcal per 100 g. Grams from cases marked *weighed* are ground truth; other grams are the user’s own estimate. ' +
    'Later diary edits (or deleted entries) count over what was first saved.',
  '',
);

lines.push('## Per prompt version and model', '');
for (const [key, rs] of [...groups.entries()].sort()) {
  const saved = rs.filter((r) => r.status === 'saved');
  const failed = rs.filter((r) => r.status === 'failed').length;
  lines.push(`### ${key}`, '');
  lines.push(`- answers: ${rs.length} · saved ${saved.length} · not saved ${rs.length - saved.length - failed} · failed ${failed}`);
  lines.push(`- fallback used: ${pct(share(rs.filter((r) => r.answeredBy?.usedFallback).length, rs.length))} · median reply time: ${latency(rs) === null ? '–' : `${num(latency(rs))} s`}`);
  if (!saved.length) {
    // nothing saved: no numbers to compare
  } else if (rs[0].kind === 'meal') {
    const cases = saved.map((r) => ({ r, c: mealCase(r) }));
    const weighed = cases.filter((x) => x.r.rating?.weighed);
    const items = cases.flatMap((x) => x.c.items);
    lines.push(
      `- portion error per kept item (median): all ${pct(median(cases.flatMap((x) => x.c.gramErrors)))} · weighed only ${pct(median(weighed.flatMap((x) => x.c.gramErrors)))} (${weighed.length} of ${cases.length} meals weighed)`,
    );
    lines.push(`- kcal error per meal (median / mean): ${pct(median(cases.map((x) => x.c.kcalError)))} / ${pct(mean(cases.map((x) => x.c.kcalError).filter((x) => x !== null)))}`);
    lines.push(
      `- AI too high vs too low (meals): ${cases.filter((x) => x.c.aiKcal > x.c.finalKcal * 1.05).length} / ${cases.filter((x) => x.c.aiKcal < x.c.finalKcal * 0.95).length}`,
    );
    lines.push(`- items removed: ${pct(share(items.filter((i) => !i.kept).length, items.length))} · renamed: ${pct(share(items.filter((i) => i.renamed).length, items.length))} · meals edited later in the diary: ${cases.filter((x) => x.c.editedLater).length}`);
  } else {
    const cases = saved.map((r) => ({ r, c: labelCase(r) }));
    lines.push(`- saved without any value change: ${pct(share(cases.filter((x) => x.c.changed === 0).length, cases.length))} · name changed: ${pct(share(cases.filter((x) => x.c.nameChanged).length, cases.length))} · g/ml changed: ${cases.filter((x) => x.c.unitChanged).length}`);
    const perField = FIELDS.map(([f]) => {
      const vals = cases.map((x) => x.c.fields[f]).filter(Boolean);
      const ch = vals.filter((v) => v.changed);
      return `${f} ${ch.length}/${vals.length}`;
    });
    lines.push(`- fields changed by the user: ${perField.join(' · ')}`);
  }
  lines.push(`- tags: ${tagCounts(rs)}`, '');
}

const worstMeals = records
  .filter((r) => r.kind === 'meal' && r.status === 'saved')
  .map((r) => ({ r, c: mealCase(r) }))
  .filter((x) => x.c.kcalError !== null)
  .sort((a, b) => b.c.kcalError - a.c.kcalError)
  .slice(0, 10);
lines.push('## Worst meal answers (kcal error)', '');
if (!worstMeals.length) lines.push('None yet.', '');
for (const { r, c } of worstMeals) {
  lines.push(
    `- ${caseLink(r)} ${photoLinks(r)} · AI ${Math.round(c.aiKcal)} kcal → kept ${Math.round(c.finalKcal)} kcal (${pct(c.kcalError)})${r.rating?.weighed ? ' · weighed' : ''}${r.hint ? ` · hint: “${r.hint}”` : ''}`,
  );
  for (const it of c.items) {
    lines.push(`  - ${it.ai.name}: AI ${it.ai.grams} g / ${it.ai.kcal} kcal → ${it.kept ? `${it.grams} g` : 'removed'}${it.renamed ? ` (renamed “${it.name}”)` : ''}`);
  }
}
lines.push('');

const worstLabels = records
  .filter((r) => r.kind === 'label' && r.status === 'saved')
  .map((r) => ({ r, c: labelCase(r) }))
  .filter((x) => x.c.changed > 0)
  .sort((a, b) => b.c.changed - a.c.changed || b.c.maxRel - a.c.maxRel)
  .slice(0, 10);
lines.push('## Label readings the user corrected most', '');
if (!worstLabels.length) lines.push('None yet.', '');
for (const { r, c } of worstLabels) {
  const diffs = Object.entries(c.fields)
    .filter(([, v]) => v.changed)
    .map(([f, v]) => `${f} ${v.ai ?? '–'} → ${v.saved ?? '–'}`)
    .join(', ');
  lines.push(`- ${caseLink(r)} ${photoLinks(r)} · ${diffs}`);
}
lines.push('');

const failedRecords = records.filter((r) => r.status === 'failed');
lines.push('## Failed answers', '');
if (!failedRecords.length) lines.push('None.', '');
for (const r of failedRecords.slice(-20)) lines.push(`- ${caseLink(r)} ${photoLinks(r)} · ${r.kind} · ${(r.error ?? '').split('\n')[0].slice(0, 160)}`);
lines.push('');

const rated = records.filter((r) => r.rating && (r.rating.note || r.rating.tags.some((t) => t !== 'spot_on')));
lines.push('## Notes and problem tags from the user', '');
if (!rated.length) lines.push('None yet.', '');
for (const r of rated) lines.push(`- ${caseLink(r)} ${photoLinks(r)} · ${r.kind} · ${r.rating.tags.join(', ') || '–'}${r.rating.note ? ` · “${r.rating.note}”` : ''}`);
lines.push('');

writeFileSync(join(out, 'summary.md'), lines.join('\n'));
console.log(`${records.length} answers in ${relative('.', out) || out} (${added} new, ${updated} updated). Summary: ${join(out, 'summary.md')}`);
