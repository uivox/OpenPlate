import { router } from 'expo-router';
import { showAlert } from '../lib/alert';
import { MAX_BACKUP_BYTES, parseBackupReport, type BackupReport } from '../lib/backup';
import { isEncryptedBackup } from '../lib/backupCrypto';
import { cancelNotification, pickTextFile } from '../lib/device';
import { useStore } from '../lib/store';
import type { TFn } from '../lib/useT';

/** An encrypted file waiting for its password on the password screen. Kept in memory only, never in route params. */
let pendingEncrypted: string | null = null;

export function takePendingEncrypted(): string | null {
  const v = pendingEncrypted;
  pendingEncrypted = null;
  return v;
}

/**
 * Picks an export file, asks before replacing everything, then imports it. Everything in the file
 * is checked first (backup.ts); AI server addresses and API keys are never taken from a file. An
 * encrypted backup goes to the password screen first, which hands the decrypted text to `importBackupText`.
 */
export async function importBackupFlow(t: TFn): Promise<void> {
  let text: string | null;
  try {
    text = await pickTextFile();
  } catch (e) {
    showAlert((e as Error)?.message === 'FILE_TOO_LARGE' ? t('import_too_large', { mb: MAX_BACKUP_BYTES / 1024 / 1024 }) : t('import_invalid'));
    return;
  }
  if (!text) return;
  if (isEncryptedBackup(text)) {
    pendingEncrypted = text;
    router.push({ pathname: '/backup-password', params: { mode: 'import' } });
    return;
  }
  importBackupText(text, t);
}

/** Checks a backup's JSON and asks before replacing everything with it. */
export function importBackupText(text: string, t: TFn): void {
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
        const done = [t('import_done'), skipped ? t('import_skipped', { n: skipped }) : '', t('import_done_setup')].filter(Boolean).join('\n\n');
        if (data.profile) {
          router.replace('/');
          showAlert(done);
        } else router.replace('/onboarding');
      },
    },
  ]);
}
