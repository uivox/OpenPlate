import { buildLabelPrompt, MAX_KCAL_PER_100G, parseLabelJson, type LabelResult, type NutrientIssue } from './labelScan';
import type { AIItem, AIProviderConfig, AIProviderId, AIResult, AISettings } from './types';

export const DEFAULT_AI_SETTINGS: AISettings = {
  primary: null,
  fallback: null,
  minConfidence: 0.5,
  providers: {
    anthropic: { model: 'claude-sonnet-5-5' },
    openai: { model: 'gpt-6-luna', baseUrl: 'https://api.openai.com/v1' },
    gemini: { model: 'gemini-3.8-flash' },
    // No default address: every network is different, and a guessed address could send meal
    // photos to whatever device happens to have it.
    local: { model: 'qwen2.5vl:7b', baseUrl: '' },
  },
};

/* ---------- Server addresses ---------- */

/** Hosts on the user's own network, where plain http is acceptable. */
export function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.lan') || h.endsWith('.home.arpa')) return true;
  if (h === '::1' || /^f[cd][0-9a-f]{2}:/.test(h) || /^fe80:/.test(h)) return true;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return (
    a === 10 ||
    a === 127 ||
    (a === 192 && b === 168) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 169 && b === 254) ||
    (a === 100 && b >= 64 && b <= 127) // carrier-grade NAT range, used by Tailscale
  );
}

export type ServerUrlProblem = 'empty' | 'invalid' | 'insecure';

/**
 * Checks a server address. http is only allowed for hosts on the local network: anywhere else the
 * photo, and any API key, would travel unencrypted. User names in the address are refused (they
 * hide where a request really goes: https://api.openai.com@example.com goes to example.com).
 */
export function serverUrlProblem(url: string): ServerUrlProblem | null {
  const u = url.trim();
  if (!u) return 'empty';
  const m = u.match(/^(https?):\/\/(\[[0-9a-fA-F:.]+\]|[^/:?#@\s]+)(:\d{1,5})?(\/[^\s?#@]*)?$/);
  if (!m) return 'invalid';
  if (m[1].toLowerCase() === 'http' && !isPrivateHost(m[2])) return 'insecure';
  return null;
}

/**
 * AI settings taken from a backup file. Only model names and the confidence threshold are taken:
 * server addresses and the chosen providers stay as they are on this device, so a backup file can
 * never redirect a saved API key (or meal photos) to another server.
 */
export function sanitizeImportedAI(raw: unknown, current: AISettings): AISettings {
  const r = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const providers = { ...current.providers };
  const rp = r.providers && typeof r.providers === 'object' ? (r.providers as Record<string, unknown>) : {};
  for (const id of Object.keys(providers) as AIProviderId[]) {
    const model = (rp[id] as Record<string, unknown> | undefined)?.model;
    if (typeof model === 'string' && /^[\w.:/@+-]{1,100}$/.test(model.trim())) providers[id] = { ...providers[id], model: model.trim() };
  }
  const mc = r.minConfidence;
  return {
    ...current,
    providers,
    minConfidence: typeof mc === 'number' && mc >= 0 && mc <= 1 ? mc : current.minConfidence,
  };
}

export const PROVIDER_NAMES: Record<AIProviderId, string> = {
  anthropic: 'Claude (Anthropic)',
  openai: 'OpenAI',
  gemini: 'Google Gemini',
  local: 'Ollama / LM Studio',
};

/** Whether the provider can run without an API key. */
export const KEY_OPTIONAL: Record<AIProviderId, boolean> = {
  anthropic: false,
  openai: false,
  gemini: false,
  local: true,
};

export function buildMealPrompt(lang: 'de' | 'en', hint?: string): string {
  const language = lang === 'de' ? 'German' : 'English';
  return [
    'You are a nutrition assistant inside a calorie-tracking app.',
    'Identify every distinct food and drink visible in the photo. For each one, estimate the eaten portion',
    'in grams (millilitres for drinks) and the nutrition of that whole portion.',
    'Use visual cues such as plate size, cutlery and packaging to judge portion size.',
    'Respond with JSON only, no markdown and no prose, in exactly this shape:',
    '{"items":[{"name":string,"grams":number,"kcal":number,"protein":number,"carbs":number,"fat":number,"confidence":number}],"confidence":number,"notes":string}',
    'protein, carbs and fat are grams for the whole portion. confidence values are between 0 and 1.',
    `Write "name" and "notes" in ${language}. Keep names short (for example "Spaghetti bolognese").`,
    'If there is no food in the photo, return {"items":[],"confidence":0,"notes":"<short reason>"}.',
    hint?.trim() ? `Extra information from the user about this meal: ${hint.trim()}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

const toNum = (v: unknown): number => {
  const n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : NaN;
};
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Upper limits for plausible values (also used for Open Food Facts data). */
export const MAX_AI_PORTION_G = 5000;
export { MAX_KCAL_PER_100G };

/** Extracts and validates the meal JSON from a model reply. Throws when nothing usable is found. */
export function parseMealJson(text: string): { items: AIItem[]; confidence: number; notes?: string } {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('The AI reply contained no JSON.');
  let data: unknown;
  try {
    data = JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    throw new Error('The AI reply was not valid JSON.');
  }
  const obj = (data ?? {}) as Record<string, unknown>;
  const rawItems = Array.isArray(obj.items) ? obj.items : [];
  const items: AIItem[] = [];
  let corrected = false;
  for (const raw of rawItems) {
    const r = (raw ?? {}) as Record<string, unknown>;
    const name = typeof r.name === 'string' ? r.name.trim().slice(0, 120) : '';
    const grams = toNum(r.grams);
    let kcal = toNum(r.kcal);
    if (!name || !(grams > 0) || !(kcal >= 0)) continue;
    const macro = (v: unknown) => {
      const n = toNum(v);
      return n >= 0 ? n : 0;
    };
    const protein = macro(r.protein);
    const carbs = macro(r.carbs);
    const fat = macro(r.fat);
    const conf = toNum(r.confidence);
    let confidence = Number.isFinite(conf) ? clamp01(conf) : 0.5;

    // Physically impossible answers are dropped: no portion weighs more than 5 kg, nothing has more
    // energy than pure fat (~900 kcal/100 g), and the macros cannot weigh much more than the portion
    // (some room for dense liquids measured in ml).
    if (grams > MAX_AI_PORTION_G || (kcal / grams) * 100 > MAX_KCAL_PER_100G || protein + carbs + fat > grams * 1.5) continue;
    // Calories far below what the macros alone provide: trust the macros and flag the item, so the
    // fallback provider is asked and the user sees a low confidence. (More calories than the macros
    // explain is normal for alcohol and sugar alcohols, so that case is left alone.)
    const macroKcal = protein * 4 + carbs * 4 + fat * 9;
    if (macroKcal > 20 && kcal < macroKcal * 0.5) {
      kcal = macroKcal;
      confidence = Math.min(confidence, 0.3);
      corrected = true;
    }
    items.push({ name, grams: Math.round(grams), kcal: Math.round(kcal), protein, carbs, fat, confidence });
  }
  const overall = toNum(obj.confidence);
  let confidence = Number.isFinite(overall)
    ? clamp01(overall)
    : items.length
      ? items.reduce((s, i) => s + i.confidence, 0) / items.length
      : 0;
  if (corrected) confidence = Math.min(confidence, ...items.map((i) => i.confidence));
  const notes = typeof obj.notes === 'string' && obj.notes.trim() ? obj.notes.trim() : undefined;
  return { items, confidence, notes };
}

export interface ProviderRequest {
  provider: AIProviderId;
  config: AIProviderConfig;
  apiKey: string | null;
  prompt: string;
  imageBase64?: string;
  /** Several JPEGs (base64) in this order, e.g. a nutrition table and the package front. Used instead of imageBase64. */
  images?: string[];
  timeoutMs?: number;
  /** Aborts the request, e.g. when the user leaves the screen. */
  signal?: AbortSignal;
}

/** Thrown when the caller cancelled; not shown as an error. */
export const CANCELLED = 'CANCELLED';

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

async function readError(res: Response): Promise<string> {
  try {
    const body = await res.text();
    try {
      const j = JSON.parse(body) as { error?: { message?: string } | string; message?: string };
      const msg = typeof j.error === 'string' ? j.error : j.error?.message ?? j.message;
      if (msg) return `HTTP ${res.status}: ${msg}`;
    } catch {
      /* not JSON */
    }
    return `HTTP ${res.status}: ${body.slice(0, 200)}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

const trimSlash = (s: string) => s.replace(/\/+$/, '');

/** Sends one prompt (optionally with a JPEG) to a provider and returns the text reply. */
export async function callProvider(req: ProviderRequest, fetchImpl: FetchLike = fetch): Promise<string> {
  const { provider, config, apiKey, prompt } = req;
  const images = req.images ?? (req.imageBase64 ? [req.imageBase64] : []);
  if (!KEY_OPTIONAL[provider] && !apiKey) throw new Error('No API key saved for this provider.');
  if (req.signal?.aborted) throw new Error(CANCELLED);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), req.timeoutMs ?? (provider === 'local' ? 180000 : 60000));
  const onCancel = () => ctrl.abort();
  req.signal?.addEventListener('abort', onCancel);
  try {
    let url: string;
    let headers: Record<string, string> = { 'content-type': 'application/json' };
    let body: unknown;

    if (provider === 'anthropic') {
      url = 'https://api.anthropic.com/v1/messages';
      // The extra header lets the web version call the API straight from the browser (CORS); harmless in the app.
      headers = {
        ...headers,
        'x-api-key': apiKey ?? '',
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      };
      const content: unknown[] = [];
      for (const data of images) content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } });
      content.push({ type: 'text', text: prompt });
      body = { model: config.model, max_tokens: 1500, messages: [{ role: 'user', content }] };
    } else if (provider === 'gemini') {
      url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent`;
      headers = { ...headers, 'x-goog-api-key': apiKey ?? '' };
      const parts: unknown[] = [];
      for (const data of images) parts.push({ inline_data: { mime_type: 'image/jpeg', data } });
      parts.push({ text: prompt });
      body = { contents: [{ role: 'user', parts }], generationConfig: { responseMimeType: 'application/json', temperature: 0.2 } };
    } else {
      // OpenAI and OpenAI-compatible local servers (Ollama, LM Studio)
      const base = trimSlash((config.baseUrl ?? '').trim() || (provider === 'openai' ? 'https://api.openai.com/v1' : ''));
      const problem = serverUrlProblem(base);
      if (problem === 'empty') throw new Error('No server address set.');
      if (problem === 'invalid') throw new Error('The server address is not a valid http(s) address.');
      if (problem === 'insecure') throw new Error('Refusing to send data over plain http to a server outside your network. Use an https address.');
      url = `${base}/chat/completions`;
      if (apiKey) headers = { ...headers, authorization: `Bearer ${apiKey}` };
      const content: unknown[] = [{ type: 'text', text: prompt }];
      for (const data of images) content.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${data}` } });
      body = {
        model: config.model,
        messages: [{ role: 'user', content }],
        // LM Studio rejects json_object, so local servers rely on the prompt alone.
        ...(provider === 'openai' ? { response_format: { type: 'json_object' } } : { temperature: 0.2 }),
      };
    }

    // No redirects: a redirect could carry the key header to another server.
    const res = await fetchImpl(url, { method: 'POST', headers, body: JSON.stringify(body), signal: ctrl.signal, redirect: 'error' });
    if (!res.ok) throw new Error(await readError(res));
    const data = (await res.json()) as Record<string, any>;

    if (provider === 'anthropic') {
      const blocks = Array.isArray(data.content) ? data.content : [];
      return blocks
        .filter((b: any) => b?.type === 'text')
        .map((b: any) => b.text)
        .join('\n');
    }
    if (provider === 'gemini') {
      const parts = data.candidates?.[0]?.content?.parts ?? [];
      const text = parts.map((p: any) => p?.text ?? '').join('');
      if (!text) throw new Error(data.promptFeedback?.blockReason ? `Blocked: ${data.promptFeedback.blockReason}` : 'Empty reply.');
      return text;
    }
    const msg = data.choices?.[0]?.message?.content;
    if (typeof msg === 'string') return msg;
    if (Array.isArray(msg)) return msg.map((p: any) => p?.text ?? '').join('');
    throw new Error('Empty reply.');
  } catch (e) {
    if (req.signal?.aborted) throw new Error(CANCELLED);
    if ((e as Error)?.name === 'AbortError') throw new Error('The request timed out.');
    throw e;
  } finally {
    clearTimeout(timer);
    req.signal?.removeEventListener('abort', onCancel);
  }
}

export interface AnalyzeAttempt {
  provider: AIProviderId;
  ok: boolean;
  confidence?: number;
  error?: string;
}

export interface AnalyzeOutcome {
  result: AIResult;
  attempts: AnalyzeAttempt[];
  usedFallback: boolean;
}

/** Order in which providers are tried: primary first, then the fallback. */
export function providerOrder(settings: AISettings): AIProviderId[] {
  const order: AIProviderId[] = [];
  if (settings.primary) order.push(settings.primary);
  if (settings.fallback && settings.fallback !== settings.primary) order.push(settings.fallback);
  return order;
}

/**
 * Runs the primary provider; if it fails, finds nothing or is below the confidence
 * threshold, asks the fallback too and keeps the more confident answer.
 */
export async function analyzeMeal(
  imageBase64: string,
  settings: AISettings,
  getKey: (p: AIProviderId) => Promise<string | null>,
  lang: 'de' | 'en',
  hint?: string,
  call: (req: ProviderRequest) => Promise<string> = (r) => callProvider(r),
  signal?: AbortSignal,
): Promise<AnalyzeOutcome> {
  const order = providerOrder(settings);
  if (!order.length) throw new Error('NO_PROVIDER');
  const prompt = buildMealPrompt(lang, hint);
  const attempts: AnalyzeAttempt[] = [];
  let best: AIResult | null = null;

  for (const provider of order) {
    if (signal?.aborted) throw new Error(CANCELLED);
    const config = settings.providers[provider];
    try {
      const text = await call({ provider, config, apiKey: await getKey(provider), prompt, imageBase64, signal });
      const parsed = parseMealJson(text);
      const result: AIResult = { ...parsed, provider, model: config.model };
      attempts.push({ provider, ok: true, confidence: parsed.confidence });
      if (!best || (result.items.length > 0 && (best.items.length === 0 || result.confidence > best.confidence))) best = result;
      if (result.items.length > 0 && result.confidence >= settings.minConfidence) break;
    } catch (e) {
      if (signal?.aborted) throw new Error(CANCELLED);
      attempts.push({ provider, ok: false, error: (e as Error)?.message ?? String(e) });
    }
  }

  if (!best) {
    throw new Error(attempts.map((a) => `${PROVIDER_NAMES[a.provider]}: ${a.error}`).join('\n'));
  }
  return { result: best, attempts, usedFallback: best.provider !== order[0] };
}

export interface LabelOutcome {
  result: LabelResult;
  provider: AIProviderId;
  model: string;
  attempts: AnalyzeAttempt[];
  usedFallback: boolean;
}

/** Issues that make a reading doubtful (worth asking the fallback provider). */
const DOUBTFUL: NutrientIssue[] = ['energy_mismatch', 'energy_vs_macros', 'sugar_over_carbs', 'satfat_over_fat', 'macros_over_100', 'missing_macros'];
const doubts = (r: LabelResult) => r.issues.filter((i) => DOUBTFUL.includes(i)).length;

/**
 * Reads a nutrition label: `images[0]` is the nutrition table, an optional `images[1]` the package
 * front (for name and brand). Asks the fallback provider too when the first reading fails, finds no
 * table or looks doubtful, and keeps the cleaner reading. The result is always reviewed by the user.
 */
export async function analyzeLabel(
  images: string[],
  settings: AISettings,
  getKey: (p: AIProviderId) => Promise<string | null>,
  lang: 'de' | 'en',
  call: (req: ProviderRequest) => Promise<string> = (r) => callProvider(r),
  signal?: AbortSignal,
): Promise<LabelOutcome> {
  const order = providerOrder(settings);
  if (!order.length) throw new Error('NO_PROVIDER');
  if (!images.length) throw new Error('No photo.');
  const prompt = buildLabelPrompt(lang, images.length > 1);
  const attempts: AnalyzeAttempt[] = [];
  let best: LabelOutcome | null = null;

  for (const provider of order) {
    if (signal?.aborted) throw new Error(CANCELLED);
    const config = settings.providers[provider];
    try {
      const text = await call({ provider, config, apiKey: await getKey(provider), prompt, images: images.slice(0, 2), signal });
      const result = parseLabelJson(text);
      attempts.push({ provider, ok: true });
      const better =
        !best ||
        (result.per100 && !best.result.per100) ||
        (result.per100 && best.result.per100 && doubts(result) < doubts(best.result));
      if (better) best = { result, provider, model: config.model, attempts, usedFallback: provider !== order[0] };
      if (result.per100 && doubts(result) === 0) break;
    } catch (e) {
      if (signal?.aborted) throw new Error(CANCELLED);
      attempts.push({ provider, ok: false, error: (e as Error)?.message ?? String(e) });
    }
  }
  if (!best) throw new Error(attempts.map((a) => `${PROVIDER_NAMES[a.provider]}: ${a.error}`).join('\n'));
  return best;
}

/** Quick connectivity check used by the "Test" button. */
export async function testProvider(provider: AIProviderId, config: AIProviderConfig, apiKey: string | null): Promise<string> {
  const text = await callProvider({
    provider,
    config,
    apiKey,
    prompt: 'Reply with this JSON only: {"ok":true}',
    timeoutMs: provider === 'local' ? 120000 : 30000,
  });
  return text.trim().slice(0, 80);
}
