import * as Haptics from 'expo-haptics';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Sprout } from '../src/components/Sprout';
import { Button, Card, Row, Screen, Txt } from '../src/components/ui';
import { showAlert } from '../src/lib/alert';
import { locale } from '../src/lib/dates';
import { PackError, type PackFailure, type RemotePack } from '../src/lib/offlinePack';
import { checkRemotePack, ensurePackLoaded, installRemotePack, packAvailable, removePack, usePack } from '../src/lib/packRuntime';
import { useColors } from '../src/lib/theme';
import { useT } from '../src/lib/useT';

type Phase =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'downloading'; received: number; total: number }
  | { kind: 'done'; result: 'installed' | 'up_to_date' }
  | { kind: 'failed'; reason: PackFailure };

/** Offline product data: products sold in Germany from Open Food Facts, kept on this device. */
export default function OfflineDataScreen() {
  const { t, lang } = useT();
  const c = useColors();
  const pack = usePack();
  const [remote, setRemote] = useState<RemotePack | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const abort = useRef<AbortController | null>(null);

  const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1).replace('.', lang === 'de' ? ',' : '.');
  const date = (iso: string) => new Date(iso).toLocaleDateString(locale(lang), { day: 'numeric', month: 'long', year: 'numeric' });
  const count = (n: number) => n.toLocaleString(locale(lang));

  useEffect(() => {
    ensurePackLoaded().catch(() => {});
    return () => abort.current?.abort();
  }, []);

  const fail = (e: unknown) => {
    if (e instanceof Error && e.name === 'AbortError') return setPhase({ kind: 'idle' });
    setPhase({ kind: 'failed', reason: e instanceof PackError ? e.reason : 'offline' });
  };

  /** Asks the server what the newest pack is (small request), so the size can be shown before downloading. */
  const check = async () => {
    setPhase({ kind: 'checking' });
    try {
      const r = await checkRemotePack();
      setRemote(r);
      setPhase({ kind: 'idle' });
      return r;
    } catch (e) {
      fail(e);
      return null;
    }
  };

  const download = async () => {
    const r = remote ?? (await check());
    if (!r) return;
    const ctrl = new AbortController();
    abort.current = ctrl;
    setPhase({ kind: 'downloading', received: 0, total: r.manifest.bytes });
    try {
      const result = await installRemotePack(r, (received) => setPhase({ kind: 'downloading', received, total: r.manifest.bytes }), ctrl.signal);
      setPhase({ kind: 'done', result });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e) {
      fail(e);
    } finally {
      abort.current = null;
    }
  };

  const remove = () =>
    showAlert(t('pack_delete_q'), t('pack_delete_text'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'),
        style: 'destructive',
        onPress: async () => {
          await removePack();
          setPhase({ kind: 'idle' });
        },
      },
    ]);

  const busy = phase.kind === 'checking' || phase.kind === 'downloading';
  const installed = pack.status === 'ready' ? pack.manifest : null;
  const newer = remote && installed && remote.manifest.sha512 !== installed.sha512 ? remote.manifest : null;

  return (
    <Screen>
      <View style={{ alignItems: 'center', paddingVertical: 8 }}>
        <Sprout size={90} />
      </View>
      <Txt v="sub">{t('pack_intro')}</Txt>

      {!packAvailable ? (
        <Card style={{ gap: 8 }}>
          <Txt v="h3">{t('pack_unavailable_title')}</Txt>
          <Txt v="sub">{t('pack_unavailable_text')}</Txt>
        </Card>
      ) : (
        <Card style={{ gap: 12 }}>
          {pack.status === 'loading' || pack.status === 'unknown' ? (
            <Row>
              <ActivityIndicator color={c.accent} />
              <Txt v="sub">{t('pack_loading')}</Txt>
            </Row>
          ) : installed ? (
            <View style={{ gap: 4 }}>
              <Txt v="h3">{t('pack_installed')}</Txt>
              <Txt v="sub">{t('pack_installed_text', { n: count(installed.rows), date: date(installed.created), mb: mb(installed.bytes) })}</Txt>
            </View>
          ) : (
            <View style={{ gap: 4 }}>
              <Txt v="h3">{t('pack_not_installed')}</Txt>
              <Txt v="sub">
                {remote
                  ? t('pack_remote_text', { n: count(remote.manifest.rows), date: date(remote.manifest.created), mb: mb(remote.manifest.bytes) })
                  : t('pack_size_hint')}
              </Txt>
            </View>
          )}

          {phase.kind === 'downloading' ? (
            <View style={{ gap: 8 }}>
              <Row>
                <ActivityIndicator color={c.accent} />
                <Txt v="sub">
                  {phase.received >= phase.total
                    ? t('pack_verifying')
                    : t('pack_progress', { done: mb(Math.min(phase.received, phase.total)), total: mb(phase.total) })}
                </Txt>
              </Row>
              <Button small kind="ghost" icon="close" title={t('cancel')} onPress={() => abort.current?.abort()} style={{ alignSelf: 'flex-start' }} />
            </View>
          ) : null}
          {phase.kind === 'checking' ? (
            <Row>
              <ActivityIndicator color={c.accent} />
              <Txt v="sub">{t('pack_checking')}</Txt>
            </Row>
          ) : null}
          {phase.kind === 'done' ? <Txt v="sub" color={c.accent}>{phase.result === 'installed' ? t('pack_done') : t('pack_up_to_date')}</Txt> : null}
          {phase.kind === 'failed' ? <Txt v="sub" color={c.coral}>{t(`pack_error_${phase.reason}`)}</Txt> : null}
          {newer && !busy ? <Txt v="sub">{t('pack_newer', { date: date(newer.created), mb: mb(newer.bytes) })}</Txt> : null}

          {pack.status === 'ready' || pack.status === 'none' ? (
            <View style={{ gap: 8 }}>
              {!installed ? (
                <Button icon="cloud-download-outline" title={t('pack_download')} onPress={download} disabled={busy} />
              ) : newer ? (
                <Button icon="cloud-download-outline" title={t('pack_update')} onPress={download} disabled={busy} />
              ) : (
                <Button kind="secondary" icon="refresh" title={t('pack_check')} onPress={async () => {
                  const r = await check();
                  if (r && installed && r.manifest.sha512 === installed.sha512) setPhase({ kind: 'done', result: 'up_to_date' });
                }} disabled={busy} />
              )}
              {installed ? <Button kind="ghost" icon="trash-outline" title={t('pack_delete')} onPress={remove} disabled={busy} /> : null}
            </View>
          ) : null}
        </Card>
      )}

      <Txt v="small">{t('pack_wifi_hint')}</Txt>
      <Txt v="small">{t('pack_license')}</Txt>
    </Screen>
  );
}
