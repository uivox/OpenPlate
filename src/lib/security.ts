/**
 * Settings for the app lock, encrypted backups and the connection log, and the lock's timing.
 * Per device: never part of a backup, so importing a file can't switch the lock off. Pure: no
 * React Native imports.
 */

export type LockAfter = 0 | 1 | 5 | 15;
export const LOCK_AFTER_OPTIONS: LockAfter[] = [0, 1, 5, 15];

export interface SecurityPrefs {
  /** App lock (Face ID / fingerprint / device PIN; a passkey in the browser). Off by default. */
  lock: boolean;
  /** Minutes in the background before the lock comes back (0 = immediately). */
  lockAfter: LockAfter;
  /** Show figures in notifications while the lock is on (they use plain texts otherwise). */
  lockShowNumbers: boolean;
  /** Web: id of the passkey made when the lock was turned on (base64url). */
  webCredentialId?: string;
  /** Ask for a password and encrypt every backup. */
  encryptBackups: boolean;
  /** Keep the 7-day connection log. On by default: it holds no contents. */
  logConnections: boolean;
}

export const DEFAULT_SECURITY: SecurityPrefs = {
  lock: false,
  lockAfter: 1,
  lockShowNumbers: false,
  encryptBackups: false,
  logConnections: true,
};

export function normalizeSecurity(v: unknown): SecurityPrefs {
  const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  const after = LOCK_AFTER_OPTIONS.includes(o.lockAfter as LockAfter) ? (o.lockAfter as LockAfter) : DEFAULT_SECURITY.lockAfter;
  return {
    lock: o.lock === true,
    lockAfter: after,
    lockShowNumbers: o.lockShowNumbers === true,
    ...(typeof o.webCredentialId === 'string' && o.webCredentialId ? { webCredentialId: o.webCredentialId } : {}),
    encryptBackups: o.encryptBackups === true,
    logConnections: o.logConnections !== false,
  };
}

/**
 * Whether the app has to be unlocked when it comes back to the front. `leftAt` is when it went to
 * the background (null: it never left since the last unlock).
 */
export function lockDue(prefs: Pick<SecurityPrefs, 'lock' | 'lockAfter'>, leftAt: number | null, now: number): boolean {
  if (!prefs.lock || leftAt === null) return false;
  // A clock set back counts as time passed: lock rather than trust it.
  if (now < leftAt) return true;
  return now - leftAt >= prefs.lockAfter * 60_000;
}

/** Notifications use their plain texts (no calories) while the lock is on, unless the user chose figures. */
export function hideNotificationNumbers(prefs: Pick<SecurityPrefs, 'lock' | 'lockShowNumbers'>): boolean {
  return prefs.lock && !prefs.lockShowNumbers;
}
