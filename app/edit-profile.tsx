import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Switch, View } from 'react-native';
import { GoalBreakdown, GoalWarnings } from '../src/components/GoalWarnings';
import { ActivityField, BodyFields, GoalField, WeightFields, draftErrors, type ProfileDraft } from '../src/components/ProfileFields';
import { Button, Card, ChipGroup, Field, NumField, Row, Screen, SectionTitle, Txt } from '../src/components/ui';
import { dayKey } from '../src/lib/dates';
import { weightOn } from '../src/lib/goals';
import { goalDetails, isValidSplit, kcalFromMacros, MACRO_PRESETS, minimumKcal, type PresetId } from '../src/lib/nutrition';
import { buildProfile, draftFromProfile } from '../src/lib/profile';
import { useStore } from '../src/lib/store';
import { useColors } from '../src/lib/theme';
import type { MacroSplit, Profile } from '../src/lib/types';
import { useT } from '../src/lib/useT';

type MacroChoice = PresetId | 'custom' | 'grams';

export default function EditProfileScreen() {
  const { t, lang } = useT();
  const c = useColors();
  const profile = useStore((s) => s.profile)!;
  const weights = useStore((s) => s.weights);
  const setProfile = useStore((s) => s.setProfile);

  const [draft, setDraft] = useState<ProfileDraft>(() => draftFromProfile(profile));
  const set = (patch: Partial<ProfileDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const [water, setWater] = useState<number | null>(profile.waterGoalMl);
  const [glass, setGlass] = useState(profile.glassMl);
  const [stepGoal, setStepGoal] = useState<number | null>(profile.stepGoal);
  const [addActivity, setAddActivity] = useState(profile.addActivityCalories);
  const [name, setName] = useState(profile.name ?? '');

  // Calorie goal
  const [goalMode, setGoalMode] = useState<'auto' | 'custom'>(profile.goalMode ?? 'auto');
  const [customKcal, setCustomKcal] = useState<number | null>(profile.customKcal ?? null);
  const [ownMaintenance, setOwnMaintenance] = useState(!!profile.customMaintenanceKcal);
  const [maintenanceKcal, setMaintenanceKcal] = useState<number | null>(profile.customMaintenanceKcal ?? null);

  // Macros
  const [macroChoice, setMacroChoice] = useState<MacroChoice>(() =>
    profile.macroMode === 'grams'
      ? 'grams'
      : (MACRO_PRESETS.find((p) => JSON.stringify(p.split) === JSON.stringify(profile.macroSplit))?.id ?? 'custom'),
  );
  const [split, setSplit] = useState<{ carbs: number | null; protein: number | null; fat: number | null }>(profile.macroSplit);
  const [grams, setGrams] = useState<{ carbs: number | null; protein: number | null; fat: number | null }>(
    profile.macroGramsTarget ?? { carbs: null, protein: null, fat: null },
  );

  const splitSum = Math.round((split.carbs ?? 0) + (split.protein ?? 0) + (split.fat ?? 0));
  const gramsComplete = grams.carbs !== null && grams.protein !== null && grams.fat !== null;
  const gramsKcal = gramsComplete ? Math.round(kcalFromMacros({ carbs: grams.carbs!, protein: grams.protein!, fat: grams.fat! })) : 0;

  const error =
    draftErrors(draft, t) ??
    // An exact goal can't go below the usual minimum (safety floor, see nutrition.ts).
    (goalMode === 'custom' && (!customKcal || customKcal < minimumKcal(draft.sex) || customKcal > 6000)
      ? t('err_custom_kcal', { min: minimumKcal(draft.sex).toLocaleString(lang === 'de' ? 'de-DE' : 'en-US') })
      : null) ??
    (ownMaintenance && (!maintenanceKcal || maintenanceKcal < 1000 || maintenanceKcal > 6000) ? t('err_maintenance') : null) ??
    (macroChoice === 'custom' && !isValidSplit(split as MacroSplit) ? t('err_split') : null) ??
    (macroChoice === 'grams' && !gramsComplete ? t('err_macro_grams') : null) ??
    (!water || water < 500 ? t('err_water') : !stepGoal || stepGoal < 1000 ? t('err_steps') : null);

  const build = (): Profile | null => {
    if (draftErrors(draft, t)) return null;
    const macroSplit: MacroSplit =
      macroChoice === 'custom' && isValidSplit(split as MacroSplit)
        ? (split as MacroSplit)
        : (MACRO_PRESETS.find((p) => p.id === macroChoice)?.split ?? profile.macroSplit);
    return buildProfile(draft, {
      ...profile,
      name: name.trim() || undefined,
      macroSplit,
      waterGoalMl: Math.round(water ?? profile.waterGoalMl),
      glassMl: glass,
      stepGoal: Math.round(stepGoal ?? profile.stepGoal),
      addActivityCalories: addActivity,
      goalMode,
      customKcal: goalMode === 'custom' && customKcal ? Math.round(customKcal) : profile.customKcal,
      customMaintenanceKcal: ownMaintenance && maintenanceKcal ? Math.round(maintenanceKcal) : undefined,
      macroMode: macroChoice === 'grams' ? 'grams' : 'percent',
      macroGramsTarget:
        gramsComplete ? { carbs: Math.round(grams.carbs!), protein: Math.round(grams.protein!), fat: Math.round(grams.fat!) } : profile.macroGramsTarget,
    });
  };

  const candidate = build();
  const details = useMemo(
    () => (candidate ? goalDetails(candidate, weightOn(weights, candidate, dayKey())) : null),
    // the candidate is rebuilt every render; its JSON is a cheap stable key
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(candidate), weights],
  );

  const save = () => {
    if (error || !candidate) return;
    setProfile(candidate);
    router.back();
  };

  const macroField = (key: 'carbs' | 'protein' | 'fat', label: string, color: string, src: typeof split, setSrc: (v: typeof split) => void, suffix: string) => (
    <View style={{ flex: 1, gap: 4 }}>
      <Row gap={6}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
        <Txt v="label" color={c.text}>
          {label}
        </Txt>
      </Row>
      <NumField value={src[key]} decimals={false} suffix={suffix} onChange={(v) => setSrc({ ...src, [key]: v })} />
    </View>
  );

  return (
    <Screen>
      <SectionTitle>{t('goal')}</SectionTitle>
      <Card style={{ gap: 14 }}>
        <GoalField draft={draft} set={set} t={t} />
        <WeightFields draft={draft} set={set} t={t} />
        <Txt v="small">{t('start_weight_note')}</Txt>
      </Card>

      <SectionTitle>{t('body')}</SectionTitle>
      <Card style={{ gap: 14 }}>
        <Field label={t('your_name')} placeholder={t('your_name_ph')} value={name} onChangeText={setName} autoCapitalize="words" maxLength={24} />
        <BodyFields draft={draft} set={set} t={t} />
        <Txt v="sub">{t('activity')}</Txt>
        <ActivityField draft={draft} set={set} t={t} />
      </Card>

      <SectionTitle>{t('goal_section')}</SectionTitle>
      {details && candidate ? (
        <Card tone="beet" r="l" style={{ gap: 10 }}>
          <GoalBreakdown details={details} />
          <GoalWarnings details={details} sex={candidate.sex} />
        </Card>
      ) : null}
      <Card style={{ gap: 12 }}>
        <Txt v="h3">{t('goal_how')}</Txt>
        <ChipGroup
          options={[
            { value: 'auto', label: t('goal_mode_auto') },
            { value: 'custom', label: t('goal_mode_custom') },
          ]}
          value={goalMode}
          onChange={(m) => {
            setGoalMode(m);
            if (m === 'custom' && !customKcal && details) setCustomKcal(details.kcal);
          }}
        />
        <Txt v="small">{t(goalMode === 'auto' ? 'goal_mode_auto_hint' : 'goal_mode_custom_hint')}</Txt>
        {goalMode === 'custom' ? <NumField label={t('custom_kcal')} value={customKcal} decimals={false} suffix="kcal" onChange={setCustomKcal} /> : null}

        <Txt v="h3" style={{ marginTop: 6 }}>
          {t('maintenance_source')}
        </Txt>
        <ChipGroup
          options={[
            { value: 'auto', label: t('maintenance_auto') },
            { value: 'own', label: t('maintenance_own') },
          ]}
          value={ownMaintenance ? 'own' : 'auto'}
          onChange={(v) => {
            setOwnMaintenance(v === 'own');
            if (v === 'own' && !maintenanceKcal && details) setMaintenanceKcal(details.maintenance);
          }}
        />
        {ownMaintenance ? (
          <NumField label={t('maintenance')} value={maintenanceKcal} decimals={false} suffix="kcal" hint={t('maintenance_own_hint')} onChange={setMaintenanceKcal} />
        ) : null}
      </Card>

      <Card style={{ gap: 12 }}>
        <Txt v="h3">{t('macros')}</Txt>
        <ChipGroup<MacroChoice>
          options={[
            ...MACRO_PRESETS.map((p) => ({
              value: p.id as MacroChoice,
              label: `${t(`preset_${p.id}`)} ${p.split.carbs}/${p.split.protein}/${p.split.fat}`,
            })),
            { value: 'custom', label: `${t('macro_custom')} %` },
            { value: 'grams', label: t('macro_mode_grams') },
          ]}
          value={macroChoice}
          onChange={(v) => {
            setMacroChoice(v);
            const preset = MACRO_PRESETS.find((p) => p.id === v);
            if (preset) setSplit(preset.split);
            if (v === 'grams' && !gramsComplete && candidate && details) {
              const base = candidate.macroSplit;
              setGrams({
                carbs: Math.round((details.kcal * base.carbs) / 400),
                protein: Math.round((details.kcal * base.protein) / 400),
                fat: Math.round((details.kcal * base.fat) / 900),
              });
            }
          }}
        />
        {macroChoice === 'custom' ? (
          <>
            <Row gap={10} style={{ alignItems: 'flex-start' }}>
              {macroField('carbs', t('carbs'), c.carbs, split, setSplit, '%')}
              {macroField('protein', t('protein'), c.protein, split, setSplit, '%')}
              {macroField('fat', t('fat'), c.fat, split, setSplit, '%')}
            </Row>
            <Txt v="small" color={splitSum === 100 ? c.sub : c.danger}>
              {t('macro_sum', { sum: splitSum })}
            </Txt>
          </>
        ) : null}
        {macroChoice === 'grams' ? (
          <>
            <Row gap={10} style={{ alignItems: 'flex-start' }}>
              {macroField('carbs', t('carbs'), c.carbs, grams, setGrams, 'g')}
              {macroField('protein', t('protein'), c.protein, grams, setGrams, 'g')}
              {macroField('fat', t('fat'), c.fat, grams, setGrams, 'g')}
            </Row>
            {gramsComplete ? (
              <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
                <Txt v="small">{t('macro_grams_kcal', { kcal: gramsKcal.toLocaleString(lang === 'de' ? 'de-DE' : 'en-US') })}</Txt>
                {details && Math.abs(gramsKcal - details.kcal) > 20 ? (
                  <Button
                    small
                    kind="ghost"
                    title={t('use_as_goal')}
                    onPress={() => {
                      setGoalMode('custom');
                      setCustomKcal(gramsKcal);
                    }}
                  />
                ) : null}
              </Row>
            ) : null}
          </>
        ) : (
          <Txt v="small">{t('macro_split_hint')}</Txt>
        )}
      </Card>

      <SectionTitle>{t('water_and_steps')}</SectionTitle>
      <Card style={{ gap: 12 }}>
        <Row>
          <NumField label={t('water_goal')} value={water} decimals={false} suffix="ml" onChange={setWater} />
          <NumField label={t('step_goal')} value={stepGoal} decimals={false} onChange={setStepGoal} />
        </Row>
        <Txt v="sub">{t('glass_size')}</Txt>
        <ChipGroup options={[200, 250, 300, 500].map((v) => ({ value: v, label: `${v} ml` }))} value={glass} onChange={setGlass} />
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt style={{ flex: 1 }}>{t('add_activity_calories')}</Txt>
          <Switch value={addActivity} onValueChange={setAddActivity} trackColor={{ true: c.accent }} />
        </Row>
        <Txt v="small">{t('add_activity_calories_hint')}</Txt>
      </Card>

      {error ? (
        <Txt v="sub" color={c.danger}>
          {error}
        </Txt>
      ) : null}
      <Button title={t('save')} icon="checkmark" onPress={save} disabled={!!error} />
    </Screen>
  );
}
