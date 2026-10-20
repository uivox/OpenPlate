import { useMemo } from 'react';
import { dayGoal } from '../lib/goals';
import { useStepHistory } from '../lib/hooks';
import { countsToday, fastingByDay, foodByDay, macroKcal, weightByDay, type DayValue, type Metric, type NutrientKey } from '../lib/insights';
import { useStore } from '../lib/store';
import { useColors } from '../lib/theme';

/** What one statistic shows: its day values, goal per day, colours and whether today counts. */
export interface Series {
  valueOf: DayValue;
  goalOf?: (date: string) => number | undefined;
  countToday: boolean;
  colors: string[];
  /** Steps only: still reading from the phone. */
  loading: boolean;
  /** Steps only: why no day could be read (an i18n key), e.g. always in the browser. */
  stepsReason: string | null;
}

export function useInsightSeries(metric: Metric, nutrient: NutrientKey, from: string, to: string): Series {
  const c = useColors();
  const profile = useStore((s) => s.profile)!;
  const weights = useStore((s) => s.weights);
  const entries = useStore((s) => s.entries);
  const water = useStore((s) => s.water);
  const fasts = useStore((s) => s.fastingHistory);
  const steps = useStepHistory(from, to, metric === 'steps');

  const food = useMemo(() => foodByDay(entries), [entries]);
  const weighIns = useMemo(() => weightByDay(weights), [weights]);
  const fastDays = useMemo(() => fastingByDay(fasts), [fasts]);

  return useMemo<Series>(() => {
    const base = { countToday: countsToday(metric), loading: false, stepsReason: null };
    const kcalGoal = (d: string) => dayGoal(profile, weights, d).kcal;
    switch (metric) {
      case 'energy':
        return { ...base, valueOf: (d) => (food.has(d) ? [food.get(d)!.kcal] : null), goalOf: kcalGoal, colors: [c.carbs] };
      case 'macros':
        return { ...base, valueOf: (d) => (food.has(d) ? macroKcal(food.get(d)!) : null), goalOf: kcalGoal, colors: [c.carbs, c.protein, c.fat] };
      case 'nutrients':
        return { ...base, valueOf: (d) => (food.has(d) ? [food.get(d)![nutrient]] : null), colors: [c.leaf] };
      case 'water':
        return { ...base, valueOf: (d) => ((water[d] ?? 0) > 0 ? [water[d]] : null), goalOf: () => profile.waterGoalMl, colors: [c.water] };
      case 'weight':
        return {
          ...base,
          valueOf: (d) => (weighIns.has(d) ? [weighIns.get(d)!] : null),
          goalOf: profile.goal !== 'maintain' ? () => profile.targetWeightKg : undefined,
          colors: [c.accent],
        };
      case 'fasting':
        return {
          ...base,
          valueOf: (d) => (fastDays.has(d) ? [fastDays.get(d)!.hours] : null),
          goalOf: (d) => fastDays.get(d)?.target,
          colors: [c.protein],
        };
      case 'steps':
        return {
          ...base,
          loading: steps.loading,
          stepsReason: steps.reason,
          valueOf: (d) => (steps.byDay.has(d) ? [steps.byDay.get(d)!] : null),
          goalOf: () => profile.stepGoal,
          colors: [c.leaf],
        };
    }
  }, [metric, nutrient, profile, weights, food, water, weighIns, fastDays, steps, c]);
}
