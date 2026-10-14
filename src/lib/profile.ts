import type { ProfileDraft } from '../components/ProfileFields';
import { defaultWaterGoal, MACRO_PRESETS } from './nutrition';
import type { Profile } from './types';

export function buildProfile(d: ProfileDraft, base?: Partial<Profile>): Profile {
  const weight = d.startWeightKg!;
  const split = base?.macroSplit ?? (d.goal === 'gain' ? MACRO_PRESETS[1].split : MACRO_PRESETS[0].split);
  return {
    name: base?.name,
    sex: d.sex,
    birthYear: d.birthYear!,
    heightCm: d.heightCm!,
    startWeightKg: weight,
    targetWeightKg: d.goal === 'maintain' ? weight : d.targetWeightKg!,
    activity: d.activity,
    goal: d.goal,
    paceKgPerWeek: d.goal === 'maintain' ? 0 : d.paceKgPerWeek ?? 0.5,
    macroSplit: split,
    waterGoalMl: base?.waterGoalMl ?? defaultWaterGoal(weight),
    glassMl: base?.glassMl ?? 250,
    stepGoal: base?.stepGoal ?? 10000,
    addActivityCalories: base?.addActivityCalories ?? false,
    fastingPlanId: base?.fastingPlanId ?? '16:8',
    fastingDays: base?.fastingDays ?? [1, 4],
    createdAt: base?.createdAt ?? Date.now(),
    customActivityFactor: d.useCustomActivity && d.customActivityFactor ? d.customActivityFactor : undefined,
    goalMode: base?.goalMode,
    customKcal: base?.customKcal,
    customMaintenanceKcal: base?.customMaintenanceKcal,
    macroMode: base?.macroMode,
    macroGramsTarget: base?.macroGramsTarget,
  };
}

export function draftFromProfile(p: Profile): ProfileDraft {
  return {
    goal: p.goal,
    sex: p.sex,
    birthYear: p.birthYear,
    heightCm: p.heightCm,
    startWeightKg: p.startWeightKg,
    targetWeightKg: p.targetWeightKg,
    activity: p.activity,
    paceKgPerWeek: p.paceKgPerWeek || 0.5,
    useCustomActivity: !!p.customActivityFactor,
    customActivityFactor: p.customActivityFactor ?? null,
  };
}
