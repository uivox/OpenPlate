import { addDays, parseDayKey } from './dates';
import { entryNutrients } from './nutrition';
import type { DiaryEntry, Goal } from './types';

/**
 * Streaks and the calendar.
 * - A day counts towards the streak as soon as anything is logged.
 * - "Goal hit" allows 5 % either way; when losing, anything under the goal counts too, when gaining
 *   anything above it. Today is only judged once the day is over ("pending" until then).
 */

export const GOAL_TOLERANCE = 0.05;

export type DayStatus = 'empty' | 'hit' | 'over' | 'under' | 'pending' | 'future';

/** kcal eaten per day, only for days with at least one entry. */
export function dailyTotals(entries: DiaryEntry[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of entries) m.set(e.date, (m.get(e.date) ?? 0) + entryNutrients(e).kcal);
  return m;
}

export function judgeDay(eaten: number, goalKcal: number, goal: Goal): 'hit' | 'over' | 'under' {
  const low = goalKcal * (1 - GOAL_TOLERANCE);
  const high = goalKcal * (1 + GOAL_TOLERANCE);
  if (eaten > high) return goal === 'gain' ? 'hit' : 'over';
  if (eaten < low) return goal === 'lose' ? 'hit' : 'under';
  return 'hit';
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
    if (judgeDay(totals.get(d)!, g.kcal, g.goal) !== 'hit') break;
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
    if (s === 'hit') hit++;
  }
  return { logged, hit };
}

/** Streak lengths worth a small celebration. */
export const STREAK_MILESTONES = [3, 7, 14, 30, 50, 100, 150, 200, 365, 500, 1000];
export function isMilestone(n: number): boolean {
  return STREAK_MILESTONES.includes(n);
}
