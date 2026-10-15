import type { Activity, DiaryEntry, MacroGrams, MacroSplit, MealType, Nutrients, Profile } from './types';

export const ACTIVITY_FACTORS: Record<Activity, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

export type PresetId = 'balanced' | 'high_protein' | 'low_carb' | 'keto';
export const MACRO_PRESETS: { id: PresetId; split: MacroSplit }[] = [
  { id: 'balanced', split: { carbs: 50, protein: 20, fat: 30 } },
  { id: 'high_protein', split: { carbs: 40, protein: 30, fat: 30 } },
  { id: 'low_carb', split: { carbs: 25, protein: 30, fat: 45 } },
  { id: 'keto', split: { carbs: 5, protein: 25, fat: 70 } },
];

/** Share of the daily goal per meal. */
export const MEAL_SHARE: Record<MealType, number> = {
  breakfast: 0.25,
  lunch: 0.35,
  dinner: 0.3,
  snack: 0.1,
};

const KCAL_PER_KG_FAT = 7700;

export function ageFromBirthYear(birthYear: number, now = new Date()): number {
  return Math.max(0, now.getFullYear() - birthYear);
}

/** Mifflin-St Jeor resting energy expenditure. */
export function bmr(p: Pick<Profile, 'sex' | 'birthYear' | 'heightCm'>, weightKg: number, now = new Date()): number {
  const age = ageFromBirthYear(p.birthYear, now);
  const base = 10 * weightKg + 6.25 * p.heightCm - 5 * age;
  return p.sex === 'male' ? base + 5 : base - 161;
}

/** Activity multiplier: the user's own value when set, else the chosen level. */
export function activityFactor(p: Pick<Profile, 'activity' | 'customActivityFactor'>): number {
  const own = p.customActivityFactor;
  return own && own >= 1 && own <= 3 ? own : ACTIVITY_FACTORS[p.activity];
}

export function tdee(
  p: Pick<Profile, 'sex' | 'birthYear' | 'heightCm' | 'activity' | 'customActivityFactor'>,
  weightKg: number,
  now = new Date(),
): number {
  return bmr(p, weightKg, now) * activityFactor(p);
}

/** Maintenance calories: a known value the user entered, else BMR × activity. */
export function maintenanceKcal(p: Profile, weightKg: number, now = new Date()): number {
  const own = p.customMaintenanceKcal;
  return own && own >= 800 ? own : tdee(p, weightKg, now);
}

export function minimumKcal(sex: Profile['sex']): number {
  return sex === 'male' ? 1500 : 1200;
}

/* ---------- Safety rules ----------
 * A calorie tracker can do harm: to children and teenagers, who need to grow, and to people with
 * (or at risk of) an eating disorder. So:
 * - weight loss is only applied for adults and only above a BMI of 18.5, and targets below a BMI of
 *   18.5 can't be set;
 * - no daily goal goes below the usual minimum (1200 / 1500 kcal), or below maintenance for people
 *   whose maintenance is lower than that, not even an exact number the user typed;
 * - fasting plans are for adults only (fasting.ts).
 */

/** Only the birth year is known, so someone counts as an adult from the calendar year they turn 18. */
export const ADULT_AGE = 18;
export function isAdult(birthYear: number, now = new Date()): boolean {
  return ageFromBirthYear(birthYear, now) >= ADULT_AGE;
}

/** Lowest BMI a weight-loss target may have (WHO lower bound of normal weight). */
export const MIN_TARGET_BMI = 18.5;
export function minHealthyWeight(heightCm: number): number {
  const m = heightCm / 100;
  return Math.ceil(MIN_TARGET_BMI * m * m * 10) / 10;
}

/** Accepted body weight range everywhere in the app. */
export const MIN_WEIGHT_KG = 35;
export const MAX_WEIGHT_KG = 300;
export function validWeight(kg: number | null | undefined): kg is number {
  return typeof kg === 'number' && kg >= MIN_WEIGHT_KG && kg <= MAX_WEIGHT_KG;
}

/**
 * Whether the chosen goal is currently applied:
 * - 'active': deficit or surplus as planned (or 'maintain')
 * - 'reached': the target weight is reached, so the plan holds the weight
 * - 'minor': weight loss is not applied for under-18s
 * - 'underweight': weight loss is not applied at or below a BMI of 18.5
 */
export type GoalStatus = 'active' | 'reached' | 'minor' | 'underweight';

export function goalStatus(p: Profile, weightKg: number, now = new Date()): GoalStatus {
  if (p.goal === 'lose') {
    if (!isAdult(p.birthYear, now)) return 'minor';
    if (bmi(weightKg, p.heightCm) <= MIN_TARGET_BMI) return 'underweight';
    if (weightKg <= p.targetWeightKg) return 'reached';
  }
  if (p.goal === 'gain' && weightKg >= p.targetWeightKg) return 'reached';
  return 'active';
}

/** Lowest daily goal the app sets: the usual minimum, or maintenance when that is lower still. */
export function kcalFloor(sex: Profile['sex'], maintenance: number): number {
  return Math.min(minimumKcal(sex), Math.round(maintenance / 10) * 10);
}

/** Daily kcal difference for a weekly pace (≈7,700 kcal per kg of body fat): 0.4 kg/week → 440 kcal/day. */
export function kcalPerDayForPace(kgPerWeek: number): number {
  return (kgPerWeek * KCAL_PER_KG_FAT) / 7;
}

export type GoalWarning = 'fast_pace' | 'below_bmr' | 'floored' | 'minor' | 'underweight' | 'reached';

export interface GoalDetails {
  /** Daily calorie goal, rounded to 10 kcal. */
  kcal: number;
  maintenance: number;
  bmr: number;
  /** Goal minus maintenance (negative while losing). */
  delta: number;
  /** Implied weekly change in kg from `delta` (negative while losing). */
  kgPerWeek: number;
  /** Whether the weight goal is applied (see goalStatus). */
  status: GoalStatus;
  warnings: GoalWarning[];
}

/**
 * The daily goal and everything worth telling the user about it. In 'custom' mode the user's own
 * number is used; in 'auto' mode the weekly pace is turned into a daily surplus/deficit. Either way
 * the safety rules above apply: no deficit for under-18s or at a BMI of 18.5 or less, and never
 * below the minimum (kcalFloor). Warnings explain what was changed and why.
 */
export function goalDetails(p: Profile, weightKg: number, now = new Date()): GoalDetails {
  const maintenance = maintenanceKcal(p, weightKg, now);
  const rest = bmr(p, weightKg, now);
  const status = goalStatus(p, weightKg, now);
  const floor = kcalFloor(p.sex, maintenance);
  const warnings: GoalWarning[] = [];
  let goal = maintenance;
  if (p.goalMode === 'custom' && p.customKcal && p.customKcal > 0) {
    goal = p.customKcal;
  } else if (status === 'active') {
    const delta = kcalPerDayForPace(p.paceKgPerWeek);
    if (p.goal === 'lose') goal = maintenance - delta;
    if (p.goal === 'gain') goal = maintenance + delta;
  }
  if (status === 'minor' || status === 'underweight') {
    goal = Math.max(goal, maintenance);
    warnings.push(status);
  }
  if (status === 'reached' && p.goalMode !== 'custom') warnings.push('reached');
  if (goal < floor) {
    goal = floor;
    warnings.push('floored');
  }
  const kcal = Math.round(goal / 10) * 10;
  const delta = kcal - maintenance;
  const kgPerWeek = (delta * 7) / KCAL_PER_KG_FAT;
  // More than about 1 % of body weight per week is aggressive in either direction.
  if (Math.abs(kgPerWeek) > weightKg * 0.01 + 0.005) warnings.push('fast_pace');
  if (kcal < rest) warnings.push('below_bmr');
  return { kcal, maintenance: Math.round(maintenance), bmr: Math.round(rest), delta: Math.round(delta), kgPerWeek, status, warnings };
}

/** Daily calorie goal from profile and current weight, rounded to 10 kcal. */
export function dailyKcalGoal(p: Profile, weightKg: number, now = new Date()): number {
  return goalDetails(p, weightKg, now).kcal;
}

/** Calorie goal on a 5:2 / 6:1 fasting day. */
export function fastingDayKcal(sex: Profile['sex']): number {
  return sex === 'male' ? 600 : 500;
}

export function macroGrams(kcal: number, split: MacroSplit): MacroGrams {
  return {
    carbs: Math.round((kcal * split.carbs) / 100 / 4),
    protein: Math.round((kcal * split.protein) / 100 / 4),
    fat: Math.round((kcal * split.fat) / 100 / 9),
  };
}

/** kcal that a set of macro grams adds up to (4/4/9). */
export function kcalFromMacros(g: MacroGrams): number {
  return g.carbs * 4 + g.protein * 4 + g.fat * 9;
}

/** Percentage split (rounded, adds up to 100) equivalent to the given grams. */
export function splitFromGrams(g: MacroGrams): MacroSplit {
  const total = kcalFromMacros(g);
  if (total <= 0) return { carbs: 50, protein: 20, fat: 30 };
  const carbs = Math.round(((g.carbs * 4) / total) * 100);
  const protein = Math.round(((g.protein * 4) / total) * 100);
  return { carbs, protein, fat: 100 - carbs - protein };
}

export function isValidSplit(s: MacroSplit): boolean {
  const ok = (v: number) => Number.isFinite(v) && v >= 0 && v <= 100;
  return ok(s.carbs) && ok(s.protein) && ok(s.fat) && Math.round(s.carbs + s.protein + s.fat) === 100;
}

/**
 * Macro targets for a day. With fixed grams they apply on normal days; on a lower-calorie day
 * (5:2 fasting) they shrink in proportion so they still fit the day's calories.
 */
export function macroTargets(p: Pick<Profile, 'macroMode' | 'macroGramsTarget' | 'macroSplit'>, kcal: number, normalKcal = kcal): MacroGrams {
  const g = p.macroMode === 'grams' ? p.macroGramsTarget : undefined;
  if (!g) return macroGrams(kcal, p.macroSplit);
  const f = normalKcal > 0 && kcal < normalKcal ? kcal / normalKcal : 1;
  return { carbs: Math.round(g.carbs * f), protein: Math.round(g.protein * f), fat: Math.round(g.fat * f) };
}

export function scaleNutrients(per100: Nutrients, grams: number): Nutrients {
  const f = grams / 100;
  const s = (v: number | undefined) => (v === undefined ? undefined : v * f);
  return {
    kcal: per100.kcal * f,
    protein: per100.protein * f,
    carbs: per100.carbs * f,
    fat: per100.fat * f,
    sugar: s(per100.sugar),
    fiber: s(per100.fiber),
    satFat: s(per100.satFat),
    salt: s(per100.salt),
  };
}

export function emptyNutrients(): Nutrients {
  return { kcal: 0, protein: 0, carbs: 0, fat: 0 };
}

export function entryNutrients(e: DiaryEntry): Nutrients {
  return scaleNutrients(e.food.per100, e.grams);
}

export function sumEntries(entries: DiaryEntry[]): Nutrients {
  return entries.reduce<Nutrients>((acc, e) => {
    const n = entryNutrients(e);
    return {
      kcal: acc.kcal + n.kcal,
      protein: acc.protein + n.protein,
      carbs: acc.carbs + n.carbs,
      fat: acc.fat + n.fat,
    };
  }, emptyNutrients());
}

/** Rough calories burned by walking: about 0.57 kcal per step per 1000 kg body weight. */
export function stepsKcal(steps: number, weightKg: number): number {
  return Math.round(steps * weightKg * 0.00057);
}

export function bmi(weightKg: number, heightCm: number): number {
  const m = heightCm / 100;
  return m > 0 ? weightKg / (m * m) : 0;
}

export function bmiCategory(value: number): 'under' | 'normal' | 'over' | 'obese' {
  if (value < 18.5) return 'under';
  if (value < 25) return 'normal';
  if (value < 30) return 'over';
  return 'obese';
}

/** Default daily water goal: 35 ml per kg, rounded to 250 ml, between 1.5 and 4 l. */
export function defaultWaterGoal(weightKg: number): number {
  const ml = Math.round((weightKg * 35) / 250) * 250;
  return Math.min(4000, Math.max(1500, ml));
}

export function per100From(portion: Nutrients, grams: number): Nutrients {
  if (grams <= 0) return { ...portion };
  const f = 100 / grams;
  return {
    kcal: portion.kcal * f,
    protein: portion.protein * f,
    carbs: portion.carbs * f,
    fat: portion.fat * f,
  };
}
