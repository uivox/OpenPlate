import { CameraView, useCameraPermissions } from 'expo-camera';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useT } from '../lib/useT';
import { Button, Screen, Txt } from './ui';

export interface BarcodeScannerProps {
  /** Called with the barcode digits; may fire repeatedly for the same code. */
  onScan: (code: string) => void;
  paused: boolean;
  /** Drawn over the camera picture. */
  children?: React.ReactNode;
}

/** Full-screen camera that reads EAN/UPC barcodes. The web build uses BarcodeScanner.web.tsx. */
export function BarcodeScanner({ onScan, paused, children }: BarcodeScannerProps) {
  const { t } = useT();
  const [permission, requestPermission] = useCameraPermissions();

  if (!permission) return <Screen scroll={false} />;
  if (!permission.granted) {
    return (
      <Screen>
        <Txt v="h2">{t('camera_needed')}</Txt>
        <Txt v="sub">{t('camera_needed_text')}</Txt>
        <Button title={t('allow_camera')} onPress={requestPermission} />
      </Screen>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }}
        onBarcodeScanned={paused ? undefined : ({ data }) => onScan(data)}
      />
      {children}
    </View>
  );
}
