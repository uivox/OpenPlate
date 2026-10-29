import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, Switch, View } from 'react-native';
import { rescheduleReminders } from '../src/components/MealReminderSync';
import { TimeField } from '../src/components/TimeField';
import { Banner, Button, Card, ChipGroup, Divider, IconButton, Row, Screen, SectionTitle, Tile, Txt, type IconName } from '../src/components/ui';
import { dayKey } from '../src/lib/dates';
import { minutesInsideFast, scheduleActive, windowFastHours } from '../src/lib/fasting';
import { askNotifications, notificationAccess, notifiesWhenClosed, openNotificationSettings } from '../src/lib/device';
import {
  clockText,
  firstSetupTimes,
  REMINDER_DELAYS,
  suggestAll,
  suggestionHint,
  type NotificationAccess,
  type ReminderDelay,
} from '../src/lib/reminders';
import { useStore } from '../src/lib/store';
import { useColors } from '../src/lib/theme';
import { MEALS, type MealType } from '../src/lib/types';
import { useT } from '../src/lib/useT';

const MEAL_ICONS: Record<MealType, IconName> = { breakfast: 'sunny', lunch: 'leaf', dinner: 'moon', snack: 'ice-cream' };

/** The phone's (or browser's) notification permission, re-read on focus and when the app comes back. */
function useNotificationAccess(): [NotificationAccess | null, () => void] {
  const [access, setAccess] = useState<NotificationAccess | null>(null);
  const refresh = useCallback(() => {
    notificationAccess().then(setAccess);
  }, []);
  useFocusEffect(refresh);
  useEffect(() => {
    // Back from the system settings: notifications may have been allowed again.
    const sub = AppState.addEventListener('change', (st) => {
      if (st !== 'active') return;
      refresh();
      void rescheduleReminders();
    });
    return () => sub.remove();
  }, [refresh]);
  return [access, refresh];
}

/** Settings → Meal reminders: on/off, a time per meal (with suggestions), the delay and the calorie option. */
export default function RemindersScreen() {
  const { t } = useT();
  const c = useColors();
  const prefs = useStore((s) => s.reminders);
  const setReminders = useStore((s) => s.setReminders);
  const entries = useStore((s) => s.entries);
  const suggestions = useMemo(() => suggestAll(entries, dayKey()), [entries]);
  const [access, refreshAccess] = useNotificationAccess();
  // With a fixed eating window, reminders that would come during the fast are held back; say so.
  const profile = useStore((s) => s.profile);
  const schedule = useStore((s) => s.fastingSchedule);
  const fastHours = profile && scheduleActive(schedule, profile) ? windowFastHours(profile.fastingPlanId) : null;
  const insideFastUntil = (meal: MealType): string | null =>
    fastHours !== null && minutesInsideFast(prefs.meals[meal].time + prefs.delay, schedule.opensAt, fastHours) ? clockText(schedule.opensAt) : null;
  const unavailable = access === 'needs_home_screen' || access === 'unsupported';

  const switchOn = async (on: boolean) => {
    if (!on) {
      setReminders({ enabled: false });
      return;
    }
    // The permission prompt comes now, not at app start. Declining keeps the settings; the screen then
    // says notifications are off, and reminders start once they are allowed.
    await askNotifications();
    const current = useStore.getState().reminders;
    const next = current.setUp ? current : firstSetupTimes(current, suggestions);
    setReminders({ ...next, enabled: true, hintDismissed: true });
    refreshAccess();
  };

  const setMeal = (meal: MealType, patch: Partial<{ on: boolean; time: number }>) =>
    setReminders({ meals: { ...prefs.meals, [meal]: { ...prefs.meals[meal], ...patch } } });

  return (
    <Screen>
      <Card>
        <Row gap={12}>
          <Txt v="h3" style={{ flex: 1 }}>
            {t('reminders_switch')}
          </Txt>
          <Switch
            value={prefs.enabled && !unavailable}
            disabled={unavailable || access === null}
            onValueChange={(on) => void switchOn(on)}
            trackColor={{ true: c.accent }}
            accessibilityLabel={t('reminders_switch')}
            testID="reminders-switch"
          />
        </Row>
        <Txt v="sub">{t('reminders_explain')}</Txt>
        {notifiesWhenClosed ? null : <Txt v="small">{t('reminders_web_open_only')}</Txt>}
      </Card>

      {access === 'needs_home_screen' ? <Banner icon="phone-portrait-outline" tone="warn" text={t('reminders_web_home_screen')} /> : null}
      {access === 'unsupported' ? <Banner icon="notifications-off-outline" tone="warn" text={t('reminders_web_unsupported')} /> : null}
      {prefs.enabled && access === 'denied' ? (
        <View style={{ gap: 8 }}>
          <Banner icon="notifications-off-outline" tone="warn" text={notifiesWhenClosed ? t('reminders_perm_off') : t('reminders_perm_web')} />
          {notifiesWhenClosed ? (
            <Button
              small
              kind="secondary"
              icon="settings-outline"
              title={t('reminders_open_settings')}
              style={{ alignSelf: 'flex-start' }}
              onPress={openNotificationSettings}
            />
          ) : null}
        </View>
      ) : null}

      {prefs.enabled && !unavailable ? (
        <>
          <SectionTitle>{t('reminders_times')}</SectionTitle>
          <Card style={{ gap: 0, paddingVertical: 6 }}>
            {MEALS.map((meal, i) => (
              <View key={meal}>
                {i > 0 ? <Divider /> : null}
                <MealRow
                  meal={meal}
                  on={prefs.meals[meal].on}
                  time={prefs.meals[meal].time}
                  suggestion={suggestionHint(prefs.meals[meal].time, suggestions[meal])}
                  insideFastUntil={insideFastUntil(meal)}
                  onChange={(patch) => setMeal(meal, patch)}
                />
              </View>
            ))}
          </Card>

          <Card style={{ gap: 10 }}>
            <Txt v="h3">{t('reminders_delay')}</Txt>
            <ChipGroup<ReminderDelay>
              options={REMINDER_DELAYS.map((n) => ({ value: n, label: t('reminders_delay_min', { n }) }))}
              value={prefs.delay}
              onChange={(delay) => setReminders({ delay })}
            />
            <Txt v="small">{t('reminders_delay_hint')}</Txt>
          </Card>

          <Card>
            <Row gap={12}>
              <Txt v="h3" style={{ flex: 1 }}>
                {t('reminders_adjust')}
              </Txt>
              <Switch
                value={prefs.adjust}
                onValueChange={(adjust) => setReminders({ adjust })}
                trackColor={{ true: c.accent }}
                accessibilityLabel={t('reminders_adjust')}
              />
            </Row>
            <Txt v="small">{t('reminders_adjust_hint')}</Txt>
          </Card>
          <Txt v="small">{t('reminders_quiet_note')}</Txt>
        </>
      ) : null}
    </Screen>
  );
}

function MealRow({
  meal,
  on,
  time,
  suggestion,
  insideFastUntil,
  onChange,
}: {
  meal: MealType;
  on: boolean;
  time: number;
  suggestion: number | null;
  /** The reminder falls inside the fixed eating window's fast, which ends at this time. */
  insideFastUntil: string | null;
  onChange: (patch: Partial<{ on: boolean; time: number }>) => void;
}) {
  const { t } = useT();
  const c = useColors();
  const name = t(`meal_${meal}`);
  const step = (d: number) => onChange({ time: (time + d + 1440) % 1440 });
  const [invalid, setInvalid] = useState(false);
  return (
    <View style={{ paddingVertical: 8, gap: 8 }}>
      <Row gap={12}>
        <Tile icon={MEAL_ICONS[meal]} bg={c.meal[meal].tile} color={c.meal[meal].icon} size={38} />
        <Txt v="h3" style={{ flex: 1, opacity: on ? 1 : 0.5 }}>
          {name}
        </Txt>
        <Switch
          value={on}
          onValueChange={(v) => onChange({ on: v })}
          trackColor={{ true: c.accent }}
          accessibilityLabel={name}
          testID={`reminder-on-${meal}`}
        />
      </Row>
      {on ? (
        <>
          <Row gap={6} style={{ paddingLeft: 50 }}>
            <IconButton icon="remove" size={18} border={c.line} color={c.text} label={`${t('reminders_earlier')}: ${name}`} onPress={() => step(-15)} />
            <TimeField
              value={time}
              label={t('reminders_time_of', { meal: name })}
              onChange={(v) => onChange({ time: v })}
              onInvalid={setInvalid}
              testID={`reminder-time-${meal}`}
            />
            <IconButton icon="add" size={18} border={c.line} color={c.text} label={`${t('reminders_later')}: ${name}`} onPress={() => step(15)} />
          </Row>
          {invalid ? (
            <Txt v="small" color={c.danger} style={{ paddingLeft: 50 }}>
              {t('reminders_time_invalid')}
            </Txt>
          ) : null}
          {insideFastUntil ? (
            <Row gap={6} style={{ paddingLeft: 50 }}>
              <Ionicons name="moon" size={14} color={c.sub} />
              <Txt v="small" style={{ flex: 1 }}>
                {t('reminder_inside_fast', { time: insideFastUntil })}
              </Txt>
            </Row>
          ) : null}
          {suggestion !== null ? (
            <Row gap={4} style={{ paddingLeft: 50 }}>
              <Txt v="small" style={{ flex: 1 }}>
                {t('reminders_suggest', { meal: t(`reminder_meal_${meal}`), time: clockText(suggestion) })}
              </Txt>
              <Button small kind="ghost" title={t('reminders_use')} onPress={() => onChange({ time: suggestion })} />
            </Row>
          ) : null}
        </>
      ) : null}
    </View>
  );
}
