import { router } from 'expo-router';
import { showAlert } from '../lib/alert';
import { cancelNotification } from '../lib/device';
import { removePack } from '../lib/packRuntime';
import { clearAllKeys } from '../lib/secure';
import { useStore } from '../lib/store';
import type { TFn } from '../lib/useT';
import { deleteAILog } from './aiLogging';
import { forgetOffLogin } from './offLogin';

/**
 * *Delete everything* (Profile and Your data): asks first, then removes the diary and settings, API
 * keys and the Open Food Facts login, the offline pack, the AI answer log, the connection log and
 * the app lock (including the browser's passkey id), and starts onboarding again.
 */
export function deleteEverythingFlow(t: TFn, afterwards?: () => void): void {
  showAlert(t('delete_all_q'), t('delete_all_text'), [
    { text: t('cancel'), style: 'cancel' },
    {
      text: t('delete_all'),
      style: 'destructive',
      onPress: async () => {
        await clearAllKeys();
        forgetOffLogin();
        await removePack().catch(() => {});
        await deleteAILog().catch(() => {});
        // A running fast's reminder must not fire after its data is gone.
        await cancelNotification(useStore.getState().fastingActive?.notificationId).catch(() => {});
        useStore.getState().resetAll();
        afterwards?.();
        router.replace('/onboarding');
      },
    },
  ]);
}
