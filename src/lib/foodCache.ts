import type { NutrientIssue } from './labelScan';
import type { Food, Nutrients, Serving } from './types';

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

/**
 * A food being created from outside data (a Robotoff suggestion, a label photo, or what Open Food
 * Facts knows about a product without nutrition). The scanner and the label screen fill it; the
 * custom-food form starts from it, and the user checks every value before it is saved.
 */
export interface FoodDraft {
  barcode?: string;
  name?: string;
  brand?: string;
  unit: 'g' | 'ml';
  per100?: Nutrients;
  servings: Serving[];
  dataFrom?: 'label' | 'robotoff';
  /** Name of the AI that read the label, shown in the review hint. */
  readBy?: string;
  issues: NutrientIssue[];
  /** Photo to compare against: the label photo, or the Open Food Facts image the values came from. */
  imageUri?: string;
}
let foodDraft: FoodDraft | null = null;
export function setFoodDraft(d: FoodDraft | null) {
  foodDraft = d;
}
export function getFoodDraft(): FoodDraft | null {
  return foodDraft;
}
