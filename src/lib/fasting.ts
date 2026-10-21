import { addDays, dayKey, parseDayKey, weekdayOf } from './dates';
import { isAdult } from './nutrition';
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

/**
 * Weekdays that count as low-calorie days for the current plan. Only as many days as the plan
 * allows are used (a 6:1 plan never has two fasting days, even if two were picked under 5:2).
 */
export function activeFastingDays(profile: Pick<Profile, 'fastingPlanId' | 'fastingDays'>): number[] {
  const plan = planById(profile.fastingPlanId);
  if (plan.kind !== 'weekly') return [];
  const unique = profile.fastingDays.filter((d, i, all) => all.indexOf(d) === i);
  return unique.slice(-(plan.fastDays ?? 0));
}

/** Fasting plans are for adults only; for under-18s no day is ever a fasting day. */
export function isFastingDay(
  profile: Pick<Profile, 'fastingPlanId' | 'fastingDays' | 'birthYear'>,
  dateKey: string,
  now = new Date(),
): boolean {
  if (!isAdult(profile.birthYear, now)) return false;
  return activeFastingDays(profile).includes(weekdayOf(dateKey));
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

/* ---------- Fixed eating window (daily plans) ---------- */
/*
 * With a fixed window, fasts start and end by themselves: the window opens at `opensAt` (local
 * wall-clock minutes) and stays open for the plan's eating hours (16:8 opening at 12:00 closes at
 * 20:00). Each scheduled fast is named after the day whose eating window ends it, so a fast from
 * 20:00 on Monday to 12:00 on Tuesday is Tuesday's. Windows may cross midnight (18:00–02:00).
 * Times follow the wall clock, so across a daylight-saving change a fast is an hour shorter or longer.
 */

export const CLOSE_LEADS = [15, 30, 60] as const;
export const CLOSE_LEAD_MIN = 5;
export const CLOSE_LEAD_MAX = 180;
/** Fasts missed while the app was closed are only filled in this far back. */
export const CATCH_UP_DAYS = 30;
/** Window notices are kept scheduled this far ahead (like meal reminders). */
export const NOTICE_DAYS = 14;

export interface FastingSchedule {
  enabled: boolean;
  /** When the eating window opens, minutes after local midnight. */
  opensAt: number;
  /** "Eating window closes in …" notice; off by default. */
  closeNotice: boolean;
  /** Minutes before the window closes (5–180). */
  closeLead: number;
  /** "Fast done" notice when the window opens; on by default. */
  doneNotice: boolean;
  /** Logging food during a fast needs ending the fast first (no "Log anyway"). */
  strict: boolean;
  /** Scheduled fasts that started before this moment (ms) are dealt with: started, recorded or skipped. */
  handledUntil: number;
}

export const DEFAULT_SCHEDULE: FastingSchedule = {
  enabled: false,
  opensAt: 12 * 60,
  closeNotice: false,
  closeLead: 30,
  doneNotice: true,
  strict: false,
  handledUntil: 0,
};

/** Any stored or imported shape → valid settings (store, backups). */
export function normalizeSchedule(v: unknown): FastingSchedule {
  const o = v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  const int = (x: unknown, min: number, max: number) => typeof x === 'number' && Number.isInteger(x) && x >= min && x <= max;
  return {
    enabled: o.enabled === true,
    opensAt: int(o.opensAt, 0, 1439) ? (o.opensAt as number) : DEFAULT_SCHEDULE.opensAt,
    closeNotice: o.closeNotice === true,
    closeLead: int(o.closeLead, CLOSE_LEAD_MIN, CLOSE_LEAD_MAX) ? (o.closeLead as number) : DEFAULT_SCHEDULE.closeLead,
    doneNotice: o.doneNotice !== false,
    strict: o.strict === true,
    handledUntil: typeof o.handledUntil === 'number' && Number.isFinite(o.handledUntil) && o.handledUntil >= 0 ? o.handledUntil : 0,
  };
}

/** Fasting hours of the plan when it is a daily one, else null (5:2 and 6:1 have no window). */
export function windowFastHours(planId: string): number | null {
  const plan = planById(planId);
  return plan.kind === 'daily' && plan.fastHours ? plan.fastHours : null;
}

/** Whether the schedule runs: switched on, a daily plan, and an adult (fasting is for adults only). */
export function scheduleActive(
  schedule: FastingSchedule,
  profile: Pick<Profile, 'fastingPlanId' | 'birthYear'>,
  now = new Date(),
): boolean {
  return schedule.enabled && windowFastHours(profile.fastingPlanId) !== null && isAdult(profile.birthYear, now);
}

/** When the window closes, minutes after midnight (may be past 24:00 for windows crossing midnight). */
export function closesAt(opensAt: number, fastHours: number): number {
  return opensAt + (24 - fastHours) * 60;
}

/** The local moment `minutes` after midnight of `date`; minutes past 24:00 roll into the next day. */
function wallClock(date: string, minutes: number): number {
  const d = parseDayKey(date);
  d.setHours(0, minutes, 0, 0);
  return d.getTime();
}

export interface ScheduledFast {
  /** The day whose eating window ends this fast. */
  key: string;
  start: number;
  end: number;
}

/** The fast that the window opening on `key` ends. */
export function scheduledFast(key: string, opensAt: number, fastHours: number): ScheduledFast {
  return { key, start: wallClock(addDays(key, -1), closesAt(opensAt, fastHours)), end: wallClock(key, opensAt) };
}

/** Every scheduled fast that overlaps [from, to], oldest first. */
export function scheduledFastsBetween(from: number, to: number, opensAt: number, fastHours: number): ScheduledFast[] {
  const out: ScheduledFast[] = [];
  const last = addDays(dayKey(new Date(to)), 2);
  for (let key = addDays(dayKey(new Date(from)), -1); key <= last; key = addDays(key, 1)) {
    const f = scheduledFast(key, opensAt, fastHours);
    if (f.end > from && f.start <= to) out.push(f);
  }
  return out;
}

/** The scheduled fast going on at `at`, or null while the window is open. */
export function scheduledFastAt(at: number, opensAt: number, fastHours: number): ScheduledFast | null {
  return scheduledFastsBetween(at, at, opensAt, fastHours).find((f) => at >= f.start && at < f.end) ?? null;
}

/**
 * Whether a clock time falls inside the daily fast (used to mark meal reminders and meals in the
 * split that the window leaves out). `minutes` is minutes after midnight.
 */
export function minutesInsideFast(minutes: number, opensAt: number, fastHours: number): boolean {
  const close = closesAt(opensAt, fastHours) % 1440;
  const m = ((minutes % 1440) + 1440) % 1440;
  return close <= opensAt ? m >= close && m < opensAt : m >= close || m < opensAt;
}

/** `handledUntil` when the schedule is switched on: the fast going on right now still starts. */
export function handledFromNow(now: number, opensAt: number, fastHours: number): number {
  return scheduledFastAt(now, opensAt, fastHours)?.start ?? now;
}

export const plannedEnd = (s: Pick<FastingSession, 'start' | 'targetHours'>) => s.start + s.targetHours * 3600000;

export interface SyncInput {
  schedule: FastingSchedule;
  profile: Pick<Profile, 'fastingPlanId' | 'birthYear'>;
  active: FastingSession | null;
  history: FastingSession[];
  now: number;
  newId: () => string;
}

export interface SyncResult {
  active: FastingSession | null;
  history: FastingSession[];
  handledUntil: number;
  changed: boolean;
}

/**
 * Brings the running fast and the history in step with the schedule (on every app open, every
 * minute while open, and after changes):
 * - a scheduled fast whose planned end has passed is recorded as finished at that end;
 * - scheduled fasts that started since `handledUntil` (at most 30 days back) are recorded when they
 *   are over, or become the running fast;
 * - a fast that is already running (a manual one, or an extended scheduled one) is never replaced;
 *   the schedule takes over from the next window after it;
 * - a scheduled fast already in the history (by its day) is never added twice, also after a backup.
 */
export function syncSchedule({ schedule, profile, active, history, now, newId }: SyncInput): SyncResult {
  const fastHours = windowFastHours(profile.fastingPlanId);
  if (!schedule.enabled || fastHours === null || !isAdult(profile.birthYear, new Date(now))) {
    return { active, history, handledUntil: schedule.handledUntil, changed: false };
  }
  let changed = false;
  let current = active;
  const added: FastingSession[] = [];
  let busyUntil = 0;
  if (current?.scheduledFor && now >= plannedEnd(current)) {
    busyUntil = plannedEnd(current);
    added.push({ ...current, end: busyUntil });
    current = null;
    changed = true;
  }
  const floor = Math.max(schedule.handledUntil, now - CATCH_UP_DAYS * 86400000);
  let handledUntil = schedule.handledUntil;
  const known = new Set([...history, ...added].map((h) => h.scheduledFor).filter(Boolean));
  for (const f of scheduledFastsBetween(floor, now, schedule.opensAt, fastHours)) {
    if (f.start < floor || f.start > now) continue;
    handledUntil = Math.max(handledUntil, f.start + 1);
    if (known.has(f.key) || current?.scheduledFor === f.key || f.start < busyUntil) continue;
    if (current) continue;
    const targetHours = (f.end - f.start) / 3600000;
    const session: FastingSession = { id: newId(), start: f.start, targetHours, planId: profile.fastingPlanId, scheduledFor: f.key };
    if (f.end <= now) added.push({ ...session, end: f.end });
    else current = session;
    known.add(f.key);
    changed = true;
  }
  if (handledUntil !== schedule.handledUntil) changed = true;
  const merged = added.length ? [...added, ...history].sort((a, b) => b.start - a.start).slice(0, 200) : history;
  return { active: current, history: merged, handledUntil, changed };
}

/* ---------- Logging food during a fast ---------- */

export interface FastCheck {
  /** When the fast is planned to end. */
  until: number;
  /** The planned time has passed but the fast hasn't been ended. */
  reached: boolean;
  /** Only *End fast & log* is offered. */
  strict: boolean;
}

/**
 * Whether adding food to `date` should first ask about the running fast: only for today, and only
 * while a fast runs. Other days are never blocked (filling in yesterday's dinner, planning ahead).
 */
export function fastCheck(active: FastingSession | null, date: string, now: number, strict: boolean): FastCheck | null {
  if (!active || active.end !== undefined || active.start > now) return null;
  if (date !== dayKey(new Date(now))) return null;
  const until = plannedEnd(active);
  return { until, reached: now >= until, strict };
}

/* ---------- Window notices ---------- */

export interface FastNotice {
  /** Stable per fast, so rescheduling replaces rather than duplicates. */
  id: string;
  at: number;
  kind: 'close' | 'done';
  /** Done: the fast's length in hours; close: minutes until the window closes. */
  value: number;
  /** Close: when the fast starts. */
  fastStart?: number;
}

export const FAST_NOTICE_PREFIX = 'fast-notice:';

/**
 * The window notices to keep scheduled: "window closes in …" before each coming fast, and "fast
 * done" at the end of the running scheduled fast and each coming one. Coming fasts that a running
 * fast still covers are left out, as the schedule only takes over after it.
 */
export function planFastNotices(input: {
  schedule: FastingSchedule;
  profile: Pick<Profile, 'fastingPlanId' | 'birthYear'>;
  active: FastingSession | null;
  now: number;
  days?: number;
}): FastNotice[] {
  const { schedule, profile, active, now, days = NOTICE_DAYS } = input;
  const fastHours = windowFastHours(profile.fastingPlanId);
  if (!scheduleActive(schedule, profile, new Date(now)) || fastHours === null) return [];
  const out: FastNotice[] = [];
  const busyUntil = active ? plannedEnd(active) : 0;
  if (active?.scheduledFor && schedule.doneNotice && busyUntil > now) {
    out.push({ id: `${FAST_NOTICE_PREFIX}done:${active.scheduledFor}`, at: busyUntil, kind: 'done', value: Math.round(active.targetHours) });
  }
  for (const f of scheduledFastsBetween(now, now + days * 86400000, schedule.opensAt, fastHours)) {
    if (f.start <= now || f.start < busyUntil) continue;
    if (schedule.closeNotice) {
      const at = f.start - schedule.closeLead * 60000;
      if (at > now) out.push({ id: `${FAST_NOTICE_PREFIX}close:${f.key}`, at, kind: 'close', value: schedule.closeLead, fastStart: f.start });
    }
    if (schedule.doneNotice) {
      out.push({ id: `${FAST_NOTICE_PREFIX}done:${f.key}`, at: f.end, kind: 'done', value: Math.round((f.end - f.start) / 3600000) });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

/** Coming scheduled fasts as time ranges, for holding back meal reminders (reminders.ts). */
export function upcomingFasts(input: {
  schedule: FastingSchedule;
  profile: Pick<Profile, 'fastingPlanId' | 'birthYear'>;
  active: FastingSession | null;
  now: number;
  days?: number;
}): { start: number; end: number }[] {
  const { schedule, profile, active, now, days = NOTICE_DAYS + 1 } = input;
  const fastHours = windowFastHours(profile.fastingPlanId);
  if (!scheduleActive(schedule, profile, new Date(now)) || fastHours === null) return [];
  const busyUntil = active ? plannedEnd(active) : 0;
  return scheduledFastsBetween(now, now + days * 86400000, schedule.opensAt, fastHours)
    .filter((f) => f.start > now && f.start >= busyUntil)
    .map(({ start, end }) => ({ start, end }));
}
