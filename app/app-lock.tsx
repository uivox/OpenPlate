import React, { useEffect, useState } from 'react';
import { Switch } from 'react-native';
import { Banner, Card, ChipGroup, Row, Screen, SectionTitle, Txt } from '../src/components/ui';
import { showAlert } from '../src/lib/alert';
import { enableLock, lockAvailability, type LockAvailability } from '../src/lib/device';
import { LOCK_AFTER_OPTIONS, type LockAfter } from '../src/lib/security';
import { useStore } from '../src/lib/store';
import { useColors } from '../src/lib/theme';
import { useT } from '../src/lib/useT';

/**
 * Profile → Your data → App lock. Off by default. Turning it on needs one successful unlock (or, in
 * the browser, making a passkey), so nobody locks themselves out by mistake.
 */
export default function AppLockSettings() {
  const { t } = useT();
  const c = useColors();
  const security = useStore((s) => s.security);
  const setSecurity = useStore((s) => s.setSecurity);
  const [available, setAvailable] = useState<LockAvailability | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void lockAvailability().then(setAvailable);
  }, []);

  const toggle = async (on: boolean) => {
    if (!on) {
      setSecurity({ lock: false, webCredentialId: undefined });
      return;
    }
    setBusy(true);
    const res = await enableLock(t('lock_prompt_enable'));
    setBusy(false);
    if (!res.ok) {
      showAlert(t('lock_enable_failed'));
      return;
    }
    setSecurity({ lock: true, ...(res.credentialId ? { webCredentialId: res.credentialId } : {}) });
    if (!useStore.getState().security.encryptBackups)
      showAlert(t('lock_suggest_enc_title'), t('lock_suggest_enc_text'), [
        { text: t('not_now'), style: 'cancel' },
        { text: t('lock_suggest_enc_yes'), onPress: () => setSecurity({ encryptBackups: true }) },
      ]);
  };

  const unavailable = available !== null && available !== 'ok';
  const afterLabel = (m: LockAfter) => (m === 0 ? t('lock_after_now') : t('lock_after_min', { n: m }));

  return (
    <Screen>
      <Card style={{ gap: 10 }}>
        <Row gap={12}>
          <Txt v="h3" style={{ flex: 1 }}>
            {t('lock_switch')}
          </Txt>
          <Switch
            value={security.lock}
            disabled={busy || (unavailable && !security.lock) || available === null}
            onValueChange={(on) => void toggle(on)}
            trackColor={{ true: c.accent }}
            accessibilityLabel={t('lock_switch')}
            testID="lock-switch"
          />
        </Row>
        <Txt v="sub">{t('lock_explain')}</Txt>
      </Card>

      {available === 'not_set_up' ? <Banner icon="information-circle-outline" tone="warn" text={t('lock_not_set_up')} /> : null}
      {available === 'unsupported' ? <Banner icon="information-circle-outline" tone="warn" text={t('lock_unsupported')} /> : null}

      {security.lock ? (
        <>
          <SectionTitle>{t('lock_after_title')}</SectionTitle>
          <Card style={{ gap: 10 }}>
            <ChipGroup<LockAfter> options={LOCK_AFTER_OPTIONS.map((m) => ({ value: m, label: afterLabel(m) }))} value={security.lockAfter} onChange={(m) => setSecurity({ lockAfter: m })} />
            <Txt v="sub">{t('lock_after_text')}</Txt>
          </Card>

          <Card style={{ gap: 10 }}>
            <Row gap={12}>
              <Txt v="h3" style={{ flex: 1 }}>
                {t('lock_numbers')}
              </Txt>
              <Switch
                value={security.lockShowNumbers}
                onValueChange={(on) => setSecurity({ lockShowNumbers: on })}
                trackColor={{ true: c.accent }}
                accessibilityLabel={t('lock_numbers')}
              />
            </Row>
            <Txt v="sub">{t('lock_numbers_text')}</Txt>
          </Card>
        </>
      ) : null}

      <Txt v="small">{t('lock_what_it_does')}</Txt>
    </Screen>
  );
}
