import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { LineChart, PeriodChart } from '../src/components/charts';
import { useInsightSeries } from '../src/components/insightSeries';
import { Button, Card, ChipGroup, Divider, Field, ListRow, NumField, Row, Screen, SectionTitle, Txt } from '../src/components/ui';
import { showAlert } from '../src/lib/alert';
import { locale, parseDayKey } from '../src/lib/dates';
import { useToday } from '../src/lib/hooks';
import { bmi, bmiCategory } from '../src/lib/nutrition';
import type { TKey } from '../src/lib/i18n';
import {
  buildBars,
  formatDateInput,
  formatValue,
  macroPercents,
  METRICS,
  NUTRIENTS,
  parseDateInput,
  periods,
  rangeBounds,
  RANGES,
  summarize,
  type Bar,
  type Group,
  type Metric,
  type NutrientKey,
  type RangeId,
} from '../src/lib/insights';
import { useStore, weightOn } from '../src/lib/store';
import { useColors } from '../src/lib/theme';
import { useT } from '../src/lib/useT';

const MAX_LIST = 120;

/** One statistic from the Progress tab: grouping, range, summary, chart, history and how it's calculated. */
export default function InsightScreen() {
  const params = useLocalSearchParams<{ kind?: string }>();
  const metric: Metric = METRICS.includes(params.kind as Metric) ? (params.kind as Metric) : 'energy';
  const { t, lang } = useT();
  const c = useColors();
  const today = useToday();
  const prefs = useStore((s) => s.insights);
  const setInsights = useStore((s) => s.setInsights);
  const [nutrient, setNutrient] = useState<NutrientKey>('sugar');
  const [width, setWidth] = useState(0);
  const [howOpen, setHowOpen] = useState(false);

  const { from, to } = rangeBounds(prefs, today);
  const series = useInsightSeries(metric, nutrient, from, to);
  const opts = { countToday: series.countToday, goalOf: series.goalOf };
  const bars = useMemo(() => buildBars(periods(from, to, prefs.group), series.valueOf, today, opts), [from, to, prefs.group, series, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const summary = useMemo(() => summarize(from, to, series.valueOf, today, opts), [from, to, series, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const anything = summary.days > 0 || bars.some((b) => b.partial);

  const fmt = (v: number, unit = true) => formatValue(metric, v, lang, unit);
  const total = (b: Pick<Bar, 'values'>) => (b.values ? b.values.reduce((s, v) => s + v, 0) : 0);
  const loc = locale(lang);
  const shortDay = (k: string) => parseDayKey(k).toLocaleDateString(loc, { day: '2-digit', month: '2-digit' });
  const barLabel = (b: Bar) =>
    prefs.group === 'month' ? parseDayKey(b.from).toLocaleDateString(loc, { month: 'short' }) : shortDay(b.from);
  const rowTitle = (b: Bar) =>
    prefs.group === 'day'
      ? parseDayKey(b.from).toLocaleDateString(loc, { day: 'numeric', month: 'long', year: 'numeric' })
      : prefs.group === 'week'
        ? `${shortDay(b.from)} – ${shortDay(b.to)}`
        : parseDayKey(b.from).toLocaleDateString(loc, { month: 'long', year: 'numeric' });
  const rangeTitle =
    prefs.range === 'custom' ? `${shortDay(from)} – ${shortDay(to)}` : t(`insight_range_title_${prefs.range}` as TKey);

  // macros: grams and shares of the energy (carbs, protein, fat); the summary of the kcal parts gives the shares
  const macroGrams = metric === 'macros' && summary.avg ? [summary.avg[0] / 4, summary.avg[1] / 4, summary.avg[2] / 9] : null;
  const macroShare = macroGrams ? macroPercents({ carbs: macroGrams[0], protein: macroGrams[1], fat: macroGrams[2] }) : null;
  const rowValue = (b: Bar) => {
    if (!b.values) return '';
    if (metric === 'macros') {
      const p = macroPercents({ carbs: b.values[0] / 4, protein: b.values[1] / 4, fat: b.values[2] / 9 });
      return `${p[0]} % / ${p[1]} % / ${p[2]} %`;
    }
    return fmt(total(b));
  };

  const listed = bars.filter((b) => b.values).reverse().slice(0, MAX_LIST);
  const todayBar = bars.find((b) => b.partial);

  return (
    <Screen>
      <Stack.Screen options={{ title: t(`insight_${metric}` as TKey) }} />

      {metric === 'weight' ? <WeightLog /> : null}

      <ChipGroup<Group>
        options={[
          { value: 'day', label: t('insight_daily') },
          { value: 'week', label: t('insight_weekly') },
          { value: 'month', label: t('insight_monthly') },
        ]}
        value={prefs.group}
        onChange={(group) => setInsights({ group })}
      />
      <ChipGroup<RangeId>
        options={RANGES.map((r) => ({ value: r, label: t(`insight_range_${r}` as TKey) }))}
        value={prefs.range}
        onChange={(range) => setInsights(range === 'custom' ? { range, from, to } : { range })}
      />
      {prefs.range === 'custom' ? <CustomRange from={from} to={to} /> : null}
      {metric === 'nutrients' ? (
        <ChipGroup<NutrientKey> options={NUTRIENTS.map((n) => ({ value: n, label: t(`insight_n_${n}` as TKey) }))} value={nutrient} onChange={setNutrient} />
      ) : null}

      {series.loading ? (
        <Card>
          <Txt v="sub">…</Txt>
        </Card>
      ) : !anything ? (
        <Card style={{ gap: 10 }}>
          <Txt v="h3">{t('insight_empty')}</Txt>
          <Txt v="sub">{series.stepsReason ? t(series.stepsReason as TKey) : t(metric === 'steps' ? 'insight_empty_steps' : 'insight_empty_text')}</Txt>
          {metric !== 'steps' ? (
            <Button small kind="secondary" icon="book-outline" title={t('insight_open_diary')} style={{ alignSelf: 'flex-start' }} onPress={() => router.dismissTo('/')} />
          ) : null}
        </Card>
      ) : (
        <>
          <Card style={{ gap: 6 }}>
            <Txt v="h3">{rangeTitle}</Txt>
            {metric === 'macros' && macroGrams && macroShare ? (
              (['carbs', 'protein', 'fat'] as const).map((k, i) => (
                <Row key={k} gap={6}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: series.colors[i] }} />
                  <Txt>
                    {t(k)}: ⌀ {formatValue('nutrients', Math.round(macroGrams[i]), lang)} ({macroShare[i]} %)
                  </Txt>
                </Row>
              ))
            ) : (
              <Txt>
                {t('insight_average')}: <Txt color={series.colors[0]}>{summary.avg ? fmt(summary.avg.reduce((s, v) => s + v, 0)) : '–'}</Txt>
              </Txt>
            )}
            {summary.goal && metric !== 'macros' ? (
              <Txt>
                {t('goal')}: <Txt color={c.leaf}>{fmt(summary.goal)}</Txt>
              </Txt>
            ) : null}
            {summary.days === 0 && todayBar ? (
              <Txt v="small">{t('insight_today_only', { value: rowValue(todayBar) })}</Txt>
            ) : (
              <Txt v="small">{summary.days === 1 ? t('insight_based_one') : t('insight_based_n', { n: summary.days })}</Txt>
            )}
          </Card>

          <Card style={{ gap: 8 }}>
            <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
              {metric === 'weight' ? (
                <LineChart
                  points={bars.filter((b) => b.values).map((b) => ({ label: barLabel(b), value: total(b) }))}
                  width={width}
                  height={200}
                  target={summary.goal}
                />
              ) : (
                <PeriodChart
                  bars={bars.map((b) => ({ label: barLabel(b), parts: b.values, partial: b.partial }))}
                  colors={series.colors}
                  goal={summary.goal}
                  width={width}
                  formatAxis={(v) => fmt(v, false)}
                />
              )}
            </View>
            {bars.some((b) => b.partial) ? <Txt v="small">{t('insight_today_light')}</Txt> : null}
          </Card>

          <SectionTitle>{t('insight_history')}</SectionTitle>
          <Card style={{ gap: 0 }}>
            {listed.map((b, i) => (
              <View key={b.from}>
                {i > 0 ? <Divider /> : null}
                <ListRow
                  title={rowTitle(b)}
                  subtitle={b.partial ? t('insight_so_far') : prefs.group !== 'day' ? (b.days === 1 ? t('insight_days_one') : t('insight_days_n', { n: b.days })) : undefined}
                  right={<Txt v="label" color={series.colors[0]}>{rowValue(b)}</Txt>}
                  onPress={prefs.group === 'day' ? () => router.dismissTo({ pathname: '/', params: { date: b.from } }) : undefined}
                />
              </View>
            ))}
          </Card>
          {metric === 'macros' ? <Txt v="small">{t('insight_macro_order')}</Txt> : null}
        </>
      )}

      <Card style={{ gap: 8 }}>
        <Pressable
          onPress={() => setHowOpen((o) => !o)}
          accessibilityRole="button"
          accessibilityState={{ expanded: howOpen }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
        >
          <Ionicons name="information-circle-outline" size={20} color={c.sub} />
          <Txt v="h3" style={{ flex: 1 }}>
            {t('insight_how')}
          </Txt>
          <Ionicons name={howOpen ? 'chevron-up' : 'chevron-down'} size={18} color={c.sub} />
        </Pressable>
        {howOpen
          ? howTexts(metric).map((k) => (
              <Txt key={k} v="small">
                {t(k)}
              </Txt>
            ))
          : null}
      </Card>
    </Screen>
  );
}

/** Which explanations a statistic gets, in order. */
function howTexts(m: Metric): TKey[] {
  const out: TKey[] = [];
  if (m === 'weight') out.push('insight_how_weight');
  else if (m === 'fasting') out.push('insight_how_fasting');
  else {
    out.push('insight_how_days', 'insight_how_today');
  }
  out.push('insight_how_groups');
  if (m === 'energy' || m === 'macros') out.push('insight_how_goal');
  if (m === 'macros') out.push('insight_how_macros');
  if (m === 'nutrients') out.push('insight_how_nutrients');
  if (m === 'steps') out.push('insight_how_steps');
  return out;
}

/** From–to fields for a custom range; a date counts once it is a real day (typed as 20.10.2026 or 2026-10-20). */
function CustomRange({ from, to }: { from: string; to: string }) {
  const { t, lang } = useT();
  const setInsights = useStore((s) => s.setInsights);
  const [a, setA] = useState(formatDateInput(from, lang));
  const [b, setB] = useState(formatDateInput(to, lang));
  const fa = parseDateInput(a, lang);
  const fb = parseDateInput(b, lang);
  const update = (na: string, nb: string) => {
    const pa = parseDateInput(na, lang);
    const pb = parseDateInput(nb, lang);
    if (pa && pb) setInsights({ range: 'custom', from: pa, to: pb });
  };
  const ph = formatDateInput('2026-10-20', lang);
  return (
    <Card style={{ gap: 10 }}>
      <Row>
        <View style={{ flex: 1 }}>
          <Field
            label={t('insight_from')}
            value={a}
            placeholder={ph}
            inputMode="numeric"
            onChangeText={(v) => {
              setA(v);
              update(v, b);
            }}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Field
            label={t('insight_to')}
            value={b}
            placeholder={ph}
            inputMode="numeric"
            onChangeText={(v) => {
              setB(v);
              update(a, v);
            }}
          />
        </View>
      </Row>
      <Txt v="small">{!fa || !fb ? t('insight_date_hint', { example: ph }) : t('insight_custom_note')}</Txt>
    </Card>
  );
}

/** Today's weigh-in (moved here from the old Progress screen). */
function WeightLog() {
  const { t, lang } = useT();
  const c = useColors();
  const today = useToday();
  const profile = useStore((s) => s.profile)!;
  const weights = useStore((s) => s.weights);
  const logWeight = useStore((s) => s.logWeight);
  const removeWeight = useStore((s) => s.removeWeight);
  const current = weightOn(weights, profile, today);
  const [input, setInput] = useState<number | null>(current);
  const loggedToday = weights.some((w) => w.date === today);
  const dec = (n: number) => n.toFixed(1).replace('.', lang === 'de' ? ',' : '.');
  const change = current - profile.startWeightKg;
  const toGo = current - profile.targetWeightKg;
  const bmiValue = bmi(current, profile.heightCm);
  const save = () => {
    if (!input || input < 30 || input > 300) return;
    logWeight(today, Math.round(input * 10) / 10);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  };
  return (
    <Card style={{ gap: 12 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <View>
          <Txt v="small">{t('current_weight')}</Txt>
          <Txt v="big">{dec(current)} kg</Txt>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Txt v="sub" color={change <= 0 ? c.accent : c.coral}>
            {change > 0 ? '+' : change < 0 ? '−' : '±'}
            {dec(Math.abs(change))} kg {t('since_start')}
          </Txt>
          {profile.goal !== 'maintain' ? (
            <Txt v="sub">{t('to_go', { kg: dec(Math.max(0, profile.goal === 'lose' ? toGo : -toGo)) })}</Txt>
          ) : null}
          <Txt v="sub">
            BMI {dec(bmiValue)} · {t(`bmi_${bmiCategory(bmiValue)}`)}
          </Txt>
        </View>
      </Row>
      <Txt v="h3">{loggedToday ? t('update_today_weight') : t('log_weight')}</Txt>
      <Row>
        <NumField value={input} onChange={setInput} suffix="kg" />
        <Button title={t('save')} icon="checkmark" onPress={save} disabled={!input || input < 30 || input > 300} />
      </Row>
      {loggedToday ? (
        <Button
          small
          kind="ghost"
          title={t('remove_today_weight')}
          style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }}
          onPress={() =>
            showAlert(t('remove_today_weight'), undefined, [
              { text: t('cancel'), style: 'cancel' },
              { text: t('delete'), style: 'destructive', onPress: () => removeWeight(today) },
            ])
          }
        />
      ) : null}
    </Card>
  );
}

