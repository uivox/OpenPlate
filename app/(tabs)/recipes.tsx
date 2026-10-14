import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Linking, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RecipeCard } from '../../src/components/RecipeCard';
import { TAB_BAR_SPACE } from '../../src/components/TabBar';
import { Button, Card, Chip, Field, Screen, SectionTitle, Txt } from '../../src/components/ui';
import { setMealDraft } from '../../src/lib/foodCache';
import { useRecipes } from '../../src/lib/hooks';
import { RECIPE_TAGS, RECIPES_GUIDE_URL, searchRecipes } from '../../src/lib/recipes';
import type { RecipeTag } from '../../src/lib/types';
import { useT } from '../../src/lib/useT';

export default function RecipesScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useT();
  const all = useRecipes();
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<RecipeTag | null>(null);

  const found = useMemo(() => searchRecipes(all, query, tag), [all, query, tag]);
  const own = found.filter((r) => r.source === 'own');
  const community = found.filter((r) => r.source === 'community');
  const open = (id: string) => router.push({ pathname: '/recipe', params: { id } });
  const create = () => {
    setMealDraft({ name: '', items: [] });
    router.push('/recipe-edit');
  };

  return (
    <Screen style={{ paddingTop: insets.top + 12 }} bottomInset={TAB_BAR_SPACE} appear>
      <Txt v="title">{t('tab_recipes')}</Txt>
      <Field placeholder={t('recipes_search')} value={query} onChangeText={setQuery} autoCorrect={false} clearButtonMode="while-editing" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        <Chip label={t('tag_all')} selected={!tag} onPress={() => setTag(null)} />
        {RECIPE_TAGS.map((tg) => (
          <Chip key={tg} label={t(`tag_${tg}`)} selected={tag === tg} onPress={() => setTag(tag === tg ? null : tg)} />
        ))}
      </ScrollView>

      <View style={{ gap: 10 }}>
        <SectionTitle>{t('my_recipes')}</SectionTitle>
        {own.map((r) => (
          <RecipeCard key={r.id} recipe={r} onPress={() => open(r.id)} />
        ))}
        {own.length === 0 && !query && !tag ? <Txt v="sub">{t('my_recipes_empty')}</Txt> : null}
        <Button kind="secondary" icon="add" title={t('new_recipe')} onPress={create} />
      </View>

      <View style={{ gap: 10 }}>
        <SectionTitle>{t('community_recipes')}</SectionTitle>
        {community.map((r) => (
          <RecipeCard key={r.id} recipe={r} onPress={() => open(r.id)} />
        ))}
        {found.length === 0 ? <Txt v="sub">{t('no_recipes')}</Txt> : null}
      </View>

      <Card tone="inset" style={{ gap: 8 }}>
        <Txt v="small">{t('community_info')}</Txt>
        <Button small kind="ghost" icon="logo-github" title={t('how_to_add_recipe')} style={{ alignSelf: 'flex-start' }} onPress={() => Linking.openURL(RECIPES_GUIDE_URL)} />
      </Card>
    </Screen>
  );
}
