import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Image, View } from 'react-native';
import { perServing } from '../lib/recipes';
import { useColors, type Colors } from '../lib/theme';
import type { Recipe } from '../lib/types';
import { useT } from '../lib/useT';
import { Tap } from './motion';
import { Row, Txt, type IconName } from './ui';

/** Square photo, or a tinted tile with an icon when a recipe has no photo. */
export function RecipeImage({ recipe, size, radius = 18 }: { recipe: Recipe; size: number | '100%'; radius?: number }) {
  const c = useColors();
  const look = placeholder(recipe, c);
  const box = { width: size, height: size === '100%' ? undefined : size, aspectRatio: size === '100%' ? 16 / 10 : undefined, borderRadius: radius } as const;
  if (recipe.photo) return <Image source={{ uri: recipe.photo }} style={[box, { backgroundColor: c.cardAlt }]} accessibilityIgnoresInvertColors />;
  return (
    <View style={[box, { backgroundColor: look.tile, alignItems: 'center', justifyContent: 'center' }]}>
      <Ionicons name={look.icon} size={typeof size === 'number' ? size * 0.42 : 56} color={look.color} />
    </View>
  );
}

function placeholder(r: Recipe, c: Colors): { tile: string; color: string; icon: IconName } {
  if (r.tags.includes('breakfast')) return { ...pick(c.meal.breakfast), icon: 'sunny' };
  if (r.tags.includes('snack')) return { ...pick(c.meal.snack), icon: 'nutrition' };
  if (r.tags.includes('vegan') || r.tags.includes('vegetarian')) return { ...pick(c.meal.lunch), icon: 'leaf' };
  return { ...pick(c.meal.dinner), icon: 'restaurant' };
}
const pick = (m: { tile: string; icon: string }) => ({ tile: m.tile, color: m.icon });

/** One row in a recipe list: image, name, kcal and protein per serving, time, tested badge. */
export function RecipeCard({ recipe, onPress }: { recipe: Recipe; onPress: () => void }) {
  const { t } = useT();
  const c = useColors();
  const n = perServing(recipe);
  const tested = recipe.testedBy?.length ?? 0;
  return (
    <Tap
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={recipe.name}
      scaleTo={0.97}
      rippleColor={c.accent}
      style={{
        flexDirection: 'row',
        gap: 12,
        alignItems: 'center',
        backgroundColor: c.card,
        borderRadius: 22,
        padding: 10,
        ...(c.glow ? { borderWidth: 1, borderColor: `${c.glow}33` } : null),
      }}
    >
      <RecipeImage recipe={recipe} size={76} />
      <View style={{ flex: 1, gap: 3 }}>
        <Txt v="h3" numberOfLines={2}>
          {recipe.name}
        </Txt>
        <Txt v="small">
          {Math.round(n.kcal)} kcal · {Math.round(n.protein)} g {t('protein')} · {t('per_serving')}
        </Txt>
        <Row gap={10}>
          {recipe.minutes ? (
            <Row gap={3}>
              <Ionicons name="time-outline" size={13} color={c.sub} />
              <Txt v="small">{t('minutes_value', { n: recipe.minutes })}</Txt>
            </Row>
          ) : null}
          {recipe.source === 'community' && tested > 0 ? (
            <Row gap={3}>
              <Ionicons name="checkmark-circle" size={13} color={c.leaf} />
              <Txt v="small" color={c.leaf}>
                {tested}
              </Txt>
            </Row>
          ) : null}
          {recipe.source === 'own' ? <Ionicons name="person-circle-outline" size={14} color={c.accent} /> : null}
        </Row>
      </View>
      <Ionicons name="chevron-forward" size={18} color={c.sub} />
    </Tap>
  );
}
