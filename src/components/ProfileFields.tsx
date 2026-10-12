import React from 'react';
import { View } from 'react-native';
import type { Activity, Goal, Sex } from '../lib/types';
import type { TFn } from '../lib/useT';
import { ChipGroup, NumField, Row, Txt } from './ui';

export interface ProfileDraft {
  goal: Goal;
  sex: Sex;
  birthYear: number | null;
  heightCm: number | null;
  startWeightKg: number | null;
  targetWeightKg: number | null;
  activity: Activity;
  paceKgPerWeek: number;
}

export const ACTIVITIES: Activity[] = ['sedentary', 'light', 'moderate', 'active', 'very_active'];
export const PACES = [0.25, 0.5, 0.75, 1];

type Props = { draft: ProfileDraft; set: (patch: Partial<ProfileDraft>) => void; t: TFn };

export function GoalField({ draft, set, t }: Props) {
  return (
    <ChipGroup
      options={(['lose', 'maintain', 'gain'] as Goal[]).map((g) => ({ value: g, label: t(`goal_${g}`) }))}
      value={draft.goal}
      onChange={(goal) => set({ goal })}
    />
  );
}

export function BodyFields({ draft, set, t }: Props) {
  return (
    <View style={{ gap: 14 }}>
      <Txt v="sub">{t('sex')}</Txt>
      <ChipGroup
        options={[
          { value: 'female', label: t('female') },
          { value: 'male', label: t('male') },
        ]}
        value={draft.sex}
        onChange={(sex) => set({ sex })}
      />
      <Row>
        <NumField label={t('birth_year')} value={draft.birthYear} decimals={false} onChange={(v) => set({ birthYear: v })} />
        <NumField label={t('height')} value={draft.heightCm} decimals={false} suffix="cm" onChange={(v) => set({ heightCm: v })} />
      </Row>
    </View>
  );
}

export function WeightFields({ draft, set, t, showStart = true }: Props & { showStart?: boolean }) {
  return (
    <View style={{ gap: 14 }}>
      <Row>
        {showStart ? (
          <NumField label={t('current_weight')} value={draft.startWeightKg} suffix="kg" onChange={(v) => set({ startWeightKg: v })} />
        ) : null}
        {draft.goal !== 'maintain' ? (
          <NumField label={t('target_weight')} value={draft.targetWeightKg} suffix="kg" onChange={(v) => set({ targetWeightKg: v })} />
        ) : null}
      </Row>
      {draft.goal !== 'maintain' ? (
        <>
          <Txt v="sub">{t('pace')}</Txt>
          <ChipGroup
            options={PACES.map((p) => ({ value: p, label: t('pace_value', { kg: p.toString().replace('.', t('decimal_sep')) }) }))}
            value={draft.paceKgPerWeek}
            onChange={(paceKgPerWeek) => set({ paceKgPerWeek })}
          />
        </>
      ) : null}
    </View>
  );
}

export function ActivityField({ draft, set, t }: Props) {
  return (
    <View style={{ gap: 8 }}>
      <ChipGroup
        options={ACTIVITIES.map((a) => ({ value: a, label: t(`activity_${a}`) }))}
        value={draft.activity}
        onChange={(activity) => set({ activity })}
      />
      <Txt v="small">{t(`activity_${draft.activity}_desc`)}</Txt>
    </View>
  );
}

export function draftErrors(d: ProfileDraft, t: TFn): string | null {
  const year = new Date().getFullYear();
  if (!d.birthYear || d.birthYear < year - 100 || d.birthYear > year - 13) return t('err_birth_year');
  if (!d.heightCm || d.heightCm < 120 || d.heightCm > 230) return t('err_height');
  if (!d.startWeightKg || d.startWeightKg < 35 || d.startWeightKg > 300) return t('err_weight');
  if (d.goal !== 'maintain' && (!d.targetWeightKg || d.targetWeightKg < 35 || d.targetWeightKg > 300)) return t('err_weight');
  if (d.goal === 'lose' && d.targetWeightKg! >= d.startWeightKg) return t('err_target_lose');
  if (d.goal === 'gain' && d.targetWeightKg! <= d.startWeightKg) return t('err_target_gain');
  return null;
}
