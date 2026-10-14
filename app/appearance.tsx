import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import { Tap } from '../src/components/motion';
import { PlateRing } from '../src/components/PlateRing';
import { Button, Card, ChipGroup, Field, MacroBar, Row, Screen, SectionTitle, Txt } from '../src/components/ui';
import { useStore } from '../src/lib/store';
import { useColors, useScheme } from '../src/lib/theme';
import { buildColors, contrast, normalizeHex, SWATCHES, THEMES } from '../src/lib/themes';
import type { Appearance, MotionPref } from '../src/lib/types';
import { useT } from '../src/lib/useT';

type MacroKey = 'carbs' | 'protein' | 'fat';

/** Theme, light/dark, own accent and macro colours, animation level — with a live preview. */
export default function AppearanceScreen() {
  const { t } = useT();
  const c = useColors();
  const scheme = useScheme();
  const appearance = useStore((s) => s.appearance);
  const setAppearance = useStore((s) => s.setAppearance);
  const [macro, setMacro] = useState<MacroKey>('carbs');
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduce)
      .catch(() => {});
  }, []);

  const themeOnly = buildColors({ ...appearance, accent: undefined, macroColors: undefined }, scheme);

  return (
    <Screen>
      <Card r="l" style={{ alignItems: 'center', gap: 14 }}>
        <Txt v="label">{t('preview')}</Txt>
        <PlateRing size={150} budget={2000} eatenKcal={1320} carbsKcal={600} proteinKcal={380} fatKcal={340}>
          <Txt v="title">680</Txt>
          <Txt v="small">{t('kcal_left')}</Txt>
        </PlateRing>
        <Row gap={12} style={{ alignSelf: 'stretch' }}>
          <MacroBar label={t('carbs')} value={150} goal={250} color={c.carbs} />
          <MacroBar label={t('protein')} value={95} goal={110} color={c.protein} />
          <MacroBar label={t('fat')} value={38} goal={65} color={c.fat} />
        </Row>
        <Row gap={10}>
          <Button small title={t('add')} icon="add" onPress={() => {}} />
          <Button small kind="secondary" title={t('save')} onPress={() => {}} />
        </Row>
      </Card>

      <SectionTitle>{t('theme')}</SectionTitle>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {THEMES.map((th) => {
          const p = buildColors({ ...appearance, theme: th.id, accent: undefined, macroColors: undefined }, scheme);
          const selected = appearance.theme === th.id;
          return (
            <Tap
              key={th.id}
              onPress={() => setAppearance({ theme: th.id })}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={t(`theme_${th.id}`)}
              scaleTo={0.94}
              haptic
              style={{
                width: '31.5%',
                flexGrow: 1,
                borderRadius: 20,
                padding: 10,
                gap: 8,
                backgroundColor: p.bg,
                borderWidth: 2,
                borderColor: selected ? c.accent : c.line,
              }}
            >
              <View style={{ backgroundColor: p.card, borderRadius: 12, padding: 8, gap: 6, borderWidth: p.glow ? 1 : 0, borderColor: `${p.accent}55` }}>
                <View style={{ flexDirection: 'row', gap: 4 }}>
                  {[p.carbs, p.protein, p.fat].map((col, i) => (
                    <View key={i} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: col }} />
                  ))}
                </View>
                <View style={{ height: 14, borderRadius: 7, backgroundColor: p.accent }} />
              </View>
              <Row style={{ justifyContent: 'space-between' }}>
                <Txt v="label" color={p.text} style={{ fontFamily: p.fontDisplay }}>
                  {t(`theme_${th.id}`)}
                </Txt>
                {selected ? <Ionicons name="checkmark-circle" size={18} color={p.accent} /> : null}
              </Row>
            </Tap>
          );
        })}
      </View>

      <Card style={{ gap: 10 }}>
        <Txt v="h3">{t('scheme')}</Txt>
        <ChipGroup<Appearance['scheme']>
          options={[
            { value: 'system', label: t('scheme_system') },
            { value: 'light', label: t('scheme_light') },
            { value: 'dark', label: t('scheme_dark') },
          ]}
          value={appearance.scheme}
          onChange={(v) => setAppearance({ scheme: v })}
        />
      </Card>

      <Card style={{ gap: 10 }}>
        <Txt v="h3">{t('accent_color')}</Txt>
        <Txt v="small">{t('accent_hint')}</Txt>
        <ColorPicker
          value={appearance.accent}
          fallback={themeOnly.accent}
          background={c.bg}
          onChange={(accent) => setAppearance({ accent })}
        />
      </Card>

      <Card style={{ gap: 10 }}>
        <Txt v="h3">{t('macro_colors')}</Txt>
        <Txt v="small">{t('macro_colors_hint')}</Txt>
        <ChipGroup<MacroKey>
          options={[
            { value: 'carbs', label: t('carbs') },
            { value: 'protein', label: t('protein') },
            { value: 'fat', label: t('fat') },
          ]}
          value={macro}
          onChange={setMacro}
        />
        <ColorPicker
          key={macro}
          value={appearance.macroColors?.[macro]}
          fallback={themeOnly[macro]}
          background={c.card}
          onChange={(hex) => setAppearance({ macroColors: { ...appearance.macroColors, [macro]: hex } })}
        />
        {appearance.accent || appearance.macroColors ? (
          <Button
            small
            kind="ghost"
            icon="refresh"
            title={t('reset_colors')}
            style={{ alignSelf: 'flex-start' }}
            onPress={() => setAppearance({ accent: undefined, macroColors: undefined })}
          />
        ) : null}
      </Card>

      <Card style={{ gap: 10 }}>
        <Txt v="h3">{t('motion')}</Txt>
        <ChipGroup<MotionPref>
          options={[
            { value: 'lively', label: t('motion_lively') },
            { value: 'calm', label: t('motion_calm') },
            { value: 'off', label: t('motion_off') },
          ]}
          value={appearance.motion}
          onChange={(motion) => setAppearance({ motion })}
        />
        <Txt v="small">{t(`motion_${appearance.motion}_desc`)}</Txt>
        {reduce ? <Txt v="small">{t('reduce_motion_note')}</Txt> : null}
      </Card>
    </Screen>
  );
}

/** Swatches plus a hex field. `value` undefined = the theme's colour (`fallback`). */
function ColorPicker({
  value,
  fallback,
  background,
  onChange,
}: {
  value: string | undefined;
  fallback: string;
  background: string;
  onChange: (hex: string | undefined) => void;
}) {
  const { t } = useT();
  const c = useColors();
  const [text, setText] = useState(value ?? '');
  // follow outside changes (swatch taps) without overwriting what is being typed
  useEffect(() => {
    setText((cur) => (normalizeHex(cur) === (value ?? null) ? cur : (value ?? '')));
  }, [value]);
  const shown = value ?? fallback;
  const lowContrast = !!value && contrast(value, background) < 1.8;

  const swatch = (hex: string | undefined, key: string) => {
    const selected = hex === value || (hex === undefined && value === undefined);
    const fill = hex ?? fallback;
    return (
      <Tap
        key={key}
        onPress={() => onChange(hex)}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel={hex ?? t('theme_default')}
        scaleTo={0.85}
        haptic
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: fill,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: selected ? 3 : 1,
          borderColor: selected ? c.text : c.line,
        }}
      >
        {hex === undefined ? <Ionicons name="color-wand-outline" size={16} color={c.card} /> : null}
      </Tap>
    );
  };

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {swatch(undefined, 'default')}
        {SWATCHES.map((hex) => swatch(hex, hex))}
      </View>
      <Row gap={10}>
        <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: shown, borderWidth: 1, borderColor: c.line }} />
        <View style={{ flex: 1 }}>
          <Field
            placeholder={`${t('hex_code')} ${fallback}`}
            value={text}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={7}
            onChangeText={(v) => {
              setText(v);
              // only complete 6-digit codes, so "#22E" doesn't jump to #2222EE while typing
              if (/^#?[0-9a-f]{6}$/i.test(v.trim())) onChange(normalizeHex(v)!);
              if (!v.trim()) onChange(undefined);
            }}
          />
        </View>
      </Row>
      {lowContrast ? <Txt v="small">{t('low_contrast')}</Txt> : null}
    </View>
  );
}
