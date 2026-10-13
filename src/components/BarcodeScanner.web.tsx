import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { space, useColors } from '../lib/theme';
import { useT } from '../lib/useT';
import type { BarcodeScannerProps } from './BarcodeScanner';
import { Button, Field, Row, Screen, Txt } from './ui';

/**
 * Browser barcode scanner: camera via getUserMedia, decoding with ZXing (Safari has no
 * BarcodeDetector). Typing the number is always possible, e.g. when camera access is denied.
 */
export function BarcodeScanner({ onScan, paused, children }: BarcodeScannerProps) {
  const { t } = useT();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [camera, setCamera] = useState<'starting' | 'on' | 'off'>('starting');
  const [code, setCode] = useState('');
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !navigator.mediaDevices?.getUserMedia) {
      setCamera('off');
      return;
    }
    let cancelled = false;
    let controls: IScannerControls | undefined;
    const hints = new Map<DecodeHintType, unknown>([
      [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E]],
    ]);
    const reader = new BrowserMultiFormatReader(hints);
    reader
      .decodeFromConstraints({ audio: false, video: { facingMode: { ideal: 'environment' } } }, video, (result) => {
        if (result && !pausedRef.current) onScanRef.current(result.getText());
      })
      .then((ctl) => {
        if (cancelled) ctl.stop();
        else {
          controls = ctl;
          setCamera('on');
        }
      })
      .catch(() => {
        if (!cancelled) setCamera('off');
      });
    return () => {
      cancelled = true;
      controls?.stop();
    };
  }, []);

  const digits = code.replace(/\D/g, '');
  const submit = () => {
    if (digits.length >= 8 && !paused) onScan(digits);
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: camera === 'off' ? 'none' : 'block' }}
      />
      {camera === 'off' ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: c.bg }]}>
          <Screen style={{ paddingTop: insets.top + 64 }}>
            <Txt v="h2">{t('camera_needed')}</Txt>
            <Txt v="sub">{t('camera_needed_web')}</Txt>
          </Screen>
        </View>
      ) : (
        children
      )}
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: space.l, paddingBottom: Math.max(insets.bottom, space.l) }}>
        <Row style={{ alignItems: 'flex-end', backgroundColor: c.card, borderRadius: 24, padding: space.m }}>
          <View style={{ flex: 1 }}>
            <Field
              label={t('barcode_manual')}
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              inputMode="numeric"
              returnKeyType="search"
              onSubmitEditing={submit}
            />
          </View>
          <Button small title={t('barcode_lookup')} onPress={submit} disabled={digits.length < 8 || paused} />
        </Row>
      </View>
    </View>
  );
}
