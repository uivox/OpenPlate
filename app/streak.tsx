import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Card, IconButton, Row, Screen, Txt } from '../src/components/ui';
import { dayKey, locale, parseDayKey } from '../src/lib/dates';
import { dayGoal } from '../src/lib/goals';
import { dailyTotals, dayStatus, monthGrid, monthSummary, streakInfo, type DayStatus, type GoalForDay } from '../src/lib/streaks';
import { useStore } from '../src/lib/store';
import { radius, useColors, type Colors } from '../src/lib/theme';
import { useT } from '../src/lib/useT';

/** Streak numbers and a month calendar of tracked days and goal hits. */
export default function StreakScreen() {
  const { t, lang } = useT();
  const c = useColors();
  const profile = useStore((s) => s.profile)!;
  const weights = useStore((s) => s.weights);
  const entries = useStore((s) => s.entries);
  const today = dayKey();
  const [month, setMonth] = useState(() => {
    const d = parseDayKey(today);
    return { y: d.getFullYear(), m: d.getMonth() + 1 };
  });

  const totals = useMemo(() => dailyTotals(entries), [entries]);
  const goalFor = useMemo<GoalForDay>(() => {
    const cache = new Map<string, { kcal: number; goal: typeof profile.goal }>();
    return (date) => {
      let g = cache.get(date);
      if (!g) {
        g = { kcal: dayGoal(profile, weights, date).kcal, goal: profile.goal };
        cache.set(date, g);
      }
      return g;
    };
  }, [profile, weights]);

  const info = useMemo(() => streakInfo(totals, today, goalFor), [totals, today, goalFor]);
  const weekStart = lang === 'de' ? 1 : 0;
  const grid = useMemo(() => monthGrid(month.y, month.m, weekStart), [month, weekStart]);
  const summary = monthSummary(grid, today, totals, goalFor);
  const monthLabel = new Date(month.y, month.m - 1, 1).toLocaleDateString(locale(lang), { month: 'long', year: 'numeric' });
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Date(2026, 1, 1 + ((i + weekStart) % 7)).toLocaleDateString(locale(lang), { weekday: 'narrow' }),
  ); // 1 Feb 2026 is a Sunday
  const isCurrentMonth = `${month.y}-${String(month.m).padStart(2, '0')}` === today.slice(0, 7);

  const shift = (n: number) =>
    setMonth(({ y, m }) => {
      const d = new Date(y, m - 1 + n, 1);
      return { y: d.getFullYear(), m: d.getMonth() + 1 };
    });

  const days = (n: number) => (n === 1 ? t('streak_days_one') : t('streak_days_n', { n }));

  return (
    <Screen appear>
      <Card r="xl" tone="beet" style={{ alignItems: 'center', paddingVertical: 24, gap: 6 }}>
        <Ionicons name="flame" size={44} color={info.todayLogged ? c.coral : c.sub} />
        <Txt v="hero">{info.current}</Txt>
        <Txt v="sub">{t('streak_current')}</Txt>
        <Txt v="small" center style={{ marginTop: 6, maxWidth: 300 }}>
          {info.current === 0 ? t('streak_start') : info.todayLogged ? t('streak_today_done') : t('streak_today_open')}
        </Txt>
      </Card>

      <Row gap={10}>
        <Stat value={days(info.best)} label={t('streak_best')} />
        <Stat value={days(info.goalStreak)} label={t('streak_goal')} />
      </Row>

      <Card r="l" style={{ gap: 10 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <IconButton icon="chevron-back" size={18} color={c.text} label={t('previous_month')} onPress={() => shift(-1)} />
          <Txt v="h3">{monthLabel}</Txt>
          <IconButton
            icon="chevron-forward"
            size={18}
            color={isCurrentMonth ? c.line : c.text}
            label={t('next_month')}
            onPress={() => !isCurrentMonth && shift(1)}
          />
        </Row>
        <View style={{ flexDirection: 'row' }}>
          {weekdays.map((w, i) => (
            <Txt key={i} v="small" center style={{ flex: 1 }}>
              {w}
            </Txt>
          ))}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {grid.map((d, i) => (
            <View key={d ?? `pad-${i}`} style={{ width: `${100 / 7}%`, aspectRatio: 1, padding: 3 }}>
              {d ? (
                <DayCell
                  day={parseDayKey(d).getDate()}
                  status={dayStatus(d, today, totals, goalFor)}
                  isToday={d === today}
                  c={c}
                  onPress={() => router.dismissTo({ pathname: '/', params: { date: d } })}
                  label={parseDayKey(d).toLocaleDateString(locale(lang), { day: 'numeric', month: 'long' })}
                />
              ) : null}
            </View>
          ))}
        </View>
        <Txt v="small" center>
          {t('month_summary', { logged: summary.logged, hit: summary.hit })}
        </Txt>
      </Card>

      <Card style={{ gap: 8 }}>
        <Legend color={c.leaf} label={t('legend_hit')} />
        <Legend color={c.coral} label={t('legend_over')} />
        <Legend color={c.water} label={t('legend_under')} />
        <Legend color={c.accent} label={t('legend_pending')} ring />
        <Txt v="small" style={{ marginTop: 4 }}>
          {t('streak_rule')}
        </Txt>
      </Card>
    </Screen>
  );
}

function statusColor(s: DayStatus, c: Colors): string | null {
  if (s === 'hit') return c.leaf;
  if (s === 'over') return c.coral;
  if (s === 'under') return c.water;
  return null;
}

function DayCell({
  day,
  status,
  isToday,
  c,
  onPress,
  label,
}: {
  day: number;
  status: DayStatus;
  isToday: boolean;
  c: Colors;
  onPress: () => void;
  label: string;
}) {
  const fill = statusColor(status, c);
  const future = status === 'future';
  return (
    <Pressable
      onPress={onPress}
      disabled={future}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        flex: 1,
        borderRadius: radius.s,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: fill ?? (status === 'empty' ? 'transparent' : c.cardAlt),
        borderWidth: isToday || status === 'pending' ? 2 : 0,
        borderColor: c.accent,
        opacity: future ? 0.35 : 1,
        transform: [{ scale: pressed ? 0.92 : 1 }],
      })}
    >
      <Txt v="label" color={fill ? c.card : c.text}>
        {day}
      </Txt>
    </Pressable>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <Card r="l" style={{ flex: 1, alignItems: 'center', gap: 2 }}>
      <Txt v="h2">{value}</Txt>
      <Txt v="small" center>
        {label}
      </Txt>
    </Card>
  );
}

function Legend({ color, label, ring }: { color: string; label: string; ring?: boolean }) {
  return (
    <Row gap={10}>
      <View
        style={{
          width: 16,
          height: 16,
          borderRadius: 5,
          backgroundColor: ring ? 'transparent' : color,
          borderWidth: ring ? 2 : 0,
          borderColor: color,
        }}
      />
      <Txt v="sub">{label}</Txt>
    </Row>
  );
}
