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
import { radius, space, useColors } from '../lib/theme';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];

export function Screen({
  children,
  scroll = true,
  padded = true,
  style,
}: {
  children?: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useColors();
  const inner = [padded && { padding: space.l, gap: space.m }, style];
  if (!scroll) return <View style={[{ flex: 1, backgroundColor: c.bg }, inner]}>{children}</View>;
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={[inner, { paddingBottom: 48 }]}
      keyboardShouldPersistTaps="handled"
      contentInsetAdjustmentBehavior="automatic"
    >
      {children}
    </ScrollView>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  return <View style={[{ backgroundColor: c.card, borderRadius: radius.m, padding: space.l, gap: space.s }, style]}>{children}</View>;
}

type TxtVariant = 'title' | 'h2' | 'h3' | 'body' | 'sub' | 'small' | 'big';
const TXT: Record<TxtVariant, TextStyle> = {
  big: { fontSize: 34, fontWeight: '800', letterSpacing: -0.5 },
  title: { fontSize: 26, fontWeight: '800', letterSpacing: -0.3 },
  h2: { fontSize: 19, fontWeight: '700' },
  h3: { fontSize: 16, fontWeight: '700' },
  body: { fontSize: 16 },
  sub: { fontSize: 14 },
  small: { fontSize: 12 },
};

export function Txt({
  children,
  v = 'body',
  color,
  style,
  numberOfLines,
  center,
}: {
  children: React.ReactNode;
  v?: TxtVariant;
  color?: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  center?: boolean;
}) {
  const c = useColors();
  const defaultColor = v === 'sub' || v === 'small' ? c.sub : c.text;
  return (
    <Text numberOfLines={numberOfLines} style={[TXT[v], { color: color ?? defaultColor }, center && { textAlign: 'center' }, style]}>
      {children}
    </Text>
  );
}

export function Row({ children, style, gap = space.s }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
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
  kind?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  small?: boolean;
}) {
  const c = useColors();
  const bg = kind === 'primary' ? c.accent : kind === 'secondary' ? c.accentSoft : kind === 'danger' ? c.danger : 'transparent';
  const fg = kind === 'primary' ? c.accentText : kind === 'danger' ? '#fff' : c.accent;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      style={({ pressed }) => [
        {
          backgroundColor: bg,
          borderRadius: 999,
          paddingVertical: small ? 8 : 14,
          paddingHorizontal: small ? 14 : 20,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
        },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Ionicons name={icon} size={small ? 16 : 19} color={fg} /> : null}
      <Text style={{ color: fg, fontWeight: '700', fontSize: small ? 14 : 16 }}>{title}</Text>
    </Pressable>
  );
}

export function IconButton({
  icon,
  onPress,
  color,
  size = 22,
  bg,
  label,
}: {
  icon: IconName;
  onPress: () => void;
  color?: string;
  size?: number;
  bg?: string;
  label: string;
}) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      hitSlop={8}
      style={({ pressed }) => ({
        width: size + 18,
        height: size + 18,
        borderRadius: 999,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: bg ?? 'transparent',
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Ionicons name={icon} size={size} color={color ?? c.accent} />
    </Pressable>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: 999,
        backgroundColor: selected ? c.accent : c.cardAlt,
        borderWidth: 1,
        borderColor: selected ? c.accent : c.line,
      }}
    >
      <Text style={{ color: selected ? c.accentText : c.text, fontWeight: '600', fontSize: 14 }}>{label}</Text>
    </Pressable>
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

export function Field({ label, hint, style, ...props }: TextInputProps & { label?: string; hint?: string }) {
  const c = useColors();
  return (
    <View style={{ gap: 6 }}>
      {label ? <Txt v="sub">{label}</Txt> : null}
      <TextInput
        placeholderTextColor={c.sub}
        {...props}
        style={[
          {
            backgroundColor: c.cardAlt,
            borderRadius: radius.s,
            borderWidth: 1,
            borderColor: c.line,
            paddingHorizontal: 14,
            paddingVertical: 12,
            fontSize: 16,
            color: c.text,
          },
          style,
        ]}
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
      {label ? <Txt v="sub">{label}</Txt> : null}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: c.cardAlt,
          borderRadius: radius.s,
          borderWidth: 1,
          borderColor: c.line,
          paddingHorizontal: 14,
        }}
      >
        <TextInput
          value={text}
          onChangeText={(t) => {
            setText(t);
            onChange(parseNum(t));
          }}
          keyboardType={decimals ? 'decimal-pad' : 'number-pad'}
          style={{ flex: 1, paddingVertical: 12, fontSize: 16, color: c.text }}
          placeholderTextColor={c.sub}
          placeholder="0"
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

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <Row style={{ justifyContent: 'space-between', marginTop: space.s }}>
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
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 10,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      {icon ? <Ionicons name={icon} size={22} color={c.accent} /> : null}
      <View style={{ flex: 1 }}>
        <Txt numberOfLines={1}>{title}</Txt>
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

export function Divider() {
  const c = useColors();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.line }} />;
}

export function MacroBar({ label, value, goal, color }: { label: string; value: number; goal: number; color: string }) {
  const c = useColors();
  const pct = goal > 0 ? Math.min(1, value / goal) : 0;
  return (
    <View style={{ flex: 1, gap: 6 }}>
      <Txt v="small" style={{ fontWeight: '700' }} color={c.text}>
        {label}
      </Txt>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: c.ringTrack, overflow: 'hidden' }}>
        <View style={{ width: `${pct * 100}%`, height: 6, borderRadius: 3, backgroundColor: color }} />
      </View>
      <Txt v="small">
        {Math.round(value)} / {Math.round(goal)} g
      </Txt>
    </View>
  );
}

export function Banner({ icon, text, tone = 'accent' }: { icon: IconName; text: string; tone?: 'accent' | 'warn' }) {
  const c = useColors();
  const color = tone === 'warn' ? c.coral : c.accent;
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: 10,
        alignItems: 'center',
        backgroundColor: tone === 'warn' ? `${c.coral}22` : c.accentSoft,
        padding: space.m,
        borderRadius: radius.s,
      }}
    >
      <Ionicons name={icon} size={20} color={color} />
      <Txt v="sub" color={c.text} style={{ flex: 1 }}>
        {text}
      </Txt>
    </View>
  );
}
