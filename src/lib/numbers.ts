/** Reading and showing numbers the user types. Pure: no React Native imports. */

/**
 * Parses what the user typed in a number field. Accepts a decimal comma or point ("72,5", "72.5"),
 * thousands separators when they are unambiguous ("1.234,5", "1,234.5", "2.000.000"), spaces, and
 * unfinished typing ("72," → 72). Anything else (letters, two decimal marks) gives null.
 * Whole-number fields (`integer`) also read "1.500" and "1,500" as 1500, and round decimals.
 */
export function parseNumber(text: string, integer = false): number | null {
  let s = text.replace(/[\s  ']/g, '');
  if (!s) return null;
  const neg = s.startsWith('-') || s.startsWith('−');
  if (neg) s = s.slice(1);
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null;

  const dots = (s.match(/\./g) ?? []).length;
  const commas = (s.match(/,/g) ?? []).length;
  const grouped = (sep: string) => new RegExp(`^\\d{1,3}(\\${sep}\\d{3})+$`).test(s);

  if (dots && commas) {
    // Both marks: the last one is the decimal mark, the other one groups thousands.
    const dec = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ',';
    const group = dec === '.' ? ',' : '.';
    const [whole, frac, extra] = s.split(dec);
    if (extra !== undefined || !new RegExp(`^\\d{1,3}(\\${group}\\d{3})+$`).test(whole)) return null;
    s = `${whole.split(group).join('')}.${frac}`;
  } else if (dots + commas > 1) {
    // The same mark twice can only be thousands separators.
    if (!grouped(dots ? '.' : ',')) return null;
    s = s.replace(/[.,]/g, '');
  } else if (dots + commas === 1) {
    // One mark: a decimal mark, except in whole-number fields where "1.500" means 1500.
    if (integer && grouped(dots ? '.' : ',')) s = s.replace(/[.,]/, '');
    else s = s.replace(',', '.');
  }

  const n = Number(s.endsWith('.') ? s.slice(0, -1) : s.startsWith('.') ? `0${s}` : s);
  if (!Number.isFinite(n)) return null;
  const v = neg ? -n : n;
  return integer ? Math.round(v) : v;
}

/** A number for an input field, with the decimal mark of the app language and no thousands separators. */
export function formatNumberInput(value: number | null, lang: string): string {
  if (value === null || !Number.isFinite(value)) return '';
  const s = String(Math.round(value * 1e6) / 1e6);
  return lang === 'de' ? s.replace('.', ',') : s;
}
