import type { DiarySection, LayoutPrefs, TabId } from './types';

/** Order and visibility of the tabs and the diary sections. Pure, so it can be tested. */

export const ALL_TABS: TabId[] = ['index', 'fasting', 'recipes', 'progress', 'profile'];
/** The diary is home and the profile holds the settings, so neither can be hidden. */
export const FIXED_TABS: TabId[] = ['index', 'profile'];

export const ALL_DIARY: DiarySection[] = ['plate', 'meals', 'fasting', 'water', 'steps'];
export const FIXED_DIARY: DiarySection[] = ['plate', 'meals'];

export const DEFAULT_LAYOUT: LayoutPrefs = {
  tabOrder: ALL_TABS,
  hiddenTabs: [],
  addButton: 'center',
  diaryOrder: ALL_DIARY,
  hiddenDiary: [],
};

/**
 * Keeps known ids once each, in the stored order. Missing ids (e.g. a tab added in an update) go in
 * right after the item that precedes them by default, so a new "Recipes" tab lands next to Fasting
 * instead of at the end.
 */
function complete<T extends string>(order: unknown, all: T[]): T[] {
  const seen = new Set<T>();
  const out: T[] = [];
  for (const id of Array.isArray(order) ? order : []) {
    if (all.includes(id as T) && !seen.has(id as T)) {
      seen.add(id as T);
      out.push(id as T);
    }
  }
  all.forEach((id, i) => {
    if (seen.has(id)) return;
    const before = i > 0 ? out.indexOf(all[i - 1]) : -1;
    out.splice(before + 1, 0, id);
    seen.add(id);
  });
  return out;
}

export function normalizeLayout(l: Partial<LayoutPrefs> | undefined): LayoutPrefs {
  // Also used for imported backups and stored data, so any shape must be handled.
  const v: Partial<LayoutPrefs> = l && typeof l === 'object' ? l : {};
  const hiddenTabs: unknown[] = Array.isArray(v.hiddenTabs) ? v.hiddenTabs : [];
  const hiddenDiary: unknown[] = Array.isArray(v.hiddenDiary) ? v.hiddenDiary : [];
  return {
    tabOrder: complete(v.tabOrder, ALL_TABS),
    hiddenTabs: complete(v.hiddenTabs, ALL_TABS).filter((id) => hiddenTabs.includes(id) && !FIXED_TABS.includes(id)),
    addButton: v.addButton === 'left' || v.addButton === 'right' ? v.addButton : 'center',
    diaryOrder: complete(v.diaryOrder, ALL_DIARY),
    hiddenDiary: complete(v.hiddenDiary, ALL_DIARY).filter((id) => hiddenDiary.includes(id) && !FIXED_DIARY.includes(id)),
  };
}

export function visibleTabs(l: LayoutPrefs): TabId[] {
  return l.tabOrder.filter((id) => !l.hiddenTabs.includes(id));
}

export function visibleDiary(l: LayoutPrefs): DiarySection[] {
  return l.diaryOrder.filter((id) => !l.hiddenDiary.includes(id));
}

/** Moves `id` one step up (-1) or down (+1). */
export function move<T>(list: T[], id: T, dir: -1 | 1): T[] {
  const i = list.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return list;
  const out = [...list];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

export function toggle<T>(list: T[], id: T, on: boolean): T[] {
  return on ? (list.includes(id) ? list : [...list, id]) : list.filter((x) => x !== id);
}

/** Splits the visible tabs around the add button. */
export function tabSides(tabs: TabId[], addButton: LayoutPrefs['addButton']): { left: TabId[]; right: TabId[] } {
  if (addButton === 'left') return { left: [], right: tabs };
  if (addButton === 'right') return { left: tabs, right: [] };
  const half = Math.ceil(tabs.length / 2);
  return { left: tabs.slice(0, half), right: tabs.slice(half) };
}
