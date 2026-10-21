import * as Haptics from 'expo-haptics';
import { showAlert, type DialogButton } from '../lib/alert';
import { formatTime } from '../lib/dates';
import { cancelNotification } from '../lib/device';
import { fastCheck } from '../lib/fasting';
import { translate, type TKey } from '../lib/i18n';
import { useStore } from '../lib/store';
import { resolveLang } from '../lib/useT';

/**
 * The one check every way of logging food goes through (search, barcode, saved meals, recipes,
 * quick add, label and meal photos, copying a meal): while a fast is running, adding food to today
 * first asks *Log anyway* (the fast keeps running) or *End fast & log*. In strict mode only the
 * latter. Other days and water are never asked about (fasting.ts `fastCheck`).
 */
export function confirmLogging(date: string, proceed: () => void): void {
  const s = useStore.getState();
  const check = fastCheck(s.fastingActive, date, Date.now(), s.fastingSchedule.enabled && s.fastingSchedule.strict);
  if (!check) {
    proceed();
    return;
  }
  const lang = resolveLang(s.language);
  const t = (k: TKey, p?: Record<string, string | number>) => translate(lang, k, p);
  const endAndLog = () => {
    const st = useStore.getState();
    void cancelNotification(st.fastingActive?.notificationId);
    st.endFast(Date.now());
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    proceed();
  };
  const buttons: DialogButton[] = [{ text: t('cancel'), style: 'cancel' }];
  if (!check.strict) buttons.push({ text: t('fast_log_anyway'), onPress: proceed });
  buttons.push({ text: t('fast_end_and_log'), onPress: endAndLog });
  showAlert(
    check.reached ? t('fast_log_title_reached') : t('fast_log_title', { time: formatTime(check.until, lang) }),
    check.strict ? t('fast_log_text_strict') : t('fast_log_text'),
    buttons,
  );
}
