import type { Appearance, MealType, ThemeId } from './types';

/**
 * Colour themes. Pure (no React Native) so it can be tested.
 * "garden" is the original veggie-patch palette (see DESIGN.md); the others swap the ground, ink and
 * action colour. Users can also pick their own accent and macro colours; text on top of any colour
 * is chosen by contrast so it stays readable.
 */

export interface Colors {
  scheme: 'light' | 'dark';
  bg: string;
  card: string;
  cardAlt: string;
  text: string;
  sub: string;
  line: string;
  accent: string;
  accentText: string;
  accentSoft: string;
  coral: string;
  carbs: string;
  protein: string;
  fat: string;
  water: string;
  danger: string;
  ringTrack: string;
  night: string;
  nightSoft: string;
  nightText: string;
  leaf: string;
  /** Dimmed backdrop behind dialogs. */
  scrim: string;
  meal: Record<MealType, { tile: string; icon: string }>;
  /** Glow colour for themes with a "lit" look (neon); null = flat. */
  glow: string | null;
  /** Font family for big numbers and titles (themes can swap it). */
  fontDisplay: string;
  fontDisplayHeavy: string;
}

type Base = Omit<Colors, 'scheme' | 'meal' | 'glow' | 'fontDisplay' | 'fontDisplayHeavy' | 'accentText' | 'accentSoft'> &
  Partial<Pick<Colors, 'meal' | 'accentText' | 'accentSoft'>>;

export const FONT_BRICOLAGE = { display: 'BricolageGrotesque_600SemiBold', heavy: 'BricolageGrotesque_800ExtraBold' };
export const FONT_SPACE = { display: 'SpaceGrotesk_600SemiBold', heavy: 'SpaceGrotesk_700Bold' };

// Produce colours shared by most themes.
const PRODUCE_LIGHT = {
  coral: '#E2492F',
  carbs: '#E39B12',
  protein: '#4A5BD4',
  fat: '#5E9A3B',
  water: '#2C9BD3',
  danger: '#C8352A',
  leaf: '#5E9A3B',
  night: '#2F2B6E',
  nightSoft: '#E3E2F5',
  nightText: '#F3F1FF',
};
const PRODUCE_DARK = {
  coral: '#F2694F',
  carbs: '#F2B947',
  protein: '#8592F2',
  fat: '#8CC46A',
  water: '#5BB8E8',
  danger: '#F2695B',
  leaf: '#8CC46A',
  night: '#2A2754',
  nightSoft: '#2A2747',
  nightText: '#F3F1FF',
};

interface ThemeDef {
  id: ThemeId;
  light: Base;
  dark: Base;
  glow?: boolean;
  font?: typeof FONT_SPACE;
}

export const THEMES: ThemeDef[] = [
  {
    id: 'garden',
    light: {
      ...PRODUCE_LIGHT,
      bg: '#EEF2E5',
      card: '#FCFDF8',
      cardAlt: '#E5EBDA',
      text: '#2A1E33',
      sub: '#6D6474',
      line: '#D8DFCD',
      accent: '#9C2F62',
      accentText: '#FFF7FB',
      accentSoft: '#F4DCE7',
      ringTrack: '#E8EDDF',
      scrim: 'rgba(42, 30, 51, 0.45)',
      meal: {
        breakfast: { tile: '#FCEBC4', icon: '#A86A00' },
        lunch: { tile: '#DDEBCF', icon: '#3F7A22' },
        dinner: { tile: '#E7DDF0', icon: '#6B3E8A' },
        snack: { tile: '#F6DCE5', icon: '#9C2F62' },
      },
    },
    dark: {
      ...PRODUCE_DARK,
      bg: '#17121B',
      card: '#221A27',
      cardAlt: '#2C2232',
      text: '#F4EEF6',
      sub: '#A99FB1',
      line: '#362B3C',
      accent: '#E26A9E',
      accentText: '#1B1220',
      accentSoft: '#3E2233',
      ringTrack: '#2F2535',
      scrim: 'rgba(0, 0, 0, 0.6)',
      meal: {
        breakfast: { tile: '#3D3020', icon: '#F2B947' },
        lunch: { tile: '#26331F', icon: '#8CC46A' },
        dinner: { tile: '#33263D', icon: '#C49BE0' },
        snack: { tile: '#3E2233', icon: '#E26A9E' },
      },
    },
  },
  {
    id: 'ocean',
    light: { ...PRODUCE_LIGHT, bg: '#E8F2F4', card: '#FBFEFF', cardAlt: '#DAE9EE', text: '#0F2A33', sub: '#58707A', line: '#CBDFE5', accent: '#0E7C86', ringTrack: '#DDEBEF', scrim: 'rgba(15, 42, 51, 0.45)' },
    dark: { ...PRODUCE_DARK, bg: '#0C171B', card: '#132229', cardAlt: '#1A2D36', text: '#E6F4F7', sub: '#93A9B1', line: '#23363F', accent: '#4FD1C5', ringTrack: '#1C2C33', scrim: 'rgba(0, 0, 0, 0.6)' },
  },
  {
    id: 'berry',
    light: { ...PRODUCE_LIGHT, bg: '#F4EEF7', card: '#FFFCFF', cardAlt: '#ECE2F1', text: '#2B1838', sub: '#6E6178', line: '#DFD2E6', accent: '#7B3FC4', ringTrack: '#EDE4F1', scrim: 'rgba(43, 24, 56, 0.45)' },
    dark: { ...PRODUCE_DARK, bg: '#140E1B', card: '#1F1729', cardAlt: '#2A1F37', text: '#F3ECF8', sub: '#A898B6', line: '#352947', accent: '#B78CF0', ringTrack: '#2A2136', scrim: 'rgba(0, 0, 0, 0.6)' },
  },
  {
    id: 'sunset',
    light: { ...PRODUCE_LIGHT, bg: '#FAF0E6', card: '#FFFCF8', cardAlt: '#F3E3D4', text: '#33201A', sub: '#7A665C', line: '#EAD8C9', accent: '#C9481A', ringTrack: '#F2E5D9', scrim: 'rgba(51, 32, 26, 0.45)' },
    dark: { ...PRODUCE_DARK, bg: '#19110D', card: '#251A15', cardAlt: '#30231C', text: '#FBEFE7', sub: '#B3A096', line: '#3B2C24', accent: '#FF8A4C', ringTrack: '#2F231D', scrim: 'rgba(0, 0, 0, 0.6)' },
  },
  {
    id: 'forest',
    light: { ...PRODUCE_LIGHT, bg: '#EBF1E9', card: '#FBFDFA', cardAlt: '#DEE8DB', text: '#1B2A1E', sub: '#5F6E62', line: '#D1DCCE', accent: '#2F7D4F', ringTrack: '#E0E9DD', scrim: 'rgba(27, 42, 30, 0.45)' },
    dark: { ...PRODUCE_DARK, bg: '#0E1510', card: '#162018', cardAlt: '#1E2B21', text: '#EAF3EB', sub: '#98AA9B', line: '#28372B', accent: '#6FCF97', ringTrack: '#1E2A20', scrim: 'rgba(0, 0, 0, 0.6)' },
  },
  {
    id: 'mono',
    light: { ...PRODUCE_LIGHT, bg: '#F1F1EF', card: '#FFFFFF', cardAlt: '#E5E5E2', text: '#161616', sub: '#686868', line: '#D9D9D6', accent: '#161616', ringTrack: '#E7E7E4', scrim: 'rgba(0, 0, 0, 0.45)' },
    dark: { ...PRODUCE_DARK, bg: '#0D0D0D', card: '#181818', cardAlt: '#222222', text: '#F2F2F2', sub: '#9A9A9A', line: '#2B2B2B', accent: '#F2F2F2', ringTrack: '#232323', scrim: 'rgba(0, 0, 0, 0.65)' },
  },
  {
    id: 'neon',
    glow: true,
    font: FONT_SPACE,
    light: {
      ...PRODUCE_LIGHT,
      bg: '#EEF2FA',
      card: '#FFFFFF',
      cardAlt: '#E4EAF7',
      text: '#0B1530',
      sub: '#55607A',
      line: '#D2DBEE',
      accent: '#0062F5',
      ringTrack: '#E3E9F6',
      coral: '#F0386B',
      carbs: '#F2A900',
      protein: '#6A4CFF',
      fat: '#00B37E',
      leaf: '#00B37E',
      water: '#0094FF',
      night: '#101A3D',
      nightSoft: '#DFE5F7',
      nightText: '#EAF2FF',
      scrim: 'rgba(11, 21, 48, 0.5)',
    },
    dark: {
      ...PRODUCE_DARK,
      bg: '#060912',
      card: '#0E1324',
      cardAlt: '#151C33',
      text: '#E8F1FF',
      sub: '#8794B8',
      line: '#1E2843',
      accent: '#22E3FF',
      ringTrack: '#151D36',
      coral: '#FF4D8D',
      carbs: '#FFC53D',
      protein: '#8C7CFF',
      fat: '#39FFA0',
      leaf: '#39FFA0',
      water: '#3DA9FF',
      danger: '#FF5A6E',
      night: '#0B1230',
      nightSoft: '#121A3A',
      nightText: '#E8F1FF',
      scrim: 'rgba(0, 0, 0, 0.7)',
    },
  },
];

export const THEME_IDS = THEMES.map((t) => t.id);

export const DEFAULT_APPEARANCE: Appearance = { theme: 'garden', scheme: 'system', motion: 'lively' };

/** Swatches offered for the accent and macro colours (any hex also works). */
export const SWATCHES = [
  '#9C2F62', '#E26A9E', '#C9481A', '#FF8A4C', '#E39B12', '#F2B947',
  '#5E9A3B', '#2F7D4F', '#39FFA0', '#0E7C86', '#4FD1C5', '#22E3FF',
  '#2C9BD3', '#0062F5', '#4A5BD4', '#8592F2', '#7B3FC4', '#B78CF0',
  '#E2492F', '#FF4D8D', '#161616', '#6D6474', '#A99FB1', '#F2F2F2',
];

// ---------- colour maths ----------

export function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split('').map((x) => x + x).join('') : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

export function normalizeHex(hex: string): string | null {
  const rgb = parseHex(hex);
  return rgb ? toHex(rgb) : null;
}

function toHex(rgb: [number, number, number]): string {
  return '#' + rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('').toUpperCase();
}

/** Mix two colours; `amount` = share of `a` (0–1). */
export function mix(a: string, b: string, amount: number): string {
  const x = parseHex(a) ?? [0, 0, 0];
  const y = parseHex(b) ?? [0, 0, 0];
  return toHex([0, 1, 2].map((i) => x[i] * amount + y[i] * (1 - amount)) as [number, number, number]);
}

export function luminance(hex: string): number {
  const rgb = parseHex(hex) ?? [0, 0, 0];
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, 1–21. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Near-white or near-black, whichever reads better on `bg`. */
export function readableOn(bg: string, light = '#FFFFFF', dark = '#111111'): string {
  return contrast(bg, light) >= contrast(bg, dark) ? light : dark;
}

/** Lightens (dark scheme) or darkens (light scheme) a colour until it stands out from `bg`. */
export function ensureContrast(color: string, bg: string, min = 3): string {
  let out = color;
  const towards = luminance(bg) < 0.5 ? '#FFFFFF' : '#000000';
  for (let i = 0; i < 10 && contrast(out, bg) < min; i++) out = mix(towards, out, 0.18);
  return out;
}

// ---------- building ----------

const MEAL_ICONS = (b: Base): Record<MealType, string> => ({
  breakfast: b.carbs,
  lunch: b.leaf,
  dinner: b.protein,
  snack: b.accent,
});

const cache = new Map<string, Colors>();

/** Full colour set for a theme, scheme and the user's own colours. */
export function buildColors(a: Appearance, scheme: 'light' | 'dark'): Colors {
  const key = JSON.stringify([a.theme, scheme, a.accent ?? '', a.macroColors ?? {}]);
  const hit = cache.get(key);
  if (hit) return hit;

  const def = THEMES.find((t) => t.id === a.theme) ?? THEMES[0];
  const b: Base = { ...def[scheme] };
  const dark = scheme === 'dark';

  const ownAccent = a.accent ? normalizeHex(a.accent) : null;
  if (ownAccent) b.accent = ensureContrast(ownAccent, b.bg, 2.2);
  const macros = a.macroColors ?? {};
  for (const k of ['carbs', 'protein', 'fat'] as const) {
    const own = macros[k] ? normalizeHex(macros[k]!) : null;
    if (own) b[k] = ensureContrast(own, b.card, 1.6);
  }

  const customised = ownAccent || def.id !== 'garden';
  const accentText = !customised && b.accentText ? b.accentText : readableOn(b.accent, '#FFFFFF', '#0B0B10');
  const accentSoft = !customised && b.accentSoft ? b.accentSoft : mix(b.accent, b.card, dark ? 0.22 : 0.14);

  let meal = b.meal;
  if (!meal || customised || a.macroColors) {
    const icons = MEAL_ICONS(b);
    if (def.id === 'garden' && b.meal && !ownAccent) {
      // keep the hand-picked garden tiles; only the snack tile follows the accent
      meal = { ...b.meal, snack: { tile: accentSoft, icon: b.accent } };
    } else {
      meal = Object.fromEntries(
        (Object.keys(icons) as MealType[]).map((m) => {
          const icon = dark ? icons[m] : ensureContrast(mix(icons[m], '#000000', 0.82), b.card, 3);
          return [m, { tile: mix(icons[m], b.card, dark ? 0.2 : 0.18), icon }];
        }),
      ) as Colors['meal'];
    }
  }

  const font = def.font ?? FONT_BRICOLAGE;
  const out: Colors = {
    ...b,
    scheme,
    accentText,
    accentSoft,
    meal: meal!,
    glow: def.glow ? b.accent : null,
    fontDisplay: font.display,
    fontDisplayHeavy: font.heavy,
  };
  cache.set(key, out);
  return out;
}

/** Fills in defaults and drops unknown values (for stored or imported settings). */
export function normalizeAppearance(a: Partial<Appearance> | undefined): Appearance {
  const v = a ?? {};
  const theme = THEME_IDS.includes(v.theme as ThemeId) ? (v.theme as ThemeId) : DEFAULT_APPEARANCE.theme;
  const scheme = v.scheme === 'light' || v.scheme === 'dark' ? v.scheme : 'system';
  const motion = v.motion === 'calm' || v.motion === 'off' ? v.motion : 'lively';
  const accent = v.accent ? (normalizeHex(v.accent) ?? undefined) : undefined;
  const macroColors: Appearance['macroColors'] = {};
  for (const k of ['carbs', 'protein', 'fat'] as const) {
    const hex = v.macroColors?.[k] ? normalizeHex(v.macroColors[k]!) : null;
    if (hex) macroColors[k] = hex;
  }
  return { theme, scheme, motion, accent, macroColors: Object.keys(macroColors).length ? macroColors : undefined };
}
