import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, View } from 'react-native';
import { streakCelebration, type Celebration } from '../lib/streaks';
import { useStore } from '../lib/store';
import { useColors, useMotion } from '../lib/theme';
import { Burst, Tap } from './motion';
import { Txt } from './ui';

const native = Platform.OS !== 'web';
const ROW = 26;

/**
 * The streak counter in the diary header. When the first entry of the day is added, the number
 * rolls up from yesterday's streak, and (Motion → Lively) the flame pops with a burst and a light
 * haptic tap, bigger on milestone days. Rules: `streakCelebration` in streaks.ts.
 */
export function StreakBadge({ current, todayLogged, onPress, label }: { current: number; todayLogged: boolean; onPress: () => void; label: string }) {
  const c = useColors();
  const motion = useMotion();
  const enabled = useStore((s) => s.appearance.celebrate !== false);
  const was = useRef(todayLogged);
  const roll = useRef(new Animated.Value(1)).current;
  const pop = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState<{ from: number; kind: Celebration; n: number } | null>(null);

  useEffect(() => {
    const kind = streakCelebration(was.current, todayLogged, current, motion, enabled);
    was.current = todayLogged;
    if (kind === 'none') return;
    setShown((s) => ({ from: Math.max(0, current - 1), kind, n: (s?.n ?? 0) + 1 }));
    roll.setValue(0);
    Animated.timing(roll, { toValue: 1, duration: 520, delay: 120, easing: Easing.out(Easing.back(1.4)), useNativeDriver: native }).start();
    if (kind === 'full' || kind === 'milestone') {
      pop.setValue(0);
      Animated.sequence([
        Animated.timing(pop, { toValue: 1, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: native }),
        Animated.spring(pop, { toValue: 0, friction: 4, tension: 120, useNativeDriver: native }),
      ]).start();
      if (kind === 'milestone') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayLogged]);

  const big = shown?.kind === 'milestone';
  const flameScale = pop.interpolate({ inputRange: [0, 1], outputRange: [1, big ? 1.9 : 1.5] });
  const rolling = shown !== null;

  return (
    <Tap
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      scaleTo={0.9}
      rippleColor={c.coral}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: c.card, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 }}
    >
      <View style={{ alignItems: 'center', justifyContent: 'center' }}>
        {shown && (shown.kind === 'full' || shown.kind === 'milestone') ? (
          <Burst key={shown.n} trigger={shown.n} colors={big ? [c.coral, c.carbs, c.accent, c.leaf] : [c.coral, c.carbs]} size={big ? 150 : 72} />
        ) : null}
        <Animated.View style={{ transform: [{ scale: flameScale }] }}>
          <Ionicons name="flame" size={18} color={todayLogged ? c.coral : c.sub} />
        </Animated.View>
      </View>
      <View style={{ height: ROW, overflow: 'hidden', justifyContent: 'center' }}>
        {rolling ? (
          <>
            <Animated.View style={{ position: 'absolute', transform: [{ translateY: roll.interpolate({ inputRange: [0, 1], outputRange: [0, -ROW] }) }], opacity: roll.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }}>
              <Txt v="h3">{shown.from}</Txt>
            </Animated.View>
            <Animated.View style={{ transform: [{ translateY: roll.interpolate({ inputRange: [0, 1], outputRange: [ROW, 0] }) }] }}>
              <Txt v="h3">{current}</Txt>
            </Animated.View>
          </>
        ) : (
          <Txt v="h3">{current}</Txt>
        )}
      </View>
    </Tap>
  );
}
