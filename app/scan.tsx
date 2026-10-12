import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useRef, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';
import { Button, Screen, Txt } from '../src/components/ui';
import { dayKey } from '../src/lib/dates';
import { putFood } from '../src/lib/foodCache';
import { lookupBarcode } from '../src/lib/openFoodFacts';
import { useStore } from '../src/lib/store';
import { useT } from '../src/lib/useT';

export default function ScanScreen() {
  const params = useLocalSearchParams<{ meal?: string; date?: string }>();
  const meal = params.meal ?? 'snack';
  const date = params.date ?? dayKey();
  const { t, lang } = useT();
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const customFoods = useStore((s) => s.customFoods);

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

  const onScan = async ({ data }: BarcodeScanningResult) => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      const own = customFoods.find((f) => f.barcode === data);
      const food = own ?? (await lookupBarcode(data, lang));
      if (food) {
        putFood(food);
        router.replace({ pathname: '/food', params: { fid: food.id, meal, date } });
        return;
      }
      Alert.alert(t('not_found'), t('not_found_text', { code: data }), [
        { text: t('scan_again'), onPress: () => (locked.current = false) },
        {
          text: t('create_food'),
          onPress: () => router.replace({ pathname: '/custom-food', params: { meal, date, barcode: data } }),
        },
      ]);
    } catch {
      Alert.alert(t('network_error'), t('network_error_text'), [{ text: t('ok'), onPress: () => (locked.current = false) }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }}
        onBarcodeScanned={busy ? undefined : onScan}
      />
      <View style={styles.overlay} pointerEvents="none">
        <View style={styles.frame} />
        <Txt color="#fff" center style={{ marginTop: 20 }}>
          {busy ? t('looking_up') : t('scan_hint')}
        </Txt>
        {busy ? <ActivityIndicator color="#fff" style={{ marginTop: 12 }} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  frame: { width: 270, height: 160, borderRadius: 18, borderWidth: 3, borderColor: '#fff' },
});
