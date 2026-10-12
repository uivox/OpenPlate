import { weekdayOf } from './dates';
import type { FastingSession, Profile } from './types';

export interface FastingPlan {
  id: string;
  kind: 'daily' | 'weekly';
  /** Daily plans: hours of fasting per day. */
  fastHours?: number;
  /** Weekly plans: number of low-calorie days per week. */
  fastDays?: number;
}

export const FASTING_PLANS: FastingPlan[] = [
  { id: '12:12', kind: 'daily', fastHours: 12 },
  { id: '14:10', kind: 'daily', fastHours: 14 },
  { id: '16:8', kind: 'daily', fastHours: 16 },
  { id: '18:6', kind: 'daily', fastHours: 18 },
  { id: '20:4', kind: 'daily', fastHours: 20 },
  { id: '23:1', kind: 'daily', fastHours: 23 },
  { id: '5:2', kind: 'weekly', fastDays: 2 },
  { id: '6:1', kind: 'weekly', fastDays: 1 },
];

export function planById(id: string): FastingPlan {
  return FASTING_PLANS.find((p) => p.id === id) ?? FASTING_PLANS[2];
}

/** Rough orientation shown under the timer (hours since the last meal). */
export const FASTING_STAGES: { fromHours: number; key: 'stage_digest' | 'stage_sugar' | 'stage_switch' | 'stage_deep' }[] = [
  { fromHours: 0, key: 'stage_digest' },
  { fromHours: 4, key: 'stage_sugar' },
  { fromHours: 12, key: 'stage_switch' },
  { fromHours: 18, key: 'stage_deep' },
];

export function stageFor(elapsedHours: number) {
  let stage = FASTING_STAGES[0];
  for (const s of FASTING_STAGES) if (elapsedHours >= s.fromHours) stage = s;
  return stage;
}

export function isFastingDay(profile: Pick<Profile, 'fastingPlanId' | 'fastingDays'>, dateKey: string): boolean {
  const plan = planById(profile.fastingPlanId);
  return plan.kind === 'weekly' && profile.fastingDays.includes(weekdayOf(dateKey));
}

export function sessionHours(s: FastingSession, now = Date.now()): number {
  return ((s.end ?? now) - s.start) / 3600000;
}

export function completedFasts(history: FastingSession[]): number {
  return history.filter((s) => s.end && sessionHours(s) >= s.targetHours).length;
}

export function longestFastHours(history: FastingSession[]): number {
  return history.reduce((m, s) => (s.end ? Math.max(m, sessionHours(s)) : m), 0);
}
