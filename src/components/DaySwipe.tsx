import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, PanResponder, Platform, View } from 'react-native';
import { dragOffset, isSideways, swipeResult } from '../lib/daySwipe';
import { useMotion } from '../lib/theme';

const native = Platform.OS !== 'web';

/**
 * Lets the user drag the diary sideways to the previous (drag right) or next (drag left) day. Built on
 * React Native's own PanResponder and Animated, so it works the same with a finger on the phones and
 * with a finger or the mouse in the browser, without extra native libraries. The page follows the
 * drag, slides out and the new day slides in from the other side. Vertical scrolling and taps keep
 * working: a drag is only taken over once it is clearly sideways (daySwipe.ts).
 */
export function DaySwipe({ day, onChange, children }: { day: string; onChange: (dir: -1 | 1) => void; children: React.ReactNode }) {
  const motion = useMotion();
  const x = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;
  const width = useRef(0);
  const pending = useRef<-1 | 1 | null>(null);
  const change = useRef(onChange);
  change.current = onChange;
  const motionRef = useRef(motion);
  motionRef.current = motion;

  // The new day comes in from the side it was dragged towards (also after the arrow buttons).
  const prevDay = useRef(day);
  useEffect(() => {
    if (prevDay.current === day) return;
    const dir = pending.current ?? (day > prevDay.current ? 1 : -1);
    prevDay.current = day;
    pending.current = null;
    if (motionRef.current === 'off') {
      x.setValue(0);
      fade.setValue(1);
      return;
    }
    const from = motionRef.current === 'lively' ? dir * width.current * 0.35 : dir * 24;
    x.setValue(from);
    fade.setValue(0.3);
    Animated.parallel([
      Animated.timing(x, { toValue: 0, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: native }),
      Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: native }),
    ]).start();
  }, [day, x, fade]);

  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_e, g) => isSideways(g.dx, g.dy),
        onMoveShouldSetPanResponder: (_e, g) => isSideways(g.dx, g.dy),
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: (_e, g) => {
          if (motionRef.current !== 'off') x.setValue(dragOffset(g.dx, width.current));
        },
        onPanResponderRelease: (_e, g) => {
          const dir = swipeResult(g.dx, g.vx, width.current);
          if (dir === 0) {
            Animated.spring(x, { toValue: 0, useNativeDriver: native, speed: 20, bounciness: 4 }).start();
            return;
          }
          pending.current = dir;
          if (motionRef.current === 'off') {
            change.current(dir);
            return;
          }
          Animated.timing(x, { toValue: -dir * width.current, duration: 140, easing: Easing.in(Easing.quad), useNativeDriver: native }).start(() =>
            change.current(dir),
          );
        },
        onPanResponderTerminate: () => {
          Animated.spring(x, { toValue: 0, useNativeDriver: native, speed: 20, bounciness: 4 }).start();
        },
      }),
    [x],
  );

  return (
    <View style={{ flex: 1, overflow: 'hidden' }} onLayout={(e) => (width.current = e.nativeEvent.layout.width)} {...responder.panHandlers} testID="day-swipe">
      <Animated.View style={{ flex: 1, opacity: fade, transform: [{ translateX: x }] }}>{children}</Animated.View>
    </View>
  );
}
