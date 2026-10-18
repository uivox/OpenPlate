import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { BarcodeScanner } from '../src/components/BarcodeScanner';
import { Txt } from '../src/components/ui';
import { showAlert } from '../src/lib/alert';
import { checkBarcode } from '../src/lib/barcode';
import { flowParams, resolveBarcode } from '../src/lib/barcodeFlow';
import { putFood, setFoodDraft } from '../src/lib/foodCache';
import { lookupFailure } from '../src/lib/openFoodFacts';
import { useStore } from '../src/lib/store';
import { useT } from '../src/lib/useT';

export default function ScanScreen() {
  const params = useLocalSearchParams<{ meal?: string; date?: string; pick?: string }>();
  // Passed on as they came: the next screens fill in the meal and date they default to.
  const passOn = flowParams({ meal: params.meal, date: params.date, pick: params.pick });
  const { t, lang } = useT();
  const [busy, setBusy] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const locked = useRef(false);
  const customFoods = useStore((s) => s.customFoods);
  const unlock = () => (locked.current = false);

  const onScan = async (data: string) => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      const out = await resolveBarcode(data, lang, customFoods);
      if (out.kind === 'found') {
        putFood(out.food);
        router.replace({ pathname: '/food', params: { ...passOn, fid: out.food.id } });
        return;
      }
      const next = { ...passOn, barcode: out.code };
      setFoodDraft(out.draft);
      if (out.kind === 'suggestion') {
        router.replace({ pathname: '/custom-food', params: { ...next, draft: '1' } });
        return;
      }
      const { partial } = out;
      showAlert(
        partial ? t('incomplete_title') : t('not_found'),
        partial ? t('incomplete_text', { name: partial.name ?? out.code }) : t('not_found_text', { code: out.code }),
        [
          { text: t('scan_label'), onPress: () => router.replace({ pathname: '/label', params: next }) },
          { text: t('type_in'), onPress: () => router.replace({ pathname: '/custom-food', params: { ...next, draft: '1' } }) },
          { text: t('scan_again'), style: 'cancel', onPress: unlock },
        ],
      );
    } catch (e) {
      const failure = lookupFailure(e);
      const shown = data.trim().slice(0, 32);
      if (failure === 'invalid') {
        showAlert(t('barcode_invalid'), t('barcode_invalid_text', { code: shown }), [
          { text: t('barcode_correct'), onPress: () => (setManualCode(shown), unlock()) },
          { text: t('scan_again'), style: 'cancel', onPress: unlock },
        ]);
        return;
      }
      // Typing the values in works without Open Food Facts; the barcode is kept with the food.
      const checked = checkBarcode(data);
      const barcode = checked.ok ? checked.code : undefined;
      const typeIn = () => {
        setFoodDraft({ barcode, unit: 'g', servings: [], issues: [] });
        router.replace({ pathname: '/custom-food', params: { ...flowParams({ ...passOn, barcode }), draft: '1' } });
      };
      const [title, text] =
        failure === 'rate_limited' ? [t('barcode_rate_limited'), t('barcode_rate_limited_text')] : failure === 'server' ? [t('server_error'), t('server_error_text')] : [t('network_error'), t('network_error_text')];
      showAlert(title, text, [
        { text: t('type_in'), onPress: typeIn },
        ...(failure === 'rate_limited' ? [] : [{ text: t('try_again'), onPress: () => (unlock(), onScan(data)) }]),
        { text: t('scan_again'), style: 'cancel' as const, onPress: unlock },
      ]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <BarcodeScanner onScan={onScan} paused={busy} manualCode={manualCode} onManualCodeChange={setManualCode}>
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
  overlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  frame: { width: 270, height: 160, borderRadius: 18, borderWidth: 3, borderColor: '#fff' },
});
