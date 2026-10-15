import * as Haptics from 'expo-haptics';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Image, Linking, View } from 'react-native';
import { Banner, Button, Card, ChipGroup, Divider, NumField, Row, Screen, Txt } from '../src/components/ui';
import { showAlert } from '../src/lib/alert';
import { dayKey } from '../src/lib/dates';
import { addToMealDraft, getFood, setFoodDraft } from '../src/lib/foodCache';
import { fmt } from '../src/lib/format';
import { leaveToDiary } from '../src/lib/nav';
import { scaleNutrients } from '../src/lib/nutrition';
import { offContributeUrl } from '../src/lib/openFoodFacts';
import { useStore } from '../src/lib/store';
import { useColors } from '../src/lib/theme';
import { MEALS, type MealType, type Nutrients } from '../src/lib/types';
import { useT } from '../src/lib/useT';

export default function FoodScreen() {
  const params = useLocalSearchParams<{ fid?: string; meal?: string; date?: string; entryId?: string; pick?: string }>();
  /** Picking an ingredient for the meal builder ('1', meal-edit.tsx) or the recipe editor ('recipe'). */
  const pick = params.pick === '1' || params.pick === 'recipe';
  const { t, lang } = useT();
  const c = useColors();
  const entry = useStore((s) => (params.entryId ? s.entries.find((e) => e.id === params.entryId) : undefined));
  const addEntry = useStore((s) => s.addEntry);
  const updateEntry = useStore((s) => s.updateEntry);
  const removeEntry = useStore((s) => s.removeEntry);
  const saveCustomFood = useStore((s) => s.saveCustomFood);
  const isSaved = useStore((s) => (entry || params.fid ? s.customFoods.some((f) => f.id === (entry?.food.id ?? params.fid)) : false));

  const food = entry?.food ?? getFood(params.fid);
  const editing = !!entry;
  const unit = food?.unit ?? 'g';

  const [unitIdx, setUnitIdx] = useState<number>(() => {
    if (!food) return -1;
    if (editing) return food.source === 'quick' ? 0 : -1;
    return food.servings.length > 0 ? 0 : -1;
  });
  const [qty, setQty] = useState<number | null>(() => {
    if (!food) return 100;
    if (editing) return food.source === 'quick' ? Math.round((entry!.grams / 100) * 100) / 100 : Math.round(entry!.grams);
    return food.servings.length > 0 ? 1 : 100;
  });
  const [meal, setMeal] = useState<MealType>(
    entry?.meal ?? (MEALS.includes(params.meal as MealType) ? (params.meal as MealType) : 'snack'),
  );

  const grams = useMemo(() => {
    if (!food || qty === null) return 0;
    if (unitIdx < 0) return qty;
    const s = food.servings[unitIdx];
    return s ? qty * s.grams : qty;
  }, [food, qty, unitIdx]);

  if (!food) {
    return (
      <Screen>
        <Txt>{t('food_missing')}</Txt>
        <Button title={t('back')} onPress={() => router.back()} />
      </Screen>
    );
  }

  const n = scaleNutrients(food.per100, grams);
  const unitOptions = [
    ...(food.source === 'quick' ? [] : [{ value: -1, label: unit }]),
    ...food.servings.map((s, i) => ({ value: i, label: `${s.label} (${fmt(s.grams)} ${unit})` })),
  ];

  const save = () => {
    if (!(grams > 0)) return;
    if (pick) {
      addToMealDraft({ food, grams });
      Haptics.selectionAsync().catch(() => {});
      router.dismissTo(params.pick === 'recipe' ? '/recipe-edit' : '/meal-edit');
      return;
    }
    if (editing) {
      updateEntry(entry!.id, { grams, meal });
      router.back();
    } else {
      addEntry({ date: params.date ?? dayKey(), meal, food, grams });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      leaveToDiary();
    }
  };

  /** Open Food Facts has the product but not its protein, carbs or fat: read them off the label instead. */
  const completeFromLabel = () => {
    setFoodDraft({ barcode: food.barcode, name: food.name, brand: food.brand, unit, servings: food.servings, issues: [] });
    router.push({ pathname: '/label', params: { barcode: food.barcode ?? '', ...(params.meal ? { meal: params.meal } : {}), ...(params.date ? { date: params.date } : {}) } });
  };

  /** Sends the user to Open Food Facts to add the product there; they sign in on that site, never in this app. */
  const contribute = () => {
    const code = food.barcode ?? '';
    showAlert(t('contribute_off'), t('contribute_off_text', { code }), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('open_site'), onPress: () => Linking.openURL(offContributeUrl(code, food.dataFrom === 'robotoff' || food.source === 'off', lang)).catch(() => {}) },
    ]);
  };

  const remove = () =>
    showAlert(t('delete_entry_q'), food.name, [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'),
        style: 'destructive',
        onPress: () => {
          removeEntry(entry!.id);
          router.back();
        },
      },
    ]);

  return (
    <Screen>
      <Stack.Screen options={{ title: pick ? t('add_ingredient') : editing ? t('edit_entry') : t('add_food') }} />
      <Row gap={12}>
        {food.imageUrl ? (
          <Image source={{ uri: food.imageUrl }} style={{ width: 64, height: 64, borderRadius: 12, backgroundColor: c.card }} />
        ) : null}
        <View style={{ flex: 1 }}>
          <Txt v="title">{food.name}</Txt>
          {food.brand ? <Txt v="sub">{food.brand}</Txt> : null}
          <Txt v="small">{t(`source_${food.source}`)}</Txt>
        </View>
      </Row>

      {food.source === 'off' && food.incomplete && food.barcode && !editing ? (
        <>
          <Banner icon="warning" tone="warn" text={t('off_incomplete')} />
          <Button kind="secondary" title={t('complete_from_label')} icon="camera-outline" onPress={completeFromLabel} />
        </>
      ) : null}

      <Card style={{ alignItems: 'center' }}>
        <Txt v="big">{Math.round(n.kcal)}</Txt>
        <Txt v="sub">kcal</Txt>
        <Row gap={24} style={{ marginTop: 8 }}>
          <Macro label={t('carbs')} value={n.carbs} color={c.carbs} />
          <Macro label={t('protein')} value={n.protein} color={c.protein} />
          <Macro label={t('fat')} value={n.fat} color={c.fat} />
        </Row>
      </Card>

      <Card style={{ gap: 12 }}>
        <Txt v="h3">{t('amount')}</Txt>
        <NumField value={qty} onChange={setQty} suffix={unitIdx < 0 ? unit : '×'} />
        {unitOptions.length > 1 ? <ChipGroup options={unitOptions} value={unitIdx} onChange={(v) => {
          // keep the same total amount when switching between grams and servings
          if (qty !== null) {
            const newServing = v >= 0 ? food.servings[v] : undefined;
            setQty(newServing ? Math.round((grams / newServing.grams) * 100) / 100 : Math.round(grams));
          }
          setUnitIdx(v);
        }} /> : null}
        {unitIdx >= 0 && food.source !== 'quick' ? <Txt v="small">= {fmt(grams)} {unit}</Txt> : null}
        {!pick ? (
          <>
            <Txt v="h3">{t('meal')}</Txt>
            <ChipGroup options={MEALS.map((m) => ({ value: m, label: t(`meal_${m}`) }))} value={meal} onChange={setMeal} />
          </>
        ) : null}
      </Card>

      <Button
        title={params.pick === '1' ? t('add_to_meal') : pick || !editing ? t('add') : t('save')}
        icon={editing ? 'checkmark' : 'add'}
        onPress={save}
        disabled={!(grams > 0)}
      />
      {editing ? <Button kind="ghost" title={t('delete')} icon="trash-outline" onPress={remove} /> : null}
      {!isSaved && (food.source === 'off' || food.source === 'ai') ? (
        <Button
          kind="ghost"
          icon="bookmark-outline"
          title={t('save_to_my_foods')}
          onPress={() => {
            saveCustomFood(food);
            Haptics.selectionAsync().catch(() => {});
          }}
        />
      ) : null}

      <Card>
        <Txt v="h3">{t('per_100', { unit })}</Txt>
        <NutrientTable n={food.per100} />
      </Card>
      {food.source === 'custom' && food.barcode && !pick ? (
        <Button kind="ghost" icon="globe-outline" title={t('contribute_off')} onPress={contribute} />
      ) : null}
      {food.dataFrom === 'label' ? <Txt v="small">{t('label_note')}</Txt> : null}
      {food.dataFrom === 'robotoff' ? <Txt v="small">{t('robotoff_note')}</Txt> : null}
      {food.source === 'off' || food.dataFrom === 'robotoff' ? <Txt v="small">{t('off_attribution')}</Txt> : null}
      {food.source === 'bls' ? <Txt v="small">{t('bls_attribution')}</Txt> : null}
      {food.source === 'ai' ? <Txt v="small">{t('ai_estimate_note')}</Txt> : null}
    </Screen>
  );
}

function Macro({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Txt v="h3" color={color}>
        {fmt(value, 1)} g
      </Txt>
      <Txt v="small">{label}</Txt>
    </View>
  );
}

function NutrientTable({ n }: { n: Nutrients }) {
  const { t } = useT();
  const rows: [string, number | undefined, string][] = [
    [t('energy'), n.kcal, 'kcal'],
    [t('carbs'), n.carbs, 'g'],
    [t('sugar'), n.sugar, 'g'],
    [t('fiber'), n.fiber, 'g'],
    [t('protein'), n.protein, 'g'],
    [t('fat'), n.fat, 'g'],
    [t('sat_fat'), n.satFat, 'g'],
    [t('salt'), n.salt, 'g'],
  ];
  return (
    <View>
      {rows
        .filter(([, v]) => v !== undefined)
        .map(([label, v, u], i) => (
          <React.Fragment key={label}>
            {i > 0 ? <Divider /> : null}
            <Row style={{ justifyContent: 'space-between', paddingVertical: 8 }}>
              <Txt v="sub">{label}</Txt>
              <Txt v="sub">
                {fmt(v!, u === 'kcal' ? 0 : 1)} {u}
              </Txt>
            </Row>
          </React.Fragment>
        ))}
    </View>
  );
}
