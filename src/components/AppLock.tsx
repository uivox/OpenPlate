import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { lockAutoPrompt, lockAvailability, unlockApp } from '../lib/device';
import { lockDue } from '../lib/security';
import { useStore } from '../lib/store';
import { useColors } from '../lib/theme';
import { useT } from '../lib/useT';
import { deleteEverythingFlow } from './deleteEverything';
import { Sprout } from './Sprout';
import { Button, Txt } from './ui';

/**
 * The app lock (Profile → Your data → App lock), rendered once over everything in the root layout.
 * - Locked when the app starts and when it comes back after the chosen time in the background.
 * - While the app is in the background or the app switcher, the screen is covered, so its preview
 *   shows no diary.
 * - Phones ask for Face ID / fingerprint / PIN by themselves; the browser waits for a tap (passkey).
 * The lock keeps out someone holding the unlocked phone; the data itself is protected by the
 * phone's own encryption, which the screen says.
 */
export function AppLock() {
  const { t } = useT();
  const c = useColors();
  const enabled = useStore((s) => s.security.lock);
  const credentialId = useStore((s) => s.security.webCredentialId);
  const [locked, setLocked] = useState(enabled);
  const [covered, setCovered] = useState(false);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const leftAt = useRef<number | null>(null);
  const active = useRef(AppState.currentState === 'active' || AppState.currentState == null);
  // Face ID's own sheet sends the app to "inactive" and back: that must not count as leaving.
  const prompting = useRef(false);

  // Turning the lock off unlocks at once; turning it on doesn't lock until the app leaves.
  useEffect(() => {
    if (!enabled) setLocked(false);
  }, [enabled]);

  const unlock = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    prompting.current = true;
    const ok = await unlockApp(t('lock_prompt'), credentialId);
    setTimeout(() => (prompting.current = false), 1000);
    setBusy(false);
    if (ok) {
      leftAt.current = null;
      setLocked(false);
    } else setFailed(true);
  }, [busy, credentialId, t]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      const prefs = useStore.getState().security;
      if (st === 'active') {
        active.current = true;
        setCovered(false);
        if (prompting.current) return;
        if (lockDue(prefs, leftAt.current, Date.now())) setLocked(true);
        else leftAt.current = null;
        return;
      }
      active.current = false;
      if (prompting.current) return;
      // "inactive" (iPhone: app switcher, Control Centre) only covers the screen; the time counts from "background".
      if (prefs.lock) setCovered(true);
      if (st === 'background' && leftAt.current === null) leftAt.current = Date.now();
    });
    // Android: the app switcher takes its picture right after focus is lost. Only Android has these
    // events (the browser's AppState refuses them), hence the try.
    const extra: { remove: () => void }[] = [];
    try {
      extra.push(
        AppState.addEventListener('blur', () => {
          if (useStore.getState().security.lock) setCovered(true);
        }),
        AppState.addEventListener('focus', () => setCovered(false)),
      );
    } catch {
      /* not this platform */
    }
    return () => {
      sub.remove();
      extra.forEach((e) => e.remove());
    };
  }, []);

  // Ask straight away on phones when the lock shows and the app is in front.
  useEffect(() => {
    if (!locked || !lockAutoPrompt || !active.current) return;
    const id = setTimeout(() => void unlock(), 250);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked]);

  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    if (!locked) return;
    void lockAvailability().then((a) => setBlocked(a !== 'ok'));
  }, [locked]);

  if (!enabled || (!locked && !covered)) return null;

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: c.bg, zIndex: 1000, elevation: 1000, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 16 }]} accessibilityViewIsModal>
      <Sprout size={110} mood="sleepy" />
      {locked ? (
        <>
          <Txt v="title" center>
            {t('lock_title')}
          </Txt>
          <Txt v="sub" center style={{ maxWidth: 320 }}>
            {blocked ? t('lock_not_set_up_now') : t('lock_text')}
          </Txt>
          <Button icon="lock-open-outline" title={t('lock_unlock')} onPress={() => void unlock()} loading={busy} style={{ alignSelf: 'stretch', maxWidth: 320, width: '100%' }} />
          {failed ? <Txt v="small" center>{t('lock_failed')}</Txt> : null}
          {failed || blocked ? (
            <Button small kind="ghost" title={t('lock_cant_unlock')} onPress={() => deleteEverythingFlow(t, () => setLocked(false))} />
          ) : null}
        </>
      ) : null}
    </View>
  );
}
