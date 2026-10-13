import { useColorScheme } from 'react-native';
import type { MealType } from './types';

/**
 * OpenPlate design tokens — "veggie patch" palette.
 * Pistachio ground, aubergine ink, beet for actions, produce colours for macros.
 * See DESIGN.md for the reasoning.
 */
export interface Colors {
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
}

const light: Colors = {
  bg: '#EEF2E5', // pistachio
  card: '#FCFDF8',
  cardAlt: '#E5EBDA',
  text: '#2A1E33', // aubergine
  sub: '#6D6474',
  line: '#D8DFCD',
  accent: '#9C2F62', // beet
  accentText: '#FFF7FB',
  accentSoft: '#F4DCE7',
  coral: '#E2492F', // tomato
  carbs: '#E39B12', // corn
  protein: '#4A5BD4', // blueberry
  fat: '#5E9A3B', // avocado
  water: '#2C9BD3',
  danger: '#C8352A',
  ringTrack: '#E8EDDF',
  night: '#2F2B6E',
  nightSoft: '#E3E2F5',
  nightText: '#F3F1FF',
  leaf: '#5E9A3B',
  scrim: 'rgba(42, 30, 51, 0.45)',
  meal: {
    breakfast: { tile: '#FCEBC4', icon: '#A86A00' },
    lunch: { tile: '#DDEBCF', icon: '#3F7A22' },
    dinner: { tile: '#E7DDF0', icon: '#6B3E8A' },
    snack: { tile: '#F6DCE5', icon: '#9C2F62' },
  },
};

const dark: Colors = {
  bg: '#17121B',
  card: '#221A27',
  cardAlt: '#2C2232',
  text: '#F4EEF6',
  sub: '#A99FB1',
  line: '#362B3C',
  accent: '#E26A9E',
  accentText: '#1B1220',
  accentSoft: '#3E2233',
  coral: '#F2694F',
  carbs: '#F2B947',
  protein: '#8592F2',
  fat: '#8CC46A',
  water: '#5BB8E8',
  danger: '#F2695B',
  ringTrack: '#2F2535',
  night: '#2A2754',
  nightSoft: '#2A2747',
  nightText: '#F3F1FF',
  leaf: '#8CC46A',
  scrim: 'rgba(0, 0, 0, 0.6)',
  meal: {
    breakfast: { tile: '#3D3020', icon: '#F2B947' },
    lunch: { tile: '#26331F', icon: '#8CC46A' },
    dinner: { tile: '#33263D', icon: '#C49BE0' },
    snack: { tile: '#3E2233', icon: '#E26A9E' },
  },
};

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? dark : light;
}

/** Font families loaded in app/_layout.tsx. Use these instead of fontWeight (Android ignores weight on custom fonts). */
export const fonts = {
  display: 'BricolageGrotesque_600SemiBold',
  displayHeavy: 'BricolageGrotesque_800ExtraBold',
  body: 'Figtree_400Regular',
  bodyMedium: 'Figtree_500Medium',
  bodySemi: 'Figtree_600SemiBold',
  bodyBold: 'Figtree_700Bold',
};

/** Radius follows hierarchy: the big hero surfaces are softest, small controls tighter. */
export const radius = { s: 12, m: 20, l: 28, xl: 36 };
export const space = { xs: 4, s: 8, m: 12, l: 16, xl: 24 };
