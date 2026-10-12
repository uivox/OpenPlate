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
