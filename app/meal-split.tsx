import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Switch, View } from 'react-native';
import { Banner, Button, Card, ChipGroup, NumField, Row, Screen, SectionTitle, Tile, Txt, type IconName } from '../src/components/ui';
import { dayKey } from '../src/lib/dates';
import { closesAt, minutesInsideFast, scheduleActive, windowFastHours } from '../src/lib/fasting';
import { dayGoal } from '../src/lib/goals';
import {
  draftToSplit,
  kcalFromPercent,
  MEAL_SPLIT_PRESETS,
  mealSplitOf,
  moveShares,
  percentFromKcal,
  presetOf,
  splitLeft,
  type MealSplitPreset,
  type SplitDraft,
} from '../src/lib/mealSplit';
import { clockText } from '../src/lib/reminders';
import { useStore } from '../src/lib/store';
import { useColors } from '../src/lib/theme';
import { MEALS, type MealType } from '../src/lib/types';
import { useT } from '../src/lib/useT';

const MEAL_ICONS: Record<MealType, IconName> = { breakfast: 'sunny', lunch: 'leaf', dinner: 'moon', snack: 'ice-cream' };

type Unit = 'percent' | 'kcal';

/**
 * Profile → Meal split: how the day's calories are shared between meals (presets or own values,
 * typed in percent or kcal, saved as percent adding up to 100) and the optional per-meal macros.
 */
export default function MealSplitScreen() {
  const { t, lang } = useT();
  const c = useColors();
  const profile = useStore((s) => s.profile)!;
  const weights = useStore((s) => s.weights);
  const updateProfile = useStore((s) => s.updateProfile);
  const schedule = useStore((s) => s.fastingSchedule);
  const mealTimes = useStore((s) => s.reminders.meals);
  const goalKcal = useMemo(() => dayGoal(profile, weights, dayKey()).kcal, [profile, weights]);

  const [draft, setDraft] = useState<SplitDraft>(() => ({ ...mealSplitOf(profile) }));
  const [unit, setUnit] = useState<Unit>('percent');
  // In kcal the typed numbers are kept as typed; each is turned into whole percent of today's goal.
  const [kcalDraft, setKcalDraft] = useState<Record<MealType, number | null>>(() => kcalOf(mealSplitOf(profile), goalKcal));
  const [macros, setMacros] = useState(profile.mealMacros === true);

  const split = draftToSplit(draft);
  const left = splitLeft(draft);
  const preset = split ? presetOf(split) : 'custom';
  const fmt = (n: number) => n.toLocaleString(lang === 'de' ? 'de-DE' : 'en-US');

  const setAll = (next: SplitDraft) => {
    setDraft(next);
    setKcalDraft(kcalOf(next, goalKcal));
  };
  const setMeal = (meal: MealType, v: number | null) => {
    if (unit === 'percent') {
      setDraft({ ...draft, [meal]: v === null ? null : Math.round(v) });
      setKcalDraft({ ...kcalDraft, [meal]: v === null ? null : kcalFromPercent(Math.round(v), goalKcal) });
    } else {
      setKcalDraft({ ...kcalDraft, [meal]: v });
      setDraft({ ...draft, [meal]: v === null ? null : percentFromKcal(v, goalKcal) });
    }
  };

  // Meals with a share whose usual time (the reminder time) falls inside the fixed window's fast.
  const fastHours = scheduleActive(schedule, profile) ? windowFastHours(profile.fastingPlanId) : null;
  const inFast = split && fastHours !== null ? MEALS.filter((m) => split[m] > 0 && minutesInsideFast(mealTimes[m].time, schedule.opensAt, fastHours)) : [];
  const inFastNames = inFast.map((m) => t(`meal_${m}`)).join(', ');

  const save = () => {
    if (!split) return;
    updateProfile({ mealSplit: split, mealMacros: macros });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    router.back();
  };

  return (
    <Screen>
      <Txt v="sub">{t('meal_split_sub')}</Txt>
      <ChipGroup<MealSplitPreset | 'custom'>
        options={[
          ...MEAL_SPLIT_PRESETS.map((p) => ({ value: p.id as MealSplitPreset | 'custom', label: `${t(`split_preset_${p.id}`)} · ${MEALS.map((m) => p.split[m]).join('/')}` })),
          { value: 'custom', label: t('split_preset_custom') },
        ]}
        value={preset}
        onChange={(v) => {
          const p = MEAL_SPLIT_PRESETS.find((x) => x.id === v);
          if (p) setAll({ ...p.split });
        }}
      />

      <Card style={{ gap: 12 }}>
        <Row gap={10}>
          <Txt v="label" style={{ flex: 1 }}>
            {t('split_enter_in')}
          </Txt>
          <ChipGroup<Unit>
            options={[
              { value: 'percent', label: t('split_percent') },
              { value: 'kcal', label: t('split_kcal') },
            ]}
            value={unit}
            onChange={(u) => {
              if (u === 'kcal') setKcalDraft(kcalOf(draft, goalKcal));
              setUnit(u);
            }}
          />
        </Row>
        {MEALS.map((meal) => {
          const pct = draft[meal];
          return (
            <Row key={meal} gap={12}>
              <Tile icon={MEAL_ICONS[meal]} bg={c.meal[meal].tile} color={c.meal[meal].icon} size={38} />
              <View style={{ flex: 1, gap: 2 }}>
                <Txt v="h3">{t(`meal_${meal}`)}</Txt>
                <Txt v="small">
                  {pct === null ? '–' : unit === 'percent' ? `= ${fmt(kcalFromPercent(pct, goalKcal))} kcal` : `= ${pct} %`}
                </Txt>
              </View>
              <View style={{ width: 120 }}>
                <NumField
                  key={`${meal}-${unit}`}
                  value={unit === 'percent' ? pct : kcalDraft[meal]}
                  decimals={false}
                  suffix={unit === 'percent' ? '%' : 'kcal'}
                  onChange={(v) => setMeal(meal, v)}
                  accessibilityLabel={t('split_field', { meal: t(`meal_${meal}`), unit: unit === 'percent' ? t('split_percent') : t('split_kcal') })}
                />
              </View>
            </Row>
          );
        })}
        <Txt v="label" color={left === 0 ? c.accent : c.danger}>
          {left === 0 ? t('split_ok') : left > 0 ? t('split_left', { n: left }) : t('split_over', { n: -left })}
        </Txt>
        <Txt v="small">{t('split_based_on', { kcal: fmt(goalKcal) })}</Txt>
        <Txt v="small">{t('split_zero_hint')}</Txt>
      </Card>

      {split && inFast.length && fastHours !== null ? (
        <View style={{ gap: 8 }}>
          <Banner
            icon="moon"
            text={t(inFast.length === 1 ? 'split_fast_hint' : 'split_fast_hint_n', {
              meals: inFastNames,
              from: clockText(schedule.opensAt),
              to: clockText(closesAt(schedule.opensAt, fastHours)),
            })}
          />
          <Button small kind="secondary" icon="swap-horizontal" title={t('split_fast_move')} style={{ alignSelf: 'flex-start' }} onPress={() => setAll(moveShares(split, inFast))} />
        </View>
      ) : null}

      <SectionTitle>{t('macros')}</SectionTitle>
      <Card>
        <Row gap={12}>
          <View style={{ flex: 1, gap: 2 }}>
            <Txt v="h3">{t('meal_macros')}</Txt>
            <Txt v="small">{t('meal_macros_sub')}</Txt>
          </View>
          <Switch value={macros} onValueChange={setMacros} trackColor={{ true: c.accent }} accessibilityLabel={t('meal_macros')} testID="meal-macros-switch" />
        </Row>
      </Card>

      <Button title={t('save')} icon="checkmark" disabled={!split} onPress={save} />
    </Screen>
  );
}

function kcalOf(draft: SplitDraft, goalKcal: number): Record<MealType, number | null> {
  const out = {} as Record<MealType, number | null>;
  for (const m of MEALS) out[m] = draft[m] === null ? null : kcalFromPercent(draft[m]!, goalKcal);
  return out;
}
