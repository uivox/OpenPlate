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
  names: { full: string; head: string; words: string[] }[];
}
let index: Indexed[] | null = null;

/** Built on first search so app start stays fast. */
function getIndex(rows: BlsRow[]): Indexed[] {
  if (index && rows === BLS_ROWS) return index;
  const built = rows.map((row) => ({
    row,
    names: [row[1], row[2]].filter(Boolean).map((name) => {
      const full = fold(name);
      return { full, head: full.split(',')[0].trim(), words: full.split(/[\s,()/-]+/).filter(Boolean) };
    }),
  }));
  if (rows === BLS_ROWS) index = built;
  return built;
}

export const BLS_COUNT = BLS_ROWS.length;

/**
 * Finds BLS foods in German and English names. Every word of the query must start a word of the
 * name. Exact and leading matches of the main name (before the first comma) rank first, shorter
 * names before longer ones ("Apfel, roh" before "Apfelkuchen, Rührteig").
 */
export function searchBLS(query: string, lang: 'de' | 'en', limit = 12, rows: BlsRow[] = BLS_ROWS): Food[] {
  const q = fold(query.trim());
  if (q.length < 2) return [];
  const qWords = q.split(/[\s,]+/).filter(Boolean);
  const hits: { row: BlsRow; score: number; len: number }[] = [];
  for (const item of getIndex(rows)) {
    let best = -1;
    let len = Infinity;
    for (const nm of item.names) {
      if (!qWords.every((w) => nm.words.some((x) => x.startsWith(w)))) continue;
      let s = 1;
      if (nm.head === q) s = 4;
      else if (nm.head.startsWith(q)) s = 3;
      else if (nm.full.startsWith(q)) s = 2.5;
      else if (nm.words[0]?.startsWith(qWords[0])) s = 2;
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
