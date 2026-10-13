import { router } from 'expo-router';
import { showAlert } from '../lib/alert';
import { parseBackup } from '../lib/backup';
import { pickTextFile } from '../lib/device';
import { useStore } from '../lib/store';
import type { TFn } from '../lib/useT';

/** Picks an export file, asks before replacing everything, then imports it (web build only; see canPickFiles). */
export async function importBackupFlow(t: TFn): Promise<void> {
  const text = await pickTextFile();
  if (!text) return;
  const data = (() => {
    try {
      return parseBackup(text);
    } catch {
      return null;
    }
  })();
  if (!data) {
    showAlert(t('import_invalid'));
    return;
  }
  showAlert(t('import_q'), t('import_text', { n: data.entries.length }), [
    { text: t('cancel'), style: 'cancel' },
    {
      text: t('import_replace'),
      style: 'destructive',
      onPress: () => {
        useStore.getState().importBackup(data);
        if (data.profile) {
          router.replace('/');
          showAlert(t('import_done'));
        } else router.replace('/onboarding');
      },
    },
  ]);
}
