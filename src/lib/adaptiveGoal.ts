/**
 * The weekly goal check-in (adaptive calorie goal). From what was eaten and how the weight moved
 * over the last 4 weeks, it estimates the user's real daily energy use and works out what their
 * goal would be with that number. It only ever *suggests*: the goal changes when the user taps
 * *Use new goal*, every change is kept in a history and can be undone. The app's safety rules
 * (goalDetails: under-18s, BMI ≤ 18.5, goal weight reached, minimum intake) always apply to the
 * suggested goal. Pure: no React Native imports.
 *
 * The calculation, step by step (each step is shown on the calculation screen):
 * 1. Days: the last 28 days before today with food logged. Days under 800 kcal are left out as
 *    probably incomplete, and the user can leave out any day. At least 14 days are needed.
 * 2. Weight trend: a straight line through the weigh-ins of the same 28 days (least squares), in
 *    kg per week. At least 4 weigh-ins are needed.
 * 3. Energy use = average intake − trend × 7,700 kcal per kg / 7 days. Gaining means part of the
 *    intake was stored; losing means the body used more than was eaten.
 * 4. The goal is worked out as usual (pace, safety rules), with that energy use as maintenance.
 *    Only a change of at least 100 kcal is suggested.
 */
import { addDays, weekdayOf } from './dates';
import { entryNutrients, goalDetails } from './nutrition';
import type { DiaryEntry, Profile, WeightEntry } from './types';

export const WINDOW_DAYS = 28;
export const MIN_LOGGED_DAYS = 14;
export const MIN_WEIGH_INS = 4;
/** Days with less logged than this are probably incomplete and left out. */
export const INCOMPLETE_BELOW_KCAL = 800;
/** Smaller differences aren't worth a new goal. */
export const MIN_CHANGE_KCAL = 100;
export const KCAL_PER_KG = 7700;
/** Energy use outside this range means the data is off (missing entries, a scale error). */
const PLAUSIBLE = [1000, 6000] as const;

/* ---------- Settings and history (part of backups) ---------- */

export interface GoalChange {
  /** When the change was made, ms. */
  at: number;
  oldKcal: number;
  newKcal: number;
  /** Estimated energy use the change was based on. */
  energyUse: number;
  /** What was changed, so it can be undone exactly. */
  field: 'customMaintenanceKcal' | 'customKcal';
  oldValue: number | null;
  newValue: number;
}

export interface GoalCheckPrefs {
  /** Weekly check-in card in the diary. On by default. */
  enabled: boolean;
  /** 0 = Sunday … 6 = Saturday. Default Sunday. */
  weekday: number;
  /** Days the user left out of the calculation. */
  excluded: string[];
  /** The check-in day last answered (the card stays until it is). */
  handled?: string;
  history: GoalChange[];
}

export const DEFAULT_GOAL_CHECK: GoalCheckPrefs = { enabled: true, weekday: 0, excluded: [], history: [] };

const isDay = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const num = (v: unknown, lo: number, hi: number) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;

export function normalizeGoalCheck(v: unknown): GoalCheckPrefs {
  const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  const history: GoalChange[] = [];
  if (Array.isArray(o.history)) {
    for (const h of o.history.slice(0, 100)) {
      if (!h || typeof h !== 'object') continue;
      const x = h as Record<string, unknown>;
      if (!num(x.at, 0, 1e14) || !num(x.oldKcal, 0, 10000) || !num(x.newKcal, 0, 10000) || !num(x.energyUse, 0, 10000) || !num(x.newValue, 0, 10000)) continue;
      if (x.field !== 'customMaintenanceKcal' && x.field !== 'customKcal') continue;
      history.push({
        at: x.at as number,
        oldKcal: x.oldKcal as number,
        newKcal: x.newKcal as number,
        energyUse: x.energyUse as number,
        field: x.field,
        oldValue: num(x.oldValue, 0, 10000) ? (x.oldValue as number) : null,
        newValue: x.newValue as number,
      });
    }
  }
  return {
    enabled: o.enabled !== false,
    weekday: Number.isInteger(o.weekday) && (o.weekday as number) >= 0 && (o.weekday as number) <= 6 ? (o.weekday as number) : 0,
    excluded: Array.isArray(o.excluded) ? [...new Set(o.excluded.filter(isDay))].sort().slice(-400) : [],
    ...(isDay(o.handled) ? { handled: o.handled } : {}),
    history,
  };
}

/* ---------- The calculation ---------- */

export type DayUse = 'used' | 'excluded' | 'incomplete';

export interface CheckDay {
  date: string;
  kcal: number;
  use: DayUse;
}

export interface Calculation {
  from: string;
  to: string;
  /** Every day in the window with food logged, newest first. */
  days: CheckDay[];
  usedDays: number;
  weighIns: WeightEntry[];
  avgIntake: number;
  /** Weight trend, kg per week (negative = losing). */
  trendKgPerWeek: number;
  /** Estimated daily energy use, rounded to 10. */
  energyUse: number;
  /** The maintenance the app uses now (calculated, or the user's own number). */
  currentMaintenance: number;
  currentGoal: number;
  /** The goal with the estimated energy use as maintenance, after the safety rules. */
  suggestedGoal: number;
  /** Safety rules that shaped the suggested goal (goalDetails warnings). */
  warnings: string[];
}

export type CheckIn =
  | { kind: 'missing'; loggedDays: number; weighIns: number; needDays: number; needWeighIns: number }
  | { kind: 'step_calories' }
  | { kind: 'unusual'; calc: Calculation }
  | { kind: 'fits'; calc: Calculation }
  | { kind: 'suggest'; calc: Calculation };

/** Least-squares slope of weight over days, kg per day. */
export function weightSlope(points: WeightEntry[]): number {
  if (points.length < 2) return 0;
  const t0 = Date.parse(`${points[0].date}T12:00:00Z`);
  const xs = points.map((p) => (Date.parse(`${p.date}T12:00:00Z`) - t0) / 86400000);
  const ys = points.map((p) => p.kg);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < xs.length; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
  }
  return sxx > 0 ? sxy / sxx : 0;
}

export function checkIn(input: {
  profile: Profile;
  entries: DiaryEntry[];
  weights: WeightEntry[];
  excluded: string[];
  today: string;
  now?: Date;
}): CheckIn {
  const { profile, entries, weights, today } = input;
  // Step calories added to the budget would be counted twice: the estimate already includes them.
  if (profile.addActivityCalories) return { kind: 'step_calories' };
  const from = addDays(today, -WINDOW_DAYS);
  const to = addDays(today, -1);
  const excluded = new Set(input.excluded);

  const totals = new Map<string, number>();
  for (const e of entries) if (e.date >= from && e.date <= to) totals.set(e.date, (totals.get(e.date) ?? 0) + entryNutrients(e).kcal);
  const days: CheckDay[] = [...totals]
    .map(([date, kcal]) => ({ date, kcal: Math.round(kcal), use: (excluded.has(date) ? 'excluded' : kcal < INCOMPLETE_BELOW_KCAL ? 'incomplete' : 'used') as DayUse }))
    .sort((a, b) => b.date.localeCompare(a.date));
  const used = days.filter((d) => d.use === 'used');
  // Leaving a day out is about what was logged; that day's weigh-in still counts.
  const weighIns = weights.filter((w) => w.date >= from && w.date <= today).sort((a, b) => a.date.localeCompare(b.date));

  if (used.length < MIN_LOGGED_DAYS || weighIns.length < MIN_WEIGH_INS)
    return { kind: 'missing', loggedDays: used.length, weighIns: weighIns.length, needDays: MIN_LOGGED_DAYS, needWeighIns: MIN_WEIGH_INS };

  const avgIntake = used.reduce((s, d) => s + d.kcal, 0) / used.length;
  const slope = weightSlope(weighIns);
  const energyUse = Math.round((avgIntake - slope * KCAL_PER_KG) / 10) * 10;
  const currentWeight = weighIns[weighIns.length - 1].kg;
  const now = input.now ?? new Date();
  const current = goalDetails(profile, currentWeight, now);
  // The suggestion keeps the user's way of setting the goal: a calculated goal gets the new
  // maintenance; an exact goal gets the new number in its place.
  const suggested = goalDetails({ ...profile, goalMode: 'auto', customMaintenanceKcal: energyUse }, currentWeight, now);
  const calc: Calculation = {
    from,
    to,
    days,
    usedDays: used.length,
    weighIns,
    avgIntake: Math.round(avgIntake),
    trendKgPerWeek: Math.round(slope * 7 * 100) / 100,
    energyUse,
    currentMaintenance: current.maintenance,
    currentGoal: current.kcal,
    suggestedGoal: suggested.kcal,
    warnings: suggested.warnings,
  };
  if (energyUse < PLAUSIBLE[0] || energyUse > PLAUSIBLE[1]) return { kind: 'unusual', calc };
  if (Math.abs(calc.suggestedGoal - calc.currentGoal) < MIN_CHANGE_KCAL) return { kind: 'fits', calc };
  return { kind: 'suggest', calc };
}

/** The profile change for *Use new goal*, and the history entry that can undo it. */
export function applySuggestion(profile: Profile, calc: Calculation, at: number): { patch: Partial<Profile>; change: GoalChange } {
  if (profile.goalMode === 'custom') {
    return {
      patch: { customKcal: calc.suggestedGoal },
      change: { at, oldKcal: calc.currentGoal, newKcal: calc.suggestedGoal, energyUse: calc.energyUse, field: 'customKcal', oldValue: profile.customKcal ?? null, newValue: calc.suggestedGoal },
    };
  }
  return {
    patch: { customMaintenanceKcal: calc.energyUse },
    change: {
      at,
      oldKcal: calc.currentGoal,
      newKcal: calc.suggestedGoal,
      energyUse: calc.energyUse,
      field: 'customMaintenanceKcal',
      oldValue: profile.customMaintenanceKcal ?? null,
      newValue: calc.energyUse,
    },
  };
}

/** The profile change that undoes a history entry (the newest one). */
export function undoPatch(change: GoalChange): Partial<Profile> {
  return { [change.field]: change.oldValue ?? undefined } as Partial<Profile>;
}

/**
 * The check-in day the diary card is for: the latest chosen weekday up to today. The card shows
 * until that day is answered, so a missed Sunday still shows on Monday.
 */
export function dueCheckIn(prefs: GoalCheckPrefs, today: string): string | null {
  if (!prefs.enabled) return null;
  let d = today;
  for (let i = 0; i < 7 && weekdayOf(d) !== prefs.weekday; i++) d = addDays(d, -1);
  return prefs.handled && prefs.handled >= d ? null : d;
}
