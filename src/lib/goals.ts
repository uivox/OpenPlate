import { isFastingDay } from './fasting';
import { fastingDayKcal, goalDetails, macroTargets } from './nutrition';
import type { MacroGrams, Profile, WeightEntry } from './types';

/** Latest logged weight on or before the given day, else the start weight. `weights` is sorted by date. */
export function weightOn(weights: WeightEntry[], profile: Profile, date: string): number {
  let kg = profile.startWeightKg;
  for (const w of weights) {
    if (w.date <= date) kg = w.kg;
    else break;
  }
  return kg;
}

export interface DayGoal {
  weight: number;
  fastDay: boolean;
  kcal: number;
  macros: MacroGrams;
}

/** Calorie and macro goals for one day: weight on that day, 5:2 / 6:1 fasting days, custom goals. */
export function dayGoal(profile: Profile, weights: WeightEntry[], date: string, now = new Date()): DayGoal {
  const weight = weightOn(weights, profile, date);
  const fastDay = isFastingDay(profile, date);
  const normal = goalDetails(profile, weight, now).kcal;
  const kcal = fastDay ? fastingDayKcal(profile.sex) : normal;
  return { weight, fastDay, kcal, macros: macroTargets(profile, kcal, normal) };
}
