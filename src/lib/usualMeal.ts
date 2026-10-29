import { addDays } from './dates';
import type { DiaryEntry, Food, MealType } from './types';

/**
 * "Your usual breakfast?": the foods logged together for a meal on at least `MIN_DAYS` of the last
 * `WINDOW_DAYS` days (today not counted). Days count as the same when the meal has exactly the same
 * foods; amounts may differ and the suggestion uses each food's median amount. If several sets
 * qualify, the most frequent wins, then the most recent. Pure: no React Native imports.
 */

export const MIN_DAYS = 3;
export const WINDOW_DAYS = 14;

export interface UsualMeal {
  items: { food: Food; grams: number }[];
  /** The days it was based on, newest first (shown under "i"). */
  days: string[];
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export function usualMeal(entries: DiaryEntry[], meal: MealType, today: string): UsualMeal | null {
  const from = addDays(today, -WINDOW_DAYS);
  // day → food id → grams that day; and the latest copy of each food
  const days = new Map<string, Map<string, number>>();
  const latest = new Map<string, DiaryEntry>();
  for (const e of entries) {
    if (e.meal !== meal || e.date >= today || e.date < from) continue;
    const day = days.get(e.date) ?? new Map<string, number>();
    day.set(e.food.id, (day.get(e.food.id) ?? 0) + e.grams);
    days.set(e.date, day);
    const l = latest.get(e.food.id);
    if (!l || e.date > l.date || (e.date === l.date && e.createdAt > l.createdAt)) latest.set(e.food.id, e);
  }
  const groups = new Map<string, string[]>();
  for (const [date, foods] of days) {
    const key = [...foods.keys()].sort().join('\n');
    groups.set(key, [...(groups.get(key) ?? []), date]);
  }
  let best: { key: string; dates: string[] } | null = null;
  for (const [key, dates] of groups) {
    if (dates.length < MIN_DAYS) continue;
    const newest = dates.reduce((a, b) => (a > b ? a : b));
    const bestNewest = best ? best.dates.reduce((a, b) => (a > b ? a : b)) : '';
    if (!best || dates.length > best.dates.length || (dates.length === best.dates.length && newest > bestNewest)) best = { key, dates };
  }
  if (!best) return null;
  const ids = best.key.split('\n');
  // The order the foods were logged in on the latest of those days.
  const lastDay = best.dates.reduce((a, b) => (a > b ? a : b));
  const order = entries.filter((e) => e.meal === meal && e.date === lastDay).sort((a, b) => a.createdAt - b.createdAt).map((e) => e.food.id);
  ids.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return {
    items: ids.map((id) => ({ food: latest.get(id)!.food, grams: Math.round(median(best!.dates.map((d) => days.get(d)!.get(id)!))) })),
    days: [...best.dates].sort().reverse(),
  };
}
