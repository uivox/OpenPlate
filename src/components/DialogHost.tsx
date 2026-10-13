import React, { useEffect, useState } from 'react';
import { Modal, View } from 'react-native';
import { setDialogListener, type Dialog, type DialogButton } from '../lib/alert';
import { space, useColors } from '../lib/theme';
import { useT } from '../lib/useT';
import { Button, Card, Txt } from './ui';

/** Shows dialogs from showAlert() in the web build (native uses the system alert). */
export function DialogHost() {
  const c = useColors();
  const { t } = useT();
  const [queue, setQueue] = useState<Dialog[]>([]);

  useEffect(() => {
    setDialogListener((d) => setQueue((q) => [...q, d]));
    return () => setDialogListener(null);
  }, []);

  const current = queue[0];
  if (!current) return null;

  const buttons: DialogButton[] = current.buttons.length ? current.buttons : [{ text: t('ok') }];
  const actions = buttons.filter((b) => b.style !== 'cancel');
  const cancel = buttons.find((b) => b.style === 'cancel');

  const close = (b?: DialogButton) => {
    setQueue((q) => q.slice(1));
    b?.onPress?.();
  };

  return (
    <Modal transparent animationType="fade" visible onRequestClose={() => cancel && close(cancel)}>
      <View style={{ flex: 1, backgroundColor: c.scrim, alignItems: 'center', justifyContent: 'center', padding: space.xl }}>
        <Card r="l" style={{ width: '100%', maxWidth: 360, gap: space.m, padding: space.xl }}>
          <Txt v="h2">{current.title}</Txt>
          {current.message ? <Txt v="sub">{current.message}</Txt> : null}
          <View style={{ gap: space.s, marginTop: space.s }}>
            {actions.map((b, i) => (
              <Button
                key={`${i}-${b.text}`}
                title={b.text}
                kind={b.style === 'destructive' ? 'danger' : i === 0 ? 'primary' : 'secondary'}
                onPress={() => close(b)}
              />
            ))}
            {cancel ? <Button kind="ghost" title={cancel.text} onPress={() => close(cancel)} /> : null}
          </View>
        </Card>
      </View>
    </Modal>
  );
}
