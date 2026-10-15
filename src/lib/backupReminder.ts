/**
 * When to remind people to export a backup. All data lives only on the device (and on the web,
 * deleting the home-screen icon deletes it), so an export file is the only copy that survives.
 */

const DAY = 24 * 60 * 60 * 1000;

/** The first reminder comes this many days after the profile was created, if nothing was exported yet. */
export const FIRST_BACKUP_AFTER_DAYS = 14;
/** After an export, the next reminder comes this many days later. */
export const BACKUP_INTERVAL_DAYS = 30;
/** "Later" hides the reminder for this many days. */
export const BACKUP_SNOOZE_DAYS = 7;

export interface BackupReminderState {
  /** When the profile was created (ms), or null when there is no profile. */
  since: number | null;
  /** Last export (or import of a backup file), ms. */
  lastBackupAt: number | null;
  /** The reminder stays hidden until then, ms. */
  snoozedUntil: number | null;
}

/** Whether the diary should show the backup reminder now. */
export function backupDue(now: number, s: BackupReminderState): boolean {
  if (s.since == null) return false;
  if (s.snoozedUntil != null && now < s.snoozedUntil) return false;
  if (s.lastBackupAt == null) return now - s.since >= FIRST_BACKUP_AFTER_DAYS * DAY;
  return now - s.lastBackupAt >= BACKUP_INTERVAL_DAYS * DAY;
}

/** Whole days since `ts` (0 = within the last 24 hours); null when there was no backup yet. */
export function daysSinceBackup(now: number, ts: number | null): number | null {
  if (ts == null) return null;
  return Math.max(0, Math.floor((now - ts) / DAY));
}

/** When a snooze that starts now ends. */
export const snoozeEnd = (now: number) => now + BACKUP_SNOOZE_DAYS * DAY;
