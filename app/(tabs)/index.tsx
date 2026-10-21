import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DaySwipe } from '../../src/components/DaySwipe';
import { exportBackupFlow } from '../../src/components/exportBackup';
import { Burst, Tap, useCountUp } from '../../src/components/motion';
import { PlateRing } from '../../src/components/PlateRing';
import { TAB_BAR_SPACE } from '../../src/components/TabBar';
import { Banner, Button, Card, Divider, IconButton, ListRow, MacroBar, Row, Screen, SectionTitle, Tile, Txt, type IconName } from '../../src/components/ui';
import { backupDue } from '../../src/lib/backupReminder';
import { addDays, formatDuration, formatShortDate } from '../../src/lib/dates';
import { setMealDraft } from '../../src/lib/foodCache';
import { amountText } from '../../src/lib/format';
import { dayGoal } from '../../src/lib/goals';
import { goalsFor, useNow, useSteps, useToday } from '../../src/lib/hooks';
import { toggle, visibleDiary } from '../../src/lib/layout';
import { itemsFromEntries } from '../../src/lib/meals';
import { mealMacroTargets, mealSplitOf, mealTarget } from '../../src/lib/mealSplit';
import { entryNutrients, sumEntries } from '../../src/lib/nutrition';
import { clockText, hintCardMeal, suggestAll } from '../../src/lib/reminders';
import { dailyTotals, isMilestone, streakInfo } from '../../src/lib/streaks';
import { useStore } from '../../src/lib/store';
import { radius, space, useColors } from '../../src/lib/theme';
import { MEALS, type DiaryEntry, type MacroGrams, type MealType } from '../../src/lib/types';
import { useT } from '../../src/lib/useT';
import { confirmLogging } from '../../src/components/fastGuard';

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
    setDate((d) => (d === before ? today : d));
  }, [today]);
  // Opened from the calendar (or a statistics list) with a day to show.
  const params = useLocalSearchParams<{ date?: string }>();
  useEffect(() => {
    if (params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date)) setDate(params.date);
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
  const { steps, loading: stepsLoading, kcal: stepKcal, reason: stepsReason, action: stepsAction } = useSteps(date, goals.weight);
  const burned = profile.addActivityCalories ? stepKcal : 0;
  const budget = goals.kcal + burned;
  const remaining = Math.round(budget - totals.kcal);
  const split = mealSplitOf(profile);
  const shownRemaining = useCountUp(remaining);
  const layout = useStore((s) => s.layout);
  const lastBackupAt = useStore((s) => s.lastBackupAt);
  const backupSnoozedUntil = useStore((s) => s.backupSnoozedUntil);
  const showBackupReminder = backupDue(Date.now(), { since: profile.createdAt, lastBackupAt, snoozedUntil: backupSnoozedUntil });
  // One-time offer once the app knows when a meal is usually eaten (5 logged days, see reminders.ts).
  const reminderPrefs = useStore((s) => s.reminders);
  const reminderHint = useMemo(
    () => (reminderPrefs.enabled || reminderPrefs.hintDismissed ? null : hintCardMeal(reminderPrefs, suggestAll(allEntries, today))),
    [reminderPrefs, allEntries, today],
  );

  const dateLabel =
    date === today
      ? t('today')
      : date === addDays(today, -1)
        ? t('yesterday')
        : date === addDays(today, 1)
          ? t('tomorrow')
          : formatShortDate(date, lang);
  const hour = new Date().getHours();
  const greeting = t(hour < 11 ? 'greet_morning' : hour < 18 ? 'greet_day' : 'greet_evening');

  return (
    <DaySwipe day={date} onChange={(dir) => setDate((d) => addDays(d, dir))}>
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
            onPress={() => setDate(addDays(date, 1))}
            color={c.text}
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
        {showBackupReminder ? (
          <View style={{ gap: space.s }}>
            <Banner icon="save-outline" text={t('backup_reminder')} />
            <Row style={{ justifyContent: 'flex-end' }}>
              <Button small kind="ghost" title={t('backup_later')} onPress={() => useStore.getState().snoozeBackupReminder()} />
              <Button small icon="share-outline" title={t('backup_now')} onPress={exportBackupFlow} />
            </Row>
          </View>
        ) : null}

        {reminderHint && date === today && !showBackupReminder ? (
          <View style={{ gap: space.s }} testID="reminder-hint">
            <Banner
              icon="notifications-outline"
              text={t('reminder_card', { meal: t(`reminder_meal_${reminderHint.meal}`), time: clockText(reminderHint.time) })}
            />
            <Row style={{ justifyContent: 'flex-end' }}>
              <Button small kind="ghost" title={t('reminder_card_no')} onPress={() => useStore.getState().setReminders({ hintDismissed: true })} />
              <Button
                small
                icon="notifications-outline"
                title={t('reminder_card_yes')}
                onPress={() => {
                  useStore.getState().setReminders({ hintDismissed: true });
                  router.push('/reminders');
                }}
              />
            </Row>
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
                    target={mealTarget(budget, split, meal)}
                    macros={profile.mealMacros && split[meal] > 0 ? mealMacroTargets(goals.macros, split, meal) : undefined}
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
                    {steps !== null
                      ? `${steps.toLocaleString(lang)} / ${profile.stepGoal.toLocaleString(lang)}`
                      : stepsLoading
                        ? '…'
                        : t('steps_unavailable')}
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
              ) : stepsReason ? (
                <>
                  <Txt v="small">{t(stepsReason)}</Txt>
                  {stepsAction ? (
                    <Button
                      small
                      kind="ghost"
                      icon="open-outline"
                      title={t(stepsAction.label)}
                      style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }}
                      onPress={stepsAction.run}
                    />
                  ) : null}
                </>
              ) : null}
            </Card>
          );
        })}
      </Screen>
    </DaySwipe>
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

function MealCard({
  meal,
  date,
  entries,
  target,
  macros,
}: {
  meal: MealType;
  date: string;
  entries: DiaryEntry[];
  /** 0 for a meal with a 0 % share: no target is shown. */
  target: number;
  /** Per-meal macro targets, when switched on (Profile → Meal split). */
  macros?: MacroGrams;
}) {
  const c = useColors();
  const { t } = useT();
  const eaten = sumEntries(entries);
  const total = Math.round(eaten.kcal);
  const add = () => router.push({ pathname: '/add-food', params: { meal, date } });
  // Folded meals show only this header row (name, kcal, add button); the choice holds on every day.
  const collapsed = useStore((s) => s.layout.collapsedMeals.includes(meal));
  const toggleCollapsed = () => {
    const l = useStore.getState().layout;
    useStore.getState().setLayout({ collapsedMeals: toggle(l.collapsedMeals, meal, !collapsed) });
    Haptics.selectionAsync().catch(() => {});
  };

  return (
    <Card r="l" style={{ gap: 4 }}>
      <Row gap={12}>
        <Tile icon={MEAL_ICONS[meal]} bg={c.meal[meal].tile} color={c.meal[meal].icon} />
        <Pressable
          style={{ flex: 1, gap: 2 }}
          onPress={toggleCollapsed}
          accessibilityRole="button"
          accessibilityState={{ expanded: !collapsed }}
          accessibilityLabel={`${t(`meal_${meal}`)}, ${target > 0 ? `${total} / ${target}` : total} kcal`}
          accessibilityHint={collapsed ? t('meal_expand') : t('meal_collapse')}
          testID={`meal-toggle-${meal}`}
        >
          <Row gap={6}>
            <Txt v="h3">{t(`meal_${meal}`)}</Txt>
            <Ionicons name={collapsed ? 'chevron-down' : 'chevron-up'} size={16} color={c.sub} />
          </Row>
          <Txt v="sub">
            {target > 0 ? `${total} / ${target}` : total} kcal
            {collapsed && entries.length > 0 ? ` · ${entries.length === 1 ? t('meal_items_one') : t('meal_items_n', { n: entries.length })}` : ''}
          </Txt>
          {macros ? (
            <Txt v="small">
              {t('meal_macro_line', {
                p: `${Math.round(eaten.protein)}/${macros.protein}`,
                c: `${Math.round(eaten.carbs)}/${macros.carbs}`,
                f: `${Math.round(eaten.fat)}/${macros.fat}`,
              })}
            </Txt>
          ) : null}
        </Pressable>
        <IconButton icon="add" label={`${t('add_food')}: ${t(`meal_${meal}`)}`} bg={c.accentSoft} color={c.accent} size={22} onPress={add} />
      </Row>
      {collapsed ? null : <MealBody meal={meal} date={date} entries={entries} />}
    </Card>
  );
}

function MealBody({ meal, date, entries }: { meal: MealType; date: string; entries: DiaryEntry[] }) {
  const { t } = useT();
  const copyMeal = useStore((s) => s.copyMeal);
  const yesterdayHas = useStore((s) => s.entries.some((e) => e.date === addDays(date, -1) && e.meal === meal));
  return (
    <>
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
            onPress={() =>
              confirmLogging(date, () => {
                copyMeal(addDays(date, -1), date, meal);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              })
            }
          />
        </View>
      ) : null}
    </>
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
