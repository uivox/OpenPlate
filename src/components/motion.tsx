import * as Haptics from 'expo-haptics';
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useMotion } from '../lib/theme';

/**
 * Motion building blocks. Everything here follows the Motion setting (lively / calm / off) and the
 * system Reduce Motion switch via useMotion(): "calm" keeps the old small press feedback,
 * "off" removes movement entirely.
 */

const native = Platform.OS !== 'web';
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type TapProps = Omit<PressableProps, 'style' | 'children'> & {
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  /** Scale while pressed. */
  scaleTo?: number;
  /** Colour of the ripple that spreads from the finger in lively mode (needs a clipped shape). */
  rippleColor?: string;
  /** Light haptic tick on press in lively mode. */
  haptic?: boolean;
};

/** Pressable with spring press feedback and an optional ripple. */
export function Tap({ style, children, scaleTo = 0.96, rippleColor, haptic, onPressIn, onPressOut, onPress, onLayout, disabled, ...rest }: TapProps) {
  const motion = useMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const ripple = useRef(new Animated.Value(0)).current;
  const [spot, setSpot] = useState<{ x: number; y: number; r: number; k: number } | null>(null);
  const box = useRef({ w: 0, h: 0 });

  const pressIn = (e: GestureResponderEvent) => {
    onPressIn?.(e);
    if (motion === 'off') return;
    if (motion === 'calm') {
      scale.setValue(scaleTo);
      return;
    }
    Animated.spring(scale, { toValue: scaleTo, useNativeDriver: native, speed: 50, bounciness: 0 }).start();
    if (rippleColor) {
      const ne = e.nativeEvent as unknown as { locationX?: number; locationY?: number; offsetX?: number; offsetY?: number };
      const x = ne.locationX ?? ne.offsetX ?? box.current.w / 2;
      const y = ne.locationY ?? ne.offsetY ?? box.current.h / 2;
      const r = Math.max(box.current.w, box.current.h, 40) * 1.1;
      setSpot({ x, y, r, k: Date.now() });
      ripple.setValue(0);
      Animated.timing(ripple, { toValue: 1, duration: 520, easing: Easing.out(Easing.quad), useNativeDriver: native }).start();
    }
  };
  const pressOut = (e: GestureResponderEvent) => {
    onPressOut?.(e);
    if (motion === 'lively') Animated.spring(scale, { toValue: 1, useNativeDriver: native, speed: 16, bounciness: 14 }).start();
    else scale.setValue(1);
  };
  const press = (e: GestureResponderEvent) => {
    if (motion === 'lively' && haptic) Haptics.selectionAsync().catch(() => {});
    onPress?.(e);
  };
  const layout = (e: LayoutChangeEvent) => {
    box.current = { w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height };
    onLayout?.(e);
  };

  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={pressIn}
      onPressOut={pressOut}
      onPress={press}
      onLayout={layout}
      style={[style, rippleColor ? { overflow: 'hidden' } : null, { transform: [{ scale }] }]}
    >
      {spot ? (
        <Animated.View
          key={spot.k}
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: spot.x - spot.r,
            top: spot.y - spot.r,
            width: spot.r * 2,
            height: spot.r * 2,
            borderRadius: spot.r,
            backgroundColor: rippleColor,
            opacity: ripple.interpolate({ inputRange: [0, 1], outputRange: [0.32, 0] }),
            transform: [{ scale: ripple.interpolate({ inputRange: [0, 1], outputRange: [0.08, 1] }) }],
          }}
        />
      ) : null}
      {children}
    </AnimatedPressable>
  );
}

/** Fades and slides its content in on mount (lively mode), staggered by `index`. */
export function Appear({ index = 0, children, style }: { index?: number; children?: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const motion = useMotion();
  const v = useRef(new Animated.Value(motion === 'lively' ? 0 : 1)).current;
  useEffect(() => {
    if (motion !== 'lively') {
      v.setValue(1);
      return;
    }
    Animated.timing(v, {
      toValue: 1,
      duration: 460,
      delay: Math.min(index, 8) * 55,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: native,
    }).start();
    // only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Animated.View
      style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] }]}
    >
      {children}
    </Animated.View>
  );
}

/** Tweens a number towards `target` (ease-out) in lively mode; jumps otherwise. */
export function useCountUp(target: number, duration = 650): number {
  const motion = useMotion();
  const [value, setValue] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    if (motion !== 'lively') {
      from.current = target;
      setValue(target);
      return;
    }
    const start = Date.now();
    const begin = from.current;
    let frame = 0;
    const step = () => {
      const t = Math.min(1, (Date.now() - start) / duration);
      const v = begin + (target - begin) * (1 - Math.pow(1 - t, 3));
      from.current = v;
      setValue(v);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, duration, motion]);
  return value;
}

/** A small burst of dots for celebrations (streak milestones). Renders nothing unless lively. */
export function Burst({ colors, size = 160, trigger }: { colors: string[]; size?: number; trigger: unknown }) {
  const motion = useMotion();
  const v = useRef(new Animated.Value(0)).current;
  const dots = useRef(
    Array.from({ length: 16 }, (_, i) => ({ angle: (i / 16) * Math.PI * 2 + Math.random() * 0.3, dist: 0.55 + Math.random() * 0.45, r: 3 + Math.random() * 3 })),
  ).current;
  useEffect(() => {
    if (motion !== 'lively') return;
    v.setValue(0);
    Animated.timing(v, { toValue: 1, duration: 1100, easing: Easing.out(Easing.cubic), useNativeDriver: native }).start();
  }, [trigger, motion, v]);
  if (motion !== 'lively') return null;
  const half = size / 2;
  return (
    <Animated.View pointerEvents="none" style={{ position: 'absolute', width: size, height: size, left: '50%', top: '50%', marginLeft: -half, marginTop: -half }}>
      {dots.map((d, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute',
            left: half - d.r,
            top: half - d.r,
            width: d.r * 2,
            height: d.r * 2,
            borderRadius: d.r,
            backgroundColor: colors[i % colors.length],
            opacity: v.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 0] }),
            transform: [
              { translateX: v.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(d.angle) * half * d.dist] }) },
              { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(d.angle) * half * d.dist] }) },
            ],
          }}
        />
      ))}
    </Animated.View>
  );
}

/** A soft ring that pulses outwards once whenever `trigger` changes (lively mode). */
export function Pulse({ trigger, color, size, radius }: { trigger: unknown; color: string; size: number; radius?: number }) {
  const motion = useMotion();
  const v = useRef(new Animated.Value(1)).current;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (motion !== 'lively') return;
    v.setValue(0);
    Animated.timing(v, { toValue: 1, duration: 750, easing: Easing.out(Easing.quad), useNativeDriver: native }).start();
  }, [trigger, motion, v]);
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        width: size,
        height: size,
        borderRadius: radius ?? size / 2,
        borderWidth: 3,
        borderColor: color,
        opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
        transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1.12] }) }],
      }}
    />
  );
}
