import { checkBarcode } from './barcode';
import type { FoodDraft } from './foodCache';
import { fetchRobotoffNutrition, InvalidBarcodeError, lookupBarcodeDetailed, type PartialProduct } from './openFoodFacts';
import type { Food } from './types';

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/**
 * What a barcode leads to, shared by the scanner and the barcode typed into the food search:
 * - `found`: a product with usable nutrition (the user's own foods first, then the offline pack, then Open Food Facts)
 * - `suggestion`: Open Food Facts' photo AI read nutrition off a package photo; the user checks it
 * - `missing`: unknown product, or known without nutrition (`partial`); the user picks label / type in / scan again
 * Errors are thrown as by `lookupBarcodeDetailed` and sorted with `lookupFailure`.
 */
export type BarcodeOutcome =
  | { kind: 'found'; code: string; food: Food }
  | { kind: 'suggestion'; code: string; draft: FoodDraft }
  | { kind: 'missing'; code: string; draft: FoodDraft; partial?: PartialProduct };

export async function resolveBarcode(
  input: string,
  lang: 'de' | 'en',
  ownFoods: Food[],
  fetchImpl: FetchLike = fetch,
  /** The offline product pack, when one is installed: asked before Open Food Facts, works without a connection. */
  offline?: { lookup(code: string): Food | undefined },
): Promise<BarcodeOutcome> {
  const check = checkBarcode(input);
  if (!check.ok) throw new InvalidBarcodeError(check.problem);
  const code = check.code;
  const own = ownFoods.find((f) => f.barcode && sameBarcode(f.barcode, code));
  if (own) return { kind: 'found', code, food: own };
  const packed = offline?.lookup(code);
  if (packed) return { kind: 'found', code, food: packed };
  const found = await lookupBarcodeDetailed(code, lang, fetchImpl);
  if (found.food) return { kind: 'found', code, food: found.food };
  const partial = found.partial;
  const base: FoodDraft = {
    barcode: code,
    name: partial?.name,
    brand: partial?.brand,
    unit: partial?.unit ?? 'g',
    servings: partial?.servings ?? [],
    issues: [],
  };
  // Not in Open Food Facts, or there without nutrition: its photo AI may have read the values off a
  // package photo already. That's only a suggestion; the user checks it in the form.
  const suggestion = await fetchRobotoffNutrition(code, fetchImpl);
  if (suggestion) {
    return { kind: 'suggestion', code, draft: { ...base, per100: suggestion.per100, issues: suggestion.issues, dataFrom: 'robotoff', imageUri: suggestion.imageUrl } };
  }
  return { kind: 'missing', code, draft: { ...base, imageUri: partial?.imageUrl }, ...(partial ? { partial } : {}) };
}

/** "0012345678905" and "012345678905" are the same product (leading zeros don't change a GTIN). */
export function sameBarcode(a: string, b: string): boolean {
  const ca = checkBarcode(a);
  const cb = checkBarcode(b);
  const strip = (s: string) => s.replace(/^0+/, '');
  return ca.ok && cb.ok ? strip(ca.code) === strip(cb.code) : a === b;
}

/** Route params for the screens a barcode leads to: only the values that are set, never empty strings. */
export function flowParams(p: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(p)) if (typeof v === 'string' && v !== '') out[k] = v;
  return out;
}
