import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { COMMUNITY_RECIPES } from './communityRecipes';
import { dayKey } from './dates';
import { openStepSettings, stepSource, stepsForDay } from './device';
import { dayGoal } from './goals';
import { stepsKcal } from './nutrition';
import { resolveCommunity } from './recipes';
import { stepsActionKey, stepsReasonKey, type StepReading } from './steps';
import { useStore } from './store';
import type { Profile, Recipe, WeightEntry } from './types';
import { useT } from './useT';

/** Calorie and macro goals for one day (see goals.ts). */
export function goalsFor(profile: Profile, weights: WeightEntry[], date: string) {
  return dayGoal(profile, weights, date);
}

/**
 * Today's day key that changes at midnight, also when the app was in the background
 * (timers do not run there, so it re-checks whenever the app becomes active again).
 */
export function useToday(): string {
  const [today, setToday] = useState(dayKey);
  useEffect(() => {
    const refresh = () => setToday(dayKey());
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const next = new Date();
      next.setHours(24, 0, 1, 0);
      timer = setTimeout(() => {
        refresh();
        schedule();
      }, next.getTime() - Date.now());
    };
    schedule();
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') refresh();
    });
    return () => {
      clearTimeout(timer);
      sub.remove();
    };
  }, []);
  return today;
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

/** False only in browsers, which can't read steps; there the step settings are hidden. */
export const canReadSteps = stepSource !== 'browser';
/** Why steps can never be read here (browsers), for the settings. */
export const STEPS_REASON = stepsReasonKey(stepSource, 'unsupported');

/**
 * The day's steps (null when they can't be read), the calories they burn, and why they're missing:
 * `reason` is the text to show and `action` the button that fixes it (see steps.ts).
 */
export function useSteps(date: string, weightKg: number) {
  // Null until the first answer, so the card doesn't flash "not available" while it loads.
  const [reading, setReading] = useState<StepReading | null>(null);
  const load = useCallback(() => {
    let alive = true;
    stepsForDay(date).then((r) => alive && setReading(r));
    return () => {
      alive = false;
    };
  }, [date]);
  useFocusEffect(load);
  useEffect(() => {
    // Back from the settings or Health Connect: the person may have just allowed steps.
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') load();
    });
    if (date !== dayKey()) return () => sub.remove();
    const id = setInterval(load, 60000);
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [date, load]);
  const steps = reading?.steps ?? null;
  const status = reading?.status ?? 'ok';
  const fix = stepsActionKey(stepSource, status);
  return {
    steps,
    loading: reading === null,
    kcal: steps === null ? 0 : stepsKcal(steps, weightKg),
    reason: reading && steps === null ? stepsReasonKey(stepSource, status) : null,
    action: fix ? { label: fix, run: () => void openStepSettings(status) } : null,
  };
}

/** Own recipes plus the community ones in the current language. Community ids start with "community:". */
export function useRecipes(): Recipe[] {
  const own = useStore((s) => s.recipes);
  const { lang } = useT();
  const community = useMemo(() => COMMUNITY_RECIPES.map((c) => resolveCommunity(c, lang).recipe), [lang]);
  return useMemo(() => [...own, ...community], [own, community]);
}
