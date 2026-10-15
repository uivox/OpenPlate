import { router } from 'expo-router';
import { showAlert } from '../lib/alert';
import { parseBackupReport, type BackupReport } from '../lib/backup';
import { cancelNotification, pickTextFile } from '../lib/device';
import { useStore } from '../lib/store';
import type { TFn } from '../lib/useT';

/**
 * Picks an export file, asks before replacing everything, then imports it. Everything in the file
 * is checked first (backup.ts); AI server addresses and API keys are never taken from a file.
 */
export async function importBackupFlow(t: TFn): Promise<void> {
  let text: string | null;
  try {
    text = await pickTextFile();
  } catch {
    showAlert(t('import_invalid'));
    return;
  }
  if (!text) return;
  let report: BackupReport | null = null;
  try {
    report = parseBackupReport(text);
  } catch {
    report = null;
  }
  if (!report) {
    showAlert(t('import_invalid'));
    return;
  }
  const { data, skipped } = report;
  showAlert(t('import_q'), t('import_text', { n: data.entries.length }), [
    { text: t('cancel'), style: 'cancel' },
    {
      text: t('import_replace'),
      style: 'destructive',
      onPress: async () => {
        // The reminder of a fast running here belongs to data that is about to be replaced.
        await cancelNotification(useStore.getState().fastingActive?.notificationId).catch(() => {});
        useStore.getState().importBackup(data);
        const done = skipped ? `${t('import_done')}\n${t('import_skipped', { n: skipped })}` : t('import_done');
        if (data.profile) {
          router.replace('/');
          showAlert(done);
        } else router.replace('/onboarding');
      },
    },
  ]);
}
