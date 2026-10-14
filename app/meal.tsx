import * as Haptics from 'expo-haptics';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';
import { Button, Card, ChipGroup, Divider, NumField, Row, Screen, SectionTitle, Txt } from '../src/components/ui';
import { showAlert } from '../src/lib/alert';
import { dayKey } from '../src/lib/dates';
import { setMealDraft } from '../src/lib/foodCache';
import { fmt } from '../src/lib/format';
import { mealTotals } from '../src/lib/meals';
import { leaveToDiary } from '../src/lib/nav';
import { scaleNutrients } from '../src/lib/nutrition';
import { useStore } from '../src/lib/store';
import { useColors } from '../src/lib/theme';
import { MEALS, type MealType } from '../src/lib/types';
import { useT } from '../src/lib/useT';

const FACTORS = [0.5, 1, 1.5, 2];

/** A saved meal: what's in it, and logging it (optionally scaled) to the diary. */
export default function MealScreen() {
  const params = useLocalSearchParams<{ id?: string; meal?: string; date?: string }>();
  const { t } = useT();
  const c = useColors();
  const saved = useStore((s) => s.meals.find((m) => m.id === params.id));
  const logMeal = useStore((s) => s.logMeal);
  const removeMeal = useStore((s) => s.removeMeal);
  const [factor, setFactor] = useState<number | null>(1);
  const [slot, setSlot] = useState<MealType>(MEALS.includes(params.meal as MealType) ? (params.meal as MealType) : 'snack');

  if (!saved) {
    return (
      <Screen>
        <Txt>{t('food_missing')}</Txt>
        <Button title={t('back')} onPress={() => router.back()} />
      </Screen>
    );
  }

  const f = factor && factor > 0 ? factor : 1;
  const total = mealTotals(saved.items, f);

  const log = () => {
    logMeal(saved.id, params.date ?? dayKey(), slot, f);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    leaveToDiary();
  };

  const edit = () => {
    setMealDraft({ id: saved.id, name: saved.name, items: saved.items });
    router.push('/meal-edit');
  };

  const remove = () =>
    showAlert(t('delete_meal_q'), saved.name, [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'),
        style: 'destructive',
        onPress: () => {
          removeMeal(saved.id);
          router.back();
        },
      },
    ]);

  return (
    <Screen>
      <Stack.Screen options={{ title: t('my_meals') }} />
      <View>
        <Txt v="title">{saved.name}</Txt>
        <Txt v="sub">{saved.items.length === 1 ? t('meal_items_one') : t('meal_items_n', { n: saved.items.length })}</Txt>
      </View>

      <Card style={{ alignItems: 'center' }}>
        <Txt v="big">{Math.round(total.kcal)}</Txt>
        <Txt v="sub">kcal</Txt>
        <Row gap={24} style={{ marginTop: 8 }}>
          <Macro label={t('carbs')} value={total.carbs} color={c.carbs} />
          <Macro label={t('protein')} value={total.protein} color={c.protein} />
          <Macro label={t('fat')} value={total.fat} color={c.fat} />
        </Row>
      </Card>

      <Card style={{ gap: 12 }}>
        <Txt v="h3">{t('portion_size')}</Txt>
        <ChipGroup
          options={FACTORS.map((v) => ({ value: v, label: `${String(v).replace('.', t('decimal_sep'))}×` }))}
          value={FACTORS.includes(factor ?? -1) ? factor : null}
          onChange={setFactor}
        />
        <NumField value={factor} onChange={setFactor} suffix="×" />
        <Txt v="h3">{t('meal')}</Txt>
        <ChipGroup options={MEALS.map((m) => ({ value: m, label: t(`meal_${m}`) }))} value={slot} onChange={setSlot} />
      </Card>

      <Button title={t('add_to_diary')} icon="add" onPress={log} />

      <SectionTitle>{t('ingredients')}</SectionTitle>
      <Card style={{ gap: 0 }}>
        {saved.items.map((it, i) => (
          <View key={`${it.food.id}-${i}`}>
            {i > 0 ? <Divider /> : null}
            <Row style={{ justifyContent: 'space-between', paddingVertical: 10 }} gap={10}>
              <View style={{ flex: 1 }}>
                <Txt numberOfLines={1}>{it.food.name}</Txt>
                <Txt v="small">
                  {fmt(it.grams * f)} {it.food.unit ?? 'g'}
                  {it.food.brand ? ` · ${it.food.brand}` : ''}
                </Txt>
              </View>
              <Txt v="label">{Math.round(scaleNutrients(it.food.per100, it.grams * f).kcal)} kcal</Txt>
            </Row>
          </View>
        ))}
      </Card>

      <Row>
        <Button kind="secondary" icon="create-outline" title={t('edit')} onPress={edit} style={{ flex: 1 }} />
        <Button kind="ghost" icon="trash-outline" title={t('delete')} onPress={remove} style={{ flex: 1 }} />
      </Row>
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
