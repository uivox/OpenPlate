import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { Card, Divider, Field, ListRow, Screen, SectionTitle, Txt } from '../src/components/ui';
import { dayKey } from '../src/lib/dates';
import { putFood } from '../src/lib/foodCache';
import { foodSubtitle } from '../src/lib/format';
import { searchGeneric } from '../src/lib/genericFoods';
import { searchOFF } from '../src/lib/openFoodFacts';
import { useStore } from '../src/lib/store';
import { useColors } from '../src/lib/theme';
import { MEALS, type Food, type MealType } from '../src/lib/types';
import { useT } from '../src/lib/useT';

export default function AddFoodScreen() {
  const params = useLocalSearchParams<{ meal?: string; date?: string }>();
  const meal: MealType = MEALS.includes(params.meal as MealType) ? (params.meal as MealType) : 'snack';
  const date = params.date ?? dayKey();
  const { t, lang } = useT();
  const c = useColors();
  const recent = useStore((s) => s.recentFoods);
  const custom = useStore((s) => s.customFoods);

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
    const generic = searchGeneric(q, lang).filter((g) => !mine.some((m) => m.id === g.id));
    return [...mine.slice(0, 6), ...generic];
  }, [q, custom, recent, lang]);

  useEffect(() => {
    if (q.length < 2) {
      setRemote([]);
      setLoading(false);
      setError(null);
      return;
    }
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    const timer = setTimeout(async () => {
      try {
        const res = /^\d{8,14}$/.test(q) ? [] : await searchOFF(q, lang);
        if (id === requestId.current) setRemote(res.filter((r) => !local.some((l) => l.id === r.id)));
      } catch {
        if (id === requestId.current) setError(t('search_failed'));
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    }, 450);
    return () => clearTimeout(timer);
    // local is derived from q; leaving it out avoids refetching on every keystroke
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, lang]);

  const open = (f: Food) => {
    putFood(f);
    router.push({ pathname: '/food', params: { fid: f.id, meal, date } });
  };

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
      <Stack.Screen options={{ title: t(`meal_${meal}`) }} />
      <Field
        placeholder={t('search_placeholder')}
        value={query}
        onChangeText={setQuery}
        autoCorrect={false}
        returnKeyType="search"
        clearButtonMode="while-editing"
      />

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Action icon="barcode-outline" label={t('scan')} onPress={() => router.push({ pathname: '/scan', params: { meal, date } })} />
        <Action icon="camera-outline" label={t('ai_photo_short')} onPress={() => router.push({ pathname: '/photo', params: { meal, date } })} />
        <Action icon="flash-outline" label={t('quick_add')} onPress={() => router.push({ pathname: '/custom-food', params: { meal, date, mode: 'quick' } })} />
        <Action icon="create-outline" label={t('create_food_short')} onPress={() => router.push({ pathname: '/custom-food', params: { meal, date } })} />
      </View>

      {q ? (
        <>
          {local.length > 0 ? <Card>{local.map(renderFood)}</Card> : null}
          <SectionTitle right={loading ? <ActivityIndicator color={c.accent} /> : undefined}>{t('products')}</SectionTitle>
          {error ? <Txt v="sub">{error}</Txt> : null}
          {!loading && !error && remote.length === 0 && q.length >= 2 ? <Txt v="sub">{t('no_results')}</Txt> : null}
          {remote.length > 0 ? <Card>{remote.map(renderFood)}</Card> : null}
          <Txt v="small">{t('off_attribution')}</Txt>
        </>
      ) : (
        <>
          {recent.length > 0 ? (
            <>
              <SectionTitle>{t('recent')}</SectionTitle>
              <Card>{recent.slice(0, 15).map(renderFood)}</Card>
            </>
          ) : null}
          {custom.length > 0 ? (
            <>
              <SectionTitle>{t('my_foods')}</SectionTitle>
              <Card>
                {custom.map((f, i) => (
                  <React.Fragment key={f.id}>
                    {i > 0 ? <Divider /> : null}
                    {renderFood(f)}
                  </React.Fragment>
                ))}
              </Card>
            </>
          ) : null}
          {recent.length === 0 && custom.length === 0 ? <Txt v="sub">{t('add_food_empty')}</Txt> : null}
        </>
      )}
    </Screen>
  );
}

function Action({ icon, label, onPress }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        backgroundColor: c.card,
        borderRadius: 14,
        paddingVertical: 14,
        alignItems: 'center',
        gap: 6,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Ionicons name={icon} size={24} color={c.accent} />
      <Txt v="small" color={c.text} center numberOfLines={1}>
        {label}
      </Txt>
    </Pressable>
  );
}
