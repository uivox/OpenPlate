import * as Haptics from 'expo-haptics';
import React, { useEffect, useRef, useState } from 'react';
import { FlatList, Platform, Pressable, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { FRACTION_LABELS, amountSpoken, joinAmount, splitAmount, wheelMax } from '../lib/portions';
import { fonts, radius, useColors } from '../lib/theme';
import { useT } from '../lib/useT';
import { Txt } from './ui';

const ITEM = 40;
const VISIBLE = 5;
const PAD = ITEM * Math.floor(VISIBLE / 2);

/**
 * One column of the wheel. Scrolling snaps to an item; a tap on an item selects it (mouse users on the
 * web); screen readers swipe up and down (adjustable). Works the same on iPhone, Android and web: the
 * end of a scroll is found by a short pause instead of momentum events, which browsers don't send.
 */
function WheelColumn({
  items,
  index,
  onChange,
  label,
  flex = 1,
  align = 'center',
  size = 22,
}: {
  items: readonly string[];
  index: number;
  onChange: (i: number) => void;
  label: string;
  flex?: number;
  align?: 'center' | 'flex-start' | 'flex-end';
  /** Font size of the chosen item (the others are a little smaller). */
  size?: number;
}) {
  const c = useColors();
  const ref = useRef<FlatList<string>>(null);
  const committed = useRef(index);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [live, setLive] = useState(index);
  const liveRef = useRef(index);
  const clamp = (i: number) => Math.max(0, Math.min(items.length - 1, i));
  // Only the user's own scrolling chooses a value. The wheel's own moves (first layout, typing a number,
  // switching the unit, virtualised rows appearing) also send scroll events, which must not change the amount.
  const userScrolling = useRef(false);
  const lastY = useRef(-1);
  const moveTo = (i: number, animated: boolean) => {
    // Long jumps (typing 270 g after 40 g) go straight there; a long smooth scroll would crawl past every number.
    if (lastY.current < 0 || Math.abs(lastY.current - i * ITEM) > ITEM * 4) animated = false;
    ref.current?.scrollToOffset({ offset: i * ITEM, animated });
  };

  // Browsers: a mouse wheel, touch, drag or arrow key on the column counts as the user scrolling.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node = ref.current?.getScrollableNode() as unknown as
      | { addEventListener: (t: string, f: () => void, o?: object) => void; removeEventListener: (t: string, f: () => void) => void }
      | undefined;
    if (!node?.addEventListener) return;
    const mark = () => (userScrolling.current = true);
    const kinds = ['wheel', 'touchstart', 'pointerdown', 'keydown'];
    kinds.forEach((k) => node.addEventListener(k, mark, { passive: true }));
    return () => kinds.forEach((k) => node.removeEventListener(k, mark));
  }, []);

  // Outside changes (typing a number, switching the unit) move the wheel.
  useEffect(() => {
    if (index === committed.current) return;
    committed.current = index;
    liveRef.current = index;
    setLive(index);
    userScrolling.current = false;
    moveTo(index, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  useEffect(() => () => {
    if (settle.current) clearTimeout(settle.current);
  }, []);

  const commit = (i: number) => {
    if (i === committed.current) return;
    committed.current = i;
    onChange(i);
  };

  const select = (i: number) => {
    const j = clamp(i);
    userScrolling.current = false;
    liveRef.current = j;
    setLive(j);
    moveTo(j, true);
    commit(j);
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    lastY.current = y;
    if (!userScrolling.current) return;
    const i = clamp(Math.round(y / ITEM));
    if (i !== liveRef.current) {
      liveRef.current = i;
      setLive(i);
      if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
    }
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      userScrolling.current = false;
      if (Math.abs(y - i * ITEM) > 1) ref.current?.scrollToOffset({ offset: i * ITEM, animated: true });
      commit(i);
    }, 160);
  };

  return (
    <View
      style={{ flex, height: ITEM * VISIBLE }}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ text: items[live] }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => select(liveRef.current + (e.nativeEvent.actionName === 'increment' ? 1 : -1))}
    >
      <FlatList
        ref={ref}
        data={items as string[]}
        keyExtractor={(_, i) => String(i)}
        extraData={live}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM}
        decelerationRate="fast"
        nestedScrollEnabled
        scrollEventThrottle={16}
        onScroll={onScroll}
        onScrollBeginDrag={() => (userScrolling.current = true)}
        contentOffset={{ x: 0, y: index * ITEM }}
        onLayout={() => moveTo(committed.current, false)}
        onContentSizeChange={() => !userScrolling.current && moveTo(committed.current, false)}
        ListHeaderComponent={<View style={{ height: PAD }} />}
        ListFooterComponent={<View style={{ height: PAD }} />}
        getItemLayout={(_, i) => ({ length: ITEM, offset: PAD + ITEM * i, index: i })}
        initialNumToRender={Math.min(items.length, index + VISIBLE + 2)}
        windowSize={7}
        renderItem={({ item, index: i }) => {
          const d = Math.abs(i - live);
          return (
            <Pressable
              onPress={() => select(i)}
              importantForAccessibility="no"
              accessibilityElementsHidden
              style={{ height: ITEM, justifyContent: 'center', alignItems: align, paddingHorizontal: 12 }}
            >
              <Txt
                color={d === 0 ? c.text : c.sub}
                numberOfLines={1}
                style={{
                  fontSize: d === 0 ? size : size - 4,
                  fontFamily: d === 0 ? fonts.bodySemi : fonts.body,
                  opacity: d === 0 ? 1 : d === 1 ? 0.75 : 0.4,
                }}
              >
                {item}
              </Txt>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

export type AmountUnit = { value: number; label: string; serving: boolean };

/**
 * The amount wheel: whole number · fraction (servings only) · unit. Changing the unit keeps the amount
 * of food the same (the screen converts it in `onUnit`).
 */
export function AmountWheel({
  qty,
  onQty,
  units,
  unit,
  onUnit,
}: {
  qty: number | null;
  onQty: (v: number) => void;
  units: AmountUnit[];
  unit: number;
  onUnit: (v: number) => void;
}) {
  const c = useColors();
  const { t } = useT();
  const current = units.find((u) => u.value === unit) ?? units[0];
  const serving = current?.serving ?? false;
  const { whole, frac } = splitAmount(qty, serving);
  const max = wheelMax(serving);
  const wholes = React.useMemo(() => Array.from({ length: max + 1 }, (_, i) => String(i)), [max]);
  const unitIdx = Math.max(0, units.findIndex((u) => u.value === unit));

  return (
    <View style={{ height: ITEM * VISIBLE }} accessibilityLabel={amountSpoken(whole, frac, serving)}>
      <View
        pointerEvents="none"
        style={{ position: 'absolute', left: 0, right: 0, top: PAD, height: ITEM, borderRadius: radius.s, backgroundColor: c.cardAlt }}
      />
      <View style={{ flexDirection: 'row', flex: 1 }}>
        {/* key: a new unit has another range of numbers, so the column starts fresh */}
        <WheelColumn
          key={`w-${serving ? 's' : 'g'}`}
          items={wholes}
          index={whole}
          onChange={(w) => onQty(joinAmount(w, frac, serving))}
          label={t('amount_whole')}
          flex={0.8}
        />
        {serving ? (
          <WheelColumn
            items={FRACTION_LABELS}
            index={frac}
            onChange={(f) => onQty(joinAmount(whole, f, serving))}
            label={t('amount_fraction')}
            flex={0.7}
          />
        ) : null}
        <WheelColumn
          items={units.map((u) => u.label)}
          index={unitIdx}
          onChange={(i) => onUnit(units[i].value)}
          label={t('amount_unit')}
          flex={2}
          size={18}
        />
      </View>
    </View>
  );
}
