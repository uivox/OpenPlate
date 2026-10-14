import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';
import { RecipeImage } from '../src/components/RecipeCard';
import { mealForNow } from '../src/components/TabBar';
import { Button, Card, Divider, IconButton, Row, Screen, SectionTitle, Txt } from '../src/components/ui';
import { showAlert } from '../src/lib/alert';
import { dayKey } from '../src/lib/dates';
import { putFood, setMealDraft } from '../src/lib/foodCache';
import { fmt } from '../src/lib/format';
import { useRecipes } from '../src/lib/hooks';
import { scaleNutrients } from '../src/lib/nutrition';
import { newRecipe, perServing, recipeFood, scaleItems } from '../src/lib/recipes';
import { useStore } from '../src/lib/store';
import { useColors } from '../src/lib/theme';
import { MEALS, type MealType } from '../src/lib/types';
import { useT } from '../src/lib/useT';

/** A recipe: photo, nutrition per serving, ingredients for any number of servings, steps. */
export default function RecipeScreen() {
  const params = useLocalSearchParams<{ id?: string; meal?: string; date?: string }>();
  const { t } = useT();
  const c = useColors();
  const recipe = useRecipes().find((r) => r.id === params.id);
  const saveRecipe = useStore((s) => s.saveRecipe);
  const removeRecipe = useStore((s) => s.removeRecipe);
  const [cookFor, setCookFor] = useState<number | null>(null);

  if (!recipe) {
    return (
      <Screen>
        <Txt>{t('food_missing')}</Txt>
        <Button title={t('back')} onPress={() => router.back()} />
      </Screen>
    );
  }

  const servings = cookFor ?? recipe.servings;
  const items = scaleItems(recipe, servings);
  const n = perServing(recipe);
  const own = recipe.source === 'own';
  const tested = recipe.testedBy?.length ?? 0;

  const log = () => {
    const food = recipeFood(recipe, t('serving_label'));
    putFood(food);
    const meal = MEALS.includes(params.meal as MealType) ? (params.meal as MealType) : mealForNow();
    router.push({ pathname: '/food', params: { fid: food.id, date: params.date ?? dayKey(), meal } });
  };

  const edit = () => {
    setMealDraft({ id: recipe.id, name: recipe.name, items: recipe.items });
    router.push({ pathname: '/recipe-edit', params: { id: recipe.id } });
  };

  const copy = () => {
    const mine = newRecipe({
      name: recipe.name,
      items: recipe.items,
      servings: recipe.servings,
      steps: recipe.steps,
      minutes: recipe.minutes,
      tags: recipe.tags,
      // community photos are links; keep them so the copy still has a picture
      photo: recipe.photo,
      photoCredit: recipe.photoCredit,
    });
    saveRecipe(mine);
    router.replace({ pathname: '/recipe', params: { id: mine.id } });
  };

  const remove = () =>
    showAlert(t('delete_recipe_q'), recipe.name, [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'),
        style: 'destructive',
        onPress: () => {
          removeRecipe(recipe.id);
          router.back();
        },
      },
    ]);

  return (
    <Screen>
      <Stack.Screen options={{ title: t('tab_recipes') }} />
      <RecipeImage recipe={recipe} size="100%" radius={28} />
      <View style={{ gap: 4 }}>
        <Txt v="title">{recipe.name}</Txt>
        <Row gap={14} style={{ flexWrap: 'wrap' }}>
          {recipe.minutes ? (
            <Row gap={4}>
              <Ionicons name="time-outline" size={15} color={c.sub} />
              <Txt v="sub">{t('minutes_value', { n: recipe.minutes })}</Txt>
            </Row>
          ) : null}
          {recipe.tags.map((tg) => (
            <Txt key={tg} v="sub">
              {t(`tag_${tg}`)}
            </Txt>
          ))}
        </Row>
      </View>

      <Card style={{ alignItems: 'center' }}>
        <Txt v="big">{Math.round(n.kcal)}</Txt>
        <Txt v="sub">kcal {t('per_serving')}</Txt>
        <Row gap={24} style={{ marginTop: 8 }}>
          <Macro label={t('carbs')} value={n.carbs} color={c.carbs} />
          <Macro label={t('protein')} value={n.protein} color={c.protein} />
          <Macro label={t('fat')} value={n.fat} color={c.fat} />
        </Row>
        <Txt v="small" center style={{ marginTop: 6 }}>
          {t('recipe_nutrition_note')}
        </Txt>
      </Card>

      <Button title={t('add_to_diary')} icon="add" onPress={log} />

      <SectionTitle
        right={
          <Row gap={2}>
            <IconButton icon="remove" size={16} border={c.line} color={c.text} label="−" onPress={() => setCookFor(Math.max(1, servings - 1))} />
            <Txt v="h3" style={{ minWidth: 26, textAlign: 'center' }}>
              {servings}
            </Txt>
            <IconButton icon="add" size={16} border={c.line} color={c.text} label="+" onPress={() => setCookFor(Math.min(50, servings + 1))} />
          </Row>
        }
      >
        {t('ingredients')}
      </SectionTitle>
      <Txt v="small" style={{ paddingHorizontal: 4 }}>
        {servings === 1 ? t('ingredients_for_one') : t('ingredients_for', { n: servings })}
      </Txt>
      <Card style={{ gap: 0 }}>
        {items.map((it, i) => (
          <View key={`${it.food.id}-${i}`}>
            {i > 0 ? <Divider /> : null}
            <Row style={{ justifyContent: 'space-between', paddingVertical: 10 }} gap={10}>
              <Txt style={{ flex: 1 }} numberOfLines={2}>
                {it.food.name}
              </Txt>
              <Txt v="label" color={c.text}>
                {fmt(it.grams)} {it.food.unit ?? 'g'}
              </Txt>
              <Txt v="small" style={{ minWidth: 64, textAlign: 'right' }}>
                {Math.round(scaleNutrients(it.food.per100, it.grams).kcal)} kcal
              </Txt>
            </Row>
          </View>
        ))}
      </Card>

      {recipe.steps.length > 0 ? (
        <>
          <SectionTitle>{t('steps_title')}</SectionTitle>
          <Card style={{ gap: 14 }}>
            {recipe.steps.map((step, i) => (
              <Row key={i} gap={12} style={{ alignItems: 'flex-start' }}>
                <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                  <Txt v="label" color={c.accent}>
                    {i + 1}
                  </Txt>
                </View>
                <Txt style={{ flex: 1 }}>{step}</Txt>
              </Row>
            ))}
          </Card>
        </>
      ) : null}

      {recipe.source === 'community' ? (
        <Card tone="inset" style={{ gap: 6 }}>
          {recipe.author ? <Txt v="small">{t('recipe_by', { author: recipe.author })}</Txt> : null}
          <Row gap={6}>
            <Ionicons name={tested > 0 ? 'checkmark-circle' : 'flask-outline'} size={16} color={tested > 0 ? c.leaf : c.sub} />
            <Txt v="small" style={{ flex: 1 }}>
              {tested === 0 ? t('starter_recipe') : tested === 1 ? t('tested_by_one') : t('tested_by_n', { n: tested })}
            </Txt>
          </Row>
          {recipe.photoCredit ? <Txt v="small">{t('photo_credit', { credit: recipe.photoCredit })}</Txt> : null}
        </Card>
      ) : null}

      {own ? (
        <Row>
          <Button kind="secondary" icon="create-outline" title={t('edit')} onPress={edit} style={{ flex: 1 }} />
          <Button kind="ghost" icon="trash-outline" title={t('delete')} onPress={remove} style={{ flex: 1 }} />
        </Row>
      ) : (
        <Button kind="secondary" icon="copy-outline" title={t('copy_recipe')} onPress={copy} />
      )}
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
