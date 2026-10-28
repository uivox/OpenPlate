import { router } from 'expo-router';
import { buildBackup } from '../lib/backup';
import { dayKey } from '../lib/dates';
import { shareExport } from '../lib/device';
import { useStore } from '../lib/store';

export const backupFileName = () => `openplate-export-${dayKey()}.json`;

/** The backup as JSON text (API keys, the app lock and the connection log are never part of it). */
export const backupJson = () => JSON.stringify(buildBackup(useStore.getState()), null, 2);

/**
 * Exports everything as a JSON file and remembers when, for the backup reminder. With *Encrypt
 * backups* on, the password screen takes over (it encrypts first, then shares from a second tap).
 * Otherwise nothing is awaited before shareExport: Safari only opens the share sheet straight from the tap.
 */
export async function exportBackupFlow(): Promise<void> {
  if (useStore.getState().security.encryptBackups) {
    router.push({ pathname: '/backup-password', params: { mode: 'export' } });
    return;
  }
  const done = await shareExport(backupJson(), backupFileName());
  if (done) useStore.getState().markBackedUp();
}
