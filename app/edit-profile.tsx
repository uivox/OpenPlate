import { router } from 'expo-router';
import React, { useState } from 'react';
import { Switch } from 'react-native';
import { ActivityField, BodyFields, GoalField, WeightFields, draftErrors, type ProfileDraft } from '../src/components/ProfileFields';
import { Button, Card, ChipGroup, NumField, Row, Screen, SectionTitle, Txt } from '../src/components/ui';
import { MACRO_PRESETS } from '../src/lib/nutrition';
import { buildProfile, draftFromProfile } from '../src/lib/profile';
import { useStore } from '../src/lib/store';
import { useColors } from '../src/lib/theme';
import { useT } from '../src/lib/useT';

export default function EditProfileScreen() {
  const { t } = useT();
  const c = useColors();
  const profile = useStore((s) => s.profile)!;
  const setProfile = useStore((s) => s.setProfile);

  const [draft, setDraft] = useState<ProfileDraft>(() => draftFromProfile(profile));
  const set = (patch: Partial<ProfileDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const [presetId, setPresetId] = useState(
    () => MACRO_PRESETS.find((p) => JSON.stringify(p.split) === JSON.stringify(profile.macroSplit))?.id ?? 'balanced',
  );
  const [water, setWater] = useState<number | null>(profile.waterGoalMl);
  const [glass, setGlass] = useState(profile.glassMl);
  const [stepGoal, setStepGoal] = useState<number | null>(profile.stepGoal);
  const [addActivity, setAddActivity] = useState(profile.addActivityCalories);

  const error = draftErrors(draft, t) ?? (!water || water < 500 ? t('err_water') : !stepGoal || stepGoal < 1000 ? t('err_steps') : null);

  const save = () => {
    if (error) return;
    const split = MACRO_PRESETS.find((p) => p.id === presetId)?.split ?? profile.macroSplit;
    setProfile(
      buildProfile(draft, {
        ...profile,
        macroSplit: split,
        waterGoalMl: Math.round(water!),
        glassMl: glass,
        stepGoal: Math.round(stepGoal!),
        addActivityCalories: addActivity,
      }),
    );
    router.back();
  };

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
        <BodyFields draft={draft} set={set} t={t} />
        <Txt v="sub">{t('activity')}</Txt>
        <ActivityField draft={draft} set={set} t={t} />
      </Card>

      <SectionTitle>{t('nutrition')}</SectionTitle>
      <Card style={{ gap: 12 }}>
        <Txt v="sub">{t('macro_split')}</Txt>
        <ChipGroup
          options={MACRO_PRESETS.map((p) => ({
            value: p.id,
            label: `${t(`preset_${p.id}`)} ${p.split.carbs}/${p.split.protein}/${p.split.fat}`,
          }))}
          value={presetId}
          onChange={setPresetId}
        />
        <Txt v="small">{t('macro_split_hint')}</Txt>
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
