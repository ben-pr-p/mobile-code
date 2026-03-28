// Must be first import — polyfills crypto.randomUUID before TanStack DB loads
import '../lib/polyfills';
import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { View, Alert } from 'react-native';
import { Stack, useGlobalSearchParams } from 'expo-router';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Drawer } from 'react-native-drawer-layout';
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
  JetBrainsMono_600SemiBold,
  JetBrainsMono_700Bold,
} from '@expo-google-fonts/jetbrains-mono';

import '../global.css';
import { ProjectsSidebar } from '../components/ProjectsSidebar';
import { RightDrawerContext } from '../lib/drawer-context';
import { useSettings } from '../hooks/useSettings';
import { useLayout } from '../hooks/useLayout';
import { useBackendManager } from '../hooks/useBackendManager';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useBackendManager();

  const [fontsLoaded] = useFonts({
    'JetBrains Mono': JetBrainsMono_400Regular,
    'JetBrainsMono-Regular': JetBrainsMono_400Regular,
    'JetBrainsMono-Medium': JetBrainsMono_500Medium,
    'JetBrainsMono-SemiBold': JetBrainsMono_600SemiBold,
    'JetBrainsMono-Bold': JetBrainsMono_700Bold,
  });
  const { width: screenWidth } = useLayout();
  const sidebarWidth = screenWidth * 0.85;
  // useGlobalSearchParams reads params from the currently focused child route,
  // since this root layout is a parent of all routes that define projectId.
  const params = useGlobalSearchParams<{ projectId?: string }>();
  const settings = useSettings();

  // Right drawer (projects) state
  const [rightDrawerOpen, setRightDrawerOpen] = useState(false);

  const rightDrawerCtx = useMemo(
    () => ({
      openRightDrawer: () => setRightDrawerOpen(true),
      closeRightDrawer: () => setRightDrawerOpen(false),
    }),
    []
  );

  // Alert the user if expo-updates rolled back due to a crash in a previous OTA update
  useEffect(() => {
    if (settings.isEmergencyLaunch) {
      Alert.alert(
        'Update Rolled Back',
        'The last OTA update crashed on launch and was automatically rolled back. ' +
          'The app is running the previous working version. ' +
          'Check the published update for errors before re-publishing.'
      );
    }
  }, [settings.isEmergencyLaunch]);

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <RightDrawerContext.Provider value={rightDrawerCtx}>
        {/* The right (projects) drawer lives in the root layout rather than
            inside the (drawer) group because expo-router's Drawer navigator
            only supports a single drawer. We use react-native-drawer-layout
            here as the outer wrapper so we get native swipe-from-right-edge
            gestures without conflicting with the left sessions drawer. */}
        <Drawer
          open={rightDrawerOpen}
          onOpen={() => setRightDrawerOpen(true)}
          onClose={() => setRightDrawerOpen(false)}
          drawerPosition="right"
          drawerType="front"
          swipeEdgeWidth={40}
          swipeMinDistance={50}
          drawerStyle={{ width: sidebarWidth }}
          renderDrawerContent={() => (
            <ProjectsSidebar
              selectedProjectId={params.projectId ?? null}
              onClose={() => setRightDrawerOpen(false)}
            />
          )}>
          <View style={{ flex: 1 }}>
            <Suspense>
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="(drawer)" />
                <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
              </Stack>
            </Suspense>
          </View>
        </Drawer>
      </RightDrawerContext.Provider>
      <StatusBar style="auto" />
    </SafeAreaProvider>
  );
}
