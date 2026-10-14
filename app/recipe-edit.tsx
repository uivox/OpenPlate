import * as Haptics from 'expo-haptics';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { Image, Platform, View } from 'react-native';
import { Button, Chip, Card, Divider, Field, IconButton, NumField, Row, Screen, SectionTitle, Txt } from '../src/components/ui';
import { showAlert } from '../src/lib/alert';
import { pickMealPhoto } from '../src/lib/device';
import { getMealDraft, setMealDraft, subscribeMealDraft } from '../src/lib/foodCache';
import { scaleNutrients } from '../src/lib/nutrition';
import { newRecipe, perServing, RECIPE_TAGS } from '../src/lib/recipes';
import { useStore } from '../src/lib/store';
import { useColors } from '../src/lib/theme';
import type { RecipeTag } from '../src/lib/types';
import { useT } from '../src/lib/useT';

/** Creates or edits an own recipe. Ingredients come from the normal search in "pick" mode. */
export default function RecipeEditScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const { t } = useT();
  const c = useColors();
  const draft = useSyncExternalStore(subscribeMealDraft, getMealDraft, getMealDraft);
  // returning from the ingredient picker can drop route params, so the draft carries the id too
  const editId = params.id ?? draft?.id;
  const existing = useStore((s) => (editId ? s.recipes.find((r) => r.id === editId) : undefined));
  const saveRecipe = useStore((s) => s.saveRecipe);

  const [servings, setServings] = useState<number | null>(existing?.servings ?? 2);
  const [minutes, setMinutes] = useState<number | null>(existing?.minutes ?? null);
  const [steps, setSteps] = useState<string[]>(existing?.steps.length ? existing.steps : ['']);
  const [tags, setTags] = useState<RecipeTag[]>(existing?.tags ?? []);
  const [photo, setPhoto] = useState<string | undefined>(existing?.photo);

  useEffect(() => {
    if (!getMealDraft()) setMealDraft(existing ? { id: existing.id, name: existing.name, items: existing.items } : { name: '', items: [] });
    // only on open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const name = draft?.name ?? '';
  const items = draft?.items ?? [];
  const update = (patch: Partial<NonNullable<typeof draft>>) => setMealDraft({ name, items, ...(draft ?? {}), ...patch });
  const clean = items.map((i) => ({ ...i, grams: i.grams || 0 }));
  const n = perServing({ items: clean, servings: servings && servings > 0 ? servings : 1 });

  const error = !name.trim()
    ? t('err_recipe_name')
    : items.length === 0 || items.some((i) => !(i.grams > 0))
      ? t('err_recipe_items')
      : !servings || servings < 1 || servings > 50
        ? t('err_servings')
        : null;

  const choosePhoto = (source: 'camera' | 'library') => {
    // Must start inside the tap handler (Safari), so no await before this call.
    pickMealPhoto(source, 640, 0.6)
      .then((p) => p && setPhoto(`data:image/jpeg;base64,${p.base64}`))
      .catch((e) => showAlert(t('error'), String(e?.message ?? e) === 'CAMERA_DENIED' ? t('camera_needed_text') : String(e?.message ?? e)));
  };

  const save = () => {
    if (error) return;
    const fields = {
      name: name.trim(),
      items,
      servings: Math.round(servings!),
      minutes: minutes && minutes > 0 ? Math.round(minutes) : undefined,
      steps: steps.map((s) => s.trim()).filter(Boolean),
      tags,
      photo,
    };
    const recipe = existing ? { ...existing, ...fields } : newRecipe(fields);
    saveRecipe(recipe);
    setMealDraft(null);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    if (existing) router.back();
    else router.replace({ pathname: '/recipe', params: { id: recipe.id } });
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: existing ? t('edit_recipe') : t('new_recipe') }} />

      <Card style={{ gap: 12 }}>
        <Field label={t('name')} placeholder={t('recipe_name_ph')} value={name} onChangeText={(v) => update({ name: v })} maxLength={60} />
        <Row gap={10} style={{ alignItems: 'flex-start' }}>
          <NumField label={t('servings')} value={servings} decimals={false} onChange={setServings} />
          <NumField label={t('minutes_label')} value={minutes} decimals={false} suffix="min" onChange={setMinutes} />
        </Row>
      </Card>

      <Card style={{ gap: 10 }}>
        <Txt v="h3">{t('photo')}</Txt>
        {photo ? <Image source={{ uri: photo }} style={{ width: '100%', aspectRatio: 16 / 10, borderRadius: 18, backgroundColor: c.cardAlt }} /> : null}
        <Row gap={8} style={{ flexWrap: 'wrap' }}>
          {Platform.OS !== 'web' ? <Button small kind="secondary" icon="camera-outline" title={t('take_photo')} onPress={() => choosePhoto('camera')} /> : null}
          <Button small kind="secondary" icon="image-outline" title={photo ? t('choose_photo') : t('add_photo')} onPress={() => choosePhoto('library')} />
          {photo ? <Button small kind="ghost" icon="trash-outline" title={t('remove_photo')} onPress={() => setPhoto(undefined)} /> : null}
        </Row>
      </Card>

      <SectionTitle
        right={
          items.length > 0 ? (
            <Txt v="label" color={c.text}>
              {Math.round(n.kcal)} kcal {t('per_serving')}
            </Txt>
          ) : undefined
        }
      >
        {t('ingredients')}
      </SectionTitle>
      <Card style={{ gap: 0 }}>
        {items.length === 0 ? <Txt v="sub">{t('meal_builder_empty')}</Txt> : null}
        {items.map((it, i) => (
          <View key={`${it.food.id}-${i}`}>
            {i > 0 ? <Divider /> : null}
            <Row gap={10} style={{ paddingVertical: 8 }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Txt numberOfLines={1}>{it.food.name}</Txt>
                <Txt v="small" numberOfLines={1}>
                  {Math.round(scaleNutrients(it.food.per100, it.grams || 0).kcal)} kcal
                </Txt>
              </View>
              <View style={{ width: 112 }}>
                <NumField
                  value={it.grams}
                  suffix={it.food.unit ?? 'g'}
                  onChange={(g) => update({ items: items.map((x, j) => (j === i ? { ...x, grams: g ?? NaN } : x)) })}
                />
              </View>
              <IconButton icon="close" size={18} color={c.sub} label={`${t('remove')}: ${it.food.name}`} onPress={() => update({ items: items.filter((_, j) => j !== i) })} />
            </Row>
          </View>
        ))}
      </Card>
      <Button kind="secondary" icon="add" title={t('add_ingredient')} onPress={() => router.push({ pathname: '/add-food', params: { pick: 'recipe' } })} />

      <SectionTitle>{t('steps_title')}</SectionTitle>
      <Card style={{ gap: 10 }}>
        {steps.map((s, i) => (
          <Row key={i} gap={6} style={{ alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <Field
                label={t('step_n', { n: i + 1 })}
                value={s}
                multiline
                onChangeText={(v) => setSteps(steps.map((x, j) => (j === i ? v : x)))}
                style={{ minHeight: 48 }}
              />
            </View>
            {steps.length > 1 ? (
              <View style={{ paddingTop: 22 }}>
                <IconButton icon="close" size={18} color={c.sub} label={`${t('remove')}: ${t('step_n', { n: i + 1 })}`} onPress={() => setSteps(steps.filter((_, j) => j !== i))} />
              </View>
            ) : null}
          </Row>
        ))}
        <Button small kind="ghost" icon="add" title={t('add_step')} style={{ alignSelf: 'flex-start' }} onPress={() => setSteps([...steps, ''])} />
      </Card>

      <Card style={{ gap: 10 }}>
        <Txt v="h3">{t('tags')}</Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {RECIPE_TAGS.map((tg) => (
            <Chip key={tg} label={t(`tag_${tg}`)} selected={tags.includes(tg)} onPress={() => setTags(tags.includes(tg) ? tags.filter((x) => x !== tg) : [...tags, tg])} />
          ))}
        </View>
      </Card>

      {error && (name || items.length) ? <Txt v="small">{error}</Txt> : null}
      <Button title={t('save_recipe')} icon="checkmark" onPress={save} disabled={!!error} />
    </Screen>
  );
}
