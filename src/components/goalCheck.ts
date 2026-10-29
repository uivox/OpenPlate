import * as Haptics from 'expo-haptics';
import { useMemo } from 'react';
import { applySuggestion, checkIn, dueCheckIn, undoPatch, type Calculation, type CheckIn } from '../lib/adaptiveGoal';
import { dayKey } from '../lib/dates';
import { useStore } from '../lib/store';

/** The current check-in (recomputed when the diary, weights, profile or left-out days change). */
export function useCheckIn(): CheckIn | null {
  const profile = useStore((s) => s.profile);
  const entries = useStore((s) => s.entries);
  const weights = useStore((s) => s.weights);
  const excluded = useStore((s) => s.goalCheck.excluded);
  const today = dayKey();
  return useMemo(() => (profile ? checkIn({ profile, entries, weights, excluded, today }) : null), [profile, entries, weights, excluded, today]);
}

/** The check-in day the diary card is for, or null. */
export function useDueCheckIn(): string | null {
  const prefs = useStore((s) => s.goalCheck);
  return dueCheckIn(prefs, dayKey());
}

/** *Use new goal*: changes the profile and keeps the change in the history (newest first). */
export function applyNewGoal(calc: Calculation): void {
  const s = useStore.getState();
  if (!s.profile) return;
  const { patch, change } = applySuggestion(s.profile, calc, Date.now());
  s.updateProfile(patch);
  s.setGoalCheck({ history: [change, ...s.goalCheck.history], handled: dueCheckIn(s.goalCheck, dayKey()) ?? s.goalCheck.handled });
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

/** *Keep mine* / *OK*: the card goes until the next check-in day. */
export function answerCheckIn(): void {
  const s = useStore.getState();
  const due = dueCheckIn(s.goalCheck, dayKey());
  if (due) s.setGoalCheck({ handled: due });
}

/** Undoes the newest change in the history. */
export function undoLastChange(): void {
  const s = useStore.getState();
  const [last, ...rest] = s.goalCheck.history;
  if (!last) return;
  s.updateProfile(undoPatch(last));
  s.setGoalCheck({ history: rest });
}
