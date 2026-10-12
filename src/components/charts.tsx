import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Line, Polyline, Rect, Text as SvgText } from 'react-native-svg';
import { useColors } from '../lib/theme';

export function LineChart({
  points,
  width,
  height = 160,
  target,
  color,
}: {
  points: { label: string; value: number }[];
  width: number;
  height?: number;
  target?: number;
  color?: string;
}) {
  const c = useColors();
  const stroke = color ?? c.accent;
  if (points.length === 0 || width <= 0) return <View style={{ height }} />;
  const values = points.map((p) => p.value);
  if (target !== undefined) values.push(target);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (max - min < 2) {
    min -= 1;
    max += 1;
  }
  const padL = 34;
  const padR = 10;
  const padT = 10;
  const padB = 22;
  const w = width - padL - padR;
  const h = height - padT - padB;
  const x = (i: number) => padL + (points.length === 1 ? w / 2 : (i / (points.length - 1)) * w);
  const y = (v: number) => padT + h - ((v - min) / (max - min)) * h;
  const coords = points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ');
  const ticks = [min, (min + max) / 2, max];
  return (
    <Svg width={width} height={height}>
      {ticks.map((t, i) => (
        <React.Fragment key={i}>
          <Line x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} stroke={c.line} strokeWidth={1} />
          <SvgText x={padL - 6} y={y(t) + 4} fontSize={10} fill={c.sub} textAnchor="end">
            {t.toFixed(t >= 100 ? 0 : 1)}
          </SvgText>
        </React.Fragment>
      ))}
      {target !== undefined ? (
        <Line x1={padL} x2={width - padR} y1={y(target)} y2={y(target)} stroke={c.coral} strokeWidth={1.5} strokeDasharray="5 4" />
      ) : null}
      {points.length > 1 ? <Polyline points={coords} fill="none" stroke={stroke} strokeWidth={2.5} strokeLinejoin="round" /> : null}
      {points.map((p, i) => (
        <Circle key={i} cx={x(i)} cy={y(p.value)} r={3.5} fill={stroke} />
      ))}
      <SvgText x={x(0)} y={height - 4} fontSize={10} fill={c.sub} textAnchor="start">
        {points[0].label}
      </SvgText>
      {points.length > 1 ? (
        <SvgText x={x(points.length - 1)} y={height - 4} fontSize={10} fill={c.sub} textAnchor="end">
          {points[points.length - 1].label}
        </SvgText>
      ) : null}
    </Svg>
  );
}

export function BarChart({
  bars,
  width,
  height = 150,
  goal,
}: {
  bars: { label: string; value: number }[];
  width: number;
  height?: number;
  goal?: number;
}) {
  const c = useColors();
  if (width <= 0 || bars.length === 0) return <View style={{ height }} />;
  const max = Math.max(goal ?? 0, ...bars.map((b) => b.value), 1) * 1.1;
  const padB = 20;
  const h = height - padB;
  const slot = width / bars.length;
  const bw = Math.min(28, slot * 0.6);
  const y = (v: number) => h - (v / max) * h;
  return (
    <Svg width={width} height={height}>
      {bars.map((b, i) => {
        const over = goal !== undefined && b.value > goal;
        return (
          <React.Fragment key={i}>
            <Rect
              x={i * slot + (slot - bw) / 2}
              y={y(b.value)}
              width={bw}
              height={Math.max(0, h - y(b.value))}
              rx={6}
              fill={over ? c.coral : c.accent}
            />
            <SvgText x={i * slot + slot / 2} y={height - 5} fontSize={10} fill={c.sub} textAnchor="middle">
              {b.label}
            </SvgText>
          </React.Fragment>
        );
      })}
      {goal !== undefined ? <Line x1={0} x2={width} y1={y(goal)} y2={y(goal)} stroke={c.sub} strokeWidth={1} strokeDasharray="4 4" /> : null}
    </Svg>
  );
}
