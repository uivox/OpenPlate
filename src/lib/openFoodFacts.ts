import type { Food, Nutrients } from './types';

/**
 * Open Food Facts (https://world.openfoodfacts.org) — open database of packaged foods,
 * licensed under the Open Database License (ODbL). Attribution is shown in the app.
 */
const USER_AGENT = 'OpenPlate/1.0 (open-source calorie tracker; https://github.com/uivox/OpenPlate)';
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
  'countries_tags',
  'stores',
  'unique_scans_n',
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
    // Browsers don't let pages set User-Agent (or turn it into a CORS preflight), so the web version sends only Accept.
    const headers: Record<string, string> = typeof document === 'undefined' ? { 'User-Agent': USER_AGENT, Accept: 'application/json' } : { Accept: 'application/json' };
    const res = await fetch(url, { headers, signal: ctrl.signal });
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

/**
 * German supermarkets and their house brands. Typing "lidl skyr" searches for "skyr" and puts
 * Lidl products (by store or by a Lidl brand such as Milbona) first. Only a ranking hint:
 * products are still found by their own names.
 */
export const RETAILERS: { id: string; names: string[]; brands: string[] }[] = [
  {
    id: 'lidl',
    names: ['lidl'],
    brands: ['milbona', 'pilos', 'crownfield', 'freeway', 'solevita', 'snack day', 'chef select', 'fin carre', 'combino', 'alesto', 'vemondo', 'deluxe', 'bellarom', 'favorina', 'kania', 'baresa', 'gelatelli', 'sondey', 'trattoria alfredo', 'dulano', 'mister choc', 'grafschafter', 'lord nelson', 'mcennedy'],
  },
  {
    id: 'aldi',
    names: ['aldi', 'aldi sud', 'aldi nord'],
    brands: ['milsani', 'gut bio', 'goldahren', 'moser roth', 'choceur', 'river', 'lyttos', 'cucina nobile', 'golden bridge', "rio d'oro", 'westminster', 'meine metzgerei', 'le gusto', 'knusperone'],
  },
  { id: 'rewe', names: ['rewe'], brands: ['rewe beste wahl', 'rewe bio', 'ja!', 'rewe feine welt'] },
  { id: 'edeka', names: ['edeka'], brands: ['gut & gunstig', 'gut&gunstig', 'edeka bio', 'edeka herzstucke'] },
  { id: 'kaufland', names: ['kaufland'], brands: ['k-classic', 'k-bio', 'k-favourites'] },
  { id: 'penny', names: ['penny'], brands: ['naturgut'] },
  { id: 'netto', names: ['netto'], brands: [] },
  { id: 'dm', names: ['dm'], brands: ['dmbio', 'dm bio'] },
  { id: 'rossmann', names: ['rossmann'], brands: ['enerbio'] },
];

const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss')
    .trim();

/** Splits a retailer name off the query ("lidl skyr" → lidl + "skyr"). */
export function parseRetailer(query: string): { retailer?: (typeof RETAILERS)[number]; rest: string } {
  const q = fold(query);
  for (const r of RETAILERS) {
    for (const n of [...r.names].sort((a, b) => b.length - a.length)) {
      const re = new RegExp(`(^|\\s)${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`);
      if (re.test(q)) {
        const rest = q.replace(re, ' ').replace(/\s+/g, ' ').trim();
        return { retailer: r, rest };
      }
    }
  }
  return { rest: query.trim() };
}

/**
 * Orders raw search hits: name matches first, products sold in Germany (for German users),
 * products from the asked-for retailer, popular products (many scans) and complete nutrition.
 */
export function rankHits(hits: Json[], query: string, lang: 'de' | 'en', retailer?: (typeof RETAILERS)[number]): Json[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  const scored = hits.map((h, i) => {
    const name = fold(str(h[`product_name_${lang}`], lang) ?? str(h.product_name, lang) ?? '');
    const brands = fold(str(h.brands, lang) ?? '');
    const stores = fold(str(h.stores, lang) ?? '');
    const countries = Array.isArray(h.countries_tags) ? (h.countries_tags as unknown[]).map(String) : [];
    let score = 0;
    if (words.length) {
      const hay = `${name} ${brands}`;
      const matched = words.filter((w) => hay.includes(w)).length / words.length;
      score += matched * 3;
      if (name.startsWith(words.join(' '))) score += 1.5;
      if (name === words.join(' ')) score += 1;
    }
    if (lang === 'de') {
      if (countries.includes('en:germany')) score += 2;
      else if (countries.includes('en:austria') || countries.includes('en:switzerland')) score += 0.8;
    }
    if (retailer) {
      const byStore = listHas(retailer.names, stores) || listHas(retailer.names, brands);
      const byBrand = listHas(retailer.brands, brands);
      if (byStore || byBrand) score += 4;
    }
    const scans = num(h.unique_scans_n) ?? 0;
    score += Math.min(2, Math.log10(scans + 1) * 0.6);
    const n = (h.nutriments ?? {}) as Json;
    if (num(n['proteins_100g']) !== undefined && num(n['carbohydrates_100g']) !== undefined && num(n['fat_100g']) !== undefined) score += 0.5;
    return { h, score, i };
  });
  return scored.sort((a, b) => b.score - a.score || a.i - b.i).map((x) => x.h);
}

function listHas(needles: string[], hay: string): boolean {
  return needles.some((n) => n && hay.split(/\s*,\s*/).some((part) => part === n || part.startsWith(`${n} `)));
}

/** Full-text search: tries the newer search service, falls back to the classic endpoint. */
export async function searchOFF(query: string, lang: 'de' | 'en', pageSize = 40): Promise<Food[]> {
  const { retailer, rest } = parseRetailer(query);
  const text = (retailer ? rest || retailer.names[0] : rest).trim();
  const q = encodeURIComponent(text);
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
  for (const h of rankHits(hits, text, lang, retailer)) {
    const f = foodFromOFF(h, lang);
    if (f && !seen.has(f.id)) {
      seen.add(f.id);
      out.push(f);
    }
  }
  return out;
}
