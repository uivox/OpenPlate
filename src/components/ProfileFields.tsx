import React from 'react';
import { View } from 'react-native';
import { ACTIVITY_FACTORS } from '../lib/nutrition';
import type { Activity, Goal, ProfileDraft, Sex } from '../lib/types';
import { draftProblem } from '../lib/validation';

export type { ProfileDraft };
import type { TFn } from '../lib/useT';
import { ChipGroup, NumField, Row, Txt } from './ui';

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
            value={PACES.includes(draft.paceKgPerWeek ?? -1) ? draft.paceKgPerWeek : null}
            onChange={(paceKgPerWeek) => set({ paceKgPerWeek })}
          />
          <NumField
            value={draft.paceKgPerWeek}
            onChange={(paceKgPerWeek) => set({ paceKgPerWeek })}
            suffix={t('kg_per_week', { kg: '' }).trim()}
            hint={t('pace_custom_hint')}
          />
        </>
      ) : null}
    </View>
  );
}

export function ActivityField({ draft, set, t }: Props) {
  type Choice = Activity | 'custom';
  return (
    <View style={{ gap: 8 }}>
      <ChipGroup<Choice>
        options={[
          ...ACTIVITIES.map((a) => ({ value: a as Choice, label: t(`activity_${a}`) })),
          { value: 'custom', label: t('activity_custom') },
        ]}
        value={draft.useCustomActivity ? 'custom' : draft.activity}
        onChange={(v) =>
          v === 'custom'
            ? set({ useCustomActivity: true, customActivityFactor: draft.customActivityFactor ?? ACTIVITY_FACTORS[draft.activity] })
            : set({ activity: v, useCustomActivity: false })
        }
      />
      {draft.useCustomActivity ? (
        <>
          <NumField label={t('activity_factor')} value={draft.customActivityFactor} onChange={(customActivityFactor) => set({ customActivityFactor })} suffix="×" />
          <Txt v="small">{t('activity_custom_desc')}</Txt>
        </>
      ) : (
        <Txt v="small">{t(`activity_${draft.activity}_desc`)}</Txt>
      )}
    </View>
  );
}

/** First problem with the draft as a translated message, or null (rules in validation.ts). */
export function draftErrors(d: ProfileDraft, t: TFn): string | null {
  const p = draftProblem(d);
  if (!p) return null;
  const params = p.params && Object.fromEntries(Object.entries(p.params).map(([k, v]) => [k, typeof v === 'number' ? String(v).replace('.', t('decimal_sep')) : v]));
  return t(p.key, params);
}
