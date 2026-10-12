import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ring } from '../../src/components/Ring';
import { Banner, Button, Card, Divider, IconButton, ListRow, MacroBar, Row, Screen, Txt } from '../../src/components/ui';
import { addDays, dayKey, formatDuration, formatShortDate } from '../../src/lib/dates';
import { amountText } from '../../src/lib/format';
import { goalsFor, useNow, useSteps } from '../../src/lib/hooks';
import { entryNutrients, MEAL_SHARE, sumEntries } from '../../src/lib/nutrition';
import { useStore } from '../../src/lib/store';
import { useColors } from '../../src/lib/theme';
import { MEALS, type DiaryEntry, type MealType } from '../../src/lib/types';
import { useT } from '../../src/lib/useT';

const MEAL_ICONS: Record<MealType, React.ComponentProps<typeof Ionicons>['name']> = {
  breakfast: 'cafe',
  lunch: 'restaurant',
  dinner: 'moon',
  snack: 'nutrition',
};

export default function DiaryScreen() {
  const insets = useSafeAreaInsets();
  const c = useColors();
  const { t, lang } = useT();
  const today = dayKey();
  const [date, setDate] = useState(today);

  const profile = useStore((s) => s.profile)!;
  const weights = useStore((s) => s.weights);
  const allEntries = useStore((s) => s.entries);
  const fastingActive = useStore((s) => s.fastingActive);

  const entries = useMemo(() => allEntries.filter((e) => e.date === date).sort((a, b) => a.createdAt - b.createdAt), [allEntries, date]);
  const goals = goalsFor(profile, weights, date);
  const totals = sumEntries(entries);
  const { steps, kcal: stepKcal } = useSteps(date, goals.weight);
  const burned = profile.addActivityCalories ? stepKcal : 0;
  const budget = goals.kcal + burned;
  const remaining = Math.round(budget - totals.kcal);

  const dateLabel = date === today ? t('today') : date === addDays(today, -1) ? t('yesterday') : formatShortDate(date, lang);

  return (
    <Screen style={{ paddingTop: insets.top + 8 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <IconButton icon="chevron-back" label={t('previous_day')} onPress={() => setDate(addDays(date, -1))} />
        <Pressable onPress={() => setDate(today)}>
          <Txt v="h2">{dateLabel}</Txt>
        </Pressable>
        <IconButton
          icon="chevron-forward"
          label={t('next_day')}
          onPress={() => setDate(addDays(date, 1))}
          color={date >= today ? c.line : c.accent}
        />
      </Row>

      <Card style={{ alignItems: 'center', gap: 16 }}>
        <Row style={{ justifyContent: 'space-between', alignSelf: 'stretch' }}>
          <Stat label={t('eaten')} value={Math.round(totals.kcal)} />
          <Ring size={170} stroke={14} progress={budget > 0 ? totals.kcal / budget : 0} color={c.accent}>
            <Txt v="big" color={remaining < 0 ? c.coral : c.text}>
              {Math.abs(remaining)}
            </Txt>
            <Txt v="sub">{remaining < 0 ? t('kcal_over') : t('kcal_left')}</Txt>
          </Ring>
          <Stat label={t('burned')} value={burned} />
        </Row>
        <Row gap={14} style={{ alignSelf: 'stretch' }}>
          <MacroBar label={t('carbs')} value={totals.carbs} goal={goals.macros.carbs} color={c.carbs} />
          <MacroBar label={t('protein')} value={totals.protein} goal={goals.macros.protein} color={c.protein} />
          <MacroBar label={t('fat')} value={totals.fat} goal={goals.macros.fat} color={c.fat} />
        </Row>
      </Card>

      {goals.fastDay ? <Banner icon="leaf" text={t('fasting_day_banner', { kcal: goals.kcal })} /> : null}
      {fastingActive && date === today ? <FastingMini start={fastingActive.start} target={fastingActive.targetHours} /> : null}

      {MEALS.map((meal) => (
        <MealCard
          key={meal}
          meal={meal}
          date={date}
          entries={entries.filter((e) => e.meal === meal)}
          target={Math.round(budget * MEAL_SHARE[meal])}
        />
      ))}

      <WaterCard date={date} />

      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Row>
            <Ionicons name="walk" size={22} color={c.accent} />
            <Txt v="h3">{t('steps')}</Txt>
          </Row>
          <Txt v="sub">{steps === null ? t('steps_unavailable') : `${steps.toLocaleString(lang)} / ${profile.stepGoal.toLocaleString(lang)}`}</Txt>
        </Row>
        {steps !== null ? (
          <>
            <View style={{ height: 8, borderRadius: 4, backgroundColor: c.ringTrack, overflow: 'hidden' }}>
              <View style={{ width: `${Math.min(1, steps / profile.stepGoal) * 100}%`, height: 8, backgroundColor: c.accent }} />
            </View>
            <Txt v="small">
              {t('steps_kcal', { kcal: stepKcal })}
              {profile.addActivityCalories ? '' : ` · ${t('steps_not_added')}`}
            </Txt>
          </>
        ) : null}
      </Card>
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={{ alignItems: 'center', width: 70 }}>
      <Txt v="h2">{value}</Txt>
      <Txt v="small">{label}</Txt>
    </View>
  );
}

function FastingMini({ start, target }: { start: number; target: number }) {
  const now = useNow(1000);
  const { t } = useT();
  const c = useColors();
  return (
    <Pressable onPress={() => router.push('/fasting')}>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Ionicons name="timer" size={24} color={c.accent} />
        <View style={{ flex: 1 }}>
          <Txt v="h3">{t('fasting_running')}</Txt>
          <Txt v="sub">{t('fasting_mini', { elapsed: formatDuration(now - start), target })}</Txt>
        </View>
        <Ionicons name="chevron-forward" size={20} color={c.sub} />
      </Card>
    </Pressable>
  );
}

function MealCard({ meal, date, entries, target }: { meal: MealType; date: string; entries: DiaryEntry[]; target: number }) {
  const c = useColors();
  const { t } = useT();
  const copyMeal = useStore((s) => s.copyMeal);
  const yesterdayHas = useStore((s) => s.entries.some((e) => e.date === addDays(date, -1) && e.meal === meal));
  const total = Math.round(sumEntries(entries).kcal);

  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row>
          <View style={{ backgroundColor: c.accentSoft, borderRadius: 999, padding: 8 }}>
            <Ionicons name={MEAL_ICONS[meal]} size={18} color={c.accent} />
          </View>
          <View>
            <Txt v="h3">{t(`meal_${meal}`)}</Txt>
            <Txt v="small">
              {total} / {target} kcal
            </Txt>
          </View>
        </Row>
        <IconButton
          icon="add"
          label={t('add_food')}
          bg={c.accent}
          color={c.accentText}
          size={20}
          onPress={() => router.push({ pathname: '/add-food', params: { meal, date } })}
        />
      </Row>
      {entries.length > 0 ? <Divider /> : null}
      {entries.map((e) => (
        <ListRow
          key={e.id}
          title={e.food.name}
          subtitle={amountText(e, t('quick_entry'))}
          right={<Txt v="sub">{Math.round(entryNutrients(e).kcal)} kcal</Txt>}
          onPress={() => router.push({ pathname: '/food', params: { entryId: e.id } })}
        />
      ))}
      {entries.length === 0 && yesterdayHas ? (
        <Button
          small
          kind="ghost"
          icon="copy-outline"
          title={t('copy_yesterday')}
          style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }}
          onPress={() => {
            copyMeal(addDays(date, -1), date, meal);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          }}
        />
      ) : null}
    </Card>
  );
}

function WaterCard({ date }: { date: string }) {
  const c = useColors();
  const { t, lang } = useT();
  const profile = useStore((s) => s.profile)!;
  const ml = useStore((s) => s.water[date] ?? 0);
  const addWater = useStore((s) => s.addWater);
  const glass = profile.glassMl;
  const count = Math.min(12, Math.max(1, Math.ceil(profile.waterGoalMl / glass)));
  const filled = Math.floor(ml / glass);

  const tapGlass = (i: number) => {
    const target = (i + 1) * glass;
    const next = ml >= target ? i * glass : target;
    addWater(date, next - ml);
    Haptics.selectionAsync().catch(() => {});
  };

  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row>
          <Ionicons name="water" size={22} color={c.water} />
          <Txt v="h3">{t('water')}</Txt>
        </Row>
        <Txt v="sub">
          {(ml / 1000).toLocaleString(lang, { maximumFractionDigits: 2 })} / {(profile.waterGoalMl / 1000).toLocaleString(lang)} l
        </Txt>
      </Row>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {Array.from({ length: count }).map((_, i) => (
          <Pressable key={i} onPress={() => tapGlass(i)} accessibilityLabel={t('glass_n', { n: i + 1 })} hitSlop={4}>
            <Ionicons name={i < filled ? 'water' : 'water-outline'} size={30} color={i < filled ? c.water : c.line} />
          </Pressable>
        ))}
      </View>
      <Row>
        <Button small kind="secondary" icon="remove" title={`${glass} ml`} onPress={() => addWater(date, -glass)} disabled={ml <= 0} />
        <Button small kind="secondary" icon="add" title={`${glass} ml`} onPress={() => addWater(date, glass)} />
      </Row>
    </Card>
  );
}
