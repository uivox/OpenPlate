import { newId } from './id';
import { scaleNutrients } from './nutrition';
import type { DiaryEntry, Food, MealType, Nutrients, SavedMeal, SavedMealItem } from './types';

/**
 * Saved meals ("Meine Mahlzeiten"): a named set of foods with amounts, e.g. the breakfast you eat
 * every day. Logging one adds every item as its own diary entry, so each stays editable.
 */

export function mealTotals(items: SavedMealItem[], factor = 1): Nutrients {
  return items.reduce<Nutrients>(
    (acc, it) => {
      const n = scaleNutrients(it.food.per100, it.grams * factor);
      return { kcal: acc.kcal + n.kcal, protein: acc.protein + n.protein, carbs: acc.carbs + n.carbs, fat: acc.fat + n.fat };
    },
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

/** Items for a new meal built from diary entries. Quick-add entries are kept (their 100 g = one portion). */
export function itemsFromEntries(entries: DiaryEntry[]): SavedMealItem[] {
  return [...entries].sort((a, b) => a.createdAt - b.createdAt).map((e) => ({ food: e.food, grams: e.grams }));
}

export function newMeal(name: string, items: SavedMealItem[], now = Date.now()): SavedMeal {
  return { id: `meal:${newId()}`, name: name.trim(), items, createdAt: now, lastUsed: 0 };
}

/** Diary entries (without id/createdAt) for logging a meal, with an optional portion factor. */
export function entriesForMeal(m: SavedMeal, date: string, meal: MealType, factor = 1): { date: string; meal: MealType; food: Food; grams: number }[] {
  const f = factor > 0 ? factor : 1;
  return m.items.map((it) => ({ date, meal, food: it.food, grams: Math.round(it.grams * f * 10) / 10 }));
}

const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss');

/** Meals whose name or any ingredient matches the query. Most recently used first. */
export function searchMeals(meals: SavedMeal[], q: string): SavedMeal[] {
  const ql = fold(q.trim());
  const sorted = [...meals].sort((a, b) => (b.lastUsed || b.createdAt) - (a.lastUsed || a.createdAt));
  if (!ql) return sorted;
  return sorted.filter((m) => fold(m.name).includes(ql) || m.items.some((it) => fold(it.food.name).includes(ql)));
}
