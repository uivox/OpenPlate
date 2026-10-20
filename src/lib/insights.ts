import { addDays, dayKey, parseDayKey } from './dates';
import { entryNutrients } from './nutrition';
import type { DiaryEntry, FastingSession, WeightEntry } from './types';

/**
 * The Progress tab's statistics: which days a range covers, how days are grouped into bars, and
 * what counts towards an average. Pure, so it can be tested; the screens are app/(tabs)/progress.tsx
 * (tiles) and app/insight.tsx (one statistic).
 *
 * Rules (also explained in the app under "How this is calculated"):
 * - Only days with something logged count; empty days are left out instead of pulling averages down.
 * - Today isn't over yet: its bar is drawn lighter and it is left out of averages, for everything
 *   that grows during the day (food, water, steps). A weigh-in or a finished fast is complete, so
 *   those count on the day.
 * - Weekly and monthly bars show the average day of that week or month, not the sum.
 */

export type Metric = 'energy' | 'macros' | 'water' | 'weight' | 'steps' | 'nutrients' | 'fasting';
export const METRICS: Metric[] = ['energy', 'macros', 'water', 'weight', 'steps', 'nutrients', 'fasting'];

export type Group = 'day' | 'week' | 'month';
export type RangeId = '7' | '30' | '90' | '365' | 'custom';
export const RANGES: RangeId[] = ['7', '30', '90', '365', 'custom'];

/** Last choice on the statistics screens (kept on the device). */
export interface InsightPrefs {
  group: Group;
  range: RangeId;
  /** Custom range, inclusive day keys. */
  from?: string;
  to?: string;
}

export const DEFAULT_INSIGHTS: InsightPrefs = { group: 'day', range: '30' };

/** Longest custom range, so a typo like year 1026 can't ask for a thousand years of bars. */
export const MAX_RANGE_DAYS = 3 * 366;

const KEY = /^\d{4}-\d{2}-\d{2}$/;
const isKey = (v: unknown): v is string => typeof v === 'string' && KEY.test(v) && dayKey(parseDayKey(v)) === v;

export function normalizeInsights(p: Partial<InsightPrefs> | undefined): InsightPrefs {
  const v: Partial<InsightPrefs> = p && typeof p === 'object' ? p : {};
  const group: Group = v.group === 'week' || v.group === 'month' ? v.group : 'day';
  const range: RangeId = RANGES.includes(v.range as RangeId) ? (v.range as RangeId) : DEFAULT_INSIGHTS.range;
  return { group, range, ...(isKey(v.from) ? { from: v.from } : {}), ...(isKey(v.to) ? { to: v.to } : {}) };
}

/** Number of days from `from` to `to`, both included. */
export function daysBetween(from: string, to: string): number {
  return Math.round((parseDayKey(to).getTime() - parseDayKey(from).getTime()) / 86400000) + 1;
}

/**
 * First and last day of the chosen range. Presets end today. A custom range is put in order, ends
 * today at the latest and is at most MAX_RANGE_DAYS long; without both dates it falls back to 30 days.
 */
export function rangeBounds(p: InsightPrefs, today: string): { from: string; to: string } {
  if (p.range !== 'custom') return { from: addDays(today, -(Number(p.range) - 1)), to: today };
  if (!p.from || !p.to) return { from: addDays(today, -29), to: today };
  let [from, to] = p.from <= p.to ? [p.from, p.to] : [p.to, p.from];
  if (to > today) to = today;
  if (from > to) from = to;
  if (daysBetween(from, to) > MAX_RANGE_DAYS) from = addDays(to, -(MAX_RANGE_DAYS - 1));
  return { from, to };
}

/** Monday of the week that contains `key`. */
export function weekStart(key: string): string {
  const wd = parseDayKey(key).getDay(); // 0 = Sunday
  return addDays(key, -((wd + 6) % 7));
}

export interface Period {
  /** First day of the period (inside the range). */
  from: string;
  /** Last day of the period (inside the range). */
  to: string;
}

/** The bars for a range: one per day, per week (Monday to Sunday) or per calendar month, cut to the range. */
export function periods(from: string, to: string, group: Group): Period[] {
  const out: Period[] = [];
  let d = from;
  while (d <= to) {
    let end: string;
    if (group === 'day') end = d;
    else if (group === 'week') end = addDays(weekStart(d), 6);
    else {
      const x = parseDayKey(d);
      end = dayKey(new Date(x.getFullYear(), x.getMonth() + 1, 0));
    }
    if (end > to) end = to;
    out.push({ from: d, to: end });
    d = addDays(end, 1);
  }
  return out;
}

/** A day's numbers for one statistic, or null when nothing was logged. Several numbers = stacked parts. */
export type DayValue = (date: string) => number[] | null;

export interface Bar extends Period {
  /** Average day of the period (each part), or null when no day in it has a log. */
  values: number[] | null;
  /** Days that went into `values`. */
  days: number;
  /** Only today is in it so far (drawn lighter, not in the averages). */
  partial: boolean;
  /** Average goal over the period's days. */
  goal?: number;
}

function average(rows: number[][]): number[] | null {
  if (!rows.length) return null;
  return rows[0].map((_, i) => rows.reduce((s, r) => s + (r[i] ?? 0), 0) / rows.length);
}

function eachDay(from: string, to: string, fn: (d: string) => void) {
  for (let d = from; d <= to; d = addDays(d, 1)) fn(d);
}

/** Which logged days count: past days, plus today when `countToday` (complete readings like weight). */
function counted(from: string, to: string, valueOf: DayValue, today: string, countToday: boolean) {
  const rows: number[][] = [];
  const dates: string[] = [];
  eachDay(from, to, (d) => {
    if (d > today || (d === today && !countToday)) return;
    const v = valueOf(d);
    if (v) {
      rows.push(v);
      dates.push(d);
    }
  });
  return { rows, dates };
}

const goalAverage = (dates: string[], goalOf?: (d: string) => number | undefined) => {
  if (!goalOf || !dates.length) return undefined;
  const gs = dates.map(goalOf).filter((g): g is number => typeof g === 'number' && g > 0);
  return gs.length ? gs.reduce((s, g) => s + g, 0) / gs.length : undefined;
};

export function buildBars(
  list: Period[],
  valueOf: DayValue,
  today: string,
  opts: { countToday?: boolean; goalOf?: (date: string) => number | undefined } = {},
): Bar[] {
  return list.map((p) => {
    const { rows, dates } = counted(p.from, p.to, valueOf, today, !!opts.countToday);
    if (rows.length) return { ...p, values: average(rows), days: rows.length, partial: false, goal: goalAverage(dates, opts.goalOf) };
    // Nothing finished yet: show today's numbers so far, marked as not complete.
    const todayValue = !opts.countToday && p.from <= today && today <= p.to ? valueOf(today) : null;
    return { ...p, values: todayValue, days: 0, partial: !!todayValue, goal: todayValue ? goalAverage([today], opts.goalOf) : undefined };
  });
}

export interface Summary {
  /** Average day over the counted days (each part), or null when none. */
  avg: number[] | null;
  days: number;
  goal?: number;
}

export function summarize(
  from: string,
  to: string,
  valueOf: DayValue,
  today: string,
  opts: { countToday?: boolean; goalOf?: (date: string) => number | undefined } = {},
): Summary {
  const { rows, dates } = counted(from, to, valueOf, today, !!opts.countToday);
  return { avg: average(rows), days: rows.length, goal: goalAverage(dates, opts.goalOf) };
}

/* ---------- What a day holds, per statistic ---------- */

export interface DayFood {
  kcal: number;
  carbs: number;
  protein: number;
  fat: number;
  sugar: number;
  fiber: number;
  satFat: number;
  salt: number;
}

/** Everything eaten per day. A day with entries is a logged day, even when they add up to 0 kcal. */
export function foodByDay(entries: DiaryEntry[]): Map<string, DayFood> {
  const out = new Map<string, DayFood>();
  for (const e of entries) {
    const n = entryNutrients(e);
    const d = out.get(e.date) ?? { kcal: 0, carbs: 0, protein: 0, fat: 0, sugar: 0, fiber: 0, satFat: 0, salt: 0 };
    d.kcal += n.kcal;
    d.carbs += n.carbs;
    d.protein += n.protein;
    d.fat += n.fat;
    d.sugar += n.sugar ?? 0;
    d.fiber += n.fiber ?? 0;
    d.satFat += n.satFat ?? 0;
    d.salt += n.salt ?? 0;
    out.set(e.date, d);
  }
  return out;
}

/** Energy from each macro: 4 kcal per gram of carbs and protein, 9 per gram of fat. */
export function macroKcal(d: Pick<DayFood, 'carbs' | 'protein' | 'fat'>): [number, number, number] {
  return [d.carbs * 4, d.protein * 4, d.fat * 9];
}

/** Shares of the macro energy in whole percent (carbs, protein, fat), adding up to 100 (or all 0). */
export function macroPercents(d: Pick<DayFood, 'carbs' | 'protein' | 'fat'>): [number, number, number] {
  const k = macroKcal(d);
  const total = k[0] + k[1] + k[2];
  if (total <= 0) return [0, 0, 0];
  const raw = k.map((v) => (v / total) * 100);
  const out = raw.map(Math.floor) as [number, number, number];
  // largest remainders get the missing points, so the three always add up to 100
  let missing = 100 - (out[0] + out[1] + out[2]);
  const order = [0, 1, 2].sort((a, b) => raw[b] - out[b] - (raw[a] - out[a]));
  for (const i of order) if (missing-- > 0) out[i]++;
  return out;
}

export type NutrientKey = 'sugar' | 'fiber' | 'satFat' | 'salt';
export const NUTRIENTS: NutrientKey[] = ['sugar', 'fiber', 'satFat', 'salt'];

/** Weigh-ins by day. */
export function weightByDay(weights: WeightEntry[]): Map<string, number> {
  return new Map(weights.map((w) => [w.date, w.kg]));
}

/** Finished fasts by the day they ended: hours fasted (longest that day) and its goal in hours. */
export function fastingByDay(history: FastingSession[]): Map<string, { hours: number; target: number }> {
  const out = new Map<string, { hours: number; target: number }>();
  for (const f of history) {
    if (!f.end || f.end <= f.start) continue;
    const d = dayKey(new Date(f.end));
    const hours = (f.end - f.start) / 3600000;
    const prev = out.get(d);
    if (!prev || hours > prev.hours) out.set(d, { hours, target: f.targetHours });
  }
  return out;
}

/** Statistics whose readings are complete on the day (weigh-ins, finished fasts) count today too. */
export function countsToday(m: Metric): boolean {
  return m === 'weight' || m === 'fasting';
}

/* ---------- Typed dates for a custom range ---------- */

/**
 * Reads a date typed by the user: 20.10.2026 or 20.10.26 (German order), 10/20/2026 (US order, English
 * only) or 2026-10-20. Returns the day key, or null when it isn't a real date.
 */
export function parseDateInput(text: string, lang: 'de' | 'en'): string | null {
  const s = text.trim();
  let y: number, m: number, d: number;
  let r: RegExpMatchArray | null;
  if ((r = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) [y, m, d] = [Number(r[1]), Number(r[2]), Number(r[3])];
  else if ((r = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/))) [d, m, y] = [Number(r[1]), Number(r[2]), Number(r[3])];
  else if (lang === 'en' && (r = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/))) [m, d, y] = [Number(r[1]), Number(r[2]), Number(r[3])];
  else return null;
  if (y < 100) y += 2000;
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return dayKey(date);
}

/** A day key written the way the user types it (see parseDateInput). */
export function formatDateInput(key: string, lang: 'de' | 'en'): string {
  const [y, m, d] = key.split('-');
  return lang === 'de' ? `${d}.${m}.${y}` : `${m}/${d}/${y}`;
}

/* ---------- Showing numbers ---------- */

const UNIT: Record<Metric, string> = { energy: 'kcal', macros: 'kcal', water: 'l', weight: 'kg', steps: '', nutrients: 'g', fasting: 'h' };

/** A statistic's value with its unit, written for the language ("2.881 kcal", "1,75 l", "68,4 kg"). */
export function formatValue(m: Metric, v: number, lang: 'de' | 'en', withUnit = true): string {
  const loc = lang === 'de' ? 'de-DE' : 'en-US';
  const n =
    m === 'water'
      ? (v / 1000).toLocaleString(loc, { maximumFractionDigits: 2 })
      : m === 'weight' || m === 'nutrients' || m === 'fasting'
        ? v.toLocaleString(loc, { maximumFractionDigits: 1 })
        : Math.round(v).toLocaleString(loc);
  return withUnit && UNIT[m] ? `${n} ${UNIT[m]}` : n;
}
