import type { AIItem, AIProviderConfig, AIProviderId, AIResult, AISettings } from './types';

export const DEFAULT_AI_SETTINGS: AISettings = {
  primary: null,
  fallback: null,
  minConfidence: 0.5,
  providers: {
    anthropic: { model: 'claude-sonnet-5-5' },
    openai: { model: 'gpt-6-luna', baseUrl: 'https://api.openai.com/v1' },
    gemini: { model: 'gemini-3.8-flash' },
    local: { model: 'qwen2.5vl:7b', baseUrl: 'http://192.168.178.20:11434/v1' },
  },
};

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
  for (const raw of rawItems) {
    const r = (raw ?? {}) as Record<string, unknown>;
    const name = typeof r.name === 'string' ? r.name.trim() : '';
    const grams = toNum(r.grams);
    const kcal = toNum(r.kcal);
    if (!name || !(grams > 0) || !(kcal >= 0)) continue;
    const macro = (v: unknown) => {
      const n = toNum(v);
      return n >= 0 ? n : 0;
    };
    const conf = toNum(r.confidence);
    items.push({
      name,
      grams: Math.round(grams),
      kcal: Math.round(kcal),
      protein: macro(r.protein),
      carbs: macro(r.carbs),
      fat: macro(r.fat),
      confidence: Number.isFinite(conf) ? clamp01(conf) : 0.5,
    });
  }
  const overall = toNum(obj.confidence);
  const confidence = Number.isFinite(overall)
    ? clamp01(overall)
    : items.length
      ? items.reduce((s, i) => s + i.confidence, 0) / items.length
      : 0;
  const notes = typeof obj.notes === 'string' && obj.notes.trim() ? obj.notes.trim() : undefined;
  return { items, confidence, notes };
}

export interface ProviderRequest {
  provider: AIProviderId;
  config: AIProviderConfig;
  apiKey: string | null;
  prompt: string;
  imageBase64?: string;
  timeoutMs?: number;
}

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
  const { provider, config, apiKey, prompt, imageBase64 } = req;
  if (!KEY_OPTIONAL[provider] && !apiKey) throw new Error('No API key saved for this provider.');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), req.timeoutMs ?? (provider === 'local' ? 180000 : 60000));
  try {
    let url: string;
    let headers: Record<string, string> = { 'content-type': 'application/json' };
    let body: unknown;

    if (provider === 'anthropic') {
      url = 'https://api.anthropic.com/v1/messages';
      headers = { ...headers, 'x-api-key': apiKey ?? '', 'anthropic-version': '2023-06-01' };
      const content: unknown[] = [];
      if (imageBase64) content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 } });
      content.push({ type: 'text', text: prompt });
      body = { model: config.model, max_tokens: 1500, messages: [{ role: 'user', content }] };
    } else if (provider === 'gemini') {
      url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent`;
      headers = { ...headers, 'x-goog-api-key': apiKey ?? '' };
      const parts: unknown[] = [];
      if (imageBase64) parts.push({ inline_data: { mime_type: 'image/jpeg', data: imageBase64 } });
      parts.push({ text: prompt });
      body = { contents: [{ role: 'user', parts }], generationConfig: { responseMimeType: 'application/json', temperature: 0.2 } };
    } else {
      // OpenAI and OpenAI-compatible local servers (Ollama, LM Studio)
      const base = trimSlash(config.baseUrl || (provider === 'openai' ? 'https://api.openai.com/v1' : ''));
      if (!base) throw new Error('No server address set.');
      url = `${base}/chat/completions`;
      if (apiKey) headers = { ...headers, authorization: `Bearer ${apiKey}` };
      const content: unknown[] = [{ type: 'text', text: prompt }];
      if (imageBase64) content.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } });
      body = {
        model: config.model,
        messages: [{ role: 'user', content }],
        // LM Studio rejects json_object, so local servers rely on the prompt alone.
        ...(provider === 'openai' ? { response_format: { type: 'json_object' } } : { temperature: 0.2 }),
      };
    }

    const res = await fetchImpl(url, { method: 'POST', headers, body: JSON.stringify(body), signal: ctrl.signal });
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
    if ((e as Error)?.name === 'AbortError') throw new Error('The request timed out.');
    throw e;
  } finally {
    clearTimeout(timer);
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
): Promise<AnalyzeOutcome> {
  const order = providerOrder(settings);
  if (!order.length) throw new Error('NO_PROVIDER');
  const prompt = buildMealPrompt(lang, hint);
  const attempts: AnalyzeAttempt[] = [];
  let best: AIResult | null = null;

  for (const provider of order) {
    const config = settings.providers[provider];
    try {
      const text = await call({ provider, config, apiKey: await getKey(provider), prompt, imageBase64 });
      const parsed = parseMealJson(text);
      const result: AIResult = { ...parsed, provider, model: config.model };
      attempts.push({ provider, ok: true, confidence: parsed.confidence });
      if (!best || (result.items.length > 0 && (best.items.length === 0 || result.confidence > best.confidence))) best = result;
      if (result.items.length > 0 && result.confidence >= settings.minConfidence) break;
    } catch (e) {
      attempts.push({ provider, ok: false, error: (e as Error)?.message ?? String(e) });
    }
  }

  if (!best) {
    throw new Error(attempts.map((a) => `${PROVIDER_NAMES[a.provider]}: ${a.error}`).join('\n'));
  }
  return { result: best, attempts, usedFallback: best.provider !== order[0] };
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
