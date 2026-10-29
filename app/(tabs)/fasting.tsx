import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import { ScrollView, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ring } from '../../src/components/Ring';
import { Sprout } from '../../src/components/Sprout';
import { TAB_BAR_SPACE } from '../../src/components/TabBar';
import { TimeField } from '../../src/components/TimeField';
import { Banner, Button, Card, Chip, ChipGroup, Divider, IconButton, ListRow, NumField, Row, Screen, SectionTitle, Txt } from '../../src/components/ui';
import { showAlert } from '../../src/lib/alert';
import { dayKey, formatDuration, formatShortDate, formatTime, locale } from '../../src/lib/dates';
import { askNotifications, cancelNotification, notifiesWhenClosed, scheduleAt } from '../../src/lib/device';
import {
  activeFastingDays,
  CLOSE_LEAD_MAX,
  CLOSE_LEAD_MIN,
  CLOSE_LEADS,
  closesAt,
  completedFasts,
  FASTING_PLANS,
  handledFromNow,
  isFastingDay,
  longestFastHours,
  planById,
  plannedEnd,
  scheduledFastAt,
  scheduledFastsBetween,
  sessionHours,
  stageFor,
  windowFastHours,
} from '../../src/lib/fasting';
import { useNow } from '../../src/lib/hooks';
import { fastingDayKcal, isAdult } from '../../src/lib/nutrition';
import { clockText } from '../../src/lib/reminders';
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
  const discardActiveFast = useStore((s) => s.discardActiveFast);
  const schedule = useStore((s) => s.fastingSchedule);
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
    if (active.scheduledFor) {
      // The eating window's own "fast done" notice follows the change (FastingSync).
      updateActiveFast({ start: newStart });
      return;
    }
    await cancelNotification(active.notificationId);
    const notificationId = await notify(newStart, active.targetHours);
    updateActiveFast({ start: newStart, notificationId });
  };

  /** Today only: the schedule itself stays as it is. */
  const extend = () => {
    if (!active) return;
    const end = plannedEnd(active);
    showAlert(t('fast_extend_q'), undefined, [
      ...[1, 2, 4].map((h) => ({
        text: `+${h} h · ${t('fast_extend_to', { time: formatTime(end + h * 3600000, lang) })}`,
        onPress: () => updateActiveFast({ targetHours: active.targetHours + h }),
      })),
      { text: t('cancel'), style: 'cancel' as const },
    ]);
  };

  const skip = () =>
    showAlert(t('fast_skip_q'), t('fast_skip_text'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('fast_skip_do'),
        style: 'destructive',
        onPress: () => {
          void cancelNotification(active?.notificationId);
          discardActiveFast();
        },
      },
    ]);

  const fastHours = windowFastHours(plan.id);
  const windowOn = schedule.enabled && fastHours !== null;
  const nextFastStart =
    windowOn && !active && !scheduledFastAt(now, schedule.opensAt, fastHours)
      ? scheduledFastsBetween(now, now + 86400000 * 2, schedule.opensAt, fastHours).find((f) => f.start > now)?.start
      : undefined;

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
                {nextFastStart ? (
                  <Txt v="small" color={c.nightText} center>
                    {t('window_open_now', { time: formatTime(nextFastStart, lang) })}
                  </Txt>
                ) : null}
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
              {notifiesWhenClosed ? null : (
                <Txt v="small" color={c.nightText} center>
                  {t('notif_open_only')}
                </Txt>
              )}
              <Button title={t('end_fast')} icon="sunny" kind="night" onPress={stop} style={{ alignSelf: 'stretch' }} />
              {active.scheduledFor ? (
                <>
                  <Txt v="small" color={c.nightText}>
                    {t('window_from_schedule')}
                  </Txt>
                  <Row gap={8}>
                    <Button small kind="night" icon="time-outline" title={t('fast_extend')} onPress={extend} />
                    <Button small kind="night" icon="play-skip-forward-outline" title={t('fast_skip')} onPress={skip} />
                  </Row>
                </>
              ) : null}
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

      {fastHours !== null ? <EatingWindowCard fastHours={fastHours} /> : null}

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
                    subtitle={`${formatDuration(hours * 3600000)} / ${hoursText(s.targetHours, lang)} h`}
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

const hoursText = (h: number, lang: 'de' | 'en') =>
  Number.isInteger(h) ? String(h) : h.toFixed(1).replace('.', lang === 'de' ? ',' : '.');

type LeadChoice = (typeof CLOSE_LEADS)[number] | 'custom';

/** Fixed eating window (daily plans): opening time, notices and strict mode. Fasts then run by themselves. */
function EatingWindowCard({ fastHours }: { fastHours: number }) {
  const { t } = useT();
  const c = useColors();
  const schedule = useStore((s) => s.fastingSchedule);
  const setSchedule = useStore((s) => s.setFastingSchedule);
  const active = useStore((s) => s.fastingActive);
  const [invalid, setInvalid] = useState(false);
  const [leadChoice, setLeadChoice] = useState<LeadChoice>((CLOSE_LEADS as readonly number[]).includes(schedule.closeLead) ? (schedule.closeLead as LeadChoice) : 'custom');

  const turn = async (on: boolean) => {
    if (!on) {
      setSchedule({ enabled: false });
      return;
    }
    // The fast going on right now (by the new window) still starts, unless another fast is running.
    setSchedule({ enabled: true, handledUntil: handledFromNow(Date.now(), schedule.opensAt, fastHours) });
    if (schedule.doneNotice || schedule.closeNotice) await askNotifications();
  };
  const setOpens = (opensAt: number) => {
    const m = ((opensAt % 1440) + 1440) % 1440;
    setSchedule(active ? { opensAt: m } : { opensAt: m, handledUntil: handledFromNow(Date.now(), m, fastHours) });
  };
  const setNotice = async (patch: { closeNotice?: boolean; doneNotice?: boolean }) => {
    setSchedule(patch);
    if (patch.closeNotice || patch.doneNotice) await askNotifications();
  };

  const from = clockText(schedule.opensAt);
  const to = clockText(closesAt(schedule.opensAt, fastHours));
  return (
    <Card style={{ gap: 12 }}>
      <Row gap={12}>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt v="h3">{t('window_title')}</Txt>
          <Txt v="small">{t('window_sub')}</Txt>
        </View>
        <Switch
          value={schedule.enabled}
          onValueChange={(on) => void turn(on)}
          trackColor={{ true: c.accent }}
          accessibilityLabel={t('window_title')}
          testID="window-switch"
        />
      </Row>
      {schedule.enabled ? (
        <>
          <Row gap={6}>
            <Txt v="label" style={{ flex: 1 }}>
              {t('window_opens')}
            </Txt>
            <IconButton icon="remove" size={18} border={c.line} color={c.text} label={t('window_earlier')} onPress={() => setOpens(schedule.opensAt - 30)} />
            <TimeField value={schedule.opensAt} label={t('window_time_of')} onChange={setOpens} onInvalid={setInvalid} testID="window-opens" />
            <IconButton icon="add" size={18} border={c.line} color={c.text} label={t('window_later')} onPress={() => setOpens(schedule.opensAt + 30)} />
          </Row>
          {invalid ? (
            <Txt v="small" color={c.danger}>
              {t('reminders_time_invalid')}
            </Txt>
          ) : null}
          <Banner icon="time-outline" text={t('window_range', { from, to })} />
          {active && !active.scheduledFor ? <Txt v="small">{t('window_manual_running')}</Txt> : null}

          <Divider />
          <Row gap={12}>
            <Txt v="body" style={{ flex: 1 }}>
              {t('window_close_notice')}
            </Txt>
            <Switch
              value={schedule.closeNotice}
              onValueChange={(on) => void setNotice({ closeNotice: on })}
              trackColor={{ true: c.accent }}
              accessibilityLabel={t('window_close_notice')}
              testID="window-close-switch"
            />
          </Row>
          {schedule.closeNotice ? (
            <>
              <ChipGroup<LeadChoice>
                options={[
                  ...CLOSE_LEADS.map((n) => ({ value: n as LeadChoice, label: t('window_close_lead', { n }) })),
                  { value: 'custom', label: t('window_close_custom') },
                ]}
                value={leadChoice}
                onChange={(v) => {
                  setLeadChoice(v);
                  if (v !== 'custom') setSchedule({ closeLead: v });
                }}
              />
              {leadChoice === 'custom' ? (
                <NumField
                  label={t('window_close_custom_label')}
                  value={schedule.closeLead}
                  decimals={false}
                  suffix="min"
                  onChange={(v) => {
                    if (v !== null && v >= CLOSE_LEAD_MIN && v <= CLOSE_LEAD_MAX) setSchedule({ closeLead: v });
                  }}
                  hint={t('window_close_custom_invalid')}
                />
              ) : null}
            </>
          ) : null}
          <Row gap={12}>
            <Txt v="body" style={{ flex: 1 }}>
              {t('window_done_notice')}
            </Txt>
            <Switch
              value={schedule.doneNotice}
              onValueChange={(on) => void setNotice({ doneNotice: on })}
              trackColor={{ true: c.accent }}
              accessibilityLabel={t('window_done_notice')}
            />
          </Row>
          {notifiesWhenClosed ? null : <Txt v="small">{t('notif_open_only')}</Txt>}

          <Divider />
          <Row gap={12}>
            <View style={{ flex: 1, gap: 2 }}>
              <Txt v="body">{t('window_strict')}</Txt>
              <Txt v="small">{t('window_strict_sub')}</Txt>
            </View>
            <Switch
              value={schedule.strict}
              onValueChange={(strict) => setSchedule({ strict })}
              trackColor={{ true: c.accent }}
              accessibilityLabel={t('window_strict')}
              testID="window-strict-switch"
            />
          </Row>
        </>
      ) : null}
    </Card>
  );
}
