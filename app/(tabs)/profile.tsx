import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { importBackupFlow } from '../../src/components/importBackup';
import { Sprout } from '../../src/components/Sprout';
import { TAB_BAR_SPACE } from '../../src/components/TabBar';
import { Card, ChipGroup, Divider, ListRow, Row, Screen, SectionTitle, Txt } from '../../src/components/ui';
import { PROVIDER_NAMES } from '../../src/lib/ai';
import { showAlert } from '../../src/lib/alert';
import { buildBackup } from '../../src/lib/backup';
import { dayKey } from '../../src/lib/dates';
import { canPickFiles, shareExport } from '../../src/lib/device';
import { foodSubtitle } from '../../src/lib/format';
import { goalsFor } from '../../src/lib/hooks';
import { clearAllKeys } from '../../src/lib/secure';
import { useStore } from '../../src/lib/store';
import { useColors } from '../../src/lib/theme';
import type { LanguagePref } from '../../src/lib/types';
import { useT } from '../../src/lib/useT';

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useT();
  const c = useColors();
  const state = useStore();
  const profile = state.profile!;
  const goals = goalsFor(profile, state.weights, dayKey());
  const chevron = <Ionicons name="chevron-forward" size={18} color={c.sub} />;

  const exportData = async () => {
    const { profile: p, language, entries, customFoods, recentFoods, water, weights, fastingActive, fastingHistory, ai } = useStore.getState();
    const data = buildBackup({ profile: p, language, entries, customFoods, recentFoods, water, weights, fastingActive, fastingHistory, ai });
    await shareExport(JSON.stringify(data, null, 2), `openplate-export-${dayKey()}.json`);
  };

  const importData = () => importBackupFlow(t);

  const resetAll = () =>
    showAlert(t('delete_all_q'), t('delete_all_text'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete_all'),
        style: 'destructive',
        onPress: async () => {
          await clearAllKeys();
          useStore.getState().resetAll();
          router.replace('/onboarding');
        },
      },
    ]);

  const aiLabel = state.ai.primary
    ? [state.ai.primary, state.ai.fallback].filter(Boolean).map((p) => PROVIDER_NAMES[p!]).join(' → ')
    : t('not_set_up');

  return (
    <Screen style={{ paddingTop: insets.top + 12 }} bottomInset={TAB_BAR_SPACE}>
      <Txt v="title">{t('tab_profile')}</Txt>

      <Card r="xl" tone="beet" style={{ paddingVertical: 22 }}>
        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ flex: 1, gap: 4 }}>
            <Txt v="label">{t(`goal_${profile.goal}`)}</Txt>
            <Txt v="big">{goals.kcal}</Txt>
            <Txt v="sub">{t('kcal_per_day')}</Txt>
          </View>
          <Sprout size={84} />
        </Row>
        <Txt v="sub">
          {t('macro_line', { c: goals.macros.carbs, p: goals.macros.protein, f: goals.macros.fat })}
        </Txt>
        <Txt v="sub">{t('weight_path', { from: profile.startWeightKg, to: profile.targetWeightKg })}</Txt>
      </Card>

      <Card>
        <ListRow icon="person-outline" title={t('edit_profile')} subtitle={t('edit_profile_sub')} right={chevron} onPress={() => router.push('/edit-profile')} />
        <Divider />
        <ListRow icon="sparkles-outline" title={t('ai_settings')} subtitle={aiLabel} right={chevron} onPress={() => router.push('/ai-settings')} />
      </Card>

      <SectionTitle>{t('language')}</SectionTitle>
      <Card>
        <ChipGroup<LanguagePref>
          options={[
            { value: 'system', label: t('lang_system') },
            { value: 'de', label: 'Deutsch' },
            { value: 'en', label: 'English' },
          ]}
          value={state.language}
          onChange={state.setLanguage}
        />
      </Card>

      {state.customFoods.length > 0 ? (
        <>
          <SectionTitle>{t('my_foods')}</SectionTitle>
          <Card>
            {state.customFoods.map((f, i) => (
              <View key={f.id}>
                {i > 0 ? <Divider /> : null}
                <ListRow
                  title={f.name}
                  subtitle={foodSubtitle(f)}
                  onLongPress={() =>
                    showAlert(t('delete_food_q'), f.name, [
                      { text: t('cancel'), style: 'cancel' },
                      { text: t('delete'), style: 'destructive', onPress: () => state.removeCustomFood(f.id) },
                    ])
                  }
                />
              </View>
            ))}
          </Card>
          <Txt v="small">{t('long_press_delete')}</Txt>
        </>
      ) : null}

      <SectionTitle>{t('data')}</SectionTitle>
      <Card>
        <ListRow icon="share-outline" title={t('export_data')} subtitle={t('export_data_sub')} onPress={exportData} />
        <Divider />
        {canPickFiles ? (
          <>
            <ListRow icon="download-outline" title={t('import_data')} subtitle={t('import_data_sub')} onPress={importData} />
            <Divider />
          </>
        ) : null}
        <ListRow icon="trash-outline" title={t('delete_all')} onPress={resetAll} />
      </Card>
      {Platform.OS === 'web' ? <Txt v="small">{t('web_data_note')}</Txt> : null}

      <SectionTitle>{t('about')}</SectionTitle>
      <Card>
        <Txt v="sub">{t('about_text')}</Txt>
        <Txt v="small">{t('off_attribution')}</Txt>
        <Txt v="small">{t('medical_disclaimer')}</Txt>
      </Card>
    </Screen>
  );
}
