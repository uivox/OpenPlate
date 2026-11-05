import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { RecipeCard } from '../src/components/RecipeCard';
import { Sprout } from '../src/components/Sprout';
import { Button, Card, ChipGroup, Divider, Field, IconButton, ListRow, Screen, SectionTitle, Tile, Txt, type IconName } from '../src/components/ui';
import { dayKey, locale, parseDayKey } from '../src/lib/dates';
import { looksLikeBarcode } from '../src/lib/barcode';
import { flowParams, resolveBarcode } from '../src/lib/barcodeFlow';
import { putFood, setFoodDraft, setMealDraft, type FoodDraft } from '../src/lib/foodCache';
import { foodSubtitle } from '../src/lib/format';
import { searchBLS } from '../src/lib/bls';
import { searchGeneric } from '../src/lib/genericFoods';
import { searchRestaurants } from '../src/lib/restaurants';
import { useBlsReady, useRecipes, useRestaurantsReady } from '../src/lib/hooks';
import { mealTotals, searchMeals } from '../src/lib/meals';
import { leaveToDiary } from '../src/lib/nav';
import { lookupFailure, RateLimitedError, searchOFFPage, type LookupFailure, type PartialProduct } from '../src/lib/openFoodFacts';
import { showAlert } from '../src/lib/alert';
import {
  appendPage,
  filterHistory,
  foodHistory,
  HISTORY_FILTER_FROM,
  HISTORY_PAGE,
  matchesFood,
  OFF_PAGE_SIZE,
  sectionPage,
  shownCount,
  type HistoryItem,
  type SearchSection,
} from '../src/lib/foodHistory';
import { currentPack, usePack } from '../src/lib/packRuntime';
import { useStore } from '../src/lib/store';
import { useColors } from '../src/lib/theme';
import { MEALS, type Food, type MealType, type SavedMeal } from '../src/lib/types';
import { useT } from '../src/lib/useT';
import { confirmLogging } from '../src/components/fastGuard';

type ListTab = 'recent' | 'meals' | 'recipes' | 'mine';

const NO_TAPS: Record<SearchSection, number> = { mine: 0, generic: 0, restaurant: 0, bls: 0, pack: 0 };

/** A barcode typed into the search box that didn't lead straight to a product. */
type BarcodeState = { kind: 'missing'; code: string; draft: FoodDraft; partial?: PartialProduct } | { kind: 'failed'; code: string; failure: LookupFailure };

export default function AddFoodScreen() {
  const params = useLocalSearchParams<{ meal?: string; date?: string; pick?: string }>();
  const meal: MealType = MEALS.includes(params.meal as MealType) ? (params.meal as MealType) : 'snack';
  const date = params.date ?? dayKey();
  /** Picking an ingredient for the meal ('1') or recipe ('recipe') builder instead of logging to the diary. */
  const pick = params.pick === '1' || params.pick === 'recipe';
  const { t, lang } = useT();
  const c = useColors();
  const entries = useStore((s) => s.entries);
  const custom = useStore((s) => s.customFoods);
  const hidden = useStore((s) => s.hiddenHistory);
  const hide = useStore((s) => s.hideFromHistory);
  // Every food ever logged, built from the diary (the old recent list kept only 40).
  const history = useMemo(() => foodHistory(entries, custom, hidden), [entries, custom, hidden]);
  const [historyFilter, setHistoryFilter] = useState('');
  const [historyShown, setHistoryShown] = useState(HISTORY_PAGE);
  const meals = useStore((s) => s.meals);
  const recipes = useRecipes();
  const logMeal = useStore((s) => s.logMeal);
  const [tab, setTab] = useState<ListTab>('recent');

  const [query, setQuery] = useState('');
  const [remote, setRemote] = useState<Food[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [barcode, setBarcode] = useState<BarcodeState | null>(null);
  /** Open Food Facts: the last page fetched, whether there is another, and a failed *Load more*. */
  const [offPage, setOffPage] = useState(0);
  const [offMore, setOffMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  /** Taps on *Show more* per section; back to none for every new search text. */
  const [taps, setTaps] = useState(NO_TAPS);
  const showMore = (section: SearchSection) => setTaps((x) => ({ ...x, [section]: x[section] + 1 }));
  const requestId = useRef(0);

  const q = query.trim();
  // The BLS database is loaded when this screen opens (usually already a few seconds after start).
  const blsReady = useBlsReady();
  // Fast-food chains' menus (Profile → Layout can turn them off).
  const restaurantsOn = useStore((s) => s.layout.restaurantFoods !== false);
  const restaurantsReady = useRestaurantsReady(restaurantsOn);
  // Each section asks for one item more than it shows, so *Show more* only appears when there is one.
  const sections = useMemo(() => {
    const none = { visible: [] as Food[], more: false };
    if (!q) return { mine: none, generic: none, restaurant: none, bls: none };
    const limit = (s: SearchSection) => shownCount(s, taps[s]) + 1;
    const mine = [...custom, ...history.map((h) => h.food)].filter((f, i, arr) => matchesFood(f, q) && arr.findIndex((x) => x.id === f.id) === i);
    const generic = searchGeneric(q, lang, limit('generic') + mine.length).filter((g) => !mine.some((m) => m.id === g.id));
    // the national nutrient database fills in everything unpackaged that the basics list lacks
    const restaurant = (restaurantsOn && restaurantsReady ? searchRestaurants(q, lang, limit('restaurant') + mine.length) : []).filter((r) => !mine.some((m) => m.id === r.id));
    const genericPage = sectionPage(generic, shownCount('generic', taps.generic));
    const taken = new Set([...mine, ...genericPage.visible].map((f) => f.name.toLowerCase()));
    const bls = (blsReady ? searchBLS(q, lang, limit('bls') + taken.size) : []).filter((b) => !mine.some((m) => m.id === b.id) && !taken.has(b.name.toLowerCase()));
    return {
      mine: sectionPage(mine, shownCount('mine', taps.mine)),
      generic: genericPage,
      restaurant: sectionPage(restaurant, shownCount('restaurant', taps.restaurant)),
      bls: sectionPage(bls, shownCount('bls', taps.bls)),
    };
  }, [q, custom, history, lang, blsReady, restaurantsOn, restaurantsReady, taps]);
  const local = useMemo(() => [...sections.mine.visible, ...sections.generic.visible, ...sections.restaurant.visible, ...sections.bls.visible], [sections]);

  // The offline pack is searched on the phone while typing (a short pause after the last key, it holds
  // hundreds of thousands of products); Open Food Facts itself only when the user submits.
  const pack = usePack();
  const [packQuery, setPackQuery] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setPackQuery(q), 250);
    return () => clearTimeout(id);
  }, [q]);
  const packSection = useMemo(() => {
    if (pack.status !== 'ready' || packQuery.length < 2 || looksLikeBarcode(packQuery)) return { visible: [] as Food[], more: false };
    const shown = shownCount('pack', taps.pack);
    return sectionPage(pack.index.search(packQuery, shown + 1 + local.length).filter((f) => !local.some((l) => l.id === f.id)), shown);
  }, [pack, packQuery, local, taps.pack]);
  const packHits = packSection.visible;
  const packDate = pack.status === 'ready' ? new Date(pack.manifest.created).toLocaleDateString(locale(lang)) : '';
  const shownRemote = remote.filter((r) => !packHits.some((p) => p.id === r.id));

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
    setBarcode(null);
    setOffPage(0);
    setOffMore(false);
    setLoadingMore(false);
    setMoreError(null);
    setTaps(NO_TAPS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, lang]);

  // Only digits, as many as a barcode has: look the barcode up instead of searching names.
  const asBarcode = looksLikeBarcode(q);
  const pickParam = pick ? { pick: params.pick! } : {};
  const barcodeParams = (code: string) => flowParams({ meal, date, ...pickParam, barcode: code });

  const searchProducts = async () => {
    if (q.length < 2 || loading) return;
    const id = ++requestId.current;
    setSearched(q);
    setLoading(true);
    setError(null);
    setBarcode(null);
    setOffPage(0);
    setOffMore(false);
    setMoreError(null);
    try {
      if (asBarcode) {
        const out = await resolveBarcode(q, lang, custom, fetch, currentPack());
        if (id !== requestId.current) return;
        if (out.kind === 'found') setRemote([out.food]);
        else if (out.kind === 'suggestion') {
          // Straight to the form with the suggested values, as in the scanner; coming back shows the choices.
          setBarcode({ kind: 'missing', code: out.code, draft: out.draft });
          setFoodDraft(out.draft);
          router.push({ pathname: '/custom-food', params: { ...barcodeParams(out.code), draft: '1' } });
        } else setBarcode({ kind: 'missing', code: out.code, draft: out.draft, partial: out.partial });
        return;
      }
      const res = await searchOFFPage(q, lang, 1, OFF_PAGE_SIZE);
      if (id !== requestId.current) return;
      setRemote(res.foods.filter((r) => !local.some((l) => l.id === r.id)));
      setOffPage(1);
      setOffMore(res.more);
    } catch (e) {
      if (id !== requestId.current) return;
      if (asBarcode) setBarcode({ kind: 'failed', code: q.replace(/\s+/g, ''), failure: lookupFailure(e) });
      else setError(e instanceof RateLimitedError ? t('search_rate_limited') : t('search_failed'));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  };

  /** The next page of Open Food Facts results: only on a tap, and it counts toward the searches a minute. */
  const loadMore = async () => {
    if (loadingMore || loading || !offPage || searched !== q) return;
    const id = requestId.current;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const res = await searchOFFPage(q, lang, offPage + 1, OFF_PAGE_SIZE);
      if (id !== requestId.current) return;
      setRemote((shown) => appendPage(shown, res.foods.filter((r) => !local.some((l) => l.id === r.id))));
      setOffPage(offPage + 1);
      setOffMore(res.more);
    } catch (e) {
      if (id === requestId.current) setMoreError(e instanceof RateLimitedError ? t('search_rate_limited') : t('search_failed'));
    } finally {
      if (id === requestId.current) setLoadingMore(false);
    }
  };

  /** The same choices the scanner offers when a barcode doesn't lead to a product. */
  const readLabel = (b: BarcodeState & { kind: 'missing' }) => {
    setFoodDraft(b.draft);
    router.push({ pathname: '/label', params: barcodeParams(b.code) });
  };
  const typeIn = (b: BarcodeState) => {
    const valid = b.kind === 'missing' || b.failure !== 'invalid';
    setFoodDraft(b.kind === 'missing' ? b.draft : { barcode: valid ? b.code : undefined, unit: 'g', servings: [], issues: [] });
    router.push({ pathname: '/custom-food', params: { ...(valid ? barcodeParams(b.code) : flowParams({ meal, date, ...pickParam })), draft: '1' } });
  };

  const renderBarcode = (b: BarcodeState) => {
    const [title, text] =
      b.kind === 'missing'
        ? b.partial
          ? [t('incomplete_title'), t('incomplete_text', { name: b.partial.name ?? b.code })]
          : [t('not_found'), t('not_found_text', { code: b.code })]
        : b.failure === 'invalid'
          ? [t('barcode_invalid'), t('barcode_invalid_text', { code: b.code })]
          : b.failure === 'rate_limited'
            ? [t('barcode_rate_limited'), t('barcode_rate_limited_text')]
            : b.failure === 'server'
              ? [t('server_error'), t('server_error_text')]
              : [t('network_error'), t('network_error_text')];
    return (
      <Card style={{ gap: 10 }}>
        <Txt v="h3">{title}</Txt>
        <Txt v="sub">{text}</Txt>
        {b.kind === 'failed' && b.failure === 'invalid' ? null : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {b.kind === 'missing' ? <Button small icon="camera-outline" title={t('scan_label')} onPress={() => readLabel(b)} /> : null}
            <Button small kind="secondary" icon="create-outline" title={t('type_in')} onPress={() => typeIn(b)} />
            {b.kind === 'failed' && b.failure !== 'rate_limited' ? <Button small kind="secondary" icon="refresh" title={t('try_again')} onPress={searchProducts} /> : null}
          </View>
        )}
      </Card>
    );
  };

  const matchingMeals = useMemo(() => (q && !pick ? searchMeals(meals, q).slice(0, 4) : []), [q, meals, pick]);

  const open = (f: Food) => {
    putFood(f);
    router.push({ pathname: '/food', params: { fid: f.id, meal, date, ...pickParam } });
  };

  const openMeal = (m: SavedMeal) => router.push({ pathname: '/meal', params: { id: m.id, meal, date } });
  const quickLogMeal = (m: SavedMeal) =>
    confirmLogging(date, () => {
      logMeal(m.id, date, meal);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      leaveToDiary();
    });
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

  /** One search section in its own card, with *Show more* at the end when it has more. */
  const renderSection = (section: SearchSection, page: { visible: Food[]; more: boolean }) =>
    page.visible.length > 0 ? (
      <Card key={section}>
        {page.visible.map(renderFood)}
        {page.more ? <MoreRow label={t('show_more')} onPress={() => showMore(section)} testID={`show-more-${section}`} /> : null}
      </Card>
    ) : null;

  const lastDay = (key: string) =>
    parseDayKey(key).toLocaleDateString(locale(lang), {
      day: 'numeric',
      month: 'short',
      ...(key.slice(0, 4) !== String(new Date().getFullYear()) ? { year: 'numeric' } : {}),
    });
  const askRemove = (h: HistoryItem) =>
    showAlert(t('history_remove_q', { name: h.food.name }), t('history_remove_text'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('history_remove'), style: 'destructive', onPress: () => hide(h.food.id) },
    ]);
  const renderHistory = (h: HistoryItem, i: number) => (
    <React.Fragment key={h.food.id}>
      {i > 0 ? <Divider /> : null}
      <ListRow
        title={h.food.name}
        subtitle={`${t('history_line', { n: h.count, date: lastDay(h.lastDate) })} · ${foodSubtitle(h.food)}`}
        onPress={() => open(h.food)}
        onLongPress={() => askRemove(h)}
        right={<Ionicons name="add-circle" size={26} color={c.accent} />}
      />
    </React.Fragment>
  );
  const filteredHistory = historyFilter.trim() ? filterHistory(history, historyFilter) : history;

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
          {renderSection('mine', sections.mine)}
          {renderSection('generic', sections.generic)}
          {renderSection('restaurant', sections.restaurant)}
          {renderSection('bls', sections.bls)}
          <SectionTitle right={loading ? <ActivityIndicator color={c.accent} /> : undefined}>{t('products')}</SectionTitle>
          {error ? <Txt v="sub">{error}</Txt> : null}
          {q.length >= 2 && searched !== q && !loading ? (
            <Button
              small
              kind="secondary"
              icon={asBarcode ? 'barcode-outline' : 'search'}
              title={asBarcode ? t('barcode_search', { code: q }) : t('search_products', { q })}
              onPress={searchProducts}
              style={{ alignSelf: 'flex-start' }}
            />
          ) : null}
          {barcode && searched === q && !loading ? renderBarcode(barcode) : null}
          {!barcode ? renderSection('pack', packSection) : null}
          {!loading && !error && !barcode && remote.length === 0 && packHits.length === 0 && q.length >= 2 && searched === q ? <Txt v="sub">{t('no_results')}</Txt> : null}
          {shownRemote.length > 0 ? (
            <Card>
              {shownRemote.map(renderFood)}
              {offMore && searched === q && !asBarcode ? (
                loadingMore ? (
                  <ActivityIndicator color={c.accent} style={{ paddingVertical: 12 }} />
                ) : (
                  <MoreRow label={t('load_more_off')} onPress={loadMore} testID="load-more-off" />
                )
              ) : null}
            </Card>
          ) : null}
          {moreError ? <Txt v="sub">{moreError}</Txt> : null}
          <Txt v="small">{t('off_attribution')}</Txt>
          {packHits.length > 0 ? <Txt v="small">{t('pack_search_note', { date: packDate })}</Txt> : null}
          {local.some((f) => f.source === 'restaurant') ? <Txt v="small">{t('restaurant_attribution')}</Txt> : null}
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
            history.length > 0 ? (
              <>
                {history.length > HISTORY_FILTER_FROM ? (
                  <Field
                    placeholder={t('history_filter')}
                    value={historyFilter}
                    onChangeText={(v) => {
                      setHistoryFilter(v);
                      setHistoryShown(HISTORY_PAGE);
                    }}
                    autoCorrect={false}
                    clearButtonMode="while-editing"
                  />
                ) : null}
                {filteredHistory.length > 0 ? (
                  <Card>
                    {filteredHistory.slice(0, historyShown).map(renderHistory)}
                    {filteredHistory.length > historyShown ? (
                      <MoreRow label={t('show_more')} onPress={() => setHistoryShown((n) => n + HISTORY_PAGE)} testID="show-more-history" />
                    ) : null}
                  </Card>
                ) : (
                  <Txt v="sub">{t('history_no_match', { q: historyFilter.trim() })}</Txt>
                )}
                <Txt v="small">{t('history_hint')}</Txt>
              </>
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

/** *Show more* / *Load more* at the end of a list card. */
function MoreRow({ label, onPress, testID }: { label: string; onPress: () => void; testID?: string }) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, opacity: pressed ? 0.6 : 1 })}
    >
      <Ionicons name="chevron-down" size={18} color={c.accent} />
      <Txt v="label" color={c.accent}>
        {label}
      </Txt>
    </Pressable>
  );
}
