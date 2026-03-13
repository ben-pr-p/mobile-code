import React, { useEffect, useRef, useMemo } from 'react';
import { View, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAtomValue } from 'jotai';
import { useNavigation, DrawerActions } from '@react-navigation/native';
import { SessionHeader } from '../../components/SessionHeader';
import { useRightDrawer } from '../../lib/drawer-context';
import { useStateQuery, type ProjectValue } from '../../lib/stream-db';
import { apiClientAtom } from '../../lib/api';

/**
 * Root index route — shown when no project is selected.
 * Auto-navigates to the most recent project on initial load.
 */
export default function IndexScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const navigation = useNavigation();
  const { openRightDrawer } = useRightDrawer();
  const api = useAtomValue(apiClientAtom);

  const { data: rawProjects } = useStateQuery(
    (db, q) => q.from({ projects: db.collections.projects }),
  );
  const projects = useMemo(
    () =>
      (rawProjects as ProjectValue[] | undefined)
        ?.slice()
        .sort((a, b) => b.time.created - a.time.created) ?? [],
    [rawProjects],
  );

  // Auto-navigate to the most recent project on initial load
  const hasAutoNavigated = useRef(false);
  useEffect(() => {
    if (hasAutoNavigated.current) return;
    if (projects.length === 0) return;
    hasAutoNavigated.current = true;

    const pid = projects[0].id;
    // Try to find existing sessions for this project
    (async () => {
      try {
        const res = await api.api.projects[':projectId'].sessions.$get({
          param: { projectId: pid },
        });
        if (res.ok) {
          const sessions = (await res.json()) as any[];
          // Skip child sessions (those with a parentID) — only navigate to top-level sessions
          const topLevel = sessions.filter((s: any) => !s.parentID);
          if (topLevel.length > 0) {
            router.replace({
              pathname: '/projects/[projectId]/sessions/[sessionId]',
              params: { projectId: pid, sessionId: topLevel[0].id },
            });
            return;
          }
        }
      } catch {}
      router.replace({
        pathname: '/projects/[projectId]/new-session',
        params: { projectId: pid },
      });
    })();
  }, [projects, api, router]);

  return (
    <View className="flex-1 bg-stone-50 dark:bg-stone-950" style={{ paddingTop: insets.top }}>
      <SessionHeader
        projectName=""
        branchName=""
        relativeTime=""
        onMenuPress={() => navigation.dispatch(DrawerActions.openDrawer())}
        onProjectsPress={openRightDrawer}
      />
      <View className="flex-1 items-center justify-center px-8">
        <Text className="text-center text-sm text-stone-400 dark:text-stone-600">
          Select a project to get started
        </Text>
      </View>
    </View>
  );
}
