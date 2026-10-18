/**
 * Retail barcodes (GTIN): EAN-8, UPC-E, UPC-A, EAN-13 and GTIN-14. The last digit is a check digit,
 * so most typos and misreads can be caught before anything is sent to Open Food Facts.
 */

export type BarcodeProblem = 'empty' | 'not_digits' | 'length' | 'check_digit';
export type BarcodeKind = 'ean8' | 'upce' | 'upca' | 'ean13' | 'gtin14';

export type BarcodeCheck =
  | { ok: true; kind: BarcodeKind; /** The number to look up (UPC-E expanded, a GTIN-14's leading 0 dropped). */ code: string }
  | { ok: false; problem: BarcodeProblem };

/** Longer input isn't looked at; no barcode comes close. */
const MAX_INPUT = 64;

/** GS1 check digit for the digits before it: weights 3 and 1 alternating from the right. */
export function gtinCheckDigit(body: string): number {
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    const d = body.charCodeAt(body.length - 1 - i) - 48;
    sum += i % 2 === 0 ? d * 3 : d;
  }
  return (10 - (sum % 10)) % 10;
}

const checkDigitOk = (code: string) => gtinCheckDigit(code.slice(0, -1)) === Number(code[code.length - 1]);

/**
 * UPC-E (8 digits: number system 0 or 1, six digits, check digit) written out as the UPC-A it stands
 * for. Undefined when it can't be one.
 */
export function expandUpcE(code: string): string | undefined {
  if (!/^[01]\d{7}$/.test(code)) return undefined;
  const [ns, d, check] = [code[0], code.slice(1, 7), code[7]];
  const last = d[5];
  let body: string;
  if (last <= '2') body = `${d.slice(0, 2)}${last}0000${d.slice(2, 5)}`;
  else if (last === '3') body = `${d.slice(0, 3)}00000${d.slice(3, 5)}`;
  else if (last === '4') body = `${d.slice(0, 4)}00000${d[4]}`;
  else body = `${d.slice(0, 5)}0000${last}`;
  const upca = `${ns}${body}${check}`;
  return checkDigitOk(upca) ? upca : undefined;
}

/**
 * Checks a scanned or typed barcode. Spaces are ignored ("4 006446 005476" as printed under the bars);
 * anything else that isn't a digit makes it invalid. Eight digits are read as EAN-8 first and as UPC-E
 * only when the EAN-8 check digit doesn't fit.
 */
export function checkBarcode(input: string): BarcodeCheck {
  if (typeof input !== 'string' || input.length > MAX_INPUT) return { ok: false, problem: 'length' };
  const digits = input.replace(/\s+/g, '');
  if (!digits) return { ok: false, problem: 'empty' };
  if (!/^\d+$/.test(digits)) return { ok: false, problem: 'not_digits' };
  const len = digits.length;
  if (len !== 8 && (len < 12 || len > 14)) return { ok: false, problem: 'length' };
  if (len === 8) {
    if (checkDigitOk(digits)) return { ok: true, kind: 'ean8', code: digits };
    const upca = expandUpcE(digits);
    return upca ? { ok: true, kind: 'upce', code: upca } : { ok: false, problem: 'check_digit' };
  }
  if (!checkDigitOk(digits)) return { ok: false, problem: 'check_digit' };
  if (len === 12) return { ok: true, kind: 'upca', code: digits };
  if (len === 13) return { ok: true, kind: 'ean13', code: digits };
  // GTIN-14 with a leading 0 is the same product as the EAN-13 behind it (same check digit).
  return { ok: true, kind: 'gtin14', code: digits[0] === '0' ? digits.slice(1) : digits };
}

export const isValidBarcode = (input: string) => checkBarcode(input).ok;

/**
 * A code as the camera read it. When the scanner says it is UPC-E (expo-camera: "upc_e", ZXing:
 * "UPC_E", iOS also "org.gs1.UPC-E"), it is written out as UPC-A, so it isn't mistaken for an EAN-8.
 */
export function scannedBarcode(data: string, type?: string): string {
  if (type && /upc[-_]?e$/i.test(type)) return expandUpcE(data.trim()) ?? data;
  return data;
}

/**
 * Text in the search box that is meant as a barcode: only digits (and spaces) and as long as one.
 * It may still have a wrong check digit; `checkBarcode` tells.
 */
export function looksLikeBarcode(input: string): boolean {
  if (input.length > MAX_INPUT || !/^[\d\s]+$/.test(input)) return false;
  const len = input.replace(/\s+/g, '').length;
  return len === 8 || (len >= 12 && len <= 14);
}
