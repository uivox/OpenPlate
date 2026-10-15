import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { RecipeCard } from '../src/components/RecipeCard';
import { Sprout } from '../src/components/Sprout';
import { Button, Card, ChipGroup, Divider, Field, IconButton, ListRow, Screen, SectionTitle, Tile, Txt, type IconName } from '../src/components/ui';
import { dayKey } from '../src/lib/dates';
import { putFood, setMealDraft } from '../src/lib/foodCache';
import { foodSubtitle } from '../src/lib/format';
import { searchBLS } from '../src/lib/bls';
import { searchGeneric } from '../src/lib/genericFoods';
import { useRecipes } from '../src/lib/hooks';
import { mealTotals, searchMeals } from '../src/lib/meals';
import { leaveToDiary } from '../src/lib/nav';
import { isBarcode, lookupBarcode, RateLimitedError, searchOFF } from '../src/lib/openFoodFacts';
import { useStore } from '../src/lib/store';
import { useColors } from '../src/lib/theme';
import { MEALS, type Food, type MealType, type SavedMeal } from '../src/lib/types';
import { useT } from '../src/lib/useT';

type ListTab = 'recent' | 'meals' | 'recipes' | 'mine';

export default function AddFoodScreen() {
  const params = useLocalSearchParams<{ meal?: string; date?: string; pick?: string }>();
  const meal: MealType = MEALS.includes(params.meal as MealType) ? (params.meal as MealType) : 'snack';
  const date = params.date ?? dayKey();
  /** Picking an ingredient for the meal ('1') or recipe ('recipe') builder instead of logging to the diary. */
  const pick = params.pick === '1' || params.pick === 'recipe';
  const { t, lang } = useT();
  const c = useColors();
  const recent = useStore((s) => s.recentFoods);
  const custom = useStore((s) => s.customFoods);
  const meals = useStore((s) => s.meals);
  const recipes = useRecipes();
  const logMeal = useStore((s) => s.logMeal);
  const [tab, setTab] = useState<ListTab>('recent');

  const [query, setQuery] = useState('');
  const [remote, setRemote] = useState<Food[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const q = query.trim();
  const local = useMemo(() => {
    if (!q) return [];
    const ql = q.toLowerCase();
    const mine = [...custom, ...recent].filter(
      (f, i, arr) => f.name.toLowerCase().includes(ql) && arr.findIndex((x) => x.id === f.id) === i,
    );
    const generic = searchGeneric(q, lang, 5).filter((g) => !mine.some((m) => m.id === g.id));
    // the national nutrient database fills in everything unpackaged that the basics list lacks
    const taken = new Set([...mine, ...generic].map((f) => f.name.toLowerCase()));
    const bls = searchBLS(q, lang, 10).filter((b) => !mine.some((m) => m.id === b.id) && !taken.has(b.name.toLowerCase()));
    return [...mine.slice(0, 6), ...generic, ...bls];
  }, [q, custom, recent, lang]);

  // Open Food Facts is only asked when the user submits (their fair-use rules ask apps not to
  // search on every keystroke); local foods update while typing.
  const [searched, setSearched] = useState('');
  useEffect(() => {
    if (q === searched) return;
    requestId.current++;
    setSearched('');
    setRemote([]);
    setLoading(false);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, lang]);

  const searchProducts = async () => {
    if (q.length < 2 || loading) return;
    const id = ++requestId.current;
    setSearched(q);
    setLoading(true);
    setError(null);
    try {
      const res = isBarcode(q) ? ((await lookupBarcode(q, lang)) ?? undefined) : await searchOFF(q, lang);
      const list = Array.isArray(res) ? res : res ? [res] : [];
      if (id === requestId.current) setRemote(list.filter((r) => !local.some((l) => l.id === r.id)));
    } catch (e) {
      if (id === requestId.current) setError(e instanceof RateLimitedError ? t('search_rate_limited') : t('search_failed'));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  };

  const matchingMeals = useMemo(() => (q && !pick ? searchMeals(meals, q).slice(0, 4) : []), [q, meals, pick]);
  const pickParam = pick ? { pick: params.pick! } : {};

  const open = (f: Food) => {
    putFood(f);
    router.push({ pathname: '/food', params: { fid: f.id, meal, date, ...pickParam } });
  };

  const openMeal = (m: SavedMeal) => router.push({ pathname: '/meal', params: { id: m.id, meal, date } });
  const quickLogMeal = (m: SavedMeal) => {
    logMeal(m.id, date, meal);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    leaveToDiary();
  };
  const newMealFlow = () => {
    setMealDraft({ name: '', items: [] });
    router.push('/meal-edit');
  };

  const renderMeal = (m: SavedMeal, i: number) => (
    <React.Fragment key={m.id}>
      {i > 0 ? <Divider /> : null}
      <ListRow
        icon="restaurant-outline"
        title={m.name}
        subtitle={`${m.items.length === 1 ? t('meal_items_one') : t('meal_items_n', { n: m.items.length })} · ${Math.round(mealTotals(m.items).kcal)} kcal`}
        onPress={() => openMeal(m)}
        right={<IconButton icon="add-circle" size={26} label={`${t('add')}: ${m.name}`} onPress={() => quickLogMeal(m)} />}
      />
    </React.Fragment>
  );

  const renderFood = (f: Food) => (
    <ListRow
      key={f.id}
      title={f.name}
      subtitle={foodSubtitle(f)}
      onPress={() => open(f)}
      right={<Ionicons name="add-circle" size={26} color={c.accent} />}
    />
  );

  return (
    <Screen>
      <Stack.Screen options={{ title: pick ? t('add_ingredient') : t(`meal_${meal}`) }} />
      <Field
        placeholder={t('search_placeholder')}
        value={query}
        onChangeText={setQuery}
        autoCorrect={false}
        returnKeyType="search"
        onSubmitEditing={searchProducts}
        clearButtonMode="while-editing"
      />

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Action icon="barcode-outline" bg={c.meal.breakfast.tile} color={c.meal.breakfast.icon} label={t('scan')} onPress={() => router.push({ pathname: '/scan', params: { meal, date, ...pickParam } })} />
        {!pick ? (
          <>
            <Action icon="sparkles" bg={c.accent} color={c.accentText} label={t('ai_photo_short')} onPress={() => router.push({ pathname: '/photo', params: { meal, date } })} />
            <Action icon="flash" bg={c.meal.dinner.tile} color={c.meal.dinner.icon} label={t('quick_add')} onPress={() => router.push({ pathname: '/custom-food', params: { meal, date, mode: 'quick' } })} />
          </>
        ) : null}
        <Action icon="create" bg={c.meal.lunch.tile} color={c.meal.lunch.icon} label={t('create_food_short')} onPress={() => router.push({ pathname: '/custom-food', params: { meal, date, ...pickParam } })} />
      </View>

      {q ? (
        <>
          {matchingMeals.length > 0 ? <Card>{matchingMeals.map(renderMeal)}</Card> : null}
          {local.length > 0 ? <Card>{local.map(renderFood)}</Card> : null}
          <SectionTitle right={loading ? <ActivityIndicator color={c.accent} /> : undefined}>{t('products')}</SectionTitle>
          {error ? <Txt v="sub">{error}</Txt> : null}
          {q.length >= 2 && searched !== q && !loading ? (
            <Button small kind="secondary" icon="search" title={t('search_products', { q })} onPress={searchProducts} style={{ alignSelf: 'flex-start' }} />
          ) : null}
          {!loading && !error && remote.length === 0 && q.length >= 2 && searched === q ? <Txt v="sub">{t('no_results')}</Txt> : null}
          {remote.length > 0 ? <Card>{remote.map(renderFood)}</Card> : null}
          <Txt v="small">{t('off_attribution')}</Txt>
          {local.some((f) => f.source === 'bls') ? <Txt v="small">{t('bls_attribution')}</Txt> : null}
          {lang === 'de' && !/^(lidl|aldi|rewe|edeka|kaufland|penny|netto|dm|rossmann)\b/i.test(q) ? <Txt v="small">{t('retailer_hint')}</Txt> : null}
        </>
      ) : (
        <>
          <ChipGroup<ListTab>
            options={[
              { value: 'recent', label: t('recent') },
              ...(pick
                ? []
                : [
                    { value: 'meals' as ListTab, label: t('my_meals') },
                    { value: 'recipes' as ListTab, label: t('tab_recipes') },
                  ]),
              { value: 'mine', label: t('my_foods') },
            ]}
            value={tab}
            onChange={setTab}
          />
          {tab === 'recent' ? (
            recent.length > 0 ? (
              <Card>{recent.slice(0, 15).map(renderFood)}</Card>
            ) : (
              <View style={{ alignItems: 'center', gap: 8, paddingVertical: 20 }}>
                <Sprout size={100} />
                <Txt v="sub" center style={{ maxWidth: 280 }}>
                  {t('add_food_empty')}
                </Txt>
              </View>
            )
          ) : null}
          {tab === 'meals' ? (
            <>
              {meals.length > 0 ? <Card>{searchMeals(meals, '').map(renderMeal)}</Card> : <Txt v="sub">{t('meals_empty')}</Txt>}
              <Button kind="secondary" icon="add" title={t('new_meal')} onPress={newMealFlow} />
            </>
          ) : null}
          {tab === 'recipes' ? (
            <View style={{ gap: 10 }}>
              {recipes.map((r) => (
                <RecipeCard key={r.id} recipe={r} onPress={() => router.push({ pathname: '/recipe', params: { id: r.id, meal, date } })} />
              ))}
            </View>
          ) : null}
          {tab === 'mine' ? (
            custom.length > 0 ? (
              <Card>
                {custom.map((f, i) => (
                  <React.Fragment key={f.id}>
                    {i > 0 ? <Divider /> : null}
                    {renderFood(f)}
                  </React.Fragment>
                ))}
              </Card>
            ) : (
              <Button kind="secondary" icon="add" title={t('create_food')} onPress={() => router.push({ pathname: '/custom-food', params: { meal, date, ...pickParam } })} />
            )
          ) : null}
        </>
      )}
    </Screen>
  );
}

function Action({ icon, label, onPress, bg, color }: { icon: IconName; label: string; onPress: () => void; bg: string; color: string }) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        flex: 1,
        backgroundColor: c.card,
        borderRadius: 20,
        paddingVertical: 14,
        alignItems: 'center',
        gap: 8,
        transform: [{ scale: pressed ? 0.96 : 1 }],
      })}
    >
      <Tile icon={icon} bg={bg} color={color} size={42} />
      <Txt v="label" color={c.text} center numberOfLines={1}>
        {label}
      </Txt>
    </Pressable>
  );
}
