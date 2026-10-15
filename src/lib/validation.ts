import type { TKey } from './i18n';
import { bmi, isAdult, MAX_WEIGHT_KG, MIN_TARGET_BMI, minHealthyWeight, validWeight } from './nutrition';
import type { ProfileDraft } from './types';

export interface Problem {
  key: TKey;
  params?: Record<string, string | number>;
}

/**
 * First problem with a profile draft, or null when it can be saved. Besides plain range checks this
 * holds the safety rules: weight loss only for adults, not when already at a BMI of 18.5 or below,
 * and never to a target below a BMI of 18.5.
 */
export function draftProblem(d: ProfileDraft, now = new Date()): Problem | null {
  const year = now.getFullYear();
  if (!d.birthYear || d.birthYear < year - 100 || d.birthYear > year - 13) return { key: 'err_birth_year' };
  if (!d.heightCm || d.heightCm < 120 || d.heightCm > 230) return { key: 'err_height' };
  if (!validWeight(d.startWeightKg)) return { key: 'err_weight' };
  if (d.goal !== 'maintain' && !validWeight(d.targetWeightKg)) return { key: 'err_weight' };
  if (d.goal === 'lose') {
    if (!isAdult(d.birthYear, now)) return { key: 'err_minor_lose' };
    if (bmi(d.startWeightKg, d.heightCm) <= MIN_TARGET_BMI) return { key: 'err_underweight_lose' };
    if (d.targetWeightKg! >= d.startWeightKg) return { key: 'err_target_lose' };
    const min = minHealthyWeight(d.heightCm);
    if (d.targetWeightKg! < min) return { key: 'err_target_bmi', params: { kg: min } };
  }
  if (d.goal === 'gain' && d.targetWeightKg! <= d.startWeightKg) return { key: 'err_target_gain' };
  if (d.goal === 'gain' && d.targetWeightKg! > MAX_WEIGHT_KG) return { key: 'err_weight' };
  if (d.goal !== 'maintain' && (d.paceKgPerWeek === null || d.paceKgPerWeek < 0.05 || d.paceKgPerWeek > 2)) return { key: 'err_pace' };
  if (d.useCustomActivity && (d.customActivityFactor === null || d.customActivityFactor < 1 || d.customActivityFactor > 2.5)) return { key: 'err_factor' };
  return null;
}
