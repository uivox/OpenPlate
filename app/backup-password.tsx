import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { backupFileName, backupJson } from '../src/components/exportBackup';
import { importBackupText, takePendingEncrypted } from '../src/components/importBackup';
import { Banner, Button, Card, Field, Row, Screen, Txt } from '../src/components/ui';
import { decryptBackup, encryptBackup, MIN_PASSWORD, passwordProblem } from '../src/lib/backupCrypto';
import { randomBytes, shareExport } from '../src/lib/device';
import { useStore } from '../src/lib/store';
import { useColors } from '../src/lib/theme';
import { useT } from '../src/lib/useT';

type Phase = { kind: 'form' } | { kind: 'working'; progress: number } | { kind: 'ready'; text: string } | { kind: 'error'; key: 'backup_pw_wrong' | 'import_invalid' };

/**
 * Password for an encrypted backup (Profile → Export data with *Encrypt backups* on, or importing an
 * encrypted file). Export: password twice → encrypt on the device → *Share backup* (a separate tap,
 * because Safari only opens the share sheet straight from one). Import: password → decrypt → the
 * usual "replace everything?" question. The password is never stored.
 */
export default function BackupPassword() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const importing = mode === 'import';
  const { t } = useT();
  const c = useColors();
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [phase, setPhase] = useState<Phase>({ kind: 'form' });
  const file = useRef<string | null>(null);

  useEffect(() => {
    if (!importing) return;
    file.current = takePendingEncrypted();
    if (!file.current) router.back();
  }, [importing]);

  const problem = importing ? (password ? null : 'short') : passwordProblem(password, repeat);
  const onProgress = (p: number) => setPhase({ kind: 'working', progress: p });

  const run = async () => {
    setPhase({ kind: 'working', progress: 0 });
    try {
      if (importing) {
        const json = await decryptBackup(file.current ?? '', password, onProgress);
        setPassword('');
        setPhase({ kind: 'form' });
        importBackupText(json, t);
      } else {
        const text = await encryptBackup(backupJson(), password, randomBytes, undefined, onProgress);
        setPassword('');
        setRepeat('');
        setPhase({ kind: 'ready', text });
      }
    } catch (e) {
      setPhase({ kind: 'error', key: (e as Error)?.message === 'WRONG_PASSWORD' ? 'backup_pw_wrong' : 'import_invalid' });
    }
  };

  const share = async () => {
    if (phase.kind !== 'ready') return;
    const done = await shareExport(phase.text, backupFileName());
    if (done) {
      useStore.getState().markBackedUp();
      router.back();
    }
  };

  const working = phase.kind === 'working';

  return (
    <Screen>
      <Txt v="title">{importing ? t('backup_pw_import_title') : t('backup_pw_export_title')}</Txt>
      <Txt v="sub">{importing ? t('backup_pw_import_text') : t('backup_pw_export_text')}</Txt>

      {phase.kind === 'ready' ? (
        <Card style={{ gap: 12 }}>
          <Txt v="h3">{t('backup_pw_ready')}</Txt>
          <Txt v="sub">{t('backup_pw_ready_text')}</Txt>
          <Button icon="share-outline" title={t('backup_pw_share')} onPress={() => void share()} />
        </Card>
      ) : (
        <Card style={{ gap: 12 }}>
          <Field
            label={t('backup_pw_label')}
            value={password}
            onChangeText={(v) => {
              setPassword(v);
              if (phase.kind === 'error') setPhase({ kind: 'form' });
            }}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            textContentType={importing ? 'password' : 'newPassword'}
            editable={!working}
            testID="backup-pw"
          />
          {importing ? null : (
            <Field
              label={t('backup_pw_repeat')}
              value={repeat}
              onChangeText={setRepeat}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="newPassword"
              editable={!working}
              testID="backup-pw-repeat"
            />
          )}
          {!importing && password && problem === 'short' ? <Txt v="small">{t('backup_pw_short', { n: MIN_PASSWORD })}</Txt> : null}
          {!importing && repeat && problem === 'mismatch' ? <Txt v="small" color={c.danger}>{t('backup_pw_mismatch')}</Txt> : null}
          {phase.kind === 'error' ? <Txt v="small" color={c.danger}>{t(phase.key)}</Txt> : null}
          {working ? (
            <Row>
              <ActivityIndicator color={c.accent} />
              <Txt v="sub">{t(importing ? 'backup_pw_decrypting' : 'backup_pw_encrypting', { p: Math.round(phase.progress * 100) })}</Txt>
            </Row>
          ) : null}
          <Button
            icon={importing ? 'lock-open-outline' : 'lock-closed-outline'}
            title={importing ? t('backup_pw_open') : t('backup_pw_encrypt')}
            onPress={() => void run()}
            disabled={!!problem || working}
          />
        </Card>
      )}

      {importing ? null : (
        <View style={{ gap: 8 }}>
          <Banner icon="warning-outline" tone="warn" text={t('backup_pw_warning')} />
        </View>
      )}
    </Screen>
  );
}
