import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import { Animated, Platform, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dayKey } from '../lib/dates';
import { tabSides, visibleTabs } from '../lib/layout';
import { useStore } from '../lib/store';
import { fonts, useColors, useMotion } from '../lib/theme';
import type { MealType, TabId } from '../lib/types';
import { useT } from '../lib/useT';
import { Tap } from './motion';

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

/** Floating tab bar. Tab order, hidden tabs and the add button's side come from the layout settings. */
export function TabBar({ state, descriptors, navigation }: TabBarProps) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { t } = useT();
  const layout = useStore((s) => s.layout);
  const motion = useMotion();
  const current = state.routes[state.index]?.name;

  const tab = (name: TabId) => {
    const route = state.routes.find((r) => r.name === name);
    if (!route) return null;
    const focused = current === name;
    const label = descriptors[route.key]?.options.title ?? route.name;
    const [on, off] = ICONS[route.name] ?? ['ellipse', 'ellipse-outline'];
    return (
      <Tap
        key={route.key}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={label}
        scaleTo={0.9}
        onPress={() => {
          const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !e.defaultPrevented) {
            Haptics.selectionAsync().catch(() => {});
            navigation.navigate(route.name);
          }
        }}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, paddingVertical: 8 }}
      >
        <TabIcon name={focused ? on : off} focused={focused} lively={motion === 'lively'} />
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={1.2}
          style={{ fontFamily: focused ? fonts.bodyBold : fonts.bodyMedium, fontSize: 11.5, color: focused ? c.text : c.sub }}
        >
          {label}
        </Text>
      </Tap>
    );
  };

  const { left, right } = tabSides(visibleTabs(layout), layout.addButton);
  const add = (
    <View style={{ width: 76, alignItems: 'center' }}>
      <Tap
        accessibilityRole="button"
        accessibilityLabel={t('add_food')}
        scaleTo={0.88}
        rippleColor={c.accentText}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          router.push({ pathname: '/add-food', params: { meal: mealForNow(), date: dayKey() } });
        }}
        style={{
          width: 62,
          height: 62,
          marginTop: -30,
          borderRadius: 31,
          backgroundColor: c.accent,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 5,
          borderColor: c.bg,
          ...(c.glow ? { shadowColor: c.glow, shadowOpacity: 0.6, shadowRadius: 16, shadowOffset: { width: 0, height: 0 } } : null),
        }}
      >
        <Ionicons name="add" size={32} color={c.accentText} />
      </Tap>
    </View>
  );

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
          borderColor: c.glow ? `${c.glow}40` : c.line,
          shadowColor: c.glow ?? '#2A1E33',
          shadowOpacity: c.glow ? 0.3 : 0.12,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 8 },
          elevation: 10,
        }}
      >
        {left.map(tab)}
        {add}
        {right.map(tab)}
      </View>
    </View>
  );
}

/** Tab icon that springs up when its tab becomes active (lively motion). */
function TabIcon({ name, focused, lively }: { name: IconName; focused: boolean; lively: boolean }) {
  const c = useColors();
  const v = useRef(new Animated.Value(focused ? 1 : 0)).current;
  useEffect(() => {
    if (!lively) {
      v.setValue(focused ? 1 : 0);
      return;
    }
    Animated.spring(v, { toValue: focused ? 1 : 0, useNativeDriver: Platform.OS !== 'web', speed: 14, bounciness: 12 }).start();
  }, [focused, lively, v]);
  return (
    <Animated.View
      style={{
        paddingHorizontal: 12,
        paddingVertical: 2,
        borderRadius: 999,
        backgroundColor: focused && lively ? c.accentSoft : 'transparent',
        transform: [
          { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -2] }) },
          { scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }) },
        ],
      }}
    >
      <Ionicons name={name} size={23} color={focused ? c.accent : c.sub} />
    </Animated.View>
  );
}

/** Space to leave under scrolling content so it clears the floating bar. */
export const TAB_BAR_SPACE = 130;
