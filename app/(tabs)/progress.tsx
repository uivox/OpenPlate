import { router } from 'expo-router';
import React, { useMemo } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Tap } from '../../src/components/motion';
import { TAB_BAR_SPACE } from '../../src/components/TabBar';
import { Screen, SectionTitle, Tile, Txt, type IconName } from '../../src/components/ui';
import { addDays } from '../../src/lib/dates';
import { canReadSteps, STEPS_REASON, useToday } from '../../src/lib/hooks';
import type { TKey } from '../../src/lib/i18n';
import { fastingByDay, foodByDay, formatValue, macroPercents, summarize, type Metric } from '../../src/lib/insights';
import { useStore, weightOn } from '../../src/lib/store';
import { useColors } from '../../src/lib/theme';
import { useT } from '../../src/lib/useT';

const ICONS: Record<Metric, IconName> = {
  energy: 'flame',
  macros: 'pie-chart',
  water: 'water',
  weight: 'scale',
  steps: 'footsteps',
  nutrients: 'leaf',
  fasting: 'moon',
};

/**
 * Progress tab: one tile per statistic, each opening its own screen (app/insight.tsx) with daily,
 * weekly and monthly bars. Under each name a short line about the last 30 days.
 */
export default function ProgressScreen() {
  const insets = useSafeAreaInsets();
  const { t, lang } = useT();
  const c = useColors();
  const today = useToday();
  const profile = useStore((s) => s.profile)!;
  const entries = useStore((s) => s.entries);
  const water = useStore((s) => s.water);
  const weights = useStore((s) => s.weights);
  const fasts = useStore((s) => s.fastingHistory);

  const lines = useMemo(() => {
    const from = addDays(today, -29);
    const food = foodByDay(entries);
    const fd = fastingByDay(fasts);
    const avgOf = (m: Metric, valueOf: (d: string) => number[] | null, countToday = false) => {
      const s = summarize(from, today, valueOf, today, { countToday });
      if (!s.avg) return t('insight_tile_none');
      return t('insight_tile_avg', { value: formatValue(m, s.avg.reduce((a, b) => a + b, 0), lang) });
    };
    const macros = summarize(from, today, (d) => (food.has(d) ? [food.get(d)!.carbs, food.get(d)!.protein, food.get(d)!.fat] : null), today);
    const p = macros.avg ? macroPercents({ carbs: macros.avg[0], protein: macros.avg[1], fat: macros.avg[2] }) : null;
    return {
      energy: avgOf('energy', (d) => (food.has(d) ? [food.get(d)!.kcal] : null)),
      macros: p ? `${p[0]} / ${p[1]} / ${p[2]} %` : t('insight_tile_none'),
      water: avgOf('water', (d) => ((water[d] ?? 0) > 0 ? [water[d]] : null)),
      weight: formatValue('weight', weightOn(weights, profile, today), lang),
      steps: canReadSteps ? t('insight_tile_steps') : t(STEPS_REASON as TKey),
      nutrients: t('insight_tile_nutrients'),
      fasting: avgOf('fasting', (d) => (fd.has(d) ? [fd.get(d)!.hours] : null), true),
    } satisfies Record<Metric, string>;
  }, [today, entries, water, weights, fasts, profile, lang, t]);

  const tile = (m: Metric, bg: string, color: string) => (
    <Tap
      key={m}
      onPress={() => router.push({ pathname: '/insight', params: { kind: m } })}
      accessibilityRole="button"
      accessibilityLabel={`${t(`insight_${m}` as TKey)}: ${lines[m]}`}
      scaleTo={0.96}
      haptic
      testID={`insight-${m}`}
      style={{ flexBasis: '40%', flexGrow: 1, backgroundColor: c.card, borderRadius: 22, padding: 14, gap: 10 }}
    >
      <Tile icon={ICONS[m]} bg={bg} color={color} />
      <View style={{ gap: 2 }}>
        <Txt v="h3">{t(`insight_${m}` as TKey)}</Txt>
        <Txt v="small" numberOfLines={2}>
          {lines[m]}
        </Txt>
      </View>
    </Tap>
  );

  return (
    <Screen style={{ paddingTop: insets.top + 12 }} bottomInset={TAB_BAR_SPACE} appear>
      <Txt v="title">{t('tab_progress')}</Txt>
      <SectionTitle>{t('insight_highlights')}</SectionTitle>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {tile('energy', c.meal.breakfast.tile, c.meal.breakfast.icon)}
        {tile('macros', c.meal.dinner.tile, c.meal.dinner.icon)}
        {tile('water', `${c.water}22`, c.water)}
        {tile('weight', c.meal.snack.tile, c.meal.snack.icon)}
        {tile('steps', c.meal.lunch.tile, c.meal.lunch.icon)}
        {tile('fasting', c.cardAlt, c.text)}
      </View>
      <SectionTitle>{t('insight_more')}</SectionTitle>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {tile('nutrients', `${c.leaf}22`, c.leaf)}
        <View style={{ flexBasis: '40%', flexGrow: 1 }} />
      </View>
    </Screen>
  );
}
