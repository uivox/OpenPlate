import React from 'react';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import { useColors } from '../lib/theme';

/**
 * OpenPlate's bowl with a sprout, the same shape as the app icon (src/lib/appIcon.ts) and the web
 * start screen (scripts/web-pwa.mjs), in the theme's colours. Used on onboarding and empty states.
 * `mood` changes the face: happy (default, the icon's face), sleepy (fasting, app lock), surprised (AI).
 */
export function Sprout({ size = 120, mood = 'happy' }: { size?: number; mood?: 'happy' | 'sleepy' | 'surprised' }) {
  const c = useColors();
  const face = c.accentText;
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <G transform="translate(8.4 8) scale(0.86)">
        {/* sprout */}
        <Path d="M60 66 C60 52 57 44 60 33" stroke={c.leaf} strokeWidth={7} strokeLinecap="round" fill="none" />
        <Path d="M59 45 C40 46 25 34 23 15 C43 14 58 27 59 45 Z" fill={c.leaf} />
        <Path d="M61 38 C77 36 93 22 97 4 C77 3 62 18 61 38 Z" fill={c.leaf} opacity={0.75} />
        {/* bowl */}
        <Path d="M12 66 H108 A48 48 0 0 1 12 66 Z" fill={c.accent} />
        <Rect x={8} y={59} width={104} height={13} rx={6.5} fill={c.accent} />
        {/* face */}
        {mood === 'sleepy' ? (
          <>
            <Path d="M39 84 Q46 91 53 84" stroke={face} strokeWidth={5} strokeLinecap="round" fill="none" />
            <Path d="M67 84 Q74 91 81 84" stroke={face} strokeWidth={5} strokeLinecap="round" fill="none" />
            <Path d="M55 99 Q60 102 65 99" stroke={face} strokeWidth={4} strokeLinecap="round" fill="none" />
          </>
        ) : mood === 'surprised' ? (
          <>
            <Circle cx={46} cy={85} r={6.5} fill={face} />
            <Circle cx={74} cy={85} r={6.5} fill={face} />
            <Circle cx={60} cy={100} r={5} fill={face} />
          </>
        ) : (
          <>
            <Path d="M39 87 Q46 79 53 87" stroke={face} strokeWidth={5} strokeLinecap="round" fill="none" />
            <Path d="M67 87 Q74 79 81 87" stroke={face} strokeWidth={5} strokeLinecap="round" fill="none" />
            <Path d="M49 94 H71 Q70 107 60 107 Q50 107 49 94 Z" fill={face} />
          </>
        )}
        <Circle cx={33} cy={96} r={5.5} fill={face} opacity={0.22} />
        <Circle cx={87} cy={96} r={5.5} fill={face} opacity={0.22} />
      </G>
    </Svg>
  );
}
