/** The amount picker on the food screen: whole numbers, fractions of a serving, switching units. Pure: no React Native imports. */

/** Fractions the wheel offers for servings, as in "1¾ portions". */
export const FRACTIONS = [0, 1 / 8, 1 / 4, 1 / 3, 1 / 2, 2 / 3, 3 / 4, 7 / 8] as const;
export const FRACTION_LABELS = ['–', '⅛', '¼', '⅓', '½', '⅔', '¾', '⅞'] as const;

/** Highest whole number on the wheel: servings go to 99, grams and millilitres to 2000. */
export function wheelMax(serving: boolean): number {
  return serving ? 99 : 2000;
}

/**
 * Splits an amount into the wheel's columns: whole number and fraction (servings) or whole number only
 * (grams, millilitres). Takes the nearest position the wheel has (1.6 portions shows as 1⅔, 12.4 g as 12);
 * amounts beyond the wheel stop at its end.
 */
export function splitAmount(qty: number | null, serving: boolean): { whole: number; frac: number } {
  const max = wheelMax(serving);
  if (qty === null || !Number.isFinite(qty) || qty <= 0) return { whole: 0, frac: 0 };
  if (qty >= max) return { whole: max, frac: 0 };
  if (!serving) return { whole: Math.min(max, Math.round(qty)), frac: 0 };
  let whole = Math.floor(qty);
  const rest = qty - whole;
  let frac = 0;
  let best = Infinity;
  // 1 stands for "the next whole number", so 1.95 shows as 2.
  [...FRACTIONS, 1].forEach((f, i) => {
    const d = Math.abs(rest - f);
    if (d < best - 1e-9) {
      best = d;
      frac = i;
    }
  });
  if (frac === FRACTIONS.length) {
    whole += 1;
    frac = 0;
  }
  return whole >= max ? { whole: max, frac: 0 } : { whole, frac };
}

/** The amount for a wheel position, rounded to 2 decimals so the type-in field stays readable (1⅓ → 1.33). */
export function joinAmount(whole: number, frac: number, serving: boolean): number {
  const f = serving ? (FRACTIONS[frac] ?? 0) : 0;
  return Math.round((whole + f) * 100) / 100;
}

/**
 * The amount in another unit for the same quantity of food. `servingGrams` is the size of the new
 * serving, or null for grams/millilitres.
 */
export function convertAmount(grams: number, servingGrams: number | null): number {
  if (!(grams > 0)) return 0;
  return servingGrams && servingGrams > 0 ? Math.round((grams / servingGrams) * 100) / 100 : Math.round(grams);
}

/** Text a screen reader reads for a wheel position: "1 ¾", "2", "40". */
export function amountSpoken(whole: number, frac: number, serving: boolean): string {
  return serving && frac > 0 ? `${whole} ${FRACTION_LABELS[frac]}` : String(whole);
}
