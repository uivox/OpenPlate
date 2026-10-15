import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { BarcodeScanner } from '../src/components/BarcodeScanner';
import { Txt } from '../src/components/ui';
import { showAlert } from '../src/lib/alert';
import { dayKey } from '../src/lib/dates';
import { putFood, setFoodDraft } from '../src/lib/foodCache';
import { fetchRobotoffNutrition, lookupBarcodeDetailed } from '../src/lib/openFoodFacts';
import { useStore } from '../src/lib/store';
import { useT } from '../src/lib/useT';

export default function ScanScreen() {
  const params = useLocalSearchParams<{ meal?: string; date?: string; pick?: string }>();
  const meal = params.meal ?? 'snack';
  const date = params.date ?? dayKey();
  const pick = params.pick ? { pick: params.pick } : {};
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
      const found = own ? { food: own } : await lookupBarcodeDetailed(data, lang);
      if (found.food) {
        putFood(found.food);
        router.replace({ pathname: '/food', params: { fid: found.food.id, meal, date, ...pick } });
        return;
      }
      // Not in Open Food Facts, or there without nutrition: Open Food Facts' photo AI may have read the
      // values off a package photo already. That's only a suggestion; the user checks it in the form.
      const partial = 'partial' in found ? found.partial : undefined;
      const base = {
        barcode: data,
        name: partial?.name,
        brand: partial?.brand,
        unit: partial?.unit ?? ('g' as const),
        servings: partial?.servings ?? [],
        issues: [],
      };
      const suggestion = await fetchRobotoffNutrition(data);
      const params = { meal, date, barcode: data, ...pick };
      if (suggestion) {
        setFoodDraft({ ...base, per100: suggestion.per100, issues: suggestion.issues, dataFrom: 'robotoff', imageUri: suggestion.imageUrl });
        router.replace({ pathname: '/custom-food', params: { ...params, draft: '1' } });
        return;
      }
      setFoodDraft({ ...base, imageUri: partial?.imageUrl });
      showAlert(
        partial ? t('incomplete_title') : t('not_found'),
        partial ? t('incomplete_text', { name: partial.name ?? data }) : t('not_found_text', { code: data }),
        [
          { text: t('scan_label'), onPress: () => router.replace({ pathname: '/label', params }) },
          { text: t('create_food'), onPress: () => router.replace({ pathname: '/custom-food', params: { ...params, draft: '1' } }) },
          { text: t('scan_again'), style: 'cancel', onPress: () => (locked.current = false) },
        ],
      );
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
