import { useEffect, useSyncExternalStore } from 'react';
import type { OffLogin } from '../lib/offWrite';
import { getOffLogin, setOffLogin } from '../lib/secure';

/**
 * The Open Food Facts login for this device, read once from secure storage and shared by the
 * screens that need it (Profile → Open Food Facts, the food screen, the send preview).
 * `undefined` while it is still being read.
 */
let current: OffLogin | null | undefined;
let reading: Promise<void> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function load() {
  reading ??= getOffLogin().then((l) => {
    current = l;
    emit();
  });
}

export function useOffLogin(): OffLogin | null | undefined {
  useEffect(load, []);
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => current,
  );
}

export async function saveOffLogin(login: OffLogin | null): Promise<void> {
  await setOffLogin(login);
  current = login;
  emit();
}

/** After "Delete all data" (the secure storage was cleared there already). */
export function forgetOffLogin() {
  current = null;
  emit();
}
