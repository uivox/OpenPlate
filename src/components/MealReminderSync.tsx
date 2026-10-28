import { router, useRootNavigationState } from 'expo-router';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { onReminderOpened, syncReminders } from '../lib/device';
import { upcomingFasts } from '../lib/fasting';
import { dayGoal } from '../lib/goals';
import { mealSplitOf } from '../lib/mealSplit';
import { translate, type TKey } from '../lib/i18n';
import { planReminders, reminderText, type ReminderNotice } from '../lib/reminders';
import { hideNotificationNumbers } from '../lib/security';
import { useStore } from '../lib/store';
import { resolveLang } from '../lib/useT';

/** Every pending reminder as it should be right now, with its text in the app's language. */
function wantedReminders(): { wanted: ReminderNotice[]; logNow: string } {
  const s = useStore.getState();
  const lang = resolveLang(s.language);
  const t = (k: TKey, p?: Record<string, string | number>) => translate(lang, k, p);
  const profile = s.profile;
  const hideNumbers = hideNotificationNumbers(s.security);
  const plan = profile
    ? planReminders({
        prefs: s.reminders,
        entries: s.entries,
        goalFor: (date) => dayGoal(profile, s.weights, date).kcal,
        fast: s.fastingActive,
        fasts: upcomingFasts({ schedule: s.fastingSchedule, profile, active: s.fastingActive, now: Date.now() }),
        split: mealSplitOf(profile),
        now: Date.now(),
      })
    : [];
  return { wanted: plan.map((r) => ({ id: r.id, at: r.at, meal: r.meal, date: r.date, ...reminderText(r, t, lang, hideNumbers) })), logNow: t('reminder_log_now') };
}

let running: Promise<void> = Promise.resolve();
let again = false;

/** Brings the phone's (or browser's) pending reminders in step with the data. Calls never overlap. */
export function rescheduleReminders(): Promise<void> {
  again = true;
  running = running.then(async () => {
    if (!again) return;
    again = false;
    const { wanted, logNow } = wantedReminders();
    await syncReminders(wanted, logNow);
  });
  return running;
}

/**
 * Keeps meal reminders scheduled (rendered once in the root layout, after the data is loaded):
 * after every change to the diary, the reminder settings, goals, fasting or the language, when the
 * app comes back to the front (also after a timezone or daylight-saving change), and every hour.
 * A tap on a reminder opens the add screen for that meal and day.
 */
export function MealReminderSync() {
  const navReady = !!useRootNavigationState()?.key;

  useEffect(() => {
    if (!navReady) return;
    return onReminderOpened(({ meal, date }) => {
      if (useStore.getState().profile) router.push({ pathname: '/add-food', params: { meal, date } });
    });
  }, [navReady]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const soon = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void rescheduleReminders(), 400);
    };
    void rescheduleReminders();
    const unsub = useStore.subscribe((s, prev) => {
      if (
        s.entries !== prev.entries ||
        s.reminders !== prev.reminders ||
        s.profile !== prev.profile ||
        s.weights !== prev.weights ||
        s.fastingActive !== prev.fastingActive ||
        s.fastingSchedule !== prev.fastingSchedule ||
        s.language !== prev.language ||
        hideNotificationNumbers(s.security) !== hideNotificationNumbers(prev.security)
      )
        soon();
    });
    const app = AppState.addEventListener('change', (st) => {
      if (st === 'active') soon();
    });
    const hourly = setInterval(() => void rescheduleReminders(), 3600000);
    return () => {
      clearTimeout(timer);
      unsub();
      app.remove();
      clearInterval(hourly);
    };
  }, []);

  return null;
}
