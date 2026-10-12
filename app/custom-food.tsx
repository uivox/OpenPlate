import * as Haptics from 'expo-haptics';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Button, Card, ChipGroup, Field, NumField, Row, Screen, Txt } from '../src/components/ui';
import { dayKey } from '../src/lib/dates';
import { putFood } from '../src/lib/foodCache';
import { newId } from '../src/lib/id';
import { leaveToDiary } from '../src/lib/nav';
import { useStore } from '../src/lib/store';
import { MEALS, type Food, type MealType } from '../src/lib/types';
import { useT } from '../src/lib/useT';

export default function CustomFoodScreen() {
  const params = useLocalSearchParams<{ meal?: string; date?: string; mode?: string; barcode?: string }>();
  const quick = params.mode === 'quick';
  const meal: MealType = MEALS.includes(params.meal as MealType) ? (params.meal as MealType) : 'snack';
  const date = params.date ?? dayKey();
  const { t } = useT();
  const addEntry = useStore((s) => s.addEntry);
  const saveCustomFood = useStore((s) => s.saveCustomFood);

  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [unit, setUnit] = useState<'g' | 'ml'>('g');
  const [kcal, setKcal] = useState<number | null>(null);
  const [carbs, setCarbs] = useState<number | null>(null);
  const [protein, setProtein] = useState<number | null>(null);
  const [fat, setFat] = useState<number | null>(null);
  const [sugar, setSugar] = useState<number | null>(null);
  const [fiber, setFiber] = useState<number | null>(null);
  const [servingLabel, setServingLabel] = useState('');
  const [servingGrams, setServingGrams] = useState<number | null>(null);

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
      },
      servings: servingGrams && servingGrams > 0 ? [{ label: servingLabel.trim() || t('portion'), grams: servingGrams }] : [],
      unit,
    };
    saveCustomFood(food);
    putFood(food);
    router.replace({ pathname: '/food', params: { fid: food.id, meal, date } });
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: quick ? t('quick_add') : t('create_food') }} />
      {quick ? <Txt v="sub">{t('quick_add_text')}</Txt> : null}
      {params.barcode ? <Txt v="sub">{t('barcode_value', { code: params.barcode })}</Txt> : null}

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
          <Row>
            <NumField label={t('sugar')} value={sugar} onChange={setSugar} suffix="g" />
            <NumField label={t('fiber')} value={fiber} onChange={setFiber} suffix="g" />
          </Row>
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
    </Screen>
  );
}
