import * as Haptics from 'expo-haptics';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Image } from 'react-native';
import { Banner, Button, Card, ChipGroup, Field, NumField, Row, Screen, Txt } from '../src/components/ui';
import { dayKey } from '../src/lib/dates';
import { getFoodDraft, putFood, setFoodDraft, type FoodDraft } from '../src/lib/foodCache';
import { newId } from '../src/lib/id';
import { leaveToDiary } from '../src/lib/nav';
import { useStore } from '../src/lib/store';
import { useColors } from '../src/lib/theme';
import { MEALS, type Food, type MealType } from '../src/lib/types';
import { useT } from '../src/lib/useT';

/** Rounds values read by an AI to what a label prints, so the fields stay readable. */
const tidy = (v: number | undefined) => (v === undefined ? null : Math.round(v * 10) / 10);

export default function CustomFoodScreen() {
  const params = useLocalSearchParams<{ meal?: string; date?: string; mode?: string; barcode?: string; pick?: string; draft?: string }>();
  const quick = params.mode === 'quick';
  const meal: MealType = MEALS.includes(params.meal as MealType) ? (params.meal as MealType) : 'snack';
  const date = params.date ?? dayKey();
  const { t } = useT();
  const c = useColors();
  const addEntry = useStore((s) => s.addEntry);
  const saveCustomFood = useStore((s) => s.saveCustomFood);

  // Values from a Robotoff suggestion or a label photo, for the user to check (only for this barcode).
  const [draft] = useState<FoodDraft | null>(() => {
    const d = params.draft === '1' && !quick ? getFoodDraft() : null;
    return d && (!params.barcode || d.barcode === params.barcode) ? d : null;
  });
  const n = draft?.per100;

  const [name, setName] = useState(draft?.name ?? '');
  const [brand, setBrand] = useState(draft?.brand ?? '');
  const [unit, setUnit] = useState<'g' | 'ml'>(draft?.unit ?? 'g');
  const [kcal, setKcal] = useState<number | null>(n ? Math.round(n.kcal) : null);
  const [carbs, setCarbs] = useState<number | null>(tidy(n?.carbs));
  const [protein, setProtein] = useState<number | null>(tidy(n?.protein));
  const [fat, setFat] = useState<number | null>(tidy(n?.fat));
  const [sugar, setSugar] = useState<number | null>(tidy(n?.sugar));
  const [fiber, setFiber] = useState<number | null>(tidy(n?.fiber));
  const [satFat, setSatFat] = useState<number | null>(tidy(n?.satFat));
  const [salt, setSalt] = useState<number | null>(n?.salt === undefined ? null : Math.round(n.salt * 100) / 100);
  const [servingLabel, setServingLabel] = useState(draft?.servings[0]?.label ?? '');
  const [servingGrams, setServingGrams] = useState<number | null>(draft?.servings[0]?.grams ?? null);

  // The draft is used once; leaving the form without saving must not prefill a later one.
  useEffect(() => () => setFoodDraft(null), []);

  const valid = kcal !== null && kcal >= 0 && (quick || name.trim().length > 0);

  const submit = () => {
    if (!valid) return;
    if (quick) {
      const food: Food = {
        id: `quick:${newId()}`,
        source: 'quick',
        name: name.trim() || t('quick_entry'),
        per100: { kcal: kcal!, carbs: carbs ?? 0, protein: protein ?? 0, fat: fat ?? 0 },
        servings: [{ label: t('portion'), grams: 100 }],
        unit: 'g',
      };
      addEntry({ date, meal, food, grams: 100 });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      leaveToDiary();
      return;
    }
    const food: Food = {
      id: `custom:${newId()}`,
      source: 'custom',
      name: name.trim(),
      brand: brand.trim() || undefined,
      barcode: params.barcode || undefined,
      per100: {
        kcal: kcal!,
        carbs: carbs ?? 0,
        protein: protein ?? 0,
        fat: fat ?? 0,
        sugar: sugar ?? undefined,
        fiber: fiber ?? undefined,
        satFat: satFat ?? undefined,
        salt: salt ?? undefined,
      },
      servings: servingGrams && servingGrams > 0 ? [{ label: servingLabel.trim() || t('portion'), grams: servingGrams }] : [],
      unit,
      ...(draft?.dataFrom ? { dataFrom: draft.dataFrom } : {}),
    };
    saveCustomFood(food);
    putFood(food);
    router.replace({ pathname: '/food', params: { fid: food.id, meal, date, ...(params.pick ? { pick: params.pick } : {}) } });
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: quick ? t('quick_add') : draft?.per100 ? t('check_food') : t('create_food') }} />
      {quick ? <Txt v="sub">{t('quick_add_text')}</Txt> : null}
      {params.barcode ? <Txt v="sub">{t('barcode_value', { code: params.barcode })}</Txt> : null}

      {draft?.dataFrom === 'robotoff' ? <Banner icon="sparkles-outline" text={t('robotoff_banner')} /> : null}
      {draft?.dataFrom === 'label' ? <Banner icon="sparkles-outline" text={t('label_banner', { provider: draft.readBy ?? 'AI' })} /> : null}
      {draft?.issues.length ? (
        <Banner icon="warning" tone="warn" text={[t('check_values'), ...draft.issues.map((i) => t(`issue_${i}`))].join('\n')} />
      ) : null}
      {draft?.imageUri ? (
        <Image
          source={{ uri: draft.imageUri }}
          resizeMode="contain"
          accessibilityLabel={t('compare_photo')}
          style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: 18, backgroundColor: c.card }}
        />
      ) : null}

      <Card style={{ gap: 12 }}>
        <Field label={quick ? t('title_optional') : t('name')} value={name} onChangeText={setName} placeholder={quick ? t('quick_entry') : ''} />
        {!quick ? (
          <>
            <Field label={t('brand_optional')} value={brand} onChangeText={setBrand} />
            <ChipGroup
              options={[
                { value: 'g', label: t('solid_g') },
                { value: 'ml', label: t('liquid_ml') },
              ]}
              value={unit}
              onChange={setUnit}
            />
          </>
        ) : null}
      </Card>

      <Card style={{ gap: 12 }}>
        <Txt v="h3">{quick ? t('nutrition_portion') : t('per_100', { unit })}</Txt>
        <NumField label={t('energy')} value={kcal} onChange={setKcal} suffix="kcal" />
        <Row>
          <NumField label={t('carbs')} value={carbs} onChange={setCarbs} suffix="g" />
          <NumField label={t('protein')} value={protein} onChange={setProtein} suffix="g" />
          <NumField label={t('fat')} value={fat} onChange={setFat} suffix="g" />
        </Row>
        {!quick ? (
          <>
            <Row>
              <NumField label={t('sugar')} value={sugar} onChange={setSugar} suffix="g" />
              <NumField label={t('fiber')} value={fiber} onChange={setFiber} suffix="g" />
            </Row>
            <Row>
              <NumField label={t('sat_fat')} value={satFat} onChange={setSatFat} suffix="g" />
              <NumField label={t('salt')} value={salt} onChange={setSalt} suffix="g" />
            </Row>
          </>
        ) : null}
      </Card>

      {!quick ? (
        <Card style={{ gap: 12 }}>
          <Txt v="h3">{t('serving_optional')}</Txt>
          <Row>
            <Field style={{ minWidth: 150 }} value={servingLabel} onChangeText={setServingLabel} placeholder={t('serving_label_ph')} />
            <NumField value={servingGrams} onChange={setServingGrams} suffix={unit} />
          </Row>
        </Card>
      ) : null}

      <Button title={quick ? t('add') : t('save_and_continue')} icon="checkmark" onPress={submit} disabled={!valid} />
      {draft?.dataFrom === 'robotoff' ? <Txt v="small">{t('off_attribution')}</Txt> : null}
    </Screen>
  );
}
