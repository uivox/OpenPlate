import { BricolageGrotesque_600SemiBold } from '@expo-google-fonts/bricolage-grotesque/600SemiBold';
import { BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque/800ExtraBold';
import { Figtree_400Regular } from '@expo-google-fonts/figtree/400Regular';
import { Figtree_500Medium } from '@expo-google-fonts/figtree/500Medium';
import { Figtree_600SemiBold } from '@expo-google-fonts/figtree/600SemiBold';
import { Figtree_700Bold } from '@expo-google-fonts/figtree/700Bold';
import { SpaceGrotesk_600SemiBold } from '@expo-google-fonts/space-grotesk/600SemiBold';
import { SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk/700Bold';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { DialogHost } from '../src/components/DialogHost';
import { setupNotifications } from '../src/lib/device';
import { requestPersistentStorage } from '../src/lib/storage';
import { useHydrated } from '../src/lib/store';
import { fonts, useColors } from '../src/lib/theme';
import { useT } from '../src/lib/useT';

export default function RootLayout() {
  const hydrated = useHydrated();
  const [fontsLoaded, fontError] = useFonts({
    BricolageGrotesque_600SemiBold,
    BricolageGrotesque_800ExtraBold,
    Figtree_400Regular,
    Figtree_500Medium,
    Figtree_600SemiBold,
    Figtree_700Bold,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
  });
  const c = useColors();
  const { t } = useT();

  useEffect(() => {
    setupNotifications();
    requestPersistentStorage();
  }, []);

  // If fonts fail to load the app still works with system fonts.
  if (!hydrated || (!fontsLoaded && !fontError)) return <View style={{ flex: 1, backgroundColor: c.bg }} />;

  return (
    <>
      <StatusBar style={c.scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: c.bg },
          headerTintColor: c.accent,
          headerTitleStyle: { color: c.text, fontFamily: c.fontDisplay, fontSize: 18 },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: c.bg },
          headerBackTitle: t('back'),
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="add-food" options={{ title: t('add_food') }} />
        <Stack.Screen name="food" options={{ title: '' }} />
        <Stack.Screen name="scan" options={{ title: t('scan_barcode'), headerTransparent: true, headerTintColor: '#fff', headerTitleStyle: { color: '#fff', fontFamily: fonts.display } }} />
        <Stack.Screen name="photo" options={{ title: t('ai_photo') }} />
        <Stack.Screen name="custom-food" options={{ title: t('create_food') }} />
        <Stack.Screen name="ai-settings" options={{ title: t('ai_settings') }} />
        <Stack.Screen name="edit-profile" options={{ title: t('edit_profile') }} />
        <Stack.Screen name="meal" options={{ title: t('my_meals') }} />
        <Stack.Screen name="meal-edit" options={{ title: t('new_meal') }} />
        <Stack.Screen name="streak" options={{ title: t('streak_title') }} />
        <Stack.Screen name="appearance" options={{ title: t('appearance') }} />
        <Stack.Screen name="layout-settings" options={{ title: t('layout_title') }} />
      </Stack>
      <DialogHost />
    </>
  );
}
