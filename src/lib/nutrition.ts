import type { Activity, DiaryEntry, MacroSplit, MealType, Nutrients, Profile } from './types';

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

export function tdee(p: Pick<Profile, 'sex' | 'birthYear' | 'heightCm' | 'activity'>, weightKg: number, now = new Date()): number {
  return bmr(p, weightKg, now) * ACTIVITY_FACTORS[p.activity];
}

export function minimumKcal(sex: Profile['sex']): number {
  return sex === 'male' ? 1500 : 1200;
}

/** Daily calorie goal from profile and current weight, rounded to 10 kcal. */
export function dailyKcalGoal(p: Profile, weightKg: number, now = new Date()): number {
  const maintenance = tdee(p, weightKg, now);
  const delta = (p.paceKgPerWeek * KCAL_PER_KG_FAT) / 7;
  let goal = maintenance;
  if (p.goal === 'lose') goal = Math.max(maintenance - delta, minimumKcal(p.sex));
  if (p.goal === 'gain') goal = maintenance + delta;
  return Math.round(goal / 10) * 10;
}

/** Calorie goal on a 5:2 / 6:1 fasting day. */
export function fastingDayKcal(sex: Profile['sex']): number {
  return sex === 'male' ? 600 : 500;
}

export function macroGrams(kcal: number, split: MacroSplit): { carbs: number; protein: number; fat: number } {
  return {
    carbs: Math.round((kcal * split.carbs) / 100 / 4),
    protein: Math.round((kcal * split.protein) / 100 / 4),
    fat: Math.round((kcal * split.fat) / 100 / 9),
  };
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
