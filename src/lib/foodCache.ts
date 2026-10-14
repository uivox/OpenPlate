import type { Food } from './types';

/**
 * Screens receive only string params, so foods picked in search or the scanner are parked
 * here and the food screen looks them up by id.
 */
const cache = new Map<string, Food>();

export function putFood(food: Food): string {
  cache.set(food.id, food);
  return food.id;
}

export function getFood(id: string | undefined): Food | undefined {
  return id ? cache.get(id) : undefined;
}

let pendingAI: { items: import('./types').AIItem[] } | null = null;
export function setPendingAI(v: typeof pendingAI) {
  pendingAI = v;
}
export function getPendingAI() {
  return pendingAI;
}

/**
 * The meal being built on the meal-edit screen. Foods picked through add-food / scan / food in
 * "pick" mode are appended here, and the builder re-renders through `subscribeMealDraft`.
 */
export interface MealDraft {
  /** Set when editing an existing saved meal. */
  id?: string;
  name: string;
  items: import('./types').SavedMealItem[];
}
let mealDraft: MealDraft | null = null;
const draftListeners = new Set<() => void>();

export function setMealDraft(d: MealDraft | null) {
  mealDraft = d;
  draftListeners.forEach((l) => l());
}
export function getMealDraft(): MealDraft | null {
  return mealDraft;
}
export function addToMealDraft(item: import('./types').SavedMealItem) {
  setMealDraft({ ...(mealDraft ?? { name: '', items: [] }), items: [...(mealDraft?.items ?? []), item] });
}
export function subscribeMealDraft(listener: () => void): () => void {
  draftListeners.add(listener);
  return () => draftListeners.delete(listener);
}
