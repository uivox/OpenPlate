import { CameraView, useCameraPermissions } from 'expo-camera';
import React from 'react';
import { KeyboardAvoidingView, Linking, Platform, StyleSheet, View } from 'react-native';
import { scannedBarcode } from '../lib/barcode';
import { useT } from '../lib/useT';
import { CameraOff, ManualBarcodeEntry } from './ScannerParts';
import { Button } from './ui';

export interface BarcodeScannerProps {
  /** Called with the barcode as scanned or typed (not checked yet); may fire repeatedly for the same code. */
  onScan: (code: string) => void;
  paused: boolean;
  /** The number in the "type it in" field. The scan screen owns it, so it can put a code there to correct. */
  manualCode: string;
  onManualCodeChange: (code: string) => void;
  /** Drawn over the camera picture. */
  children?: React.ReactNode;
}

/**
 * Full-screen camera that reads EAN/UPC barcodes, with a field to type the number in (also when
 * camera access is denied). The web build uses BarcodeScanner.web.tsx, which looks and works the same.
 */
export function BarcodeScanner({ onScan, paused, manualCode, onManualCodeChange, children }: BarcodeScannerProps) {
  const { t } = useT();
  const [permission, requestPermission] = useCameraPermissions();
  const manual = <ManualBarcodeEntry value={manualCode} onChange={onManualCodeChange} onSubmit={() => onScan(manualCode)} disabled={paused} />;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#000' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {permission?.granted ? (
        <>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }}
            onBarcodeScanned={paused ? undefined : ({ data, type }) => onScan(scannedBarcode(data, type))}
          />
          {children}
        </>
      ) : permission ? (
        <CameraOff text={t('camera_needed_scan')}>
          {/* Once the user said no, iOS and Android only let them change it in the system settings. */}
          <Button title={t('allow_camera')} onPress={() => (permission.canAskAgain ? requestPermission() : Linking.openSettings())} />
        </CameraOff>
      ) : (
        <View style={StyleSheet.absoluteFill} />
      )}
      {manual}
    </KeyboardAvoidingView>
  );
}
