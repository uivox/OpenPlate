import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { fonts, radius, space, useColors } from '../lib/theme';
import { readableOn } from '../lib/themes';
import { Appear, Tap } from './motion';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];

export function Screen({
  children,
  scroll = true,
  padded = true,
  style,
  bottomInset = 48,
  appear,
}: {
  children?: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
  bottomInset?: number;
  /** Stagger the children in (lively motion only). */
  appear?: boolean;
}) {
  const c = useColors();
  const inner = [padded && { padding: space.l, gap: space.m }, style];
  if (appear) {
    let i = 0;
    children = React.Children.map(children, (child) => (child ? <Appear index={i++}>{child}</Appear> : child));
  }
  if (!scroll) return <View style={[{ flex: 1, backgroundColor: c.bg }, inner]}>{children}</View>;
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={[inner, { paddingBottom: bottomInset }]}
      keyboardShouldPersistTaps="handled"
      contentInsetAdjustmentBehavior="automatic"
    >
      {children}
    </ScrollView>
  );
}

export function Card({
  children,
  style,
  tone = 'card',
  r = 'm',
}: {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  tone?: 'card' | 'inset' | 'night' | 'beet';
  r?: keyof typeof radius;
}) {
  const c = useColors();
  const bg = tone === 'inset' ? c.cardAlt : tone === 'night' ? c.night : tone === 'beet' ? c.accentSoft : c.card;
  // "Lit" themes (neon) outline cards with a faint glow instead of the flat look.
  const glow: ViewStyle | null =
    c.glow && tone !== 'inset'
      ? { borderWidth: 1, borderColor: `${c.glow}33`, shadowColor: c.glow, shadowOpacity: c.scheme === 'dark' ? 0.22 : 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 0 } }
      : null;
  return <View style={[{ backgroundColor: bg, borderRadius: radius[r], padding: space.l, gap: space.s }, glow, style]}>{children}</View>;
}

type TxtVariant = 'hero' | 'big' | 'title' | 'h2' | 'h3' | 'body' | 'sub' | 'small' | 'label';
const TXT: Record<TxtVariant, TextStyle> = {
  hero: { fontFamily: fonts.displayHeavy, fontSize: 52, lineHeight: 56, letterSpacing: -1.5 },
  big: { fontFamily: fonts.displayHeavy, fontSize: 34, lineHeight: 38, letterSpacing: -0.8 },
  title: { fontFamily: fonts.displayHeavy, fontSize: 28, lineHeight: 32, letterSpacing: -0.5 },
  h2: { fontFamily: fonts.display, fontSize: 21, lineHeight: 26, letterSpacing: -0.2 },
  h3: { fontFamily: fonts.bodyBold, fontSize: 16, lineHeight: 21 },
  body: { fontFamily: fonts.body, fontSize: 16, lineHeight: 22 },
  sub: { fontFamily: fonts.body, fontSize: 14, lineHeight: 19 },
  small: { fontFamily: fonts.body, fontSize: 12.5, lineHeight: 17 },
  label: { fontFamily: fonts.bodySemi, fontSize: 13, lineHeight: 17 },
};

export function Txt({
  children,
  v = 'body',
  color,
  style,
  numberOfLines,
  center,
}: {
  children?: React.ReactNode;
  v?: TxtVariant;
  color?: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  center?: boolean;
}) {
  const c = useColors();
  const defaultColor = v === 'sub' || v === 'small' || v === 'label' ? c.sub : c.text;
  // Themes can swap the display face (e.g. neon uses Space Grotesk).
  const family = v === 'hero' || v === 'big' || v === 'title' ? c.fontDisplayHeavy : v === 'h2' ? c.fontDisplay : undefined;
  return (
    <Text
      numberOfLines={numberOfLines}
      maxFontSizeMultiplier={1.4}
      style={[TXT[v], family ? { fontFamily: family } : null, { color: color ?? defaultColor }, center && { textAlign: 'center' }, style]}
    >
      {children}
    </Text>
  );
}

export function Row({ children, style, gap = space.s }: { children?: React.ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

export function Button({
  title,
  onPress,
  kind = 'primary',
  icon,
  disabled,
  loading,
  style,
  small,
}: {
  title: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'night';
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  small?: boolean;
}) {
  const c = useColors();
  const bg = {
    primary: c.accent,
    secondary: c.accentSoft,
    ghost: 'transparent',
    danger: c.danger,
    night: c.nightText,
  }[kind];
  const fg = { primary: c.accentText, secondary: c.accent, ghost: c.accent, danger: readableOn(c.danger), night: c.night }[kind];
  const glow: ViewStyle | null =
    c.glow && kind === 'primary' && !disabled
      ? { shadowColor: c.glow, shadowOpacity: 0.45, shadowRadius: 14, shadowOffset: { width: 0, height: 0 } }
      : null;
  return (
    <Tap
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!(disabled || loading) }}
      scaleTo={0.96}
      rippleColor={kind === 'ghost' ? c.accent : fg}
      haptic
      style={[
        {
          backgroundColor: bg,
          borderRadius: 999,
          minHeight: small ? 38 : 54,
          paddingHorizontal: small ? 14 : 22,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          opacity: disabled ? 0.4 : 1,
        },
        glow,
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Ionicons name={icon} size={small ? 16 : 20} color={fg} /> : null}
      <Text style={{ color: fg, fontFamily: fonts.bodyBold, fontSize: small ? 14 : 16.5 }} maxFontSizeMultiplier={1.3}>
        {title}
      </Text>
    </Tap>
  );
}

export function IconButton({
  icon,
  onPress,
  color,
  size = 22,
  bg,
  label,
  border,
}: {
  icon: IconName;
  onPress: () => void;
  color?: string;
  size?: number;
  bg?: string;
  label: string;
  border?: string;
}) {
  const c = useColors();
  return (
    <Tap
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityRole="button"
      hitSlop={8}
      scaleTo={0.86}
      style={{
        width: size + 20,
        height: size + 20,
        borderRadius: 999,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: bg ?? 'transparent',
        borderWidth: border ? 1.5 : 0,
        borderColor: border,
      }}
    >
      <Ionicons name={icon} size={size} color={color ?? c.accent} />
    </Tap>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress: () => void }) {
  const c = useColors();
  return (
    <Tap
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      scaleTo={0.93}
      rippleColor={selected ? c.bg : c.text}
      haptic
      style={{
        paddingVertical: 9,
        paddingHorizontal: 15,
        borderRadius: 999,
        backgroundColor: selected ? c.text : c.cardAlt,
      }}
    >
      <Text style={{ color: selected ? c.bg : c.text, fontFamily: fonts.bodySemi, fontSize: 14 }} maxFontSizeMultiplier={1.3}>
        {label}
      </Text>
    </Tap>
  );
}

export function ChipGroup<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {options.map((o) => (
        <Chip key={String(o.value)} label={o.label} selected={o.value === value} onPress={() => onChange(o.value)} />
      ))}
    </View>
  );
}

const inputBox = (c: ReturnType<typeof useColors>): ViewStyle => ({
  backgroundColor: c.cardAlt,
  borderRadius: radius.s,
  paddingHorizontal: 14,
});

export function Field({ label, hint, style, ...props }: TextInputProps & { label?: string; hint?: string }) {
  const c = useColors();
  return (
    <View style={{ gap: 6 }}>
      {label ? <Txt v="label">{label}</Txt> : null}
      <TextInput
        placeholderTextColor={c.sub}
        selectionColor={c.accent}
        {...props}
        style={[inputBox(c), { paddingVertical: 13, fontSize: 16, color: c.text, fontFamily: fonts.body }, style]}
      />
      {hint ? <Txt v="small">{hint}</Txt> : null}
    </View>
  );
}

/** Numeric text field that keeps the user's typing and reports parsed numbers. */
export function NumField({
  label,
  value,
  onChange,
  suffix,
  decimals = true,
  hint,
}: {
  label?: string;
  value: number | null;
  onChange: (v: number | null) => void;
  suffix?: string;
  decimals?: boolean;
  hint?: string;
}) {
  const [text, setText] = React.useState(value === null || Number.isNaN(value) ? '' : String(value).replace('.', ','));
  React.useEffect(() => {
    const parsed = parseNum(text);
    if (value !== parsed) setText(value === null || Number.isNaN(value) ? '' : String(value).replace('.', ','));
    // only react to outside changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const c = useColors();
  return (
    <View style={{ gap: 6, flex: 1 }}>
      {label ? <Txt v="label">{label}</Txt> : null}
      <View style={[inputBox(c), { flexDirection: 'row', alignItems: 'center' }]}>
        <TextInput
          value={text}
          onChangeText={(t) => {
            setText(t);
            onChange(parseNum(t));
          }}
          keyboardType={decimals ? 'decimal-pad' : 'number-pad'}
          selectionColor={c.accent}
          style={{ flex: 1, paddingVertical: 13, fontSize: 17, color: c.text, fontFamily: fonts.bodySemi }}
          placeholderTextColor={c.sub}
          placeholder="0"
          accessibilityLabel={label}
        />
        {suffix ? <Txt v="sub">{suffix}</Txt> : null}
      </View>
      {hint ? <Txt v="small">{hint}</Txt> : null}
    </View>
  );
}

export function parseNum(t: string): number | null {
  const n = parseFloat(t.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export function SectionTitle({ children, right }: { children?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <Row style={{ justifyContent: 'space-between', marginTop: space.m, paddingHorizontal: 4 }}>
      <Txt v="h2">{children}</Txt>
      {right}
    </Row>
  );
}

export function ListRow({
  title,
  subtitle,
  right,
  onPress,
  icon,
  onLongPress,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  icon?: IconName;
  onLongPress?: () => void;
}) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={!onPress && !onLongPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 11,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      {icon ? <Ionicons name={icon} size={22} color={c.accent} /> : null}
      <View style={{ flex: 1 }}>
        <Txt numberOfLines={1} style={{ fontFamily: fonts.bodyMedium }}>
          {title}
        </Txt>
        {subtitle ? (
          <Txt v="sub" numberOfLines={1}>
            {subtitle}
          </Txt>
        ) : null}
      </View>
      {right}
    </Pressable>
  );
}

export function Divider({ inset = 0 }: { inset?: number }) {
  const c = useColors();
  return <View style={{ height: StyleSheet.hairlineWidth * 2, backgroundColor: c.line, marginLeft: inset }} />;
}

export function MacroBar({ label, value, goal, color }: { label: string; value: number; goal: number; color: string }) {
  const c = useColors();
  const pct = goal > 0 ? Math.min(1, value / goal) : 0;
  return (
    <View style={{ flex: 1, gap: 6 }} accessible accessibilityLabel={`${label} ${Math.round(value)} / ${Math.round(goal)} g`}>
      <Row gap={6}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
        <Txt v="label" color={c.text}>
          {label}
        </Txt>
      </Row>
      <View style={{ height: 7, borderRadius: 4, backgroundColor: c.ringTrack, overflow: 'hidden' }}>
        <View style={{ width: `${pct * 100}%`, height: 7, borderRadius: 4, backgroundColor: color }} />
      </View>
      <Txt v="small">
        {Math.round(value)} / {Math.round(goal)} g
      </Txt>
    </View>
  );
}

export function Banner({ icon, text, tone = 'accent' }: { icon: IconName; text: string; tone?: 'accent' | 'warn' | 'leaf' }) {
  const c = useColors();
  const color = tone === 'warn' ? c.coral : tone === 'leaf' ? c.leaf : c.accent;
  const bg = tone === 'warn' ? `${c.coral}22` : tone === 'leaf' ? c.meal.lunch.tile : c.accentSoft;
  return (
    <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: bg, padding: space.m, borderRadius: radius.m }}>
      <Ionicons name={icon} size={20} color={color} />
      <Txt v="sub" color={c.text} style={{ flex: 1 }}>
        {text}
      </Txt>
    </View>
  );
}

/** Rounded square with an icon, used for meals and feature entry points. */
export function Tile({ icon, bg, color, size = 46 }: { icon: IconName; bg: string; color: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.32, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={icon} size={size * 0.48} color={color} />
    </View>
  );
}
