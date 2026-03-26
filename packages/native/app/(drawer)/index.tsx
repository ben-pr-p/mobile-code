import React, { useEffect, useRef } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColorScheme } from 'nativewind';
import { useRouter } from 'expo-router';
import { useNavigation, DrawerActions, type NavigationProp } from '@react-navigation/native';
import { SessionHeader } from '../../components/SessionHeader';
import { useRightDrawer } from '../../lib/drawer-context';
import { useDeduplicatedProjects } from '../../hooks/useDeduplicatedProjects';

/**
 * Root index route — shown when no project is selected.
 * Auto-navigates to the most recent project on initial load.
 */
export default function IndexScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const navigation = useNavigation<NavigationProp<any>>();
  const { openRightDrawer } = useRightDrawer();
  const { colorScheme } = useColorScheme();
  const { projects, isLoading } = useDeduplicatedProjects();

  // Auto-navigate to the most recent project's index, which will in turn
  // resolve the most recent non-archived session or fall back to new-session.
  const hasAutoNavigated = useRef(false);
  useEffect(() => {
    if (hasAutoNavigated.current) return;
    if (isLoading || projects.length === 0) return;
    hasAutoNavigated.current = true;

    router.replace({
      pathname: '/projects/[projectId]',
      params: { projectId: projects[0].projectId },
    });
  }, [isLoading, projects, router]);

  return (
    <View className="flex-1 bg-stone-50 dark:bg-stone-950" style={{ paddingTop: insets.top }}>
      <SessionHeader
        projectName=""
        branchName=""
        relativeTime=""
        onMenuPress={() => navigation.dispatch(DrawerActions.openDrawer())}
        onProjectsPress={openRightDrawer}
      />
      {isLoading || projects.length > 0 ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="small" color={colorScheme === 'dark' ? '#A8A29E' : '#78716C'} />
        </View>
      ) : (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-center text-sm text-stone-400 dark:text-stone-600">
            Select a project to get started
          </Text>
        </View>
      )}
    </View>
  );
}
