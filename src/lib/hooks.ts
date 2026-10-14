import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { dayKey } from './dates';
import { stepsForDay } from './device';
import { dayGoal } from './goals';
import { stepsKcal } from './nutrition';
import type { Profile, WeightEntry } from './types';

/** Calorie and macro goals for one day (see goals.ts). */
export function goalsFor(profile: Profile, weights: WeightEntry[], date: string) {
  return dayGoal(profile, weights, date);
}

/** Re-renders every `ms` milliseconds while mounted. */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

export function useSteps(date: string, weightKg: number) {
  const [steps, setSteps] = useState<number | null>(null);
  const load = useCallback(() => {
    let alive = true;
    stepsForDay(date).then((s) => alive && setSteps(s));
    return () => {
      alive = false;
    };
  }, [date]);
  useFocusEffect(load);
  useEffect(() => {
    if (date !== dayKey()) return;
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
  }, [date, load]);
  return { steps, kcal: steps === null ? 0 : stepsKcal(steps, weightKg) };
}
