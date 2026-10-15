import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ring } from '../../src/components/Ring';
import { Sprout } from '../../src/components/Sprout';
import { TAB_BAR_SPACE } from '../../src/components/TabBar';
import { Banner, Button, Card, Chip, Divider, ListRow, Row, Screen, SectionTitle, Txt } from '../../src/components/ui';
import { showAlert } from '../../src/lib/alert';
import { dayKey, formatDuration, formatShortDate, formatTime, locale } from '../../src/lib/dates';
import { cancelNotification, scheduleAt } from '../../src/lib/device';
import { activeFastingDays, completedFasts, FASTING_PLANS, isFastingDay, longestFastHours, planById, sessionHours, stageFor } from '../../src/lib/fasting';
import { useNow } from '../../src/lib/hooks';
import { fastingDayKcal, isAdult } from '../../src/lib/nutrition';
import { useStore } from '../../src/lib/store';
import { useColors } from '../../src/lib/theme';
import { useT } from '../../src/lib/useT';

const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

export default function FastingScreen() {
  const insets = useSafeAreaInsets();
  const { t, lang } = useT();
  const c = useColors();
  const profile = useStore((s) => s.profile)!;
  const updateProfile = useStore((s) => s.updateProfile);
  const active = useStore((s) => s.fastingActive);
  const history = useStore((s) => s.fastingHistory);
  const startFast = useStore((s) => s.startFast);
  const endFast = useStore((s) => s.endFast);
  const updateActiveFast = useStore((s) => s.updateActiveFast);
  const removeFast = useStore((s) => s.removeFast);
  const now = useNow(1000);

  const plan = planById(profile.fastingPlanId);
  const adult = isAdult(profile.birthYear);
  const targetHours = active?.targetHours ?? plan.fastHours ?? 16;

  const notify = (start: number, hours: number) =>
    scheduleAt(new Date(start + hours * 3600000), t('notif_fast_done_title'), t('notif_fast_done_body', { h: hours }));

  const start = async () => {
    const s = Date.now();
    const notificationId = await notify(s, targetHours);
    startFast({ start: s, targetHours, planId: plan.id, notificationId });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  };

  const stop = () => {
    if (!active) return;
    const done = () => {
      cancelNotification(active.notificationId);
      endFast(Date.now());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    };
    if (sessionHours(active, now) < active.targetHours) {
      showAlert(t('end_early_q'), t('end_early_text'), [
        { text: t('cancel'), style: 'cancel' },
        { text: t('end_fast'), style: 'destructive', onPress: done },
      ]);
    } else done();
  };

  const shiftStart = async (minutes: number) => {
    if (!active) return;
    const newStart = Math.min(Date.now(), active.start + minutes * 60000);
    await cancelNotification(active.notificationId);
    const notificationId = await notify(newStart, active.targetHours);
    updateActiveFast({ start: newStart, notificationId });
  };

  const weekdayName = (d: number) => new Date(2024, 0, 7 + d).toLocaleDateString(locale(lang), { weekday: 'short' });

  const selectedDays = activeFastingDays(profile);
  const toggleDay = (d: number) => {
    const days = selectedDays.includes(d) ? selectedDays.filter((x) => x !== d) : [...selectedDays, d];
    updateProfile({ fastingDays: activeFastingDays({ fastingPlanId: plan.id, fastingDays: days }) });
  };

  const elapsedMs = active ? now - active.start : 0;
  const progress = active ? elapsedMs / (active.targetHours * 3600000) : 0;
  const remainingMs = active ? active.start + active.targetHours * 3600000 - now : 0;
  const stage = stageFor(elapsedMs / 3600000);
  const todayIsFastDay = isFastingDay(profile, dayKey());

  // Fasting plans are for adults only. A fast that is already running can still be ended.
  if (!adult && !active) {
    return (
      <Screen style={{ paddingTop: insets.top + 12 }} bottomInset={TAB_BAR_SPACE} appear>
        <Txt v="title">{t('tab_fasting')}</Txt>
        <Card r="xl" style={{ alignItems: 'center', gap: 12, paddingVertical: 24 }}>
          <Sprout size={96} mood="sleepy" />
          <Txt v="h2" center>
            {t('fasting_adults_title')}
          </Txt>
          <Txt v="sub" center>
            {t('fasting_adults_text')}
          </Txt>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen style={{ paddingTop: insets.top + 12 }} bottomInset={TAB_BAR_SPACE} appear>
      <Txt v="title">{t('tab_fasting')}</Txt>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {FASTING_PLANS.map((p) => (
          <Chip
            key={p.id}
            label={p.id}
            selected={p.id === plan.id}
            onPress={() => {
              if (active) {
                showAlert(t('plan_locked'), t('plan_locked_text'));
                return;
              }
              // Switching e.g. from 5:2 to 6:1 keeps only as many fasting days as the new plan allows.
              updateProfile({
                fastingPlanId: p.id,
                ...(p.kind === 'weekly' ? { fastingDays: activeFastingDays({ fastingPlanId: p.id, fastingDays: profile.fastingDays }) } : {}),
              });
            }}
          />
        ))}
      </ScrollView>
      <Txt v="sub">
        {plan.kind === 'daily'
          ? t('plan_daily_desc', { fast: plan.fastHours!, eat: 24 - plan.fastHours! })
          : t('plan_weekly_desc', { days: plan.fastDays!, kcal: fastingDayKcal(profile.sex) })}
      </Txt>

      {plan.kind === 'daily' || active ? (
        <Card tone="night" r="xl" style={{ alignItems: 'center', gap: 16, paddingVertical: 28 }}>
          <Ring
            size={250}
            stroke={16}
            progress={progress}
            color={progress >= 1 ? c.carbs : c.nightText}
            overflowColor={c.carbs}
            trackColor="#ffffff1f"
          >
            {active ? (
              <>
                <Txt v="small" color={c.nightText}>
                  {t('elapsed')}
                </Txt>
                <Txt v="big" color={c.nightText} style={{ fontVariant: ['tabular-nums'] }}>
                  {formatDuration(elapsedMs)}
                </Txt>
                <Txt v="sub" color={c.nightText}>
                  {remainingMs > 0 ? t('remaining', { time: formatDuration(remainingMs) }) : t('goal_reached')}
                </Txt>
              </>
            ) : (
              <>
                <Sprout size={78} mood="sleepy" />
                <Txt v="h2" color={c.nightText}>
                  {t('ready_to_fast')}
                </Txt>
                <Txt v="sub" color={c.nightText}>
                  {t('target_hours', { h: targetHours })}
                </Txt>
              </>
            )}
          </Ring>
          {active ? (
            <>
              <Row gap={8}>
                <Button small kind="night" title="−30 min" onPress={() => shiftStart(-30)} />
                <Txt v="sub" color={c.nightText}>
                  {t('started_at', { time: formatTime(active.start, lang) })}
                </Txt>
                <Button small kind="night" title="+30 min" onPress={() => shiftStart(30)} />
              </Row>
              <Txt v="sub" color={c.nightText}>
                {t('ends_at', { time: formatTime(active.start + active.targetHours * 3600000, lang) })}
              </Txt>
              <Button title={t('end_fast')} icon="sunny" kind="night" onPress={stop} style={{ alignSelf: 'stretch' }} />
            </>
          ) : (
            <Button title={t('start_fast')} icon="moon" kind="night" onPress={start} style={{ alignSelf: 'stretch' }} />
          )}
        </Card>
      ) : null}

      {active ? (
        <Card r="l">
          <Row>
            <Ionicons name="sparkles" size={20} color={c.protein} />
            <Txt v="h3">{t(stage.key)}</Txt>
          </Row>
          <Txt v="sub">{t(`${stage.key}_text`)}</Txt>
          <Txt v="small">{t('stages_disclaimer')}</Txt>
        </Card>
      ) : null}

      {plan.kind === 'weekly' ? (
        <Card style={{ gap: 12 }}>
          <Txt v="h3">{t('fasting_days')}</Txt>
          <Row gap={6} style={{ flexWrap: 'wrap' }}>
            {WEEK_ORDER.map((d) => (
              <Chip key={d} label={weekdayName(d)} selected={selectedDays.includes(d)} onPress={() => toggleDay(d)} />
            ))}
          </Row>
          <Txt v="small">{t('fasting_days_hint', { n: plan.fastDays! })}</Txt>
          <Banner
            icon={todayIsFastDay ? 'leaf' : 'restaurant'}
            text={todayIsFastDay ? t('today_fast_day', { kcal: fastingDayKcal(profile.sex) }) : t('today_normal_day')}
          />
        </Card>
      ) : null}

      <Row gap={12}>
        <Card style={{ flex: 1, alignItems: 'center' }}>
          <Txt v="h2">{completedFasts(history)}</Txt>
          <Txt v="small" center>
            {t('fasts_completed')}
          </Txt>
        </Card>
        <Card style={{ flex: 1, alignItems: 'center' }}>
          <Txt v="h2">{longestFastHours(history).toFixed(1).replace('.', lang === 'de' ? ',' : '.')} h</Txt>
          <Txt v="small" center>
            {t('longest_fast')}
          </Txt>
        </Card>
      </Row>

      {history.length > 0 ? (
        <>
          <SectionTitle>{t('history')}</SectionTitle>
          <Card>
            {history.slice(0, 14).map((s, i) => {
              const hours = sessionHours(s);
              const reached = hours >= s.targetHours;
              return (
                <View key={s.id}>
                  {i > 0 ? <Divider /> : null}
                  <ListRow
                    title={`${formatShortDate(dayKey(new Date(s.start)), lang)} · ${formatTime(s.start, lang)}`}
                    subtitle={`${formatDuration(hours * 3600000)} / ${s.targetHours} h`}
                    right={<Ionicons name={reached ? 'checkmark-circle' : 'close-circle-outline'} size={22} color={reached ? c.accent : c.sub} />}
                    onLongPress={() =>
                      showAlert(t('delete_fast_q'), undefined, [
                        { text: t('cancel'), style: 'cancel' },
                        { text: t('delete'), style: 'destructive', onPress: () => removeFast(s.id) },
                      ])
                    }
                  />
                </View>
              );
            })}
          </Card>
          <Txt v="small">{t('long_press_delete')}</Txt>
        </>
      ) : null}
    </Screen>
  );
}
