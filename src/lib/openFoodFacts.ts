import type { Food, Nutrients } from './types';

/**
 * Open Food Facts (https://world.openfoodfacts.org) — open database of packaged foods,
 * licensed under the Open Database License (ODbL). Attribution is shown in the app.
 */
const USER_AGENT = 'OpenPlate/1.0 (open-source calorie tracker; https://github.com/)';
const FIELDS = [
  'code',
  'product_name',
  'product_name_de',
  'product_name_en',
  'generic_name',
  'brands',
  'nutriments',
  'serving_quantity',
  'serving_size',
  'quantity',
  'image_front_small_url',
].join(',');

type Json = Record<string, unknown>;

function num(v: unknown): number | undefined {
  const n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : undefined;
}

function str(v: unknown, lang: 'de' | 'en'): string | undefined {
  if (typeof v === 'string') return v.trim() || undefined;
  if (Array.isArray(v)) return v.filter((x) => typeof x === 'string').join(', ') || undefined;
  if (v && typeof v === 'object') {
    const o = v as Json;
    return str(o[lang], lang) ?? str(o.main, lang) ?? str(o.en, lang) ?? str(Object.values(o)[0], lang);
  }
  return undefined;
}

export function nutrientsFromOFF(n: Json | undefined): Nutrients | undefined {
  if (!n) return undefined;
  let kcal = num(n['energy-kcal_100g']);
  if (kcal === undefined) {
    const kj = num(n['energy-kj_100g']) ?? num(n['energy_100g']);
    if (kj !== undefined) kcal = kj / 4.184;
  }
  if (kcal === undefined) return undefined;
  return {
    kcal,
    protein: num(n['proteins_100g']) ?? 0,
    carbs: num(n['carbohydrates_100g']) ?? 0,
    fat: num(n['fat_100g']) ?? 0,
    sugar: num(n['sugars_100g']),
    fiber: num(n['fiber_100g']),
    satFat: num(n['saturated-fat_100g']),
    salt: num(n['salt_100g']),
  };
}

export function foodFromOFF(p: Json, lang: 'de' | 'en'): Food | undefined {
  const per100 = nutrientsFromOFF(p.nutriments as Json | undefined);
  const code = str(p.code, lang);
  const name =
    str(p[`product_name_${lang}`], lang) ?? str(p.product_name, lang) ?? str(p.generic_name, lang) ?? str(p.product_name_en, lang);
  if (!per100 || !name) return undefined;
  const servingG = num(p.serving_quantity);
  const servingLabel = str(p.serving_size, lang);
  const quantity = str(p.quantity, lang) ?? '';
  const unit: 'g' | 'ml' = /\b\d+([.,]\d+)?\s*(ml|cl|l)\b/i.test(quantity) ? 'ml' : 'g';
  const brand = str(p.brands, lang)?.split(',')[0]?.trim();
  return {
    id: `off:${code ?? name}`,
    source: 'off',
    name,
    brand,
    barcode: code,
    per100,
    unit,
    servings: servingG && servingG > 0 ? [{ label: servingLabel ?? `${servingG} ${unit}`, grams: servingG }] : [],
    imageUrl: str(p.image_front_small_url, lang),
  };
}

async function getJson(url: string, timeoutMs = 12000): Promise<Json> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as Json;
  } finally {
    clearTimeout(timer);
  }
}

export async function lookupBarcode(code: string, lang: 'de' | 'en'): Promise<Food | null> {
  const clean = code.replace(/\D/g, '');
  const data = await getJson(`https://world.openfoodfacts.org/api/v2/product/${clean}.json?fields=${FIELDS}`);
  if (data.status !== 1 || !data.product) return null;
  const food = foodFromOFF({ code: clean, ...(data.product as Json) }, lang);
  return food ?? null;
}

/** Full-text search: tries the newer search service, falls back to the classic endpoint. */
export async function searchOFF(query: string, lang: 'de' | 'en', pageSize = 25): Promise<Food[]> {
  const q = encodeURIComponent(query.trim());
  if (!q) return [];
  let hits: Json[] = [];
  try {
    const data = await getJson(`https://search.openfoodfacts.org/search?q=${q}&page_size=${pageSize}&langs=${lang},en&fields=${FIELDS}`);
    hits = Array.isArray(data.hits) ? (data.hits as Json[]) : [];
  } catch {
    const data = await getJson(
      `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${q}&search_simple=1&action=process&json=1&page_size=${pageSize}&fields=${FIELDS}`,
    );
    hits = Array.isArray(data.products) ? (data.products as Json[]) : [];
  }
  const seen = new Set<string>();
  const out: Food[] = [];
  for (const h of hits) {
    const f = foodFromOFF(h, lang);
    if (f && !seen.has(f.id)) {
      seen.add(f.id);
      out.push(f);
    }
  }
  return out;
}
