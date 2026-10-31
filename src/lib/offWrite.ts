import { checkPer100, type NutrientIssue } from './labelScan';
import type { Food, Nutrients } from './types';

/**
 * Sending the user's own foods to Open Food Facts with *their* Open Food Facts account (Profile →
 * Open Food Facts). Pure: no React Native imports, network through `fetchImpl` so tests fake it.
 *
 * - Sign-in is checked with /cgi/auth.pl, which answers JSON. Username and password are then sent with
 *   every write (Open Food Facts' documented way for apps); `no_log=1` keeps each write from opening a
 *   new login session, which would sign the user out of other devices after ten.
 * - Writes go to /cgi/product_jqm2.pl as a plain form post (no preflight in browsers; the server answers
 *   other sites with `Access-Control-Allow-Origin: *`). `code=new` makes the server give a product
 *   without barcode (bakery, market) its own code starting with 2.
 * - Only what differs from the product as it is on Open Food Facts right now is sent. Name, brand and
 *   serving size are only filled in when the product has none, so the app never overwrites them;
 *   nutrition values are sent when they differ (a correction). Values the user left empty are never sent.
 * - A wrong password makes the write script answer with an HTML page (HTTP 403), not JSON.
 */

export interface OffServer {
  base: string;
  /** HTTP basic auth of the test server (world.openfoodfacts.net), as "user:password". */
  basicAuth?: string;
}

export const OFF_PRODUCTION: OffServer = { base: 'https://world.openfoodfacts.org' };
/** Open Food Facts' test server; accounts there are separate from the real ones. */
export const OFF_STAGING: OffServer = { base: 'https://world.openfoodfacts.net', basicAuth: 'off:off' };
/** Builds made with EXPO_PUBLIC_OFF_STAGING=1 send to the test server (see docs/CONTRIBUTING.md). */
export const OFF_SERVER: OffServer = process.env.EXPO_PUBLIC_OFF_STAGING === '1' ? OFF_STAGING : OFF_PRODUCTION;

export interface OffLogin {
  /** Open Food Facts user name (what auth.pl answered, also when the user typed an email address). */
  user: string;
  password: string;
  /** Random id for this install, sent as app_uuid so moderators can block one user, not the whole app. */
  uuid: string;
}

export const APP_NAME = 'Tellerwerk';

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

const USER_AGENT = 'Tellerwerk/1.0 (open-source calorie tracker; https://github.com/uivox/Tellerwerk)';
const TIMEOUT_MS = 20000;

/** Base64 of an ASCII string (btoa exists in browsers, Hermes and Node). */
function b64(s: string): string {
  return btoa(s);
}

function headersFor(server: OffServer, form = true): Record<string, string> {
  const h: Record<string, string> = { Accept: 'application/json' };
  if (form) h['Content-Type'] = 'application/x-www-form-urlencoded;charset=UTF-8';
  // Browsers don't let pages set User-Agent; the apps send it as Open Food Facts asks.
  if (typeof document === 'undefined') h['User-Agent'] = USER_AGENT;
  if (server.basicAuth) h.Authorization = `Basic ${b64(server.basicAuth)}`;
  return h;
}

export function formBody(params: [string, string][]): string {
  return params.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
}

async function post(url: string, init: RequestInit, fetchImpl: FetchLike): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetchImpl(url, { method: 'POST', ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function readJson(res: Response): Promise<Record<string, unknown> | null> {
  const text = await res.text().catch(() => '');
  try {
    const v = JSON.parse(text) as unknown;
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/* ---------- Sign-in ---------- */

export type LoginOutcome = { ok: true; user: string } | { ok: false; reason: 'wrong' | 'offline' | 'busy' | 'server' };

/** Checks user name (or email) and password. Nothing is stored here; the screen keeps the login. */
export async function checkOffLogin(user: string, password: string, fetchImpl: FetchLike = fetch, server: OffServer = OFF_SERVER): Promise<LoginOutcome> {
  let res: Response;
  try {
    res = await post(
      `${server.base}/cgi/auth.pl`,
      { headers: headersFor(server), body: formBody([['user_id', user.trim()], ['password', password], ['body', '1'], ['no_log', '1']]) },
      fetchImpl,
    );
  } catch {
    return { ok: false, reason: 'offline' };
  }
  if (res.status === 429 || res.status === 503) return { ok: false, reason: 'busy' };
  const json = await readJson(res);
  if (json && json.status === 1 && typeof json.user_id === 'string' && json.user_id) return { ok: true, user: json.user_id };
  if (res.status === 403 || (json && json.status === 0)) return { ok: false, reason: 'wrong' };
  return { ok: false, reason: 'server' };
}

/* ---------- What would be sent ---------- */

export type OffField = 'name' | 'brand' | 'serving' | 'kcal' | 'carbs' | 'protein' | 'fat' | 'sugar' | 'fiber' | 'satFat' | 'salt';
export const NUTRIENT_FIELDS: OffField[] = ['kcal', 'carbs', 'protein', 'fat', 'sugar', 'fiber', 'satFat', 'salt'];

/** Open Food Facts' nutrient ids for our fields. */
const NID: Record<string, string> = {
  kcal: 'energy-kcal',
  carbs: 'carbohydrates',
  protein: 'proteins',
  fat: 'fat',
  sugar: 'sugars',
  fiber: 'fiber',
  satFat: 'saturated-fat',
  salt: 'salt',
};

/** The parts of a product on Open Food Facts that the app can fill in or correct. */
export interface OffSnapshot {
  name?: string;
  brand?: string;
  serving?: string;
  per100: Partial<Record<keyof Nutrients, number>>;
}

function num(v: unknown): number | undefined {
  const n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : undefined;
}
function txt(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/** Reads a product from the v2 product API (`product` object) into what the app compares. */
export function snapshotFromOff(p: Record<string, unknown> | null | undefined, lang: 'de' | 'en'): OffSnapshot | null {
  if (!p) return null;
  const n = (p.nutriments ?? {}) as Record<string, unknown>;
  const kj = num(n['energy-kj_100g']);
  const per100: OffSnapshot['per100'] = {};
  const kcal = num(n['energy-kcal_100g']) ?? (kj !== undefined ? kj / 4.184 : undefined);
  if (kcal !== undefined) per100.kcal = kcal;
  for (const f of ['carbs', 'protein', 'fat', 'sugar', 'fiber', 'satFat', 'salt'] as const) {
    const v = num(n[`${NID[f]}_100g`]);
    if (v !== undefined) per100[f] = v;
  }
  return {
    name: txt(p[`product_name_${lang}`]) ?? txt(p.product_name),
    brand: txt(p.brands),
    serving: txt(p.serving_size),
    per100,
  };
}

export interface Change {
  field: OffField;
  /** What Open Food Facts has now (undefined: nothing). */
  from?: string | number;
  to: string | number;
}

/** Rounded like the label prints it: kcal whole, grams to one decimal, salt to two. */
export function roundFor(field: OffField, v: number): number {
  if (field === 'kcal') return Math.round(v);
  if (field === 'salt') return Math.round(v * 100) / 100;
  return Math.round(v * 10) / 10;
}

export function servingText(food: Food): string | undefined {
  const s = food.servings[0];
  if (!s || !(s.grams > 0)) return undefined;
  return `${s.label} (${roundFor('carbs', s.grams)} ${food.unit ?? 'g'})`;
}

/**
 * What to send for this food, compared with the product as Open Food Facts has it now (`off` null:
 * the product doesn't exist there yet). Empty when Open Food Facts already has everything.
 */
export function changesFor(food: Food, off: OffSnapshot | null): Change[] {
  const out: Change[] = [];
  const have = off ?? { per100: {} };
  if (!have.name && food.name.trim()) out.push({ field: 'name', to: food.name.trim() });
  if (!have.brand && food.brand?.trim()) out.push({ field: 'brand', to: food.brand.trim() });
  const serving = servingText(food);
  if (!have.serving && serving) out.push({ field: 'serving', to: serving });
  for (const f of NUTRIENT_FIELDS) {
    const mine = food.per100[f as keyof Nutrients];
    if (mine === undefined || !Number.isFinite(mine)) continue;
    const to = roundFor(f, mine);
    const now = have.per100[f as keyof Nutrients];
    if (now !== undefined && roundFor(f, now) === to) continue;
    out.push({ field: f, ...(now !== undefined ? { from: roundFor(f, now) } : {}), to });
  }
  return out;
}

/** Reasons the food can't be sent yet. Bakery and market items without barcode need the shop as brand. */
export type Blocker = 'implausible' | 'no_name' | 'no_shop';

export interface SendCheck {
  blockers: Blocker[];
  /** Same warnings as when checking a label photo (sugar above carbs, calories that don't fit …). */
  issues: NutrientIssue[];
}

export function checkForSending(food: Food, hasCode: boolean): SendCheck {
  const blockers: Blocker[] = [];
  const check = checkPer100(food.per100);
  if (!check.per100) blockers.push('implausible');
  if (!food.name.trim()) blockers.push('no_name');
  if (!hasCode && !food.brand?.trim()) blockers.push('no_shop');
  return { blockers, issues: check.issues };
}

/** The product code to write to: the barcode, the code Open Food Facts gave earlier, or "new". */
export function codeFor(food: Food): string {
  return food.barcode ?? food.offCode ?? 'new';
}

/** The form fields of a write (without the login, which `sendToOff` adds). */
export function writeFields(code: string, food: Food, changes: Change[], lang: 'de' | 'en', appVersion: string): [string, string][] {
  const out: [string, string][] = [['code', code]];
  if (code === 'new') out.push(['lc', lang]);
  const per = food.unit === 'ml' ? '100ml' : '100g';
  let nutrients = false;
  for (const c of changes) {
    if (c.field === 'name') out.push([`product_name_${lang}`, String(c.to)]);
    else if (c.field === 'brand') out.push(['brands', String(c.to)]);
    else if (c.field === 'serving') out.push(['serving_size', String(c.to)]);
    else {
      nutrients = true;
      out.push([`nutriment_${NID[c.field]}`, String(c.to)], [`nutriment_${NID[c.field]}_unit`, c.field === 'kcal' ? 'kcal' : 'g']);
    }
  }
  if (nutrients) out.push(['nutrition_data_per', per]);
  out.push(['app_name', APP_NAME], ['app_version', appVersion], ['comment', `${APP_NAME} ${appVersion}: ${changes.map((c) => c.field).join(', ')}`]);
  return out;
}

/* ---------- Sending ---------- */

export type SendFailure = 'login' | 'offline' | 'busy' | 'server' | 'rejected';
export type SendOutcome = { ok: true; code: string } | { ok: false; reason: SendFailure; detail?: string };

const loginFields = (login: OffLogin): [string, string][] => [
  ['user_id', login.user],
  ['password', login.password],
  ['app_uuid', login.uuid],
  ['no_log', '1'],
];

/** Sends the fields; the answer's `code` is the new code for products without barcode. */
export async function sendToOff(fields: [string, string][], login: OffLogin, fetchImpl: FetchLike = fetch, server: OffServer = OFF_SERVER): Promise<SendOutcome> {
  const code = fields.find(([k]) => k === 'code')?.[1] ?? '';
  let res: Response;
  try {
    res = await post(`${server.base}/cgi/product_jqm2.pl`, { headers: headersFor(server), body: formBody([...fields, ...loginFields(login)]) }, fetchImpl);
  } catch {
    return { ok: false, reason: 'offline' };
  }
  if (res.status === 429 || res.status === 503) return { ok: false, reason: 'busy' };
  const json = await readJson(res);
  if (!json) return { ok: false, reason: res.status === 403 ? 'login' : 'server' };
  const verbose = typeof json.status_verbose === 'string' ? json.status_verbose : undefined;
  const newCode = typeof json.code === 'string' && json.code ? json.code : code;
  if (json.status === 1 || verbose === 'not modified') return { ok: true, code: newCode };
  if (verbose === 'no user credentials') return { ok: false, reason: 'login' };
  return { ok: false, reason: 'rejected', detail: verbose };
}

export type PhotoOutcome = { ok: true } | { ok: false; reason: SendFailure; detail?: string };

/**
 * Uploads a photo of the nutrition table and selects it for the product. `form` is built by the
 * platform (device.ts / device.web.ts: appendPhoto) because files go into a form differently there.
 */
export async function uploadOffPhoto(
  code: string,
  lang: 'de' | 'en',
  login: OffLogin,
  addFile: (form: FormData, field: string) => void,
  fetchImpl: FetchLike = fetch,
  server: OffServer = OFF_SERVER,
): Promise<PhotoOutcome> {
  const field = `nutrition_${lang}`;
  const form = new FormData();
  for (const [k, v] of [['code', code], ['imagefield', field], ...loginFields(login)] as [string, string][]) form.append(k, v);
  addFile(form, `imgupload_${field}`);
  let res: Response;
  try {
    const h = headersFor(server, false); // the form sets its own multipart content type
    res = await post(`${server.base}/cgi/product_image_upload.pl`, { headers: h, body: form }, fetchImpl);
  } catch {
    return { ok: false, reason: 'offline' };
  }
  if (res.status === 429 || res.status === 503) return { ok: false, reason: 'busy' };
  const json = await readJson(res);
  if (!json) return { ok: false, reason: res.status === 403 ? 'login' : 'server' };
  if (json.status === 'status ok') return { ok: true };
  return { ok: false, reason: 'rejected', detail: typeof json.error === 'string' ? json.error : typeof json.status === 'string' ? json.status : undefined };
}

/** The product's page on Open Food Facts. */
export function offProductUrl(code: string, lang: 'de' | 'en', server: OffServer = OFF_SERVER): string {
  const host = server === OFF_PRODUCTION ? `https://${lang === 'de' ? 'de' : 'world'}.openfoodfacts.org` : server.base;
  return `${host}/product/${code}`;
}

/** Where to create an Open Food Facts account. */
export function offSignupUrl(lang: 'de' | 'en', server: OffServer = OFF_SERVER): string {
  const host = server === OFF_PRODUCTION ? `https://${lang === 'de' ? 'de' : 'world'}.openfoodfacts.org` : server.base;
  return `${host}/cgi/user.pl`;
}

/* ---------- Waiting to send ---------- */

/** A send the user kept for later (no connection, or Open Food Facts was busy). Sent again only by the user. */
export interface OffPending {
  foodId: string;
  savedAt: number;
}

export function normalizePending(v: unknown): OffPending[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const out: OffPending[] = [];
  for (const x of v) {
    if (!x || typeof x !== 'object') continue;
    const { foodId, savedAt } = x as Record<string, unknown>;
    if (typeof foodId !== 'string' || !foodId || seen.has(foodId)) continue;
    seen.add(foodId);
    out.push({ foodId, savedAt: typeof savedAt === 'number' && Number.isFinite(savedAt) ? savedAt : 0 });
  }
  return out.slice(0, 200);
}

/** Reads a stored login; anything incomplete counts as signed out. */
export function parseOffLogin(raw: string | null | undefined): OffLogin | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<OffLogin>;
    return typeof v.user === 'string' && v.user && typeof v.password === 'string' && v.password && typeof v.uuid === 'string' && v.uuid
      ? { user: v.user, password: v.password, uuid: v.uuid }
      : null;
  } catch {
    return null;
  }
}

/**
 * The app_uuid for this install: a random UUID from the platform's secure generator (the caller passes
 * expo's `uuid.v4`: iOS UUID(), Java UUID.randomUUID(), crypto.randomUUID() in browsers), written as
 * 32 hex digits. Not tied to the user's name or device. Anything that isn't a UUID is refused.
 */
export function newAppUuid(randomUuid: () => string): string {
  const hex = randomUuid().replace(/-/g, '').toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) throw new Error('not a UUID');
  return hex;
}
