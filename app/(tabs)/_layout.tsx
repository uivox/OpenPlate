import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';
import React from 'react';
import { useStore } from '../../src/lib/store';
import { useColors } from '../../src/lib/theme';
import { useT } from '../../src/lib/useT';

export default function TabsLayout() {
  const profile = useStore((s) => s.profile);
  const c = useColors();
  const { t } = useT();
  if (!profile) return <Redirect href="/onboarding" />;

  const icon =
    (name: React.ComponentProps<typeof Ionicons>['name']) =>
    ({ color, size }: { color: string; size: number }) => <Ionicons name={name} color={color} size={size} />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.sub,
        tabBarStyle: { backgroundColor: c.card, borderTopColor: c.line },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t('tab_diary'), tabBarIcon: icon('book') }} />
      <Tabs.Screen name="fasting" options={{ title: t('tab_fasting'), tabBarIcon: icon('timer') }} />
      <Tabs.Screen name="progress" options={{ title: t('tab_progress'), tabBarIcon: icon('trending-down') }} />
      <Tabs.Screen name="profile" options={{ title: t('tab_profile'), tabBarIcon: icon('person-circle') }} />
    </Tabs>
  );
}
