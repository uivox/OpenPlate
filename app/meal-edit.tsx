import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router, Stack } from 'expo-router';
import React, { useEffect, useSyncExternalStore } from 'react';
import { View } from 'react-native';
import { Button, Card, Divider, Field, IconButton, NumField, Row, Screen, SectionTitle, Txt } from '../src/components/ui';
import { getMealDraft, setMealDraft, subscribeMealDraft } from '../src/lib/foodCache';
import { fmt } from '../src/lib/format';
import { mealTotals, newMeal } from '../src/lib/meals';
import { scaleNutrients } from '../src/lib/nutrition';
import { useStore } from '../src/lib/store';
import { useColors } from '../src/lib/theme';
import { useT } from '../src/lib/useT';

/** Builds or edits a saved meal. Ingredients come from the normal add-food search in "pick" mode. */
export default function MealEditScreen() {
  const { t } = useT();
  const c = useColors();
  const draft = useSyncExternalStore(subscribeMealDraft, getMealDraft, getMealDraft);
  const existing = useStore((s) => (draft?.id ? s.meals.find((m) => m.id === draft.id) : undefined));
  const saveMeal = useStore((s) => s.saveMeal);

  useEffect(() => {
    if (!getMealDraft()) setMealDraft({ name: '', items: [] });
  }, []);

  const name = draft?.name ?? '';
  const items = draft?.items ?? [];
  const update = (patch: Partial<NonNullable<typeof draft>>) => setMealDraft({ name, items, ...(draft ?? {}), ...patch });
  // grams is NaN while a field is cleared; count it as 0 for the totals
  const total = mealTotals(items.map((i) => ({ ...i, grams: i.grams || 0 })));

  const error = !name.trim() ? t('err_meal_name') : items.length === 0 || items.some((i) => !(i.grams > 0)) ? t('err_meal_items') : null;

  const save = () => {
    if (error) return;
    const meal = existing ? { ...existing, name: name.trim(), items } : newMeal(name, items);
    saveMeal(meal);
    setMealDraft(null);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    router.back();
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: existing ? t('edit_meal') : t('new_meal') }} />
      <Card>
        <Field label={t('name')} placeholder={t('meal_name_ph')} value={name} onChangeText={(v) => update({ name: v })} maxLength={40} />
      </Card>

      <SectionTitle
        right={
          items.length > 0 ? (
            <Txt v="label" color={c.text}>
              {Math.round(total.kcal)} kcal
            </Txt>
          ) : undefined
        }
      >
        {t('ingredients')}
      </SectionTitle>
      <Card style={{ gap: 0 }}>
        {items.length === 0 ? <Txt v="sub">{t('meal_builder_empty')}</Txt> : null}
        {items.map((it, i) => {
          const kcal = scaleNutrients(it.food.per100, it.grams || 0).kcal;
          return (
            <View key={`${it.food.id}-${i}`}>
              {i > 0 ? <Divider /> : null}
              <Row gap={10} style={{ paddingVertical: 8 }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt numberOfLines={1}>{it.food.name}</Txt>
                  <Txt v="small" numberOfLines={1}>
                    {[it.food.brand, `${Math.round(kcal)} kcal`].filter(Boolean).join(' · ')}
                  </Txt>
                </View>
                <View style={{ width: 112 }}>
                  <NumField
                    value={it.grams}
                    suffix={it.food.unit ?? 'g'}
                    onChange={(g) => update({ items: items.map((x, j) => (j === i ? { ...x, grams: g ?? NaN } : x)) })}
                  />
                </View>
                <IconButton
                  icon="close"
                  size={18}
                  color={c.sub}
                  label={`${t('remove')}: ${it.food.name}`}
                  onPress={() => update({ items: items.filter((_, j) => j !== i) })}
                />
              </Row>
            </View>
          );
        })}
      </Card>
      <Button kind="secondary" icon="add" title={t('add_ingredient')} onPress={() => router.push({ pathname: '/add-food', params: { pick: '1' } })} />

      {items.length > 0 ? (
        <Card tone="inset" style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
          <Macro label={t('carbs')} value={total.carbs} color={c.carbs} />
          <Macro label={t('protein')} value={total.protein} color={c.protein} />
          <Macro label={t('fat')} value={total.fat} color={c.fat} />
        </Card>
      ) : null}

      {error && (name || items.length) ? (
        <Row gap={6}>
          <Ionicons name="information-circle-outline" size={16} color={c.sub} />
          <Txt v="small">{error}</Txt>
        </Row>
      ) : null}
      <Button title={t('save_meal')} icon="checkmark" onPress={save} disabled={!!error} />
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
