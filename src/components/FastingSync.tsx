import { useEffect } from 'react';
import { AppState } from 'react-native';
import { formatTime } from '../lib/dates';
import { syncFastNotices } from '../lib/device';
import { planFastNotices, syncSchedule } from '../lib/fasting';
import { translate, type TKey } from '../lib/i18n';
import { newId } from '../lib/id';
import type { ScheduledReminder } from '../lib/reminders';
import { useStore } from '../lib/store';
import { resolveLang } from '../lib/useT';

/** Starts, ends and fills in the fixed eating window's fasts (fasting.ts syncSchedule). */
export function syncFastingNow(now = Date.now()): void {
  const s = useStore.getState();
  if (!s.profile) return;
  const r = syncSchedule({ schedule: s.fastingSchedule, profile: s.profile, active: s.fastingActive, history: s.fastingHistory, now, newId });
  if (r.changed) s.applyScheduleSync(r);
}

let running: Promise<void> = Promise.resolve();
let again = false;

/** Brings the pending window notices in step with the schedule and the running fast. Calls never overlap. */
export function rescheduleFastNotices(): Promise<void> {
  again = true;
  running = running.then(async () => {
    if (!again) return;
    again = false;
    const s = useStore.getState();
    const lang = resolveLang(s.language);
    const t = (k: TKey, p?: Record<string, string | number>) => translate(lang, k, p);
    const notices = s.profile ? planFastNotices({ schedule: s.fastingSchedule, profile: s.profile, active: s.fastingActive, now: Date.now() }) : [];
    const wanted: ScheduledReminder[] = notices.map((n) =>
      n.kind === 'close'
        ? { id: n.id, at: n.at, title: t('notif_window_close_title'), body: t('notif_window_close_body', { time: formatTime(n.fastStart!, lang) }) }
        : { id: n.id, at: n.at, title: t('notif_fast_done_title'), body: t('notif_fast_done_body', { h: n.value }) },
    );
    await syncFastNotices(wanted);
  });
  return running;
}

/**
 * Keeps the fixed eating window running (rendered once in the root layout, after the data is
 * loaded): on start, every minute, when the app comes back to the front, and after changes to the
 * schedule, the plan or the running fast. Fasts that happened while the app was closed are filled
 * in on the next open.
 */
export function FastingSync() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      syncFastingNow();
      void rescheduleFastNotices();
    };
    const soon = () => {
      clearTimeout(timer);
      timer = setTimeout(tick, 300);
    };
    tick();
    const unsub = useStore.subscribe((s, prev) => {
      if (
        s.fastingSchedule !== prev.fastingSchedule ||
        s.fastingActive !== prev.fastingActive ||
        s.profile?.fastingPlanId !== prev.profile?.fastingPlanId ||
        s.language !== prev.language
      )
        soon();
    });
    const app = AppState.addEventListener('change', (st) => {
      if (st === 'active') soon();
    });
    const minute = setInterval(tick, 60000);
    return () => {
      clearTimeout(timer);
      unsub();
      app.remove();
      clearInterval(minute);
    };
  }, []);
  return null;
}
