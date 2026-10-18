import { Stack } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fonts, space, useColors } from '../lib/theme';
import { useT } from '../lib/useT';
import { Button, Field, Row, Screen, Txt } from './ui';

/**
 * Pieces both barcode scanners (BarcodeScanner.tsx and .web.tsx) draw the same way, so the phone
 * apps and the web version look and behave alike.
 */

/** "Type the number in" bar at the bottom of the scanner. Checking the number is up to the scan screen. */
export function ManualBarcodeEntry({ value, onChange, onSubmit, disabled }: { value: string; onChange: (v: string) => void; onSubmit: () => void; disabled?: boolean }) {
  const { t } = useT();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const empty = !value.trim();
  const submit = () => {
    if (!empty && !disabled) onSubmit();
  };
  return (
    <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: space.l, paddingBottom: Math.max(insets.bottom, space.l) }}>
      <Row style={{ alignItems: 'flex-end', backgroundColor: c.card, borderRadius: 24, padding: space.m }}>
        <View style={{ flex: 1 }}>
          <Field
            label={t('barcode_manual')}
            value={value}
            onChangeText={onChange}
            keyboardType="number-pad"
            inputMode="numeric"
            returnKeyType="search"
            onSubmitEditing={submit}
            maxLength={32}
          />
        </View>
        <Button small title={t('barcode_lookup')} onPress={submit} disabled={empty || disabled} />
      </Row>
    </View>
  );
}

/** Shown instead of the camera picture when there is no camera access; typing the number still works. */
export function CameraOff({ text, children }: { text: string; children?: React.ReactNode }) {
  const { t } = useT();
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: c.bg }]}>
      {/* Without the camera picture the white header would vanish on the light background. */}
      <Stack.Screen options={{ headerTintColor: c.accent, headerTitleStyle: { color: c.text, fontFamily: fonts.display } }} />
      <Screen style={{ paddingTop: insets.top + 64 }}>
        <Txt v="h2">{t('camera_needed')}</Txt>
        <Txt v="sub">{text}</Txt>
        {children}
      </Screen>
    </View>
  );
}
