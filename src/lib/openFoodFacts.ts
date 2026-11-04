import { MAX_KCAL_PER_100G } from './ai';
import { checkBarcode, type BarcodeProblem } from './barcode';
import { nutrientsFromRobotoff, type NutrientIssue } from './labelScan';
import type { Food, Nutrients, Serving } from './types';

/**
 * Open Food Facts (https://world.openfoodfacts.org) — open database of packaged foods,
 * licensed under the Open Database License (ODbL). Attribution is shown in the app.
 */
const USER_AGENT = 'Tellerwerk/1.0 (open-source calorie tracker; https://github.com/uivox/Tellerwerk)';
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

const plausibleKcal = (v: number | undefined): v is number => v !== undefined && v >= 0 && v <= MAX_KCAL_PER_100G;
/** Optional per-100 g values: negative or impossible ones are treated as unknown. */
const per100g = (v: number | undefined) => (v !== undefined && v >= 0 && v <= 100 ? v : undefined);

/**
 * Nutrients per 100 g from an Open Food Facts product. Community data contains typos (kJ typed
 * into the kcal field, misplaced decimal points); values that cannot be right are rejected, so the
 * product shows up as "not found" with the option to enter it correctly, instead of logging nonsense.
 */
export function nutrientsFromOFF(n: Json | undefined): Nutrients | undefined {
  if (!n) return undefined;
  const kj = num(n['energy-kj_100g']) ?? num(n['energy_100g']);
  const fromKj = kj !== undefined ? kj / 4.184 : undefined;
  const kcalField = num(n['energy-kcal_100g']);
  const kcal = plausibleKcal(kcalField) ? kcalField : plausibleKcal(fromKj) ? fromKj : undefined;
  if (kcal === undefined) return undefined;
  const protein = per100g(num(n['proteins_100g']));
  const carbs = per100g(num(n['carbohydrates_100g']));
  const fat = per100g(num(n['fat_100g']));
  if ((protein ?? 0) + (carbs ?? 0) + (fat ?? 0) > 105) return undefined;
  return {
    kcal,
    protein: protein ?? 0,
    carbs: carbs ?? 0,
    fat: fat ?? 0,
    sugar: per100g(num(n['sugars_100g'])),
    fiber: per100g(num(n['fiber_100g'])),
    satFat: per100g(num(n['saturated-fat_100g'])),
    salt: per100g(num(n['salt_100g'])),
  };
}

/** Product photos are only shown from Open Food Facts' own image servers. */
const OFF_IMAGE = /^https:\/\/(images|static)\.openfoodfacts\.(org|net)\//;

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
    imageUrl: OFF_IMAGE.test(str(p.image_front_small_url, lang) ?? '') ? str(p.image_front_small_url, lang) : undefined,
    ...(missingMacros(p.nutriments as Json | undefined) ? { incomplete: true } : {}),
  };
}

/** True when protein, carbs or fat is missing (the app then counts it as 0). */
function missingMacros(n: Json | undefined): boolean {
  const v = n ?? {};
  return ['proteins_100g', 'carbohydrates_100g', 'fat_100g'].some((k) => num(v[k]) === undefined);
}

export class HttpError extends Error {
  constructor(
    public status: number,
    /** Seconds from a Retry-After header, when the server sent one. */
    public retryAfterS?: number,
  ) {
    super(`HTTP ${status}`);
  }
}

/** Thrown before a request would exceed Open Food Facts' rate limit, or while it asked us to wait. */
export class RateLimitedError extends Error {
  constructor() {
    super('RATE_LIMITED');
  }
}

/** Thrown for a barcode that can't be right (wrong length, letters, wrong check digit). Nothing is sent. */
export class InvalidBarcodeError extends Error {
  constructor(public problem: BarcodeProblem) {
    super('INVALID_BARCODE');
  }
}

/**
 * Why a barcode lookup or search failed, for the message the user sees:
 * - `invalid`: the number itself is wrong; the user can correct it
 * - `rate_limited`: too many requests; wait a minute
 * - `server`: Open Food Facts answered with an error (5xx, 403 …)
 * - `offline`: no answer at all (no internet, DNS, timeout, a blocked request)
 */
export type LookupFailure = 'invalid' | 'rate_limited' | 'server' | 'offline';

export function lookupFailure(e: unknown): LookupFailure {
  if (e instanceof InvalidBarcodeError) return 'invalid';
  if (e instanceof RateLimitedError || (e instanceof HttpError && e.status === 429)) return 'rate_limited';
  if (e instanceof HttpError) return 'server';
  return 'offline';
}

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

async function getJson(url: string, fetchImpl: FetchLike = fetch, timeoutMs = 12000, notFoundOk = false, extraHeaders: Record<string, string> = {}): Promise<Json> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    // Browsers don't let pages set User-Agent (or turn it into a CORS preflight), so the web version sends only Accept.
    const headers: Record<string, string> = typeof document === 'undefined' ? { 'User-Agent': USER_AGENT, Accept: 'application/json' } : { Accept: 'application/json' };
    const res = await fetchImpl(url, { headers: { ...headers, ...extraHeaders }, signal: ctrl.signal });
    // The product API answers an unknown barcode with 404 and {"status":0} (with CORS headers, so the
    // browser can read it too). That is a normal answer, not a failure.
    if (notFoundOk && res.status === 404) return ((await res.json().catch(() => null)) as Json | null) ?? { status: 0 };
    if (!res.ok) {
      const retry = Number(res.headers?.get?.('retry-after'));
      throw new HttpError(res.status, Number.isFinite(retry) && retry > 0 ? retry : undefined);
    }
    return (await res.json()) as Json;
  } finally {
    clearTimeout(timer);
  }
}

/*
 * Open Food Facts' fair-use rules: when it answers 429 (too many requests), wait before asking again.
 * The pause covers search and barcode lookups alike and lasts at least a minute (longer when the
 * server says so in Retry-After, at most ten). Other answers, such as 404 for an unknown product,
 * never cause a pause.
 */
const MIN_PAUSE_MS = 60_000;
const MAX_PAUSE_MS = 10 * 60_000;
let pausedUntil = 0;

function checkPause(now: number) {
  if (now < pausedUntil) throw new RateLimitedError();
}

function notePause(e: unknown, now: number) {
  if (e instanceof HttpError && e.status === 429) {
    pausedUntil = now + Math.min(MAX_PAUSE_MS, Math.max(MIN_PAUSE_MS, (e.retryAfterS ?? 0) * 1000));
  }
}

/**
 * What Open Food Facts knows about a product that has no usable nutrition: its name, brand, size and
 * photo, so the user doesn't have to type them again when completing it.
 */
export interface PartialProduct {
  code: string;
  name?: string;
  brand?: string;
  unit: 'g' | 'ml';
  servings: Serving[];
  imageUrl?: string;
}

export interface BarcodeResult {
  /** The checked barcode that was looked up (UPC-E written out as UPC-A). */
  code: string;
  food: Food | null;
  /** Set when the product exists in Open Food Facts but its nutrition is missing or unusable. */
  partial?: PartialProduct;
}

/**
 * Looks up a barcode and also returns what is known about products without usable nutrition.
 * `food: null` without `partial` means Open Food Facts doesn't know the product.
 * Throws InvalidBarcodeError (nothing sent), RateLimitedError, HttpError, or the fetch error when
 * there is no connection; `lookupFailure` sorts them.
 */
export async function lookupBarcodeDetailed(code: string, lang: 'de' | 'en', fetchImpl: FetchLike = fetch, now = Date.now()): Promise<BarcodeResult> {
  const check = checkBarcode(code);
  if (!check.ok) throw new InvalidBarcodeError(check.problem);
  const clean = check.code;
  checkPause(now);
  let data: Json;
  try {
    data = await getJson(`https://world.openfoodfacts.org/api/v2/product/${clean}.json?fields=${FIELDS}`, fetchImpl, 12000, true);
  } catch (e) {
    notePause(e, now);
    throw e;
  }
  if (data.status !== 1 || !data.product) return { code: clean, food: null };
  const p: Json = { code: clean, ...(data.product as Json) };
  const food = foodFromOFF(p, lang);
  if (food) return { code: clean, food };
  const quantity = str(p.quantity, lang) ?? '';
  const unit: 'g' | 'ml' = /\b\d+([.,]\d+)?\s*(ml|cl|l)\b/i.test(quantity) ? 'ml' : 'g';
  const servingG = num(p.serving_quantity);
  const image = str(p.image_front_small_url, lang);
  return {
    code: clean,
    food: null,
    partial: {
      code: clean,
      name: (str(p[`product_name_${lang}`], lang) ?? str(p.product_name, lang) ?? str(p.generic_name, lang))?.slice(0, 120),
      brand: str(p.brands, lang)?.split(',')[0]?.trim().slice(0, 80),
      unit,
      servings: servingG && servingG > 0 && servingG <= 5000 ? [{ label: (str(p.serving_size, lang) ?? `${servingG} ${unit}`).slice(0, 40), grams: servingG }] : [],
      imageUrl: image && OFF_IMAGE.test(image) ? image : undefined,
    },
  };
}

const EDIT_FIELDS = 'code,product_name,product_name_de,product_name_en,brands,serving_size,nutriments';

/**
 * The product as Open Food Facts has it right now, with the raw fields the app compares before
 * sending an edit (offWrite.ts), or null when it doesn't exist. Counts as a barcode lookup for the
 * fair-use pause. Codes Open Food Facts gave products without barcode (starting with 2) have no
 * check digit, so they are only checked for being digits.
 */
export async function fetchProductForEdit(
  code: string,
  fetchImpl: FetchLike = fetch,
  now = Date.now(),
  base = 'https://world.openfoodfacts.org',
  basicAuth?: string,
): Promise<Json | null> {
  const clean = code.replace(/\s/g, '');
  if (!/^\d{6,14}$/.test(clean)) throw new InvalidBarcodeError('not_digits');
  checkPause(now);
  let data: Json;
  try {
    const auth: Record<string, string> = basicAuth ? { Authorization: `Basic ${btoa(basicAuth)}` } : {};
    data = await getJson(`${base}/api/v2/product/${clean}.json?fields=${EDIT_FIELDS}`, fetchImpl, 12000, true, auth);
  } catch (e) {
    notePause(e, now);
    throw e;
  }
  return data.status === 1 && data.product && typeof data.product === 'object' ? (data.product as Json) : null;
}

/* ---------- Robotoff: values Open Food Facts' AI read off product photos ---------- */

export interface RobotoffSuggestion {
  per100: Nutrients;
  issues: NutrientIssue[];
  /** The product photo the values were read from, to compare against. */
  imageUrl?: string;
}

/** Robotoff names the source image by its path below /images/products, e.g. "/400/644/600/5476/1.jpg". */
const ROBOTOFF_IMAGE_PATH = /^\/[\d/]+\/\d+\.jpg$/;

/**
 * Asks Robotoff (Open Food Facts' AI) for nutrition it read off the product's photos. Read-only and
 * without an account. Returns null when there is nothing usable; never throws for network problems,
 * since this is only a bonus on top of the normal lookup.
 */
export async function fetchRobotoffNutrition(code: string, fetchImpl: FetchLike = fetch): Promise<RobotoffSuggestion | null> {
  const check = checkBarcode(code);
  if (!check.ok) return null;
  const clean = check.code;
  let data: Json;
  try {
    data = await getJson(`https://robotoff.openfoodfacts.org/api/v1/insights?barcode=${clean}&insight_types=nutrient_extraction&count=5`, fetchImpl, 8000);
  } catch {
    return null;
  }
  const insights = Array.isArray(data.insights) ? (data.insights as Json[]) : [];
  for (const ins of insights) {
    // Insights people rejected (annotation 0) are skipped; unanswered, confirmed (1) or skipped (-1) ones are used.
    if (ins.barcode !== clean || ins.annotation === 0) continue;
    const nutrients = (ins.data as Json | undefined)?.nutrients;
    const { per100, issues } = nutrientsFromRobotoff(nutrients);
    if (!per100) continue;
    const path = typeof ins.source_image === 'string' ? ins.source_image : '';
    return { per100, issues, imageUrl: ROBOTOFF_IMAGE_PATH.test(path) ? `https://images.openfoodfacts.org/images/products${path}` : undefined };
  }
  return null;
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

/*
 * Open Food Facts allows 10 search requests per minute per IP and asks apps not to search on every
 * keystroke. The app therefore searches only when the user submits, keeps results for a while, and
 * stops itself before reaching the limit (being blocked would break search for everyone).
 */
const SEARCH_LIMIT = 8;
const SEARCH_WINDOW_MS = 60_000;
const CACHE_TTL_MS = 10 * 60_000;
const CACHE_MAX = 50;
const recentSearches: number[] = [];
const searchCache = new Map<string, { at: number; foods: Food[] }>();

function takeSearchSlot(now: number) {
  while (recentSearches.length && now - recentSearches[0] > SEARCH_WINDOW_MS) recentSearches.shift();
  if (recentSearches.length >= SEARCH_LIMIT) throw new RateLimitedError();
  recentSearches.push(now);
}

/** For tests. */
export function _resetSearchState() {
  recentSearches.length = 0;
  searchCache.clear();
  pausedUntil = 0;
}

/**
 * Full-text search: tries the newer search service, and the classic endpoint only when the first
 * one could not be reached (never after a rate-limit or other 4xx answer, which would just double the load).
 * A 429 also pauses all requests for a while (see `notePause`).
 */
export async function searchOFF(query: string, lang: 'de' | 'en', pageSize = 40, fetchImpl: FetchLike = fetch, now = Date.now()): Promise<Food[]> {
  const { retailer, rest } = parseRetailer(query);
  const text = (retailer ? rest || retailer.names[0] : rest).trim().replace(/\s+/g, ' ');
  const q = encodeURIComponent(text);
  if (!q) return [];
  const cacheKey = `${lang}:${retailer?.id ?? ''}:${text.toLowerCase()}`;
  const cached = searchCache.get(cacheKey);
  if (cached && now - cached.at < CACHE_TTL_MS) return cached.foods;

  checkPause(now);
  takeSearchSlot(now);
  let hits: Json[] = [];
  try {
    const data = await getJson(`https://search.openfoodfacts.org/search?q=${q}&page_size=${pageSize}&langs=${lang},en&fields=${FIELDS}`, fetchImpl);
    hits = Array.isArray(data.hits) ? (data.hits as Json[]) : [];
  } catch (e) {
    notePause(e, now);
    if (e instanceof HttpError && e.status < 500) throw e;
    takeSearchSlot(now);
    try {
      const data = await getJson(
        `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${q}&search_simple=1&action=process&json=1&page_size=${pageSize}&fields=${FIELDS}`,
        fetchImpl,
      );
      hits = Array.isArray(data.products) ? (data.products as Json[]) : [];
    } catch (e2) {
      notePause(e2, now);
      throw e2;
    }
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
  if (searchCache.size >= CACHE_MAX) searchCache.delete(searchCache.keys().next().value!);
  searchCache.set(cacheKey, { at: now, foods: out });
  return out;
}
