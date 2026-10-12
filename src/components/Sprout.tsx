import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useColors } from '../lib/theme';

/**
 * OpenPlate's little bowl with a sprout — used on onboarding and empty states.
 * `mood` changes the face: happy (default), sleepy (fasting), surprised (AI).
 */
export function Sprout({ size = 120, mood = 'happy' }: { size?: number; mood?: 'happy' | 'sleepy' | 'surprised' }) {
  const c = useColors();
  const face = c.accentText;
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {/* sprout */}
      <Path d="M60 64 C60 50 57 42 60 30" stroke={c.leaf} strokeWidth={4.5} strokeLinecap="round" fill="none" />
      <Path d="M59 42 C44 42 33 32 32 18 C47 18 58 27 59 42 Z" fill={c.leaf} />
      <Path d="M61 35 C73 33 85 22 88 9 C73 9 62 20 61 35 Z" fill={c.leaf} opacity={0.85} />
      {/* bowl */}
      <Path d="M16 66 H104 A44 44 0 0 1 16 66 Z" fill={c.accent} />
      <Rect x={12} y={60} width={96} height={11} rx={5.5} fill={c.accent} />
      <Rect x={12} y={60} width={96} height={4} rx={2} fill="#ffffff" opacity={0.18} />
      {/* face */}
      {mood === 'sleepy' ? (
        <>
          <Path d="M43 85 Q48 89 53 85" stroke={face} strokeWidth={3} strokeLinecap="round" fill="none" />
          <Path d="M67 85 Q72 89 77 85" stroke={face} strokeWidth={3} strokeLinecap="round" fill="none" />
        </>
      ) : (
        <>
          <Circle cx={48} cy={84} r={mood === 'surprised' ? 4.5 : 3.6} fill={face} />
          <Circle cx={72} cy={84} r={mood === 'surprised' ? 4.5 : 3.6} fill={face} />
        </>
      )}
      {mood === 'surprised' ? (
        <Circle cx={60} cy={95} r={4} fill={face} />
      ) : (
        <Path d="M52 93 Q60 100 68 93" stroke={face} strokeWidth={3} strokeLinecap="round" fill="none" />
      )}
      <Circle cx={39} cy={92} r={4.5} fill="#ffffff" opacity={0.2} />
      <Circle cx={81} cy={92} r={4.5} fill="#ffffff" opacity={0.2} />
    </Svg>
  );
}
