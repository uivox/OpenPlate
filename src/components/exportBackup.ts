import { buildBackup } from '../lib/backup';
import { dayKey } from '../lib/dates';
import { shareExport } from '../lib/device';
import { useStore } from '../lib/store';

/**
 * Exports everything as a JSON file and remembers when, for the backup reminder. Nothing is
 * awaited before shareExport: Safari only opens the share sheet straight from the tap.
 */
export async function exportBackupFlow(): Promise<void> {
  const data = buildBackup(useStore.getState());
  const done = await shareExport(JSON.stringify(data, null, 2), `openplate-export-${dayKey()}.json`);
  if (done) useStore.getState().markBackedUp();
}
