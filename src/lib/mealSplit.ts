import { MEALS, type MacroGrams, type MealType, type Profile } from './types';

/*
 * How the day's calories are shared between the meals ("meal split"). Stored as whole percent per
 * meal that add up to exactly 100, so the targets follow the daily goal when it changes (weight,
 * activity calories, 5:2 fasting days). A meal may get 0 %: it then has no target of its own.
 * Pure, so it can be tested; the editor is app/meal-split.tsx.
 */

export type MealSplit = Record<MealType, number>;

export const DEFAULT_MEAL_SPLIT: MealSplit = { breakfast: 25, lunch: 35, dinner: 30, snack: 10 };

export type MealSplitPreset = 'default' | 'three' | 'even';
export const MEAL_SPLIT_PRESETS: { id: MealSplitPreset; split: MealSplit }[] = [
  { id: 'default', split: DEFAULT_MEAL_SPLIT },
  { id: 'three', split: { breakfast: 20, lunch: 40, dinner: 40, snack: 0 } },
  { id: 'even', split: { breakfast: 30, lunch: 30, dinner: 30, snack: 10 } },
];

const validPercent = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 100;

/** True when every meal has a whole percent from 0 to 100 and they add up to exactly 100. */
export function isValidMealSplit(v: unknown): v is MealSplit {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  if (!MEALS.every((m) => validPercent(o[m]))) return false;
  return MEALS.reduce((s, m) => s + (o[m] as number), 0) === 100;
}

/** Only the four meals, or null when the value isn't a valid split (for the store and backups). */
export function normalizeMealSplit(v: unknown): MealSplit | null {
  if (!isValidMealSplit(v)) return null;
  return { breakfast: v.breakfast, lunch: v.lunch, dinner: v.dinner, snack: v.snack };
}

/** The user's split, or the default one for profiles that never set it. */
export function mealSplitOf(profile: Pick<Profile, 'mealSplit'> | null | undefined): MealSplit {
  return normalizeMealSplit(profile?.mealSplit) ?? DEFAULT_MEAL_SPLIT;
}

export function presetOf(split: MealSplit): MealSplitPreset | 'custom' {
  return MEAL_SPLIT_PRESETS.find((p) => MEALS.every((m) => p.split[m] === split[m]))?.id ?? 'custom';
}

/** A meal's calorie target for a day budget, or 0 for a 0 % meal. */
export function mealTarget(budget: number, split: MealSplit, meal: MealType): number {
  return Math.max(0, Math.round((budget * split[meal]) / 100));
}

/** A meal's protein, carbs and fat targets: the same share of each daily macro as of the calories. */
export function mealMacroTargets(macros: MacroGrams, split: MealSplit, meal: MealType): MacroGrams {
  const f = split[meal] / 100;
  return { protein: Math.round(macros.protein * f), carbs: Math.round(macros.carbs * f), fat: Math.round(macros.fat * f) };
}

/* ---------- Editing ---------- */

/** What the editor holds while typing: a whole percent per meal, or null for an empty field. */
export type SplitDraft = Record<MealType, number | null>;

/** How many percent are still to be shared out (negative when the meals add up to more than 100). */
export function splitLeft(draft: SplitDraft): number {
  return 100 - MEALS.reduce((s, m) => s + (draft[m] ?? 0), 0);
}

/** The draft as a split, or null while a field is empty, not a whole percent or the total isn't 100. */
export function draftToSplit(draft: SplitDraft): MealSplit | null {
  if (!MEALS.every((m) => draft[m] !== null)) return null;
  const split = { ...draft } as MealSplit;
  return isValidMealSplit(split) ? split : null;
}

/** A typed calorie amount as whole percent of the day's goal (what is stored). */
export function percentFromKcal(kcal: number, goalKcal: number): number {
  if (!(goalKcal > 0) || !(kcal >= 0)) return 0;
  return Math.min(100, Math.round((kcal / goalKcal) * 100));
}

export function kcalFromPercent(percent: number, goalKcal: number): number {
  return goalKcal > 0 ? Math.round((goalKcal * percent) / 100) : 0;
}

/**
 * Moves the shares of `from` to the other meals that already have one, in proportion to their
 * shares (largest remainder, so the result is whole percent that still add up to 100). When no
 * other meal has a share, lunch and dinner split it. Used by the "breakfast falls inside your fast" fix.
 */
export function moveShares(split: MealSplit, from: MealType[]): MealSplit {
  const moved = from.reduce((s, m) => s + split[m], 0);
  if (moved === 0) return split;
  let targets = MEALS.filter((m) => !from.includes(m) && split[m] > 0);
  const weights: Record<string, number> = {};
  if (targets.length) for (const m of targets) weights[m] = split[m];
  else {
    targets = (['lunch', 'dinner'] as MealType[]).filter((m) => !from.includes(m));
    if (!targets.length) targets = MEALS.filter((m) => !from.includes(m));
    if (!targets.length) return split;
    for (const m of targets) weights[m] = 1;
  }
  const total = targets.reduce((s, m) => s + weights[m], 0);
  const out = { ...split };
  for (const m of from) out[m] = 0;
  const exact = targets.map((m) => ({ m, add: (moved * weights[m]) / total }));
  let given = 0;
  for (const e of exact) {
    out[e.m] += Math.floor(e.add);
    given += Math.floor(e.add);
  }
  exact.sort((a, b) => (b.add % 1) - (a.add % 1) || MEALS.indexOf(a.m) - MEALS.indexOf(b.m));
  for (let i = 0; given < moved; i++, given++) out[exact[i % exact.length].m] += 1;
  return out;
}
