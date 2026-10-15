import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Burst, Tap, useCountUp } from '../../src/components/motion';
import { PlateRing } from '../../src/components/PlateRing';
import { TAB_BAR_SPACE } from '../../src/components/TabBar';
import { Banner, Button, Card, Divider, IconButton, ListRow, MacroBar, Row, Screen, SectionTitle, Tile, Txt, type IconName } from '../../src/components/ui';
import { addDays, dayKey, formatDuration, formatShortDate } from '../../src/lib/dates';
import { setMealDraft } from '../../src/lib/foodCache';
import { amountText } from '../../src/lib/format';
import { dayGoal } from '../../src/lib/goals';
import { goalsFor, useNow, useSteps, useToday } from '../../src/lib/hooks';
import { visibleDiary } from '../../src/lib/layout';
import { itemsFromEntries } from '../../src/lib/meals';
import { entryNutrients, MEAL_SHARE, sumEntries } from '../../src/lib/nutrition';
import { dailyTotals, isMilestone, streakInfo } from '../../src/lib/streaks';
import { useStore } from '../../src/lib/store';
import { radius, space, useColors } from '../../src/lib/theme';
import { MEALS, type DiaryEntry, type MealType } from '../../src/lib/types';
import { useT } from '../../src/lib/useT';

const MEAL_ICONS: Record<MealType, IconName> = {
  breakfast: 'sunny',
  lunch: 'leaf',
  dinner: 'moon',
  snack: 'ice-cream',
};

export default function DiaryScreen() {
  const insets = useSafeAreaInsets();
  const c = useColors();
  const { t, lang } = useT();
  const today = useToday();
  const [date, setDate] = useState(today);
  // When the day changes while the diary shows "today", follow it so food isn't logged to yesterday.
  const prevToday = useRef(today);
  useEffect(() => {
    if (prevToday.current === today) return;
    const before = prevToday.current;
    prevToday.current = today;
    setDate((d) => (d === before || d > today ? today : d));
  }, [today]);
  // Opened from the calendar with a day to show (never a future day: nothing is logged ahead).
  const params = useLocalSearchParams<{ date?: string }>();
  useEffect(() => {
    if (params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date)) setDate(params.date > dayKey() ? dayKey() : params.date);
  }, [params.date]);

  const profile = useStore((s) => s.profile)!;
  const weights = useStore((s) => s.weights);
  const allEntries = useStore((s) => s.entries);
  const fastingActive = useStore((s) => s.fastingActive);

  const entries = useMemo(() => allEntries.filter((e) => e.date === date).sort((a, b) => a.createdAt - b.createdAt), [allEntries, date]);
  const streak = useMemo(
    () => streakInfo(dailyTotals(allEntries), today, (d) => ({ kcal: dayGoal(profile, weights, d).kcal, goal: profile.goal })),
    [allEntries, today, profile, weights],
  );
  const goals = goalsFor(profile, weights, date);
  const totals = sumEntries(entries);
  const { steps, kcal: stepKcal } = useSteps(date, goals.weight);
  const burned = profile.addActivityCalories ? stepKcal : 0;
  const budget = goals.kcal + burned;
  const remaining = Math.round(budget - totals.kcal);
  const shownRemaining = useCountUp(remaining);
  const layout = useStore((s) => s.layout);

  const dateLabel = date === today ? t('today') : date === addDays(today, -1) ? t('yesterday') : formatShortDate(date, lang);
  const hour = new Date().getHours();
  const greeting = t(hour < 11 ? 'greet_morning' : hour < 18 ? 'greet_day' : 'greet_evening');

  return (
    <Screen style={{ paddingTop: insets.top + 12 }} bottomInset={TAB_BAR_SPACE} appear>
      <Row style={{ justifyContent: 'space-between', paddingHorizontal: 4 }}>
        <View style={{ flex: 1 }}>
          <Txt v="title" numberOfLines={1}>
            {profile.name ? `${greeting}, ${profile.name}` : greeting}
          </Txt>
        </View>
        <Tap
          onPress={() => router.push('/streak')}
          accessibilityRole="button"
          accessibilityLabel={`${t('streak')}: ${streak.current === 1 ? t('streak_days_one') : t('streak_days_n', { n: streak.current })}`}
          scaleTo={0.9}
          rippleColor={c.coral}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            backgroundColor: c.card,
            borderRadius: 999,
            paddingHorizontal: 12,
            paddingVertical: 7,
          }}
        >
          <Ionicons name="flame" size={18} color={streak.todayLogged ? c.coral : c.sub} />
          <Txt v="h3">{streak.current}</Txt>
        </Tap>
      </Row>

      <Row gap={4} style={{ alignSelf: 'flex-start', backgroundColor: c.card, borderRadius: 999, paddingHorizontal: 4 }}>
        <IconButton icon="chevron-back" size={18} label={t('previous_day')} onPress={() => setDate(addDays(date, -1))} color={c.text} />
        <Pressable onPress={() => setDate(today)} accessibilityRole="button" accessibilityHint={t('today')} style={{ minWidth: 92, alignItems: 'center' }}>
          <Txt v="h3">{dateLabel}</Txt>
        </Pressable>
        <IconButton
          icon="chevron-forward"
          size={18}
          label={t('next_day')}
          onPress={() => date < today && setDate(addDays(date, 1))}
          color={date >= today ? c.line : c.text}
        />
        <IconButton icon="calendar-outline" size={18} label={t('open_calendar')} onPress={() => router.push('/streak')} color={c.text} />
      </Row>

      {goals.status === 'minor' || goals.status === 'underweight' || goals.status === 'reached' ? (
        <Banner icon={goals.status === 'reached' ? 'trophy' : 'information-circle'} tone="leaf" text={t(`warn_${goals.status}`)} />
      ) : null}
      {date === today && streak.todayLogged && isMilestone(streak.current) ? (
        <View>
          <Banner icon="flame" tone="warn" text={t('streak_milestone', { n: streak.current })} />
          <Burst trigger={streak.current} colors={[c.coral, c.carbs, c.accent, c.leaf]} size={260} />
        </View>
      ) : null}

      {visibleDiary(layout).map((section) => {
        if (section === 'plate')
          return (
            <Card key={section} r="xl" style={{ alignItems: 'center', gap: 18, paddingVertical: 24 }}>
              <PlateRing
                size={236}
                budget={budget}
                eatenKcal={totals.kcal}
                carbsKcal={totals.carbs * 4}
                proteinKcal={totals.protein * 4}
                fatKcal={totals.fat * 9}
              >
                <Txt v="hero" color={remaining < 0 ? c.coral : c.text}>
                  {Math.abs(Math.round(shownRemaining))}
                </Txt>
                <Txt v="sub">{remaining < 0 ? t('kcal_over') : t('kcal_left')}</Txt>
              </PlateRing>

              <Row style={{ alignSelf: 'stretch', justifyContent: 'space-around' }}>
                <Stat label={t('goal')} value={goals.kcal} />
                <View style={{ width: 1, height: 30, backgroundColor: c.line }} />
                <Stat label={t('eaten')} value={Math.round(totals.kcal)} />
                <View style={{ width: 1, height: 30, backgroundColor: c.line }} />
                <Stat label={t('burned')} value={burned} />
              </Row>

              <Row gap={14} style={{ alignSelf: 'stretch' }}>
                <MacroBar label={t('carbs')} value={totals.carbs} goal={goals.macros.carbs} color={c.carbs} />
                <MacroBar label={t('protein')} value={totals.protein} goal={goals.macros.protein} color={c.protein} />
                <MacroBar label={t('fat')} value={totals.fat} goal={goals.macros.fat} color={c.fat} />
              </Row>
            </Card>
          );
        if (section === 'fasting')
          return goals.fastDay || (fastingActive && date === today) ? (
            <View key={section} style={{ gap: space.m }}>
              {goals.fastDay ? <Banner icon="leaf" tone="leaf" text={t('fasting_day_banner', { kcal: goals.kcal })} /> : null}
              {fastingActive && date === today ? <FastingMini start={fastingActive.start} target={fastingActive.targetHours} /> : null}
            </View>
          ) : null;
        if (section === 'meals')
          return (
            <View key={section} style={{ gap: space.m }}>
              <SectionTitle>{t('meals')}</SectionTitle>
              {MEALS.map((meal) => (
                <MealCard
                  key={meal}
                  meal={meal}
                  date={date}
                  entries={entries.filter((e) => e.meal === meal)}
                  target={Math.round(budget * MEAL_SHARE[meal])}
                />
              ))}
            </View>
          );
        if (section === 'water') return <WaterCard key={section} date={date} />;
        return (
          <Card key={section} r="l">
            <Row gap={12}>
              <Tile icon="footsteps" bg={c.meal.lunch.tile} color={c.meal.lunch.icon} />
              <View style={{ flex: 1, gap: 2 }}>
                <Txt v="h3">{t('steps')}</Txt>
                <Txt v="sub">
                  {steps === null ? t('steps_unavailable') : `${steps.toLocaleString(lang)} / ${profile.stepGoal.toLocaleString(lang)}`}
                </Txt>
              </View>
            </Row>
            {steps !== null ? (
              <>
                <View style={{ height: 8, borderRadius: 4, backgroundColor: c.ringTrack, overflow: 'hidden', marginTop: 4 }}>
                  <View style={{ width: `${Math.min(1, steps / profile.stepGoal) * 100}%`, height: 8, borderRadius: 4, backgroundColor: c.leaf }} />
                </View>
                <Txt v="small">
                  {t('steps_kcal', { kcal: stepKcal })}
                  {profile.addActivityCalories ? '' : `. ${t('steps_not_added')}`}
                </Txt>
              </>
            ) : null}
          </Card>
        );
      })}
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  const shown = useCountUp(value);
  return (
    <View style={{ alignItems: 'center', minWidth: 70 }}>
      <Txt v="h2">{Math.round(shown)}</Txt>
      <Txt v="small">{label}</Txt>
    </View>
  );
}

function FastingMini({ start, target }: { start: number; target: number }) {
  const now = useNow(1000);
  const { t } = useT();
  const c = useColors();
  const pct = Math.min(1, (now - start) / (target * 3600000));
  return (
    <Pressable onPress={() => router.push('/fasting')} accessibilityRole="button">
      <Card tone="night" r="l" style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Ionicons name="moon" size={24} color={c.nightText} />
        <View style={{ flex: 1, gap: 6 }}>
          <Txt v="h3" color={c.nightText}>
            {t('fasting_running')}
          </Txt>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: '#ffffff22', overflow: 'hidden' }}>
            <View style={{ width: `${pct * 100}%`, height: 6, borderRadius: 3, backgroundColor: c.nightText }} />
          </View>
          <Txt v="small" color={c.nightText}>
            {t('fasting_mini', { elapsed: formatDuration(now - start), target })}
          </Txt>
        </View>
        <Ionicons name="chevron-forward" size={20} color={c.nightText} />
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
  const add = () => router.push({ pathname: '/add-food', params: { meal, date } });

  return (
    <Card r="l" style={{ gap: 4 }}>
      <Row gap={12}>
        <Tile icon={MEAL_ICONS[meal]} bg={c.meal[meal].tile} color={c.meal[meal].icon} />
        <Pressable style={{ flex: 1, gap: 2 }} onPress={add} accessibilityRole="button">
          <Txt v="h3">{t(`meal_${meal}`)}</Txt>
          <Txt v="sub">
            {total} / {target} kcal
          </Txt>
        </Pressable>
        <IconButton icon="add" label={`${t('add_food')}: ${t(`meal_${meal}`)}`} bg={c.accentSoft} color={c.accent} size={22} onPress={add} />
      </Row>
      {entries.length > 0 ? <View style={{ height: 6 }} /> : null}
      {entries.map((e, i) => (
        <View key={e.id}>
          {i > 0 ? <Divider inset={58} /> : null}
          <View style={{ paddingLeft: 58 }}>
            <ListRow
              title={e.food.name}
              subtitle={amountText(e, t('quick_entry'))}
              right={<Txt v="label">{Math.round(entryNutrients(e).kcal)} kcal</Txt>}
              onPress={() => router.push({ pathname: '/food', params: { entryId: e.id } })}
            />
          </View>
        </View>
      ))}
      {entries.length >= 2 ? (
        <View style={{ paddingLeft: 50 }}>
          <Button
            small
            kind="ghost"
            icon="bookmark-outline"
            title={t('save_as_meal')}
            style={{ alignSelf: 'flex-start' }}
            onPress={() => {
              setMealDraft({ name: t(`meal_${meal}`), items: itemsFromEntries(entries) });
              router.push('/meal-edit');
            }}
          />
        </View>
      ) : null}
      {entries.length === 0 && yesterdayHas ? (
        <View style={{ paddingLeft: 50 }}>
          <Button
            small
            kind="ghost"
            icon="copy-outline"
            title={t('copy_yesterday')}
            style={{ alignSelf: 'flex-start' }}
            onPress={() => {
              copyMeal(addDays(date, -1), date, meal);
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            }}
          />
        </View>
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
    <Card r="l">
      <Row gap={12}>
        <Tile icon="water" bg={`${c.water}22`} color={c.water} />
        <View style={{ flex: 1, gap: 2 }}>
          <Txt v="h3">{t('water')}</Txt>
          <Txt v="sub">
            {(ml / 1000).toLocaleString(lang, { maximumFractionDigits: 2 })} / {(profile.waterGoalMl / 1000).toLocaleString(lang)} l
          </Txt>
        </View>
        <IconButton icon="remove" size={18} label={`− ${glass} ml`} border={c.line} color={c.text} onPress={() => ml > 0 && addWater(date, -glass)} />
        <IconButton icon="add" size={18} label={`+ ${glass} ml`} bg={c.water} color="#fff" onPress={() => addWater(date, glass)} />
      </Row>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
        {Array.from({ length: count }).map((_, i) => (
          <Pressable
            key={i}
            onPress={() => tapGlass(i)}
            accessibilityRole="button"
            accessibilityLabel={t('glass_n', { n: i + 1 })}
            hitSlop={4}
            style={{
              width: 34,
              height: 42,
              borderRadius: radius.s - 2,
              borderBottomLeftRadius: 14,
              borderBottomRightRadius: 14,
              backgroundColor: i < filled ? c.water : c.cardAlt,
              alignItems: 'center',
              justifyContent: 'flex-end',
              paddingBottom: 6,
            }}
          >
            <Ionicons name={i < filled ? 'water' : 'add'} size={14} color={i < filled ? '#fff' : c.sub} />
          </Pressable>
        ))}
      </View>
    </Card>
  );
}
