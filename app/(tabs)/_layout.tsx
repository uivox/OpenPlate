import { Redirect, Tabs } from 'expo-router';
import React from 'react';
import { TabBar } from '../../src/components/TabBar';
import { useStore } from '../../src/lib/store';
import { useColors, useMotion } from '../../src/lib/theme';
import { useT } from '../../src/lib/useT';

export default function TabsLayout() {
  const profile = useStore((s) => s.profile);
  const c = useColors();
  const motion = useMotion();
  const { t } = useT();
  if (!profile) return <Redirect href="/onboarding" />;

  return (
    <Tabs
      tabBar={(props: any) => <TabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: c.bg }, animation: motion === 'lively' ? 'shift' : 'none' }}
    >
      <Tabs.Screen name="index" options={{ title: t('tab_diary') }} />
      <Tabs.Screen name="fasting" options={{ title: t('tab_fasting') }} />
      <Tabs.Screen name="recipes" options={{ title: t('tab_recipes') }} />
      <Tabs.Screen name="progress" options={{ title: t('tab_progress') }} />
      <Tabs.Screen name="profile" options={{ title: t('tab_profile') }} />
    </Tabs>
  );
}
