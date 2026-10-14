import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { BarcodeScanner } from '../src/components/BarcodeScanner';
import { Txt } from '../src/components/ui';
import { showAlert } from '../src/lib/alert';
import { dayKey } from '../src/lib/dates';
import { putFood } from '../src/lib/foodCache';
import { lookupBarcode } from '../src/lib/openFoodFacts';
import { useStore } from '../src/lib/store';
import { useT } from '../src/lib/useT';

export default function ScanScreen() {
  const params = useLocalSearchParams<{ meal?: string; date?: string; pick?: string }>();
  const meal = params.meal ?? 'snack';
  const date = params.date ?? dayKey();
  const pick = params.pick === '1' ? { pick: '1' } : {};
  const { t, lang } = useT();
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const customFoods = useStore((s) => s.customFoods);

  const onScan = async (data: string) => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      const own = customFoods.find((f) => f.barcode === data);
      const food = own ?? (await lookupBarcode(data, lang));
      if (food) {
        putFood(food);
        router.replace({ pathname: '/food', params: { fid: food.id, meal, date, ...pick } });
        return;
      }
      showAlert(t('not_found'), t('not_found_text', { code: data }), [
        { text: t('scan_again'), onPress: () => (locked.current = false) },
        {
          text: t('create_food'),
          onPress: () => router.replace({ pathname: '/custom-food', params: { meal, date, barcode: data, ...pick } }),
        },
      ]);
    } catch {
      showAlert(t('network_error'), t('network_error_text'), [{ text: t('ok'), onPress: () => (locked.current = false) }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <BarcodeScanner onScan={onScan} paused={busy}>
      <View style={styles.overlay} pointerEvents="none">
        <View style={styles.frame} />
        <Txt color="#fff" center style={{ marginTop: 20 }}>
          {busy ? t('looking_up') : t('scan_hint')}
        </Txt>
        {busy ? <ActivityIndicator color="#fff" style={{ marginTop: 12 }} /> : null}
      </View>
    </BarcodeScanner>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  frame: { width: 270, height: 160, borderRadius: 18, borderWidth: 3, borderColor: '#fff' },
});
