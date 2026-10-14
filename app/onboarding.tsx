import { router } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { importBackupFlow } from '../src/components/importBackup';
import { ActivityField, BodyFields, GoalField, WeightFields, draftErrors, type ProfileDraft } from '../src/components/ProfileFields';
import { Sprout } from '../src/components/Sprout';
import { Button, Card, ChipGroup, Field, Row, Screen, Txt } from '../src/components/ui';
import { dayKey } from '../src/lib/dates';
import { canPickFiles } from '../src/lib/device';
import { GoalWarnings } from '../src/components/GoalWarnings';
import { bmi, goalDetails, macroTargets } from '../src/lib/nutrition';
import { buildProfile } from '../src/lib/profile';
import { useStore } from '../src/lib/store';
import { useColors } from '../src/lib/theme';
import type { LanguagePref } from '../src/lib/types';
import { useT } from '../src/lib/useT';

const STEPS = 6;

export default function Onboarding() {
  const insets = useSafeAreaInsets();
  const c = useColors();
  const { t } = useT();
  const language = useStore((s) => s.language);
  const setLanguage = useStore((s) => s.setLanguage);
  const setProfile = useStore((s) => s.setProfile);
  const logWeight = useStore((s) => s.logWeight);

  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<ProfileDraft>({
    goal: 'lose',
    sex: 'female',
    birthYear: 1995,
    heightCm: 170,
    startWeightKg: 75,
    targetWeightKg: 68,
    activity: 'light',
    paceKgPerWeek: 0.5,
    useCustomActivity: false,
    customActivityFactor: null,
  });
  const set = (patch: Partial<ProfileDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const [name, setName] = useState('');

  const stepError = (): string | null => {
    const year = new Date().getFullYear();
    if (step === 2) {
      if (!draft.birthYear || draft.birthYear < year - 100 || draft.birthYear > year - 13) return t('err_birth_year');
      if (!draft.heightCm || draft.heightCm < 120 || draft.heightCm > 230) return t('err_height');
    }
    if (step === 3 || step === 4) return draftErrors(draft, t);
    return null;
  };
  const error = stepError();

  const preview = step === 5 && !draftErrors(draft, t) ? buildProfile(draft) : null;
  const details = preview ? goalDetails(preview, preview.startWeightKg) : null;
  const kcal = details?.kcal ?? 0;
  const macros = preview ? macroTargets(preview, kcal) : null;

  const finish = () => {
    if (!preview) return;
    setProfile({ ...preview, name: name.trim() || undefined });
    logWeight(dayKey(), preview.startWeightKg);
    router.replace('/');
  };

  return (
    <Screen style={{ paddingTop: insets.top + 24, flexGrow: 1 }}>
      <Row gap={6}>
        {Array.from({ length: STEPS }).map((_, i) => (
          <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= step ? c.accent : c.line }} />
        ))}
      </Row>

      {step === 0 ? (
        <View style={{ gap: 16, marginTop: 12 }}>
          <Sprout size={150} />
          <Txt v="hero">OpenPlate</Txt>
          <Txt v="h2" style={{ maxWidth: 340 }}>
            {t('welcome_text')}
          </Txt>
          <Field label={t('your_name')} placeholder={t('your_name_ph')} value={name} onChangeText={setName} autoCapitalize="words" maxLength={24} />
          <Txt v="label">{t('language')}</Txt>
          <ChipGroup<LanguagePref>
            options={[
              { value: 'system', label: t('lang_system') },
              { value: 'de', label: 'Deutsch' },
              { value: 'en', label: 'English' },
            ]}
            value={language}
            onChange={setLanguage}
          />
          {canPickFiles ? (
            <Button
              small
              kind="ghost"
              icon="download-outline"
              title={t('import_existing')}
              onPress={() => importBackupFlow(t)}
              style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }}
            />
          ) : null}
        </View>
      ) : null}

      {step === 1 ? (
        <Card r="xl" style={{ gap: 14, padding: 22 }}>
          <Txt v="title">{t('q_goal')}</Txt>
          <GoalField draft={draft} set={set} t={t} />
        </Card>
      ) : null}

      {step === 2 ? (
        <Card r="xl" style={{ gap: 14, padding: 22 }}>
          <Txt v="title">{t('q_body')}</Txt>
          <Txt v="sub">{t('q_body_text')}</Txt>
          <BodyFields draft={draft} set={set} t={t} />
        </Card>
      ) : null}

      {step === 3 ? (
        <Card r="xl" style={{ gap: 14, padding: 22 }}>
          <Txt v="title">{t('q_weight')}</Txt>
          <WeightFields draft={draft} set={set} t={t} />
        </Card>
      ) : null}

      {step === 4 ? (
        <Card r="xl" style={{ gap: 14, padding: 22 }}>
          <Txt v="title">{t('q_activity')}</Txt>
          <ActivityField draft={draft} set={set} t={t} />
        </Card>
      ) : null}

      {step === 5 && preview && macros ? (
        <Card r="xl" style={{ gap: 12, alignItems: 'center', padding: 22 }}>
          <Txt v="title" center>
            {t('your_plan')}
          </Txt>
          <Txt v="big" color={c.accent}>
            {kcal}
          </Txt>
          <Txt v="sub">{t('kcal_per_day')}</Txt>
          <Row gap={20}>
            <Txt v="sub" color={c.carbs}>
              {t('carbs')} {macros.carbs} g
            </Txt>
            <Txt v="sub" color={c.protein}>
              {t('protein')} {macros.protein} g
            </Txt>
            <Txt v="sub" color={c.fat}>
              {t('fat')} {macros.fat} g
            </Txt>
          </Row>
          <Txt v="sub" center>
            {t('plan_water', { l: (preview.waterGoalMl / 1000).toString().replace('.', t('decimal_sep')) })}
          </Txt>
          <Txt v="sub" center>
            {t('plan_bmi', { bmi: bmi(preview.startWeightKg, preview.heightCm).toFixed(1).replace('.', t('decimal_sep')) })}
          </Txt>
          {preview.goal !== 'maintain' ? (
            <Txt v="sub" center>
              {t('plan_eta', {
                weeks: Math.ceil(Math.abs(preview.startWeightKg - preview.targetWeightKg) / Math.max(0.1, preview.paceKgPerWeek)),
              })}
            </Txt>
          ) : null}
          {details ? <GoalWarnings details={details} sex={preview.sex} /> : null}
          <Txt v="small" center>
            {t('plan_disclaimer')}
          </Txt>
        </Card>
      ) : null}

      {error ? (
        <Txt v="sub" color={c.danger}>
          {error}
        </Txt>
      ) : null}

      <View style={{ flex: 1 }} />
      <Row>
        {step > 0 ? <Button kind="secondary" title={t('back')} onPress={() => setStep(step - 1)} style={{ flex: 1 }} /> : null}
        <Button
          title={step === STEPS - 1 ? t('lets_go') : t('next')}
          onPress={() => (step === STEPS - 1 ? finish() : setStep(step + 1))}
          disabled={!!error || (step === STEPS - 1 && !preview)}
          style={{ flex: 2 }}
        />
      </Row>
    </Screen>
  );
}
