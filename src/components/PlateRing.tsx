import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useColors, useMotion } from '../lib/theme';
import { Pulse } from './motion';

/** Tweens a number towards `target` (ease-out). Skipped when motion is off or Reduce Motion is on. */
export function useTween(target: number, duration = 700): number {
  const [value, setValue] = useState(target);
  const from = useRef(target);
  const motion = useMotion();
  const reduce = useRef(false);
  reduce.current = motion === 'off';
  useEffect(() => {
    if (reduce.current) {
      from.current = target;
      setValue(target);
      return;
    }
    const start = Date.now();
    const begin = from.current;
    let frame = 0;
    const step = () => {
      const t = Math.min(1, (Date.now() - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const v = begin + (target - begin) * eased;
      from.current = v;
      setValue(v);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);
  return value;
}

/**
 * The calorie "plate": a top-down plate whose rim fills with one arc per macro
 * (carbs, protein, fat — in the order you'd see them on a nutrition label).
 * Going over budget draws a thin tomato ring outside the plate.
 */
export function PlateRing({
  size,
  budget,
  eatenKcal,
  carbsKcal,
  proteinKcal,
  fatKcal,
  children,
}: {
  size: number;
  budget: number;
  eatenKcal: number;
  carbsKcal: number;
  proteinKcal: number;
  fatKcal: number;
  children?: React.ReactNode;
}) {
  const c = useColors();
  const motion = useMotion();
  const fill = useTween(budget > 0 ? Math.min(1, eatenKcal / budget) : 0, motion === 'lively' ? 900 : 700);
  const over = useTween(budget > 0 ? Math.max(0, Math.min(1, eatenKcal / budget - 1)) : 0);

  const rimStroke = size * 0.085;
  const r = size / 2 - rimStroke / 2 - size * 0.04;
  const circ = 2 * Math.PI * r;
  const cx = size / 2;

  const macroTotal = carbsKcal + proteinKcal + fatKcal;
  const parts =
    macroTotal > 0
      ? [
          { v: carbsKcal / macroTotal, color: c.carbs },
          { v: proteinKcal / macroTotal, color: c.protein },
          { v: fatKcal / macroTotal, color: c.fat },
        ]
      : [{ v: 1, color: c.accent }];

  let offset = 0;
  const gap = fill > 0.02 ? 3 : 0;
  const arcs = parts
    .filter((p) => p.v > 0)
    .map((p, i) => {
      const len = Math.max(0, p.v * fill * circ - gap);
      const common = { cx, cy: cx, r, stroke: p.color, strokeLinecap: 'round' as const, fill: 'none', strokeDasharray: `${len} ${circ}`, strokeDashoffset: -offset };
      const arc = (
        <React.Fragment key={i}>
          {/* "lit" themes draw a soft, wider copy underneath as a glow */}
          {c.glow ? <Circle {...common} strokeWidth={rimStroke * 1.9} opacity={0.18} /> : null}
          <Circle {...common} strokeWidth={rimStroke} />
        </React.Fragment>
      );
      offset += p.v * fill * circ;
      return len > 0.5 ? arc : null;
    });

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Pulse trigger={Math.round(eatenKcal)} color={c.glow ?? c.accent} size={size} />
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        {/* plate */}
        <Circle cx={cx} cy={cx} r={size / 2 - size * 0.015} fill={c.card} stroke={c.line} strokeWidth={1.5} />
        <Circle cx={cx} cy={cx} r={r - rimStroke / 2 - size * 0.035} fill={c.bg} opacity={0.55} />
        {/* rim track */}
        <Circle cx={cx} cy={cx} r={r} stroke={c.ringTrack} strokeWidth={rimStroke} fill="none" />
        {arcs}
        {over > 0.005 ? (
          <Circle
            cx={cx}
            cy={cx}
            r={size / 2 - 2}
            stroke={c.coral}
            strokeWidth={3}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${over * 2 * Math.PI * (size / 2 - 2)} ${2 * Math.PI * size}`}
          />
        ) : null}
      </Svg>
      {children}
    </View>
  );
}
