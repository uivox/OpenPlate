import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dayKey } from '../lib/dates';
import { fonts, useColors } from '../lib/theme';
import type { MealType } from '../lib/types';
import { useT } from '../lib/useT';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const ICONS: Record<string, [IconName, IconName]> = {
  index: ['book', 'book-outline'],
  fasting: ['moon', 'moon-outline'],
  progress: ['stats-chart', 'stats-chart-outline'],
  profile: ['person', 'person-outline'],
};

/** Meal that fits the current time of day, used by the centre add button. */
export function mealForNow(d = new Date()): MealType {
  const h = d.getHours() + d.getMinutes() / 60;
  if (h < 10.5) return 'breakfast';
  if (h < 15) return 'lunch';
  if (h < 21) return 'dinner';
  return 'snack';
}

interface TabBarProps {
  state: { index: number; routes: { key: string; name: string }[] };
  descriptors: Record<string, { options: { title?: string } }>;
  navigation: { emit: (e: { type: 'tabPress'; target: string; canPreventDefault: true }) => { defaultPrevented: boolean }; navigate: (name: string) => void };
}

/** Floating tab bar with the add button in the middle. */
export function TabBar({ state, descriptors, navigation }: TabBarProps) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useT();

  const tab = (route: { key: string; name: string }, index: number) => {
    const focused = state.index === index;
    const label = descriptors[route.key]?.options.title ?? route.name;
    const [on, off] = ICONS[route.name] ?? ['ellipse', 'ellipse-outline'];
    return (
      <Pressable
        key={route.key}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={label}
        onPress={() => {
          const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !e.defaultPrevented) {
            Haptics.selectionAsync().catch(() => {});
            navigation.navigate(route.name);
          }
        }}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, paddingVertical: 8 }}
      >
        <Ionicons name={focused ? on : off} size={23} color={focused ? c.accent : c.sub} />
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={1.2}
          style={{ fontFamily: focused ? fonts.bodyBold : fonts.bodyMedium, fontSize: 11.5, color: focused ? c.text : c.sub }}
        >
          {label}
        </Text>
      </Pressable>
    );
  };

  const left = state.routes.slice(0, 2);
  const right = state.routes.slice(2);

  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingBottom: Math.max(insets.bottom, 12), paddingHorizontal: 16 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: c.card,
          borderRadius: 30,
          height: 68,
          paddingHorizontal: 6,
          borderWidth: 1,
          borderColor: c.line,
          shadowColor: '#2A1E33',
          shadowOpacity: 0.12,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 8 },
          elevation: 10,
        }}
      >
        {left.map((r, i) => tab(r, i))}
        <View style={{ width: 76, alignItems: 'center' }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('add_food')}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
              router.push({ pathname: '/add-food', params: { meal: mealForNow(), date: dayKey() } });
            }}
            style={({ pressed }) => ({
              width: 62,
              height: 62,
              marginTop: -30,
              borderRadius: 31,
              backgroundColor: c.accent,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 5,
              borderColor: c.bg,
              transform: [{ scale: pressed ? 0.93 : 1 }],
            })}
          >
            <Ionicons name="add" size={32} color={c.accentText} />
          </Pressable>
        </View>
        {right.map((r, i) => tab(r, i + 2))}
      </View>
    </View>
  );
}

/** Space to leave under scrolling content so it clears the floating bar. */
export const TAB_BAR_SPACE = 130;
