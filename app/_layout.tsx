import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { setupNotifications } from '../src/lib/device';
import { useHydrated } from '../src/lib/store';
import { useColors } from '../src/lib/theme';
import { useT } from '../src/lib/useT';

export default function RootLayout() {
  const hydrated = useHydrated();
  const c = useColors();
  const { t } = useT();

  useEffect(() => {
    setupNotifications();
  }, []);

  if (!hydrated) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={c.accent} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: c.bg },
          headerTintColor: c.accent,
          headerTitleStyle: { color: c.text },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: c.bg },
          headerBackTitle: t('back'),
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="add-food" options={{ title: t('add_food') }} />
        <Stack.Screen name="food" options={{ title: '' }} />
        <Stack.Screen name="scan" options={{ title: t('scan_barcode') }} />
        <Stack.Screen name="photo" options={{ title: t('ai_photo') }} />
        <Stack.Screen name="custom-food" options={{ title: t('create_food') }} />
        <Stack.Screen name="ai-settings" options={{ title: t('ai_settings') }} />
        <Stack.Screen name="edit-profile" options={{ title: t('edit_profile') }} />
      </Stack>
    </>
  );
}
