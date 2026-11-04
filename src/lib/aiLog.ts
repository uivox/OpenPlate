import { BACKUP_FORMAT_ID } from './appIdentity';
import type { LabelResult } from './labelScan';
import type { ProviderRequest } from './ai';
import type { AIItem, AIProviderId, DiaryEntry, MealType, Nutrients, Serving } from './types';

/*
 * The AI answer log: an opt-in record of what the AI answered and what the user kept, so the
 * prompts and models can be evaluated later (scripts/ai-log-unpack.mjs, .claude/skills/ai-eval).
 * Everything here is pure; aiLogStore(.web).ts keeps the records and photos on the device. The
 * log is never part of a backup and is only sent anywhere when the user exports it.
 */

/**
 * Bump the matching version whenever buildMealPrompt (ai.ts) or buildLabelPrompt (labelScan.ts)
 * changes, so the evaluation can compare answers before and after the change.
 */
export const PROMPT_VERSION = { meal: 'meal-1', label: 'label-1' } as const;

export type AILogKind = 'meal' | 'label';

/** Quick tags the user can add to an answer. */
export const AI_RATING_TAGS = ['spot_on', 'portion_off', 'wrong_food', 'values_off', 'missed_item'] as const;
export type AIRatingTag = (typeof AI_RATING_TAGS)[number];

export interface AIRating {
  tags: AIRatingTag[];
  note?: string;
  /** Meal photos: the user weighed the food, so their grams are ground truth. */
  weighed?: boolean;
}

export interface AILogAttempt {
  provider: AIProviderId;
  model: string;
  ok: boolean;
  ms: number;
  /** The reply text as received (shortened), before parsing. */
  raw?: string;
  error?: string;
}

export interface MealOutcome {
  meal: MealType;
  date: string;
  /** One row per item the AI found, in the AI's order. */
  items: { name: string; grams: number; kept: boolean; entryId?: string }[];
}

export interface LabelOutcome {
  name: string;
  brand?: string;
  unit: 'g' | 'ml';
  per100: Nutrients;
  servings: Serving[];
}

/** saved: the user added the meal / saved the food. not_saved: they left or retried. failed: no usable answer. */
export type AILogStatus = 'saved' | 'not_saved' | 'failed';

interface RecordBase {
  v: 1;
  id: string;
  createdAt: number;
  promptVersion: string;
  lang: 'de' | 'en';
  attempts: AILogAttempt[];
  /** The provider whose answer was shown. */
  answeredBy?: { provider: AIProviderId; model: string; usedFallback: boolean };
  status: AILogStatus;
  error?: string;
  photoCount: number;
  rating?: AIRating;
}

export interface MealLogRecord extends RecordBase {
  kind: 'meal';
  hint?: string;
  ai?: { items: AIItem[]; confidence: number; notes?: string };
  outcome?: MealOutcome;
}

export interface LabelLogRecord extends RecordBase {
  kind: 'label';
  /** Name and brand the app already knew from Open Food Facts, if any. */
  known?: { name?: string; brand?: string };
  ai?: LabelResult;
  outcome?: LabelOutcome;
}

export type AILogRecord = MealLogRecord | LabelLogRecord;

/** At most this much is kept; the oldest records go first. */
export const AI_LOG_LIMITS = { records: 300, bytes: 100 * 1024 * 1024 };
export const MAX_RAW_REPLY = 8000;

/* ---------- Recording calls ---------- */

type Call = (req: ProviderRequest) => Promise<string>;

/**
 * Wraps the provider call used by analyzeMeal / analyzeLabel so every attempt (including the
 * fallback and failures) is recorded with its raw reply and duration. `now` is injectable for tests.
 */
export function recordingCall(call: Call, attempts: AILogAttempt[], now: () => number = Date.now): Call {
  return async (req) => {
    const start = now();
    const base = { provider: req.provider, model: req.config.model };
    try {
      const text = await call(req);
      attempts.push({ ...base, ok: true, ms: now() - start, raw: text.slice(0, MAX_RAW_REPLY) });
      return text;
    } catch (e) {
      attempts.push({ ...base, ok: false, ms: now() - start, error: String((e as Error)?.message ?? e).slice(0, 500) });
      throw e;
    }
  };
}

/**
 * A reply can arrive (the call succeeded) and still be unusable (no JSON, nothing plausible).
 * analyzeMeal / analyzeLabel note that in their own attempts; this copies those errors onto the
 * recorded calls, matched in order per provider.
 */
export function markParseFailures(attempts: AILogAttempt[], analyzerAttempts: { provider: AIProviderId; ok: boolean; error?: string }[]): AILogAttempt[] {
  const out = attempts.map((a) => ({ ...a }));
  let j = 0;
  for (const a of analyzerAttempts) {
    while (j < out.length && out[j].provider !== a.provider) j++;
    if (j >= out.length) break;
    if (out[j].ok && !a.ok) out[j] = { ...out[j], ok: false, error: a.error };
    j++;
  }
  return out;
}

/* ---------- Building records ---------- */

export function cleanRating(r: AIRating | null | undefined, kind: AILogKind): AIRating | undefined {
  if (!r) return undefined;
  const tags = AI_RATING_TAGS.filter((t) => r.tags.includes(t));
  const note = r.note?.trim().slice(0, 1000) || undefined;
  const weighed = kind === 'meal' && r.weighed ? true : undefined;
  if (!tags.length && !note && !weighed) return undefined;
  return { tags, ...(note ? { note } : {}), ...(weighed ? { weighed } : {}) };
}

export function newMealRecord(p: { id: string; createdAt: number; lang: 'de' | 'en'; hint?: string; photoCount: number }): MealLogRecord {
  return {
    v: 1,
    kind: 'meal',
    id: p.id,
    createdAt: p.createdAt,
    promptVersion: PROMPT_VERSION.meal,
    lang: p.lang,
    ...(p.hint?.trim() ? { hint: p.hint.trim().slice(0, 500) } : {}),
    attempts: [],
    status: 'not_saved',
    photoCount: p.photoCount,
  };
}

export function newLabelRecord(p: {
  id: string;
  createdAt: number;
  lang: 'de' | 'en';
  photoCount: number;
  known?: { name?: string; brand?: string } | null;
}): LabelLogRecord {
  const known = p.known && (p.known.name || p.known.brand) ? { name: p.known.name, brand: p.known.brand } : undefined;
  return {
    v: 1,
    kind: 'label',
    id: p.id,
    createdAt: p.createdAt,
    promptVersion: PROMPT_VERSION.label,
    lang: p.lang,
    ...(known ? { known } : {}),
    attempts: [],
    status: 'not_saved',
    photoCount: p.photoCount,
  };
}

/* ---------- Size limit ---------- */

export interface StoredSize {
  id: string;
  createdAt: number;
  bytes: number;
}

/** Ids to delete so at most `limits.records` records and `limits.bytes` bytes remain (oldest first). */
export function recordsToPrune(stored: StoredSize[], limits = AI_LOG_LIMITS): string[] {
  const newestFirst = [...stored].sort((a, b) => b.createdAt - a.createdAt);
  const keep: string[] = [];
  const drop: string[] = [];
  let bytes = 0;
  for (const s of newestFirst) {
    if (keep.length < limits.records && bytes + s.bytes <= limits.bytes) {
      keep.push(s.id);
      bytes += s.bytes;
    } else drop.push(s.id);
  }
  return drop;
}

/** Bytes a base64 string decodes to. */
export const base64Bytes = (b64: string) => Math.floor((b64.length * 3) / 4) - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);

/* ---------- Export ---------- */

/** What the diary says now about an entry created from a meal photo (it may have been edited or deleted later). */
export interface DiaryNow {
  entryId: string;
  exists: boolean;
  grams?: number;
  meal?: MealType;
  date?: string;
}

export type ExportedRecord = AILogRecord & { diaryNow?: DiaryNow[]; photos: string[] };

export interface AILogExport {
  app: typeof BACKUP_FORMAT_ID;
  kind: 'ai-log';
  version: 1;
  exportedAt: string;
  records: ExportedRecord[];
}

export function diaryNowFor(record: AILogRecord, entries: DiaryEntry[]): DiaryNow[] | undefined {
  if (record.kind !== 'meal' || !record.outcome) return undefined;
  const ids = record.outcome.items.map((i) => i.entryId).filter((x): x is string => !!x);
  if (!ids.length) return undefined;
  const byId = new Map(entries.map((e) => [e.id, e]));
  return ids.map((entryId) => {
    const e = byId.get(entryId);
    return e ? { entryId, exists: true, grams: e.grams, meal: e.meal, date: e.date } : { entryId, exists: false };
  });
}

export function buildAILogExport(
  records: AILogRecord[],
  photosOf: (id: string) => string[],
  entries: DiaryEntry[],
  now = new Date(),
): AILogExport {
  return {
    app: BACKUP_FORMAT_ID,
    kind: 'ai-log',
    version: 1,
    exportedAt: now.toISOString(),
    records: [...records]
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((r) => {
        const diaryNow = diaryNowFor(r, entries);
        return { ...r, ...(diaryNow ? { diaryNow } : {}), photos: photosOf(r.id) };
      }),
  };
}

export const aiLogFileName = (day: string) => `tellerwerk-ai-log-${day}.json`;

/** "12.3 MB" / "12,3 MB" for the settings screen. */
export function logSizeLabel(bytes: number, lang: 'de' | 'en'): string {
  const mb = bytes / (1024 * 1024);
  const text = mb < 0.1 && bytes > 0 ? '0.1' : mb.toFixed(1);
  return `${lang === 'de' ? text.replace('.', ',') : text} MB`;
}

/** Reads a stored record back; anything that isn't a record of this version is skipped. */
export function parseStoredRecord(text: string): AILogRecord | null {
  try {
    const r = JSON.parse(text) as Partial<AILogRecord>;
    if (r && r.v === 1 && typeof r.id === 'string' && (r.kind === 'meal' || r.kind === 'label') && typeof r.createdAt === 'number') {
      return r as AILogRecord;
    }
  } catch {
    /* damaged file */
  }
  return null;
}

/** Ids are used as file names: only letters, digits, - and _. */
export const safeLogId = (id: string) => /^[\w-]{1,64}$/.test(id);
