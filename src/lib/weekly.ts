/** The "last 7 days" numbers on the Progress tab. Pure: no React Native imports. */

export interface WeekBar {
  date: string;
  /** Calories eaten that day, rounded. */
  kcal: number;
  /** That day's own calorie goal (weight on that day, fasting days), rounded. */
  goal: number;
}

export interface WeekSummary {
  bars: WeekBar[];
  /** Average calories over the days with food logged (0 when none). */
  avgKcal: number;
  /** Average water in ml over the days with water logged (0 when none). */
  avgWater: number;
  /** How many of the days have water logged. */
  waterDays: number;
}

/** Average of the values above zero, rounded; days without a log don't pull the average down. */
export function averageOfLogged(values: number[]): number {
  const logged = values.filter((v) => Number.isFinite(v) && v > 0);
  return logged.length ? Math.round(logged.reduce((s, v) => s + v, 0) / logged.length) : 0;
}

export function weekSummary(
  days: string[],
  kcalByDay: Map<string, number>,
  waterByDay: Record<string, number>,
  goalOf: (date: string) => number,
): WeekSummary {
  const bars = days.map((date) => ({ date, kcal: Math.round(kcalByDay.get(date) ?? 0), goal: Math.round(goalOf(date)) }));
  const water = days.map((d) => waterByDay[d] ?? 0);
  return {
    bars,
    avgKcal: averageOfLogged(bars.map((b) => b.kcal)),
    avgWater: averageOfLogged(water),
    waterDays: water.filter((w) => w > 0).length,
  };
}
