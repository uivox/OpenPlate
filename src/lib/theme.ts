import { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, useColorScheme } from 'react-native';
import { useStore } from './store';
import { buildColors, type Colors } from './themes';
import type { MotionPref } from './types';

/**
 * OpenPlate design tokens. The palettes live in themes.ts ("garden" is the original veggie patch:
 * pistachio ground, aubergine ink, beet for actions, produce colours for macros — see DESIGN.md).
 */
export type { Colors } from './themes';

/** Light or dark, following the user's choice or the system. */
export function useScheme(): 'light' | 'dark' {
  const system = useColorScheme();
  const pref = useStore((s) => s.appearance.scheme);
  return pref === 'system' ? (system === 'dark' ? 'dark' : 'light') : pref;
}

export function useColors(): Colors {
  const scheme = useScheme();
  const appearance = useStore((s) => s.appearance);
  return useMemo(() => buildColors(appearance, scheme), [appearance, scheme]);
}

let reduceMotion = false;
AccessibilityInfo.isReduceMotionEnabled()
  .then((r) => (reduceMotion = r))
  .catch(() => {});

/**
 * How much the UI moves: 'lively' (springs, ripples, counting numbers, staggered cards),
 * 'calm' (the original single plate animation and small press feedback) or 'off'.
 * The system's Reduce Motion setting always wins.
 */
export function useMotion(): MotionPref {
  const pref = useStore((s) => s.appearance.motion);
  const [reduce, setReduce] = useState(reduceMotion);
  useEffect(() => {
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (r) => {
      reduceMotion = r;
      setReduce(r);
    });
    return () => sub?.remove();
  }, []);
  return reduce ? 'off' : pref;
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
