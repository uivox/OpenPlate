/* Everything the user has logged, built from the diary, and the "Show more" steps of the food search.
 * Pure: no React Native, tested in tests/logic.test.ts. */
import type { DiaryEntry, Food } from './types';

/** One food in the history: the version to show, how often it was logged and when last. */
export interface HistoryItem {
  food: Food;
  /** Diary entries that used it. */
  count: number;
  /** Day of the entry that was logged last (YYYY-MM-DD). */
  lastDate: string;
  /** When that entry was made (ms). */
  lastAt: number;
}

/** A food the user removed from the history. Logging it again after `at` brings it back. Part of backups. */
export interface HiddenFood {
  id: string;
  at: number;
}

/** The *Recent* tab gets a filter field once the history is longer than this. */
export const HISTORY_FILTER_FROM = 30;
/** The *Recent* tab shows this many foods, and this many more per *Show more* (a long list stays quick to draw). */
export const HISTORY_PAGE = 30;
/** *Show more* adds this many items to a search section. */
export const SHOW_MORE_STEP = 10;
/** How many items each search section shows before *Show more*. */
export const SECTION_START = { mine: 6, generic: 5, restaurant: 8, bls: 10, pack: 20 } as const;
export type SearchSection = keyof typeof SECTION_START;
/** Open Food Facts results per page (one page per *Load more*). */
export const OFF_PAGE_SIZE = 40;
/** Hidden foods kept at most (oldest dropped); far more than anyone removes by hand. */
const MAX_HIDDEN = 2000;

/**
 * Every food in the diary, newest first. Quick-add entries (kcal only, no food) are left out, as in
 * the old recent list. The version shown is the user's own food as it is now when it still exists
 * (edited since), otherwise the food as it was in the last diary entry that used it. Hidden foods
 * stay out unless they were logged again after being removed.
 */
export function foodHistory(entries: readonly DiaryEntry[], ownFoods: readonly Food[] = [], hidden: readonly HiddenFood[] = []): HistoryItem[] {
  const byId = new Map<string, { last: DiaryEntry; count: number }>();
  for (const e of entries) {
    if (e.food.source === 'quick') continue;
    const seen = byId.get(e.food.id);
    if (!seen) byId.set(e.food.id, { last: e, count: 1 });
    else {
      seen.count++;
      if (later(e, seen.last)) seen.last = e;
    }
  }
  const own = new Map(ownFoods.map((f) => [f.id, f]));
  const hiddenAt = new Map(hidden.map((h) => [h.id, h.at]));
  const out: HistoryItem[] = [];
  for (const [id, { last, count }] of byId) {
    const at = hiddenAt.get(id);
    if (at !== undefined && last.createdAt <= at) continue;
    out.push({ food: own.get(id) ?? last.food, count, lastDate: last.date, lastAt: last.createdAt });
  }
  return out.sort((a, b) => b.lastAt - a.lastAt || b.lastDate.localeCompare(a.lastDate) || a.food.name.localeCompare(b.food.name));
}

/** Entry `a` was logged after `b` (by creation time, then by day). */
function later(a: DiaryEntry, b: DiaryEntry): boolean {
  return a.createdAt !== b.createdAt ? a.createdAt > b.createdAt : a.date > b.date;
}

/** Hides a food from the history; the diary is never touched. */
export function hideFromHistory(hidden: readonly HiddenFood[], id: string, now: number): HiddenFood[] {
  return [{ id, at: now }, ...hidden.filter((h) => h.id !== id)].slice(0, MAX_HIDDEN);
}

/** Checks a stored or imported hidden list: unknown shapes are dropped, one row per food. */
export function normalizeHidden(v: unknown): HiddenFood[] {
  if (!Array.isArray(v)) return [];
  const out: HiddenFood[] = [];
  const ids = new Set<string>();
  for (const h of v) {
    if (!h || typeof h !== 'object') continue;
    const { id, at } = h as Record<string, unknown>;
    if (typeof id !== 'string' || !id || id.length > 200 || ids.has(id)) continue;
    if (typeof at !== 'number' || !Number.isFinite(at) || at < 0) continue;
    ids.add(id);
    out.push({ id, at });
    if (out.length >= MAX_HIDDEN) break;
  }
  return out;
}

/** Every word of the query is in the food's name or brand (case does not matter). */
export function matchesFood(f: Food, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = `${f.name} ${f.brand ?? ''}`.toLowerCase();
  return words.every((w) => hay.includes(w));
}

export function filterHistory(items: readonly HistoryItem[], query: string): HistoryItem[] {
  return items.filter((i) => matchesFood(i.food, query));
}

/* ---------- Show more ---------- */

/** How many items a section shows after `taps` taps on *Show more*. */
export function shownCount(section: SearchSection, taps: number): number {
  return SECTION_START[section] + Math.max(0, Math.floor(taps)) * SHOW_MORE_STEP;
}

/**
 * The visible part of a section and whether *Show more* is offered. Searches ask for one item more
 * than they show (`shownCount + 1`), so `more` is only true when there really is another one.
 */
export function sectionPage<T>(items: readonly T[], shown: number): { visible: T[]; more: boolean } {
  return { visible: items.slice(0, shown), more: items.length > shown };
}

/** Adds the next Open Food Facts page to what is shown, without repeating products. */
export function appendPage(shown: readonly Food[], next: readonly Food[]): Food[] {
  const ids = new Set(shown.map((f) => f.id));
  return [...shown, ...next.filter((f) => !ids.has(f.id) && (ids.add(f.id), true))];
}
