import React from 'react';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useColors } from '../lib/theme';

/** Circular progress ring; progress above 1 draws a second lap in the overflow color. */
export function Ring({
  size,
  stroke,
  progress,
  color,
  overflowColor,
  trackColor,
  children,
}: {
  size: number;
  stroke: number;
  progress: number;
  color: string;
  overflowColor?: string;
  trackColor?: string;
  children?: React.ReactNode;
}) {
  const c = useColors();
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const main = Math.max(0, Math.min(1, progress));
  const over = Math.max(0, Math.min(1, progress - 1));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={trackColor ?? c.ringTrack} strokeWidth={stroke} fill="none" />
        {main > 0 ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${circ * main} ${circ}`}
          />
        ) : null}
        {over > 0 ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={overflowColor ?? c.coral}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${circ * over} ${circ}`}
          />
        ) : null}
      </Svg>
      {children}
    </View>
  );
}
