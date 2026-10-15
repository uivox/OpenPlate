import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, View } from 'react-native';
import { Sprout } from '../src/components/Sprout';
import { Banner, Button, Card, Row, Screen, Txt } from '../src/components/ui';
import { showAlert } from '../src/lib/alert';
import { analyzeLabel, CANCELLED, PROVIDER_NAMES, providerOrder } from '../src/lib/ai';
import { pickMealPhoto, type PreparedPhoto } from '../src/lib/device';
import { getFoodDraft, setFoodDraft } from '../src/lib/foodCache';
import { getApiKey } from '../src/lib/secure';
import { useStore } from '../src/lib/store';
import { useColors } from '../src/lib/theme';
import { useT } from '../src/lib/useT';

type Phase = 'pick' | 'reading' | 'error';

/**
 * Reads a nutrition table from a photo with the user's own AI. The AI copies printed numbers; the
 * result opens in the custom-food form, where the user compares it with the photo before saving.
 */
export default function LabelScreen() {
  const params = useLocalSearchParams<{ meal?: string; date?: string; barcode?: string; pick?: string }>();
  const { t, lang } = useT();
  const c = useColors();
  const ai = useStore((s) => s.ai);
  const configured = providerOrder(ai).length > 0;

  // What is already known about this product (name, brand, size from Open Food Facts).
  const [known] = useState(() => {
    const d = getFoodDraft();
    return d && d.barcode === params.barcode ? d : null;
  });
  const [table, setTable] = useState<PreparedPhoto | null>(null);
  const [front, setFront] = useState<PreparedPhoto | null>(null);
  const [phase, setPhase] = useState<Phase>('pick');
  const [error, setError] = useState('');

  // Leaving the screen cancels a running request, so photos aren't sent on after the user changed their mind.
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  const choose = async (which: 'table' | 'front', source: 'camera' | 'library') => {
    try {
      // The table needs more pixels than a meal photo: small print must stay readable.
      const p = which === 'table' ? await pickMealPhoto(source, 1600, 0.8) : await pickMealPhoto(source);
      if (!p) return;
      if (which === 'table') setTable(p);
      else setFront(p);
      setPhase('pick');
    } catch (e) {
      const msg = (e as Error).message;
      showAlert(t('error'), msg === 'CAMERA_DENIED' ? t('camera_needed_text') : msg);
    }
  };

  const read = async () => {
    if (!table) return;
    setPhase('reading');
    setError('');
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    try {
      const images = front ? [table.base64, front.base64] : [table.base64];
      const out = await analyzeLabel(images, ai, getApiKey, lang, undefined, ctrl.signal);
      if (ctrl.signal.aborted) return;
      const r = out.result;
      if (!r.per100) {
        setError(t('label_not_found'));
        setPhase('error');
        return;
      }
      setFoodDraft({
        barcode: params.barcode,
        name: r.name ?? known?.name,
        brand: r.brand ?? known?.brand,
        unit: r.unit,
        per100: r.per100,
        servings: r.servings.length ? r.servings : known?.servings ?? [],
        dataFrom: 'label',
        readBy: PROVIDER_NAMES[out.provider],
        issues: r.issues,
        imageUri: table.uri,
      });
      router.replace({
        pathname: '/custom-food',
        params: formParams(),
      });
    } catch (e) {
      if ((e as Error).message === CANCELLED || ctrl.signal.aborted) return;
      setError((e as Error).message);
      setPhase('error');
    }
  };

  /** Route params for the form; only the ones that were passed in (an empty date would break logging). */
  const formParams = () => {
    const out: Record<string, string> = { draft: '1' };
    for (const k of ['meal', 'date', 'barcode', 'pick'] as const) if (params[k]) out[k] = params[k]!;
    return out;
  };

  const typeIn = () => {
    setFoodDraft(known);
    router.replace({
      pathname: '/custom-food',
      params: formParams(),
    });
  };

  if (!configured) {
    return (
      <Screen>
        <Card style={{ alignItems: 'center', gap: 12 }}>
          <Sprout size={110} mood="surprised" />
          <Txt v="h2" center>
            {t('ai_setup_title')}
          </Txt>
          <Txt v="sub" center>
            {t('label_setup_text')}
          </Txt>
          <Button title={t('ai_settings')} icon="settings-outline" onPress={() => router.push('/ai-settings')} />
        </Card>
        <Button kind="ghost" title={t('enter_manually')} icon="create-outline" onPress={typeIn} />
      </Screen>
    );
  }

  const thumb = (p: PreparedPhoto, label: string) => (
    <View style={{ flex: 1, gap: 6 }}>
      <Image source={{ uri: p.uri }} resizeMode="cover" style={{ width: '100%', aspectRatio: 3 / 4, borderRadius: 14, backgroundColor: c.card }} />
      <Txt v="small" center>
        {label}
      </Txt>
    </View>
  );

  return (
    <Screen>
      {!table ? (
        <Card r="xl" style={{ alignItems: 'center', gap: 10, paddingVertical: 24 }}>
          <Sprout size={96} mood="surprised" />
          <Txt v="h2" center>
            {t('label_intro_title')}
          </Txt>
          <Txt v="sub" center>
            {t('label_intro_text')}
          </Txt>
          {known?.name ? <Txt v="small" center>{known.name}</Txt> : null}
        </Card>
      ) : (
        <Row gap={12} style={{ alignItems: 'flex-start' }}>
          {thumb(table, t('label_table_photo'))}
          {front ? thumb(front, t('label_front_photo')) : <View style={{ flex: 1 }} />}
        </Row>
      )}

      {phase === 'reading' ? (
        <Card style={{ alignItems: 'center', gap: 12, paddingVertical: 28 }}>
          <ActivityIndicator size="large" color={c.accent} />
          <Txt v="h3">{t('label_reading')}</Txt>
          <Txt v="small">{providerOrder(ai).map((p) => PROVIDER_NAMES[p]).join(' → ')}</Txt>
        </Card>
      ) : null}

      {phase === 'error' ? <Banner icon="alert-circle" tone="warn" text={error || t('error')} /> : null}

      {phase !== 'reading' && !table ? (
        <>
          <Button title={t('take_photo')} icon="camera" onPress={() => choose('table', 'camera')} />
          <Button kind="secondary" title={t('choose_photo')} icon="images-outline" onPress={() => choose('table', 'library')} />
        </>
      ) : null}

      {phase !== 'reading' && table ? (
        <>
          <Button title={t('label_read')} icon="sparkles-outline" onPress={read} />
          {!front && !known?.name ? (
            <Button kind="secondary" title={t('label_add_front')} icon="camera-outline" onPress={() => choose('front', 'camera')} />
          ) : null}
          <Button kind="ghost" title={t('new_photo')} icon="refresh" onPress={() => choose('table', 'camera')} />
        </>
      ) : null}

      {phase !== 'reading' ? <Button kind="ghost" title={t('enter_manually')} icon="create-outline" onPress={typeIn} /> : null}
      <Txt v="small" center>
        {t('label_privacy')}
      </Txt>
    </Screen>
  );
}
