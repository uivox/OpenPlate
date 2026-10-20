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

/** Bars with each day's own goal drawn as a short dashed mark across that bar; bars above their goal turn coral. */
export function BarChart({
  bars,
  width,
  height = 150,
}: {
  bars: { label: string; value: number; goal?: number }[];
  width: number;
  height?: number;
}) {
  const c = useColors();
  if (width <= 0 || bars.length === 0) return <View style={{ height }} />;
  const max = Math.max(...bars.map((b) => Math.max(b.value, b.goal ?? 0)), 1) * 1.1;
  const padB = 20;
  const h = height - padB;
  const slot = width / bars.length;
  const bw = Math.min(28, slot * 0.6);
  const mark = Math.min(bw + 12, slot * 0.9);
  const y = (v: number) => h - (v / max) * h;
  return (
    <Svg width={width} height={height}>
      {bars.map((b, i) => {
        const over = b.goal !== undefined && b.goal > 0 && b.value > b.goal;
        const mid = i * slot + slot / 2;
        return (
          <React.Fragment key={i}>
            <Rect x={mid - bw / 2} y={y(b.value)} width={bw} height={Math.max(0, h - y(b.value))} rx={6} fill={over ? c.coral : c.accent} />
            {b.goal ? (
              <Line x1={mid - mark / 2} x2={mid + mark / 2} y1={y(b.goal)} y2={y(b.goal)} stroke={c.sub} strokeWidth={1.5} strokeDasharray="3 3" />
            ) : null}
            <SvgText x={mid} y={height - 5} fontSize={10} fill={c.sub} textAnchor="middle">
              {b.label}
            </SvgText>
          </React.Fragment>
        );
      })}
    </Svg>
  );
}

/** Round step for axis lines (1, 2, 2.5 or 5 times a power of ten) so about `count` lines fit `max`. */
function niceStep(max: number, count = 4): number {
  const raw = max / count;
  const p = 10 ** Math.floor(Math.log10(raw));
  const m = raw / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
}

/**
 * Bars for a statistic over a range (Progress → one tile): one bar per day, week or month, stacked
 * when a bar has several parts (macros by energy), the goal as a line across, axis values on the
 * left. A bar marked `partial` (today so far) is drawn lighter. Only a few dates are written
 * underneath, so long ranges stay readable.
 */
export function PeriodChart({
  bars,
  colors,
  goal,
  width,
  height = 210,
  formatAxis = (v) => String(Math.round(v)),
}: {
  bars: { label: string; parts: number[] | null; partial?: boolean }[];
  colors: string[];
  goal?: number;
  width: number;
  height?: number;
  formatAxis?: (v: number) => string;
}) {
  const c = useColors();
  if (width <= 0 || bars.length === 0) return <View style={{ height }} />;
  const totals = bars.map((b) => (b.parts ? b.parts.reduce((s, v) => s + v, 0) : 0));
  const top = Math.max(...totals, goal ?? 0, 1);
  const step = niceStep(top);
  const max = Math.ceil((top * 1.05) / step) * step;
  const padL = 42;
  const padR = 6;
  const padT = 8;
  const padB = 22;
  const w = width - padL - padR;
  const h = height - padT - padB;
  const y = (v: number) => padT + h - (v / max) * h;
  const slot = w / bars.length;
  const bw = Math.max(2, Math.min(26, slot * 0.7));
  const ticks: number[] = [];
  for (let v = 0; v <= max + step / 2; v += step) ticks.push(v);
  const every = Math.max(1, Math.ceil(bars.length / 5));
  return (
    <Svg width={width} height={height}>
      {ticks.map((t, i) => (
        <React.Fragment key={`t${i}`}>
          <Line x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} stroke={c.line} strokeWidth={1} />
          <SvgText x={padL - 6} y={y(t) + 4} fontSize={10} fill={c.sub} textAnchor="end">
            {formatAxis(t)}
          </SvgText>
        </React.Fragment>
      ))}
      {bars.map((b, i) => {
        const mid = padL + i * slot + slot / 2;
        let base = 0;
        return (
          <React.Fragment key={`b${i}`}>
            {(b.parts ?? []).map((v, j) => {
              const y0 = y(base);
              base += v;
              const y1 = y(base);
              return (
                <Rect
                  key={j}
                  x={mid - bw / 2}
                  y={y1}
                  width={bw}
                  height={Math.max(0, y0 - y1)}
                  rx={Math.min(3, bw / 3)}
                  fill={colors[j % colors.length]}
                  opacity={b.partial ? 0.4 : 1}
                />
              );
            })}
            {(bars.length - 1 - i) % every === 0 ? (
              <SvgText x={mid} y={height - 6} fontSize={10} fill={c.sub} textAnchor="middle">
                {b.label}
              </SvgText>
            ) : null}
          </React.Fragment>
        );
      })}
      {goal ? <Line x1={padL} x2={width - padR} y1={y(goal)} y2={y(goal)} stroke={c.leaf} strokeWidth={1.5} /> : null}
    </Svg>
  );
}
