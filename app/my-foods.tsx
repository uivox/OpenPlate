import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';
import { confirmDeleteFood } from '../src/components/foodActions';
import { Button, Card, ChipGroup, Divider, ListRow, Screen, Txt } from '../src/components/ui';
import { setMealDraft } from '../src/lib/foodCache';
import { foodSubtitle } from '../src/lib/format';
import { mealTotals } from '../src/lib/meals';
import { perServing } from '../src/lib/recipes';
import { useStore } from '../src/lib/store';
import { useColors } from '../src/lib/theme';
import { useT } from '../src/lib/useT';

type Kind = 'foods' | 'meals' | 'recipes';

/**
 * "My foods & meals": everything the user made themselves in one place. Each row opens its own
 * screen to edit or delete it: own foods the food form, saved meals and recipes their detail screen.
 */
export default function MyFoodsScreen() {
  const { t } = useT();
  const c = useColors();
  const foods = useStore((s) => s.customFoods);
  const meals = useStore((s) => s.meals);
  const recipes = useStore((s) => s.recipes);
  const [kind, setKind] = useState<Kind>('foods');
  const chevron = <Ionicons name="chevron-forward" size={18} color={c.sub} />;

  const create = () => {
    if (kind === 'foods') return router.push('/custom-food');
    setMealDraft({ name: '', items: [] });
    router.push(kind === 'meals' ? '/meal-edit' : '/recipe-edit');
  };

  const rows =
    kind === 'foods'
      ? [...foods]
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((f) => ({
            key: f.id,
            title: f.name,
            subtitle: foodSubtitle(f),
            open: () => router.push({ pathname: '/custom-food', params: { edit: f.id } }),
            remove: () => confirmDeleteFood(f, t),
          }))
      : kind === 'meals'
        ? [...meals]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((m) => ({
              key: m.id,
              title: m.name,
              subtitle: `${m.items.length === 1 ? t('meal_items_one') : t('meal_items_n', { n: m.items.length })} · ${Math.round(mealTotals(m.items).kcal)} kcal`,
              open: () => router.push({ pathname: '/meal', params: { id: m.id } }),
              remove: undefined,
            }))
        : [...recipes]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((r) => ({
              key: r.id,
              title: r.name,
              subtitle: `${Math.round(perServing(r).kcal)} kcal ${t('per_serving')}`,
              open: () => router.push({ pathname: '/recipe', params: { id: r.id } }),
              remove: undefined,
            }));

  return (
    <Screen>
      <Stack.Screen options={{ title: t('my_foods_meals') }} />
      <ChipGroup
        options={[
          { value: 'foods' as Kind, label: `${t('my_foods')} (${foods.length})` },
          { value: 'meals' as Kind, label: `${t('my_meals')} (${meals.length})` },
          { value: 'recipes' as Kind, label: `${t('my_recipes')} (${recipes.length})` },
        ]}
        value={kind}
        onChange={setKind}
      />
      {rows.length === 0 ? (
        <Card>
          <Txt v="sub">{t(kind === 'foods' ? 'my_foods_empty' : kind === 'meals' ? 'my_meals_empty' : 'my_recipes_empty')}</Txt>
        </Card>
      ) : (
        <Card>
          {rows.map((r, i) => (
            <View key={r.key}>
              {i > 0 ? <Divider /> : null}
              <ListRow title={r.title} subtitle={r.subtitle} right={chevron} onPress={r.open} onLongPress={r.remove} />
            </View>
          ))}
        </Card>
      )}
      <Txt v="small">{t('my_foods_hint')}</Txt>
      <Button
        kind="secondary"
        icon="add"
        title={t(kind === 'foods' ? 'create_food' : kind === 'meals' ? 'new_meal' : 'new_recipe')}
        onPress={create}
      />
    </Screen>
  );
}
