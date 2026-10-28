/**
 * The connection log: every connection the app makes to a server outside the device, kept for 7
 * days on the device only, so the user can see where data went (Profile → Your data). It records
 * when, which server, why, whether a photo went along and whether it worked; never what was sent
 * or received. Pure: no React Native imports.
 *
 * `recordingFetch` wraps the global fetch once at start (ConnectionLogSetup.ts), so every request
 * goes through it, including ones a new module adds later. Connections that don't use fetch (the
 * native offline-pack download, product photos the image view loads) call `noteConnection`.
 */

export type ConnectionPurpose =
  | 'off_product'
  | 'off_search'
  | 'off_robotoff'
  | 'off_login'
  | 'off_send'
  | 'off_photo_upload'
  | 'off_image'
  | 'pack'
  | 'ai'
  | 'other';

export const CONNECTION_PURPOSES: ConnectionPurpose[] = [
  'off_product',
  'off_search',
  'off_robotoff',
  'off_login',
  'off_send',
  'off_photo_upload',
  'off_image',
  'pack',
  'ai',
  'other',
];

export interface ConnectionRecord {
  /** When the request started, ms. */
  at: number;
  /** Server name only (no path, no query: those can contain what was searched). */
  host: string;
  purpose: ConnectionPurpose;
  /** A photo went along (meal or label photo to the AI, nutrition-table photo to Open Food Facts). */
  photo: boolean;
  /** The server answered (2xx, or a 404 that means "not found"). False: no answer or an error. */
  ok: boolean;
  /** HTTP status when there was an answer. */
  status?: number;
}

export const LOG_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Upper bound so a week of heavy searching can't grow the store without limit. */
export const MAX_RECORDS = 2000;

function parse(url: string): URL | null {
  if (!/^https?:\/\//i.test(url)) return null; // relative, data:, blob:, file: never leave the device
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/** Why the app talks to this address. Null for addresses that don't leave the device. */
export function purposeFor(url: string): ConnectionPurpose | null {
  const u = parse(url);
  if (!u) return null;
  const host = u.hostname.toLowerCase();
  const path = u.pathname;
  const off = /(^|\.)openfoodfacts\.(org|net)$/.test(host);
  if (off) {
    if (host.startsWith('images.') || host.startsWith('static.')) return 'off_image';
    if (host.startsWith('robotoff.')) return 'off_robotoff';
    if (host.startsWith('search.') || path.startsWith('/cgi/search.pl')) return 'off_search';
    if (path.startsWith('/cgi/auth.pl')) return 'off_login';
    if (path.startsWith('/cgi/product_jqm2.pl')) return 'off_send';
    if (path.startsWith('/cgi/product_image_upload.pl')) return 'off_photo_upload';
    if (path.startsWith('/api/')) return 'off_product';
    return 'other';
  }
  if (host === 'raw.githubusercontent.com' && path.includes('/offline-pack/')) return 'pack';
  // AI providers, including the user's own server (any host): recognised by the API path.
  if (path.endsWith('/v1/messages') || path.endsWith(':generateContent') || path.endsWith('/chat/completions')) return 'ai';
  return 'other';
}

/** Whether the request body carries a photo. Only the shape is checked, nothing is kept. */
export function bodyHasPhoto(purpose: ConnectionPurpose, body: unknown): boolean {
  if (purpose === 'off_photo_upload') return true;
  if (purpose !== 'ai' || typeof body !== 'string') return false;
  return /"type"\s*:\s*"image"|"inline_data"|data:image\//.test(body);
}

/** Records younger than LOG_DAYS, newest first, at most MAX_RECORDS. */
export function pruneLog(records: ConnectionRecord[], now: number): ConnectionRecord[] {
  const from = now - LOG_DAYS * DAY_MS;
  return records
    .filter((r) => r.at >= from && r.at <= now + 60_000)
    .sort((a, b) => b.at - a.at)
    .slice(0, MAX_RECORDS);
}

export function addRecord(records: ConnectionRecord[], rec: ConnectionRecord, now: number): ConnectionRecord[] {
  return pruneLog([rec, ...records], now);
}

/** Records from a stored log that are well-formed (the store is read back on every start). */
export function normalizeLog(v: unknown, now: number): ConnectionRecord[] {
  if (!Array.isArray(v)) return [];
  const out: ConnectionRecord[] = [];
  for (const r of v) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    if (typeof o.at !== 'number' || typeof o.host !== 'string' || !CONNECTION_PURPOSES.includes(o.purpose as ConnectionPurpose)) continue;
    out.push({
      at: o.at,
      host: o.host.slice(0, 253),
      purpose: o.purpose as ConnectionPurpose,
      photo: o.photo === true,
      ok: o.ok === true,
      ...(typeof o.status === 'number' ? { status: o.status } : {}),
    });
  }
  return pruneLog(out, now);
}

/* ---------- Recording ---------- */

type Sink = (r: ConnectionRecord) => void;
let sink: Sink | null = null;

/** Where records go (the store, while the log is switched on). Null drops them. */
export function setConnectionSink(s: Sink | null): void {
  sink = s;
}

export function noteConnection(r: ConnectionRecord): void {
  try {
    sink?.(r);
  } catch {
    // the log must never break the request it describes
  }
}

/** Notes a connection to `url` that didn't go through fetch. */
export function noteUrl(url: string, ok: boolean, now = Date.now(), status?: number): void {
  const purpose = purposeFor(url);
  if (!purpose) return;
  noteConnection({ at: now, host: new URL(url).hostname.toLowerCase(), purpose, photo: false, ok, ...(status !== undefined ? { status } : {}) });
}

const lastImage = new Map<string, number>();
/** A product photo the image view loads: noted once per address and 10 minutes, not on every render. */
export function noteRemoteImage(url: string | undefined, now = Date.now()): void {
  if (!url || !parse(url)) return;
  const last = lastImage.get(url);
  if (last !== undefined && now - last < 10 * 60_000) return;
  lastImage.set(url, now);
  if (lastImage.size > 500) lastImage.clear();
  noteUrl(url, true, now);
}

type AnyFetch = (input: any, init?: any) => Promise<Response>;

function urlOf(input: unknown): string {
  if (typeof input === 'string') return input;
  if (input && typeof input === 'object') {
    const o = input as { url?: unknown; href?: unknown };
    if (typeof o.url === 'string') return o.url;
    if (typeof o.href === 'string') return o.href;
  }
  return '';
}

/**
 * Wraps fetch so each request to an outside server is noted. Requests and answers pass through
 * unchanged. `ownOrigin` (the web app's own address) is never logged: those are the app's own files.
 */
export function recordingFetch<F extends AnyFetch>(base: F, now: () => number = Date.now, ownOrigin?: string): F {
  const wrapped = async (input: unknown, init?: { body?: unknown }) => {
    const url = urlOf(input);
    const purpose = ownOrigin && (url === ownOrigin || url.startsWith(`${ownOrigin}/`)) ? null : purposeFor(url);
    if (!purpose) return base(input, init);
    const rec: ConnectionRecord = {
      at: now(),
      host: new URL(url).hostname.toLowerCase(),
      purpose,
      photo: bodyHasPhoto(purpose, init?.body),
      ok: false,
    };
    try {
      const res = await base(input, init);
      noteConnection({ ...rec, ok: res.ok || res.status === 404, status: res.status });
      return res;
    } catch (e) {
      noteConnection(rec);
      throw e;
    }
  };
  return wrapped as unknown as F;
}

/* ---------- What the "Your data" screen lists ---------- */

export type ServerId = 'off' | 'off_images' | 'pack' | 'ai';

export interface ServerInfo {
  id: ServerId;
  /** Server names, for display. The AI row shows the provider the user chose instead. */
  hosts: string[];
  purposes: ConnectionPurpose[];
}

/** Every outside server the app can talk to. A test checks that each address in the code is covered. */
export const SERVERS: ServerInfo[] = [
  {
    id: 'off',
    hosts: ['world.openfoodfacts.org', 'search.openfoodfacts.org', 'robotoff.openfoodfacts.org'],
    purposes: ['off_product', 'off_search', 'off_robotoff', 'off_login', 'off_send', 'off_photo_upload'],
  },
  { id: 'off_images', hosts: ['images.openfoodfacts.org'], purposes: ['off_image'] },
  { id: 'pack', hosts: ['raw.githubusercontent.com'], purposes: ['pack'] },
  { id: 'ai', hosts: [], purposes: ['ai'] },
];

/** How many records per purpose (for the summary at the top of the log). */
export function countByPurpose(records: ConnectionRecord[]): Partial<Record<ConnectionPurpose, number>> {
  const out: Partial<Record<ConnectionPurpose, number>> = {};
  for (const r of records) out[r.purpose] = (out[r.purpose] ?? 0) + 1;
  return out;
}
