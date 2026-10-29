import { addDays, parseDayKey } from './dates';
import { entryNutrients } from './nutrition';
import type { DiaryEntry, Goal } from './types';

/**
 * Streaks, the calendar and the colours that follow the goal's direction.
 * - A day counts towards the streak as soon as anything is logged.
 * - How a finished day is judged depends on the goal (judgeDay):
 *   - lose: up to 10 % under and 5 % over is a hit; clearly over is red; far under stays a calm
 *     "under", never red, so a light day is never pushed further (and never rewarded as a hit);
 *   - maintain: within 5 % is a hit, 5–15 % off is "a bit off" (calm), more than 15 % above or
 *     below is red, as the goal wasn't kept;
 *   - gain: every day from 5 % under the goal upwards is a hit; more than 20 % over shows a calm
 *     "well above goal" colour but still counts; more than 5 % under is a calm "under".
 * - Today is only judged once the day is over ("pending" until then).
 */

/** Room around the goal that always counts as a hit. */
export const GOAL_TOLERANCE = 0.05;
/** Extra room below the goal while losing. */
export const LOSE_UNDER_TOLERANCE = 0.1;
/** Maintaining: further off than this is red (not kept). */
export const MAINTAIN_FAR = 0.15;
/** Gaining: above this the day still counts, in a calm colour. */
export const GAIN_WELL_ABOVE = 0.2;

export type Judgement = 'hit' | 'well_above' | 'off' | 'over' | 'too_low' | 'under';
export type DayStatus = Judgement | 'empty' | 'pending' | 'future';
/** good = green, calm = a quiet colour, bad = red. */
export type Tone = 'good' | 'calm' | 'bad';

/** kcal eaten per day, only for days with at least one entry. */
export function dailyTotals(entries: DiaryEntry[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of entries) m.set(e.date, (m.get(e.date) ?? 0) + entryNutrients(e).kcal);
  return m;
}

export function judgeDay(eaten: number, goalKcal: number, goal: Goal): Judgement {
  if (!(goalKcal > 0)) return 'hit';
  // Deviation from the goal as a share of it, rounded so 2100 of 2000 is exactly 5 %.
  const d = Math.round(((eaten - goalKcal) / goalKcal) * 1e6) / 1e6;
  if (goal === 'lose') return d > GOAL_TOLERANCE ? 'over' : d < -LOSE_UNDER_TOLERANCE ? 'under' : 'hit';
  if (goal === 'gain') return d < -GOAL_TOLERANCE ? 'under' : d > GAIN_WELL_ABOVE ? 'well_above' : 'hit';
  if (Math.abs(d) <= GOAL_TOLERANCE) return 'hit';
  if (d > MAINTAIN_FAR) return 'over';
  if (d < -MAINTAIN_FAR) return 'too_low';
  return 'off';
}

/** Whether a judged day counts as the goal hit (streak of goal days, month summary). */
export const countsAsHit = (j: DayStatus): boolean => j === 'hit' || j === 'well_above';

export function judgementTone(j: Judgement): Tone {
  if (j === 'hit') return 'good';
  if (j === 'over' || j === 'too_low') return 'bad';
  return 'calm';
}

/**
 * Today's colour while the day is still running, for the diary's number and the plate's outer ring
 * once the goal is passed. Losing: any amount over is red, as before. Maintaining and gaining
 * follow the same bands as finished days, so being over while gaining is never red.
 */
export function todayOverTone(eaten: number, goalKcal: number, goal: Goal): Tone {
  if (goal === 'lose') return eaten > goalKcal ? 'bad' : 'good';
  return judgementTone(judgeDay(eaten, goalKcal, goal));
}

/**
 * Colour of the weight change since the start: green in the goal's direction (down when losing,
 * up when gaining), the normal text colour otherwise, never red. Maintaining: green within 1 kg,
 * normal up to 2 kg, red beyond.
 */
export function weightChangeTone(changeKg: number, goal: Goal): Tone | 'neutral' {
  if (goal === 'lose') return changeKg < 0 ? 'good' : 'neutral';
  if (goal === 'gain') return changeKg > 0 ? 'good' : 'neutral';
  const a = Math.abs(changeKg);
  return a <= 1 ? 'good' : a <= 2 ? 'neutral' : 'bad';
}

/** The calendar's legend for a goal: the statuses that can appear, in order. */
export function legendFor(goal: Goal): Judgement[] {
  if (goal === 'lose') return ['hit', 'over', 'under'];
  if (goal === 'gain') return ['hit', 'well_above', 'under'];
  return ['hit', 'off', 'over', 'too_low'];
}

export type GoalForDay = (date: string) => { kcal: number; goal: Goal };

export function dayStatus(date: string, today: string, totals: Map<string, number>, goalFor: GoalForDay): DayStatus {
  if (date > today) return 'future';
  const eaten = totals.get(date);
  if (eaten === undefined) return 'empty';
  if (date === today) return 'pending';
  const g = goalFor(date);
  return judgeDay(eaten, g.kcal, g.goal);
}

export interface StreakInfo {
  /** Consecutive logged days up to today (today still open counts as not broken). */
  current: number;
  best: number;
  /** Consecutive finished days with the goal hit, ending yesterday. */
  goalStreak: number;
  todayLogged: boolean;
  /** Logged days in total. */
  loggedDays: number;
}

export function streakInfo(totals: Map<string, number>, today: string, goalFor: GoalForDay): StreakInfo {
  const todayLogged = totals.has(today);
  let current = 0;
  let d = todayLogged ? today : addDays(today, -1);
  while (totals.has(d)) {
    current++;
    d = addDays(d, -1);
  }

  let goalStreak = 0;
  d = addDays(today, -1);
  while (totals.has(d)) {
    const g = goalFor(d);
    if (!countsAsHit(judgeDay(totals.get(d)!, g.kcal, g.goal))) break;
    goalStreak++;
    d = addDays(d, -1);
  }

  const days = [...totals.keys()].filter((k) => k <= today).sort();
  let best = 0;
  let run = 0;
  for (let i = 0; i < days.length; i++) {
    run = i > 0 && addDays(days[i - 1], 1) === days[i] ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return { current, best: Math.max(best, current), goalStreak, todayLogged, loggedDays: days.length };
}

/**
 * Day keys for a month calendar, padded with nulls so the first row starts on `weekStart`
 * (1 = Monday, 0 = Sunday). `month` is 1–12.
 */
export function monthGrid(year: number, month: number, weekStart: 0 | 1 = 1): (string | null)[] {
  const first = `${year}-${String(month).padStart(2, '0')}-01`;
  const lead = (parseDayKey(first).getDay() - weekStart + 7) % 7;
  const out: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let d = first; parseDayKey(d).getMonth() === month - 1; d = addDays(d, 1)) out.push(d);
  while (out.length % 7) out.push(null);
  return out;
}

/** Summary for a month: logged days and goal-hit days among finished days. */
export function monthSummary(grid: (string | null)[], today: string, totals: Map<string, number>, goalFor: GoalForDay) {
  let logged = 0;
  let hit = 0;
  for (const d of grid) {
    if (!d) continue;
    const s = dayStatus(d, today, totals, goalFor);
    if (s !== 'empty' && s !== 'future') logged++;
    if (countsAsHit(s)) hit++;
  }
  return { logged, hit };
}

/** Streak lengths worth a small celebration. */
export const STREAK_MILESTONES = [3, 7, 14, 30, 50, 100, 150, 200, 365, 500, 1000];
export function isMilestone(n: number): boolean {
  return STREAK_MILESTONES.includes(n);
}

export type Celebration = 'none' | 'roll' | 'full' | 'milestone';

/**
 * What the streak counter does when today's log changes (the first entry of the day makes the
 * streak one longer). Only the change from "nothing logged today" to "logged" celebrates: not
 * opening the app, not entries on other days. Motion *Lively* gets the full version (rolling number,
 * flame burst, haptic tap; bigger on milestones), *Calm* only the rolling number, *Off* nothing;
 * the user's switch (Appearance → Celebrate the first entry) turns it off altogether.
 */
export function streakCelebration(wasLogged: boolean, nowLogged: boolean, current: number, motion: 'lively' | 'calm' | 'off', enabled: boolean): Celebration {
  if (!enabled || motion === 'off' || wasLogged || !nowLogged) return 'none';
  if (motion === 'calm') return 'roll';
  return isMilestone(current) ? 'milestone' : 'full';
}
