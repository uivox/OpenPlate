import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, TextInput, View } from 'react-native';
import { Banner, Button, Card, ChipGroup, Divider, Field, NumField, Row, Screen, Txt } from '../src/components/ui';
import { analyzeMeal, PROVIDER_NAMES, providerOrder, type AnalyzeOutcome } from '../src/lib/ai';
import { dayKey } from '../src/lib/dates';
import { pickMealPhoto, type PreparedPhoto } from '../src/lib/device';
import { newId } from '../src/lib/id';
import { leaveToDiary } from '../src/lib/nav';
import { per100From } from '../src/lib/nutrition';
import { getApiKey } from '../src/lib/secure';
import { useStore } from '../src/lib/store';
import { useColors } from '../src/lib/theme';
import { MEALS, type AIItem, type Food, type MealType } from '../src/lib/types';
import { useT } from '../src/lib/useT';

interface EditableItem {
  key: string;
  base: AIItem;
  name: string;
  grams: number | null;
  include: boolean;
}

type Phase = 'pick' | 'analyzing' | 'review' | 'error';

export default function PhotoScreen() {
  const params = useLocalSearchParams<{ meal?: string; date?: string }>();
  const date = params.date ?? dayKey();
  const { t, lang } = useT();
  const c = useColors();
  const ai = useStore((s) => s.ai);
  const addEntry = useStore((s) => s.addEntry);

  const [meal, setMeal] = useState<MealType>(MEALS.includes(params.meal as MealType) ? (params.meal as MealType) : 'snack');
  const [phase, setPhase] = useState<Phase>('pick');
  const [photo, setPhoto] = useState<PreparedPhoto | null>(null);
  const [hint, setHint] = useState('');
  const [items, setItems] = useState<EditableItem[]>([]);
  const [outcome, setOutcome] = useState<AnalyzeOutcome | null>(null);
  const [error, setError] = useState('');

  const configured = providerOrder(ai).length > 0;

  const run = async (p: PreparedPhoto) => {
    setPhase('analyzing');
    setError('');
    try {
      const res = await analyzeMeal(p.base64, ai, getApiKey, lang, hint);
      setOutcome(res);
      setItems(res.result.items.map((it) => ({ key: newId(), base: it, name: it.name, grams: it.grams, include: true })));
      setPhase(res.result.items.length ? 'review' : 'error');
      if (!res.result.items.length) setError(res.result.notes ?? t('ai_no_food'));
    } catch (e) {
      setError((e as Error).message);
      setPhase('error');
    }
  };

  const choose = async (source: 'camera' | 'library') => {
    try {
      const p = await pickMealPhoto(source);
      if (!p) return;
      setPhoto(p);
      await run(p);
    } catch (e) {
      const msg = (e as Error).message;
      Alert.alert(t('error'), msg === 'CAMERA_DENIED' ? t('camera_needed_text') : msg);
    }
  };

  const scaled = (it: EditableItem) => {
    const f = it.base.grams > 0 && it.grams ? it.grams / it.base.grams : 0;
    return { kcal: it.base.kcal * f, protein: it.base.protein * f, carbs: it.base.carbs * f, fat: it.base.fat * f };
  };
  const total = items.filter((i) => i.include).reduce((s, i) => s + scaled(i).kcal, 0);

  const addAll = () => {
    const chosen = items.filter((i) => i.include && i.grams && i.grams > 0 && i.name.trim());
    if (!chosen.length) return;
    for (const it of chosen) {
      const food: Food = {
        id: `ai:${newId()}`,
        source: 'ai',
        name: it.name.trim(),
        per100: per100From(it.base, it.base.grams),
        servings: [],
        unit: 'g',
      };
      addEntry({ date, meal, food, grams: it.grams! });
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    leaveToDiary();
  };

  if (!configured) {
    return (
      <Screen>
        <Card style={{ alignItems: 'center', gap: 12 }}>
          <Ionicons name="sparkles" size={40} color={c.accent} />
          <Txt v="h2" center>
            {t('ai_setup_title')}
          </Txt>
          <Txt v="sub" center>
            {t('ai_setup_text')}
          </Txt>
          <Button title={t('ai_settings')} icon="settings-outline" onPress={() => router.push('/ai-settings')} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      {photo ? <Image source={{ uri: photo.uri }} style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: 18, backgroundColor: c.card }} /> : null}

      {phase === 'pick' ? (
        <>
          <Card style={{ alignItems: 'center', gap: 10 }}>
            <Ionicons name="camera" size={40} color={c.accent} />
            <Txt v="h2" center>
              {t('ai_photo_title')}
            </Txt>
            <Txt v="sub" center>
              {t('ai_photo_text')}
            </Txt>
          </Card>
          <Field label={t('ai_hint_label')} placeholder={t('ai_hint_placeholder')} value={hint} onChangeText={setHint} multiline />
          <Button title={t('take_photo')} icon="camera" onPress={() => choose('camera')} />
          <Button kind="secondary" title={t('choose_photo')} icon="images-outline" onPress={() => choose('library')} />
          <Txt v="small" center>
            {t('ai_using', { providers: providerOrder(ai).map((p) => PROVIDER_NAMES[p]).join(' → ') })}
          </Txt>
        </>
      ) : null}

      {phase === 'analyzing' ? (
        <Card style={{ alignItems: 'center', gap: 12, paddingVertical: 28 }}>
          <ActivityIndicator size="large" color={c.accent} />
          <Txt v="h3">{t('analyzing')}</Txt>
          <Txt v="small">{providerOrder(ai).map((p) => PROVIDER_NAMES[p]).join(' → ')}</Txt>
        </Card>
      ) : null}

      {phase === 'error' ? (
        <>
          <Banner icon="alert-circle" tone="warn" text={error || t('error')} />
          <Button title={t('try_again')} icon="refresh" onPress={() => photo && run(photo)} disabled={!photo} />
          <Button kind="secondary" title={t('new_photo')} icon="camera" onPress={() => setPhase('pick')} />
          <Button kind="ghost" title={t('ai_settings')} icon="settings-outline" onPress={() => router.push('/ai-settings')} />
        </>
      ) : null}

      {phase === 'review' && outcome ? (
        <>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt v="h2">{t('ai_found', { n: items.length })}</Txt>
            <Txt v="big" style={{ fontSize: 26 }}>
              {Math.round(total)} kcal
            </Txt>
          </Row>
          <Txt v="small">
            {t('ai_confidence', { pct: Math.round(outcome.result.confidence * 100), provider: PROVIDER_NAMES[outcome.result.provider] })}
            {outcome.usedFallback ? ` · ${t('ai_fallback_used')}` : ''}
          </Txt>
          {outcome.result.confidence < ai.minConfidence ? <Banner icon="warning" tone="warn" text={t('ai_low_confidence')} /> : null}
          {outcome.result.notes ? <Txt v="sub">{outcome.result.notes}</Txt> : null}

          <Card>
            {items.map((it, i) => {
              const s = scaled(it);
              return (
                <View key={it.key} style={{ gap: 8, opacity: it.include ? 1 : 0.45 }}>
                  {i > 0 ? <Divider /> : null}
                  <Row>
                    <Pressable
                      onPress={() => setItems((all) => all.map((x) => (x.key === it.key ? { ...x, include: !x.include } : x)))}
                      hitSlop={8}
                      accessibilityLabel={t('include_item')}
                    >
                      <Ionicons name={it.include ? 'checkmark-circle' : 'ellipse-outline'} size={26} color={c.accent} />
                    </Pressable>
                    <TextInput
                      value={it.name}
                      onChangeText={(name) => setItems((all) => all.map((x) => (x.key === it.key ? { ...x, name } : x)))}
                      style={{ flex: 1, fontSize: 16, fontWeight: '600', color: c.text, paddingVertical: 6 }}
                    />
                    <Txt v="sub">{Math.round(s.kcal)} kcal</Txt>
                  </Row>
                  <Row>
                    <View style={{ width: 130 }}>
                      <NumField
                        value={it.grams}
                        decimals={false}
                        suffix="g"
                        onChange={(grams) => setItems((all) => all.map((x) => (x.key === it.key ? { ...x, grams } : x)))}
                      />
                    </View>
                    <Txt v="small" style={{ flex: 1 }}>
                      {t('carbs_short')} {Math.round(s.carbs)} g · {t('protein_short')} {Math.round(s.protein)} g · {t('fat_short')}{' '}
                      {Math.round(s.fat)} g
                    </Txt>
                  </Row>
                </View>
              );
            })}
          </Card>

          <Txt v="h3">{t('meal')}</Txt>
          <ChipGroup options={MEALS.map((m) => ({ value: m, label: t(`meal_${m}`) }))} value={meal} onChange={setMeal} />
          <Button title={t('add_to_diary')} icon="add" onPress={addAll} disabled={!items.some((i) => i.include)} />
          <Button kind="ghost" title={t('new_photo')} icon="camera" onPress={() => setPhase('pick')} />
          <Txt v="small">{t('ai_estimate_note')}</Txt>
        </>
      ) : null}
    </Screen>
  );
}
