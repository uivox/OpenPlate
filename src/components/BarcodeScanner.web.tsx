import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { scannedBarcode } from '../lib/barcode';
import { useT } from '../lib/useT';
import type { BarcodeScannerProps } from './BarcodeScanner';
import { CameraOff, ManualBarcodeEntry } from './ScannerParts';

/**
 * Browser barcode scanner: camera via getUserMedia, decoding with ZXing (Safari has no
 * BarcodeDetector). Typing the number is always possible, e.g. when camera access is denied.
 * Same props and look as the phone version (BarcodeScanner.tsx).
 */
export function BarcodeScanner({ onScan, paused, manualCode, onManualCodeChange, children }: BarcodeScannerProps) {
  const { t } = useT();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [camera, setCamera] = useState<'starting' | 'on' | 'off'>('starting');
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
        if (result && !pausedRef.current) onScanRef.current(scannedBarcode(result.getText(), BarcodeFormat[result.getBarcodeFormat()]));
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

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: camera === 'off' ? 'none' : 'block' }}
      />
      {camera === 'off' ? <CameraOff text={t('camera_needed_web')} /> : children}
      <ManualBarcodeEntry value={manualCode} onChange={onManualCodeChange} onSubmit={() => onScan(manualCode)} disabled={paused} />
    </View>
  );
}
