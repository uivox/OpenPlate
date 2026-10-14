import {
  MEALS,
  type AISettings,
  type Appearance,
  type LayoutPrefs,
  type DiaryEntry,
  type FastingSession,
  type Food,
  type LanguagePref,
  type Profile,
  type SavedMeal,
  type WeightEntry,
} from './types';

/** Everything the export file carries. API keys are never part of it. */
export interface BackupData {
  profile: Profile | null;
  language: LanguagePref;
  entries: DiaryEntry[];
  customFoods: Food[];
  recentFoods: Food[];
  water: Record<string, number>;
  weights: WeightEntry[];
  fastingActive: FastingSession | null;
  fastingHistory: FastingSession[];
  ai?: Partial<AISettings>;
  /** Saved meals; missing in exports from older versions. */
  meals: SavedMeal[];
  /** Look and layout; optional, normalised by the store on import. */
  appearance?: Partial<Appearance>;
  layout?: Partial<LayoutPrefs>;
}

const BACKUP_KEYS: (keyof BackupData)[] = [
  'profile',
  'language',
  'entries',
  'customFoods',
  'recentFoods',
  'water',
  'weights',
  'fastingActive',
  'fastingHistory',
  'ai',
  'meals',
  'appearance',
  'layout',
];

/** Picks exactly the exported fields from the app state (which also holds functions and UI settings). */
export function pickBackup(state: BackupData): BackupData {
  const out: Partial<Record<keyof BackupData, unknown>> = {};
  for (const k of BACKUP_KEYS) out[k] = state[k];
  return out as unknown as BackupData;
}

export function buildBackup(data: BackupData, now = new Date()) {
  return { app: 'OpenPlate', exportedAt: now.toISOString(), ...pickBackup(data) };
}

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isDay = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function isFood(v: unknown): v is Food {
  return isObj(v) && typeof v.id === 'string' && typeof v.name === 'string' && isObj(v.per100) && isNum(v.per100.kcal);
}

function isEntry(v: unknown): v is DiaryEntry {
  return (
    isObj(v) &&
    typeof v.id === 'string' &&
    isDay(v.date) &&
    MEALS.includes(v.meal as DiaryEntry['meal']) &&
    isNum(v.grams) &&
    isFood(v.food)
  );
}

function isMeal(v: unknown): v is SavedMeal {
  return (
    isObj(v) &&
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    Array.isArray(v.items) &&
    v.items.every((it) => isObj(it) && isFood(it.food) && isNum(it.grams))
  );
}

function isFast(v: unknown): v is FastingSession {
  return isObj(v) && typeof v.id === 'string' && isNum(v.start) && isNum(v.targetHours);
}

function isProfile(v: unknown): v is Profile {
  return (
    isObj(v) &&
    (v.sex === 'female' || v.sex === 'male') &&
    isNum(v.birthYear) &&
    isNum(v.heightCm) &&
    isNum(v.startWeightKg) &&
    isNum(v.targetWeightKg) &&
    isObj(v.macroSplit)
  );
}

/**
 * Reads an OpenPlate export (from the app or the web version). Invalid rows are dropped rather
 * than failing the whole import. Throws `INVALID_BACKUP` when the text is not an export at all.
 */
export function parseBackup(text: string): BackupData {
  let raw: unknown;
  try {
    raw = JSON.parse(text.trim());
  } catch {
    throw new Error('INVALID_BACKUP');
  }
  if (!isObj(raw) || raw.app !== 'OpenPlate') throw new Error('INVALID_BACKUP');

  const water: Record<string, number> = {};
  if (isObj(raw.water)) for (const [k, v] of Object.entries(raw.water)) if (isDay(k) && isNum(v)) water[k] = v;

  const language = raw.language === 'de' || raw.language === 'en' ? raw.language : 'system';

  return {
    profile: isProfile(raw.profile) ? raw.profile : null,
    language,
    entries: list(raw.entries).filter(isEntry),
    customFoods: list(raw.customFoods).filter(isFood),
    recentFoods: list(raw.recentFoods).filter(isFood),
    water,
    weights: list(raw.weights)
      .filter((w): w is WeightEntry => isObj(w) && isDay(w.date) && isNum(w.kg))
      .sort((a, b) => a.date.localeCompare(b.date)),
    fastingActive: isFast(raw.fastingActive) ? { ...raw.fastingActive, notificationId: undefined } : null,
    fastingHistory: list(raw.fastingHistory).filter(isFast),
    ai: isObj(raw.ai) ? (raw.ai as Partial<AISettings>) : undefined,
    appearance: isObj(raw.appearance) ? (raw.appearance as Partial<Appearance>) : undefined,
    layout: isObj(raw.layout) ? (raw.layout as Partial<LayoutPrefs>) : undefined,
    meals: list(raw.meals)
      .filter(isMeal)
      .map((m) => ({ ...m, createdAt: isNum(m.createdAt) ? m.createdAt : 0, lastUsed: isNum(m.lastUsed) ? m.lastUsed : 0 })),
  };
}
