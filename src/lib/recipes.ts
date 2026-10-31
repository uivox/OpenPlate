import { blsFood, blsRows } from './bls';
import type { BlsRow } from './blsData';
import { genericFoods } from './genericFoods';
import { newId } from './id';
import { mealTotals } from './meals';
import type { Food, Nutrients, Recipe, RecipeTag, SavedMealItem } from './types';

/**
 * Recipes: own ones (with a photo from the phone) and community ones from communityRecipes.ts.
 * Nutrition is always calculated from the ingredients, never typed in. Logging a recipe turns it
 * into one food with a "1 serving" portion, so the normal portion picker does the rest.
 */

/** Contribution guide for community recipes. */
export const RECIPES_GUIDE_URL = 'https://github.com/uivox/Tellerwerk/blob/main/docs/RECIPES.md';

export const RECIPE_TAGS: RecipeTag[] = ['breakfast', 'main', 'snack', 'vegetarian', 'vegan', 'high_protein', 'quick'];

/** A recipe as written in communityRecipes.ts: ingredients point at foods in the built-in data. */
export interface CommunityRecipe {
  /** Stable, lowercase, dashes: "overnight-oats". */
  id: string;
  name: { de: string; en: string };
  servings: number;
  minutes?: number;
  tags: RecipeTag[];
  /** `ref`: "generic:<id>" (genericFoods.ts) or "bls:<code>" (BLS 4.0); grams as weighed for the whole recipe. */
  ingredients: { ref: string; grams: number }[];
  steps: { de: string[]; en: string[] };
  /** Only openly licensed photos, e.g. from Wikimedia Commons. */
  photo?: { url: string; credit: string; license: string };
  author: string;
  /** GitHub names of people other than the author who cooked it and checked the amounts. */
  testedBy: string[];
}

let blsIndex: Map<string, BlsRow> | null = null;

/** Whether a community recipe needs the BLS database (loaded on demand, see bls.ts). */
export const needsBls = (c: CommunityRecipe) => c.ingredients.some((i) => i.ref.startsWith('bls:'));

/** Looks up an ingredient reference; undefined when it doesn't exist (caught by the tests) or the BLS isn't loaded yet. */
export function resolveRef(ref: string, lang: 'de' | 'en'): Food | undefined {
  if (ref.startsWith('generic:')) return genericFoods(lang).find((f) => f.id === ref);
  if (ref.startsWith('bls:')) {
    const rows = blsRows();
    if (!rows) return undefined;
    if (!blsIndex) blsIndex = new Map(rows.map((r) => [r[0], r]));
    const row = blsIndex.get(ref.slice(4));
    return row ? blsFood(row, lang) : undefined;
  }
  return undefined;
}

export function resolveCommunity(c: CommunityRecipe, lang: 'de' | 'en'): { recipe: Recipe; missing: string[] } {
  const missing: string[] = [];
  const items: SavedMealItem[] = [];
  for (const ing of c.ingredients) {
    const food = resolveRef(ing.ref, lang);
    if (food) items.push({ food, grams: ing.grams });
    else missing.push(ing.ref);
  }
  return {
    missing,
    recipe: {
      id: `community:${c.id}`,
      name: c.name[lang] || c.name.en,
      items,
      servings: c.servings,
      steps: c.steps[lang]?.length ? c.steps[lang] : c.steps.en,
      minutes: c.minutes,
      tags: c.tags,
      photo: c.photo?.url,
      photoCredit: c.photo ? `${c.photo.credit} (${c.photo.license})` : undefined,
      source: 'community',
      author: c.author,
      testedBy: c.testedBy,
      createdAt: 0,
    },
  };
}

export function recipeGrams(r: Pick<Recipe, 'items'>): number {
  return r.items.reduce((s, i) => s + (i.grams || 0), 0);
}

export function recipeTotals(r: Pick<Recipe, 'items'>): Nutrients {
  return mealTotals(r.items.map((i) => ({ ...i, grams: i.grams || 0 })));
}

export function perServing(r: Pick<Recipe, 'items' | 'servings'>): Nutrients {
  const t = recipeTotals(r);
  const s = r.servings > 0 ? r.servings : 1;
  return { kcal: t.kcal / s, protein: t.protein / s, carbs: t.carbs / s, fat: t.fat / s };
}

/** Ingredient amounts for cooking a different number of servings. */
export function scaleItems(r: Pick<Recipe, 'items' | 'servings'>, servings: number): SavedMealItem[] {
  const f = r.servings > 0 && servings > 0 ? servings / r.servings : 1;
  return r.items.map((i) => ({ ...i, grams: Math.round(i.grams * f * 10) / 10 }));
}

/** The recipe as a loggable food: nutrients per 100 g of the finished dish and a "1 serving" portion. */
export function recipeFood(r: Recipe, servingLabel: string): Food {
  const grams = recipeGrams(r);
  const t = recipeTotals(r);
  const f = grams > 0 ? 100 / grams : 0;
  return {
    id: `recipe:${r.id}`,
    source: 'recipe',
    name: r.name,
    per100: { kcal: t.kcal * f, protein: t.protein * f, carbs: t.carbs * f, fat: t.fat * f },
    servings: grams > 0 ? [{ label: servingLabel, grams: Math.round((grams / Math.max(1, r.servings)) * 10) / 10 }] : [],
    imageUrl: r.photo && !r.photo.startsWith('data:') ? r.photo : undefined,
    unit: 'g',
  };
}

export function newRecipe(fields: Omit<Recipe, 'id' | 'createdAt' | 'source'>, now = Date.now()): Recipe {
  return { ...fields, name: fields.name.trim(), id: `recipe-${newId()}`, source: 'own', createdAt: now };
}

const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss');

/** Name or ingredient match, optionally limited to a tag. */
export function searchRecipes(list: Recipe[], q: string, tag?: RecipeTag | null): Recipe[] {
  const ql = fold(q.trim());
  return list.filter(
    (r) =>
      (!tag || r.tags.includes(tag)) &&
      (!ql || fold(r.name).includes(ql) || r.items.some((i) => fold(i.food.name).includes(ql))),
  );
}

/** Problems in the community file; the test suite requires this to be empty. */
export function validateCommunity(list: CommunityRecipe[]): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const c of list) {
    const at = `recipe ${c.id}`;
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(c.id)) errors.push(`${at}: id must be lowercase-with-dashes`);
    if (ids.has(c.id)) errors.push(`${at}: duplicate id`);
    ids.add(c.id);
    if (!c.name.de?.trim() || !c.name.en?.trim()) errors.push(`${at}: needs a German and an English name`);
    if (!(c.servings >= 1 && c.servings <= 20)) errors.push(`${at}: servings 1–20`);
    if (!c.ingredients.length) errors.push(`${at}: no ingredients`);
    for (const ing of c.ingredients) {
      if (!(ing.grams > 0)) errors.push(`${at}: ${ing.ref} needs grams > 0`);
      if (!resolveRef(ing.ref, 'de')) errors.push(`${at}: unknown ingredient ${ing.ref}`);
    }
    if (!c.steps.de?.length || !c.steps.en?.length) errors.push(`${at}: needs steps in German and English`);
    if (c.steps.de?.length !== c.steps.en?.length) errors.push(`${at}: German and English step counts differ`);
    for (const tg of c.tags) if (!RECIPE_TAGS.includes(tg)) errors.push(`${at}: unknown tag ${tg}`);
    if (c.photo && (!c.photo.url.startsWith('https://') || !c.photo.credit || !c.photo.license)) errors.push(`${at}: photo needs an https url, credit and licence`);
    if (!c.author?.trim()) errors.push(`${at}: needs an author`);
    if (c.testedBy.includes(c.author)) errors.push(`${at}: the author can't test their own recipe`);
  }
  return errors;
}
