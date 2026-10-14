import { BLS_ROWS, type BlsRow } from './blsData';
import type { Food } from './types';

/**
 * Bundeslebensmittelschlüssel (BLS 4.0): Germany's national nutrient database, ~7,000 foods and
 * dishes, from the Max Rubner-Institut under CC BY 4.0. Bundled (scripts/import_bls.py), so it
 * works offline. Values are per 100 g of the edible part; there are no serving sizes.
 */

const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss');

const n = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

export function blsFood(row: BlsRow, lang: 'de' | 'en'): Food {
  const [code, de, en, kcal, protein, carbs, fat, fiber, sugar, satFat, salt] = row;
  return {
    id: `bls:${code}`,
    source: 'bls',
    name: lang === 'de' ? de : en || de,
    per100: { kcal, protein: n(protein) ?? 0, carbs: n(carbs) ?? 0, fat: n(fat) ?? 0, fiber: n(fiber), sugar: n(sugar), satFat: n(satFat), salt: n(salt) },
    servings: [],
    unit: 'g',
  };
}

interface Indexed {
  row: BlsRow;
  names: { full: string; head: string; words: string[]; joined: string }[];
}
let index: Indexed[] | null = null;

/** Built on first search so app start stays fast. */
function getIndex(rows: BlsRow[]): Indexed[] {
  if (index && rows === BLS_ROWS) return index;
  const built = rows.map((row) => ({
    row,
    names: [row[1], row[2]].filter(Boolean).map((name) => {
      const full = fold(name);
      // "joined" lets "haferflocken" find "Hafer Flocken" (BLS often splits compound words)
      return { full, head: full.split(',')[0].trim(), words: full.split(/[\s,()/-]+/).filter(Boolean), joined: full.replace(/[\s,()/-]+/g, '') };
    }),
  }));
  if (rows === BLS_ROWS) index = built;
  return built;
}

export const BLS_COUNT = BLS_ROWS.length;

/** Everyday words → the wording the BLS uses (both are accepted). */
const SYNONYMS: Record<string, string[]> = {
  nudeln: ['teigwaren'],
  nudel: ['teigwaren'],
  pasta: ['teigwaren'],
  spaghetti: ['teigwaren'],
  gekocht: ['gegart'],
  gebraten: ['gegart'],
  hahnchen: ['huhn', 'brathuhn'],
  hackfleisch: ['hack'],
  kartoffeln: ['kartoffel'],
  eier: ['huhnerei'],
  ei: ['huhnerei'],
  semmel: ['brotchen'],
  schrippe: ['brotchen'],
  quark: ['speisequark'],
  cooked: ['boiled'],
};

/**
 * Finds BLS foods in German and English names. Every word of the query must start a word of the
 * name. Exact and leading matches of the main name (before the first comma) rank first, shorter
 * names before longer ones ("Apfel, roh" before "Apfelkuchen, Rührteig").
 */
export function searchBLS(query: string, lang: 'de' | 'en', limit = 12, rows: BlsRow[] = BLS_ROWS): Food[] {
  const q = fold(query.trim());
  if (q.length < 2) return [];
  const qWords = q.split(/[\s,]+/).filter(Boolean);
  // the query as typed plus the same query in BLS wording ("nudeln gekocht" → "teigwaren gegart")
  const phrases = [qWords];
  const alt = qWords.map((w) => SYNONYMS[w]?.[0] ?? w);
  if (alt.join(' ') !== qWords.join(' ')) phrases.push(alt);
  const variants = qWords.map((w) => [w, ...(SYNONYMS[w] ?? [])]);

  const hits: { row: BlsRow; score: number; len: number }[] = [];
  for (const item of getIndex(rows)) {
    let best = -1;
    let len = Infinity;
    for (const [ni, nm] of item.names.entries()) {
      const byWords = variants.every((vs) => nm.words.some((x) => vs.some((w) => x.startsWith(w))));
      const byJoined = !byWords && qWords.length === 1 && q.length >= 4 && nm.joined.startsWith(q);
      if (!byWords && !byJoined) continue;
      let s = 1;
      if (byJoined) {
        s = nm.head.replace(/[\s()/-]+/g, '') === q ? 4.2 : 2.2;
      } else {
        for (const [pi, words] of phrases.entries()) {
          const p = words.join(' ');
          let t = 1;
          if (nm.head === p) t = 4;
          else if (nm.head.startsWith(p)) t = 3;
          else if (nm.full.startsWith(p)) t = 2.5;
          else if (nm.words[0]?.startsWith(words[0])) t = 2;
          // the main word itself ("apfel roh") beats compounds ("apfelmus")
          // (a bit more when it's the BLS wording of a synonym: "quark" → "Speisequark …")
          if (nm.words[0] === words[0]) t += pi > 0 ? 0.9 : 0.6;
          s = Math.max(s, t);
        }
      }
      // names in the other language still match ("apple" in German), but rank below own-language ones
      if ((ni === 0) !== (lang === 'de')) s -= 1.2;
      if (s > best || (s === best && nm.full.length < len)) {
        best = s;
        len = nm.full.length;
      }
    }
    if (best > 0) hits.push({ row: item.row, score: best, len });
  }
  return hits
    .sort((a, b) => b.score - a.score || a.len - b.len)
    .slice(0, limit)
    .map((h) => blsFood(h.row, lang));
}
