import { addDays, dayKey, locale, parseDayKey } from './dates';
import type { Lang, TKey } from './i18n';
import { DEFAULT_MEAL_SPLIT, type MealSplit } from './mealSplit';
import { entryNutrients } from './nutrition';
import { MEALS, type DiaryEntry, type MealType } from './types';

/*
 * Meal reminders: "you haven't logged lunch yet". Pure, so it can be tested; scheduling lives in
 * device.ts / device.web.ts and the store hook in components/mealReminders.ts.
 *
 * A reminder fires at the meal's time plus one shared delay, only if that meal has no entry on that
 * day and no running fast covers the moment. Times are local wall-clock minutes after midnight, so
 * 12:30 stays 12:30 across daylight saving and after travelling (the plan is rebuilt on every app
 * open). The notification text carries a calorie figure that is recalculated after every diary change.
 */

export const REMINDER_DELAYS = [15, 30, 60, 90] as const;
export type ReminderDelay = (typeof REMINDER_DELAYS)[number];

export interface MealReminder {
  on: boolean;
  /** Minutes after local midnight. */
  time: number;
}

export interface ReminderPrefs {
  /** Off until the user switches reminders on (that is also when notifications are asked for). */
  enabled: boolean;
  meals: Record<MealType, MealReminder>;
  delay: ReminderDelay;
  /** Breakfast and lunch figures include what earlier meals came in under or over. */
  adjust: boolean;
  /** The time fields were filled once (from suggestions or the defaults) when first switched on. */
  setUp: boolean;
  /** The diary's one-time "want a reminder?" card was dismissed or used. */
  hintDismissed: boolean;
}

/** Fallback times when there aren't enough logged days for a suggestion yet. */
export const DEFAULT_TIMES: Record<MealType, number> = { breakfast: 8 * 60, lunch: 12 * 60 + 30, dinner: 19 * 60, snack: 15 * 60 + 30 };

export const DEFAULT_REMINDERS: ReminderPrefs = {
  enabled: false,
  meals: {
    breakfast: { on: true, time: DEFAULT_TIMES.breakfast },
    lunch: { on: true, time: DEFAULT_TIMES.lunch },
    dinner: { on: true, time: DEFAULT_TIMES.dinner },
    snack: { on: false, time: DEFAULT_TIMES.snack },
  },
  delay: 30,
  adjust: false,
  setUp: false,
  hintDismissed: false,
};

const validTime = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 24 * 60;

/** Any stored or imported shape → valid prefs (used for the store, migrations and backups). */
export function normalizeReminders(v: unknown): ReminderPrefs {
  const o = v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  const m = o.meals && typeof o.meals === 'object' ? (o.meals as Record<string, unknown>) : {};
  const meals = {} as Record<MealType, MealReminder>;
  for (const meal of MEALS) {
    const r = m[meal] && typeof m[meal] === 'object' ? (m[meal] as Record<string, unknown>) : {};
    const d = DEFAULT_REMINDERS.meals[meal];
    meals[meal] = { on: typeof r.on === 'boolean' ? r.on : d.on, time: validTime(r.time) ? r.time : d.time };
  }
  return {
    enabled: o.enabled === true,
    meals,
    delay: REMINDER_DELAYS.includes(o.delay as ReminderDelay) ? (o.delay as ReminderDelay) : DEFAULT_REMINDERS.delay,
    adjust: o.adjust === true,
    setUp: o.setUp === true,
    hintDismissed: o.hintDismissed === true,
  };
}

/* ---------- Clock times ---------- */

const pad = (n: number) => String(n).padStart(2, '0');

/** 750 → "12:30". */
export function clockText(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

/** "12:30", "12.30", "9:05", "1230", "930" or "12" → minutes after midnight; null when it isn't a time. */
export function parseClock(input: string): number | null {
  const s = input.trim();
  let h: number;
  let min: number;
  const sep = s.match(/^(\d{1,2})\s*[:.h]\s*(\d{2})$/i);
  if (sep) {
    h = Number(sep[1]);
    min = Number(sep[2]);
  } else if (/^\d{3,4}$/.test(s)) {
    h = Number(s.slice(0, -2));
    min = Number(s.slice(-2));
  } else if (/^\d{1,2}$/.test(s)) {
    h = Number(s);
    min = 0;
  } else return null;
  return h <= 23 && min <= 59 ? h * 60 + min : null;
}

/** Minutes after local midnight of a moment. */
export function minutesOfDay(ms: number): number {
  const d = new Date(ms);
  return d.getHours() * 60 + d.getMinutes();
}

/** The local moment `minutes` after midnight of `date` (minutes past 24:00 roll into the next day). */
export function wallClock(date: string, minutes: number): number {
  const d = parseDayKey(date);
  d.setHours(0, minutes, 0, 0);
  return d.getTime();
}

/* ---------- Suggested times ---------- */

export const SUGGEST_DAYS = 21;
export const SUGGEST_MIN_DAYS = 5;
/** A suggestion is only offered when it differs this much from the set time. */
export const HINT_DIFF_MIN = 30;

/**
 * When the user usually logs a meal: the median over the last 21 days (ending today) of the first
 * time that meal was logged each day, rounded to 15 minutes. Only entries made on the day itself
 * count, so filling in yesterday's lunch in the evening doesn't shift the suggestion. Null with
 * fewer than 5 such days.
 */
export function suggestTime(entries: DiaryEntry[], meal: MealType, today: string): number | null {
  const first = addDays(today, -(SUGGEST_DAYS - 1));
  const byDay = new Map<string, number>();
  for (const e of entries) {
    if (e.meal !== meal || e.date < first || e.date > today || !e.createdAt) continue;
    if (dayKey(new Date(e.createdAt)) !== e.date) continue;
    const prev = byDay.get(e.date);
    if (prev === undefined || e.createdAt < prev) byDay.set(e.date, e.createdAt);
  }
  if (byDay.size < SUGGEST_MIN_DAYS) return null;
  const mins = [...byDay.values()].map(minutesOfDay).sort((a, b) => a - b);
  const mid = mins.length / 2;
  const median = mins.length % 2 ? mins[Math.floor(mid)] : (mins[mid - 1] + mins[mid]) / 2;
  return (Math.round(median / 15) * 15) % 1440;
}

export function suggestAll(entries: DiaryEntry[], today: string): Record<MealType, number | null> {
  const out = {} as Record<MealType, number | null>;
  for (const meal of MEALS) out[meal] = suggestTime(entries, meal, today);
  return out;
}

/** The suggestion to show next to a meal's time, or null when it's missing or close to the set time. */
export function suggestionHint(set: number, suggested: number | null): number | null {
  if (suggested === null) return null;
  const diff = Math.abs(set - suggested);
  return Math.min(diff, 1440 - diff) >= HINT_DIFF_MIN ? suggested : null;
}

/** Times for the first switch-on: the suggestion where there is one, else the defaults. */
export function firstSetupTimes(prefs: ReminderPrefs, suggestions: Record<MealType, number | null>): ReminderPrefs {
  const meals = { ...prefs.meals };
  for (const meal of MEALS) meals[meal] = { ...meals[meal], time: suggestions[meal] ?? DEFAULT_TIMES[meal] };
  return { ...prefs, meals, setUp: true };
}

/** Meal for the diary's one-time card (lunch first, as the most regular meal), or null. */
export function hintCardMeal(prefs: ReminderPrefs, suggestions: Record<MealType, number | null>): { meal: MealType; time: number } | null {
  if (prefs.enabled || prefs.hintDismissed) return null;
  for (const meal of ['lunch', 'dinner', 'breakfast'] as MealType[]) {
    const time = suggestions[meal];
    if (time !== null) return { meal, time };
  }
  return null;
}

/* ---------- Which reminders to schedule ---------- */

/** The app keeps this many days scheduled and tops them up on every open (iOS allows 64 pending). */
export const SCHEDULE_DAYS = 14;

export type ReminderFigure = { kind: 'plain' } | { kind: 'planned'; kcal: number } | { kind: 'left'; kcal: number };

export interface PlannedReminder {
  /** Stable per day and meal, so rescheduling replaces rather than duplicates. */
  id: string;
  date: string;
  meal: MealType;
  /** When it fires, ms. */
  at: number;
  figure: ReminderFigure;
}

export const REMINDER_ID_PREFIX = 'meal-reminder:';
export const reminderId = (date: string, meal: MealType) => `${REMINDER_ID_PREFIX}${date}:${meal}`;

export interface ActiveFast {
  start: number;
  targetHours: number;
}

/** True when a running fast is planned to still be going at `at`. */
export function insideFast(at: number, fast: ActiveFast | null | undefined): boolean {
  return !!fast && at >= fast.start && at < fast.start + fast.targetHours * 3600000;
}

const EARLIER: Record<MealType, MealType[]> = { breakfast: [], lunch: ['breakfast'], dinner: ['breakfast', 'lunch'], snack: ['breakfast', 'lunch', 'dinner'] };

/**
 * The calorie figure in a reminder. Breakfast and lunch show their own share of the day's goal
 * ("about 700 kcal planned"), rounded to 10; with `adjust` the difference of earlier meals that
 * already have entries is carried over. Dinner and snacks show what is left of the day. Without
 * a goal, at 0 or below, or for a meal with a 0 % share, the reminder is a plain nudge.
 */
export function reminderFigure(
  meal: MealType,
  dayEntries: DiaryEntry[],
  goalKcal: number | null,
  adjust: boolean,
  split: MealSplit = DEFAULT_MEAL_SPLIT,
): ReminderFigure {
  if (!goalKcal || goalKcal <= 0 || split[meal] <= 0) return { kind: 'plain' };
  const share = (m: MealType) => split[m] / 100;
  const eaten = (m?: MealType) => dayEntries.filter((e) => !m || e.meal === m).reduce((s, e) => s + entryNutrients(e).kcal, 0);
  if (meal === 'dinner' || meal === 'snack') {
    const left = Math.round(goalKcal - eaten());
    return left > 0 ? { kind: 'left', kcal: left } : { kind: 'plain' };
  }
  let kcal = goalKcal * share(meal);
  if (adjust) {
    for (const m of EARLIER[meal]) {
      if (dayEntries.some((e) => e.meal === m)) kcal += goalKcal * share(m) - eaten(m);
    }
  }
  const rounded = Math.round(kcal / 10) * 10;
  return rounded > 0 ? { kind: 'planned', kcal: rounded } : { kind: 'plain' };
}

export interface PlanInput {
  prefs: ReminderPrefs;
  entries: DiaryEntry[];
  /** The day's calorie goal, or null when there is none. */
  goalFor: (date: string) => number | null;
  fast?: ActiveFast | null;
  /** Coming fasts of the fixed eating window (fasting.ts `upcomingFasts`); reminders inside them are held back. */
  fasts?: { start: number; end: number }[];
  /** The meal split for the calorie figures. */
  split?: MealSplit;
  now: number;
  days?: number;
}

/** Every reminder that should be pending right now, sorted by time (at most 14 days × 4 meals). */
export function planReminders({ prefs, entries, goalFor, fast, fasts = [], split, now, days = SCHEDULE_DAYS }: PlanInput): PlannedReminder[] {
  if (!prefs.enabled) return [];
  const today = dayKey(new Date(now));
  const byDay = new Map<string, DiaryEntry[]>();
  for (const e of entries) {
    if (e.date < today) continue;
    const list = byDay.get(e.date);
    if (list) list.push(e);
    else byDay.set(e.date, [e]);
  }
  const out: PlannedReminder[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(today, i);
    const dayEntries = byDay.get(date) ?? [];
    for (const meal of MEALS) {
      const r = prefs.meals[meal];
      if (!r.on) continue;
      const at = wallClock(date, r.time + prefs.delay);
      if (at <= now) continue;
      if (dayEntries.some((e) => e.meal === meal)) continue;
      if (insideFast(at, fast) || fasts.some((f) => at >= f.start && at < f.end)) continue;
      out.push({ id: reminderId(date, meal), date, meal, at, figure: reminderFigure(meal, dayEntries, goalFor(date), prefs.adjust, split) });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

/* ---------- Notification text ---------- */

type Translate = (key: TKey, params?: Record<string, string | number>) => string;

/** Title and body of a reminder in the user's language. */
export function reminderText(r: Pick<PlannedReminder, 'meal' | 'figure'>, t: Translate, lang: Lang): { title: string; body: string } {
  const kcal = r.figure.kind === 'plain' ? '' : r.figure.kcal.toLocaleString(locale(lang));
  return {
    title: t(`reminder_title_${r.meal}`),
    body:
      r.figure.kind === 'planned'
        ? t('reminder_body_planned', { kcal })
        : r.figure.kind === 'left'
          ? t('reminder_body_left', { kcal })
          : t('reminder_body_plain'),
  };
}

/* ---------- Keeping the system's list in step ---------- */

export interface ScheduledReminder {
  id: string;
  at: number;
  title: string;
  body: string;
}

/**
 * What to cancel and what to (re)schedule so the pending reminders match `wanted`. Unchanged ones
 * are left alone, so a diary change only touches the few reminders whose text moved.
 */
export function reminderDiff(current: ScheduledReminder[], wanted: ScheduledReminder[]): { cancel: string[]; add: ScheduledReminder[] } {
  const want = new Map(wanted.map((w) => [w.id, w]));
  const have = new Map(current.map((c) => [c.id, c]));
  const same = (a: ScheduledReminder, b: ScheduledReminder) => a.at === b.at && a.title === b.title && a.body === b.body;
  const cancel = current.filter((c) => !want.has(c.id) || !same(c, want.get(c.id)!)).map((c) => c.id);
  const add = wanted.filter((w) => !have.has(w.id) || !same(have.get(w.id)!, w));
  return { cancel, add };
}

/** A reminder as handed to the phone or browser: what to show, when, and where a tap leads. */
export interface ReminderNotice extends ScheduledReminder {
  meal: MealType;
  date: string;
}

/**
 * Whether reminders can be shown here: allowed, blocked (only the system settings can change it),
 * not asked yet, only in the iPhone home-screen web app, or not at all in this browser.
 */
export type NotificationAccess = 'granted' | 'denied' | 'ask' | 'needs_home_screen' | 'unsupported';

/** Where tapping a reminder (or *Log now*) leads: the add screen for that meal and day. */
export function reminderTarget(data: unknown): { meal: MealType; date: string } | null {
  if (!data || typeof data !== 'object') return null;
  const { meal, date } = data as Record<string, unknown>;
  if (!MEALS.includes(meal as MealType) || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return { meal: meal as MealType, date };
}
