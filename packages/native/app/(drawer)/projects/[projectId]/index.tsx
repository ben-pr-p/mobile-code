import React, { useEffect, useRef } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useNavigation, DrawerActions } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColorScheme } from 'nativewind';
import { SessionHeader } from '../../../../components/SessionHeader';
import { useRightDrawer } from '../../../../lib/drawer-context';
import { MergedStateQuery, MergedAppStateQuery } from '../../../../lib/merged-query';
import { collections } from '../../../../lib/collections';
import type { SessionValue, SessionMetaValue } from '../../../../lib/stream-db';
import type { WithBackendUrl } from '../../../../lib/merged-query';
import { eq } from '@tanstack/react-db';

/**
 * Project root route — auto-navigates to the most recent non-archived session,
 * or to new-session if none exist. Shows a loading spinner while resolving.
 */
export default function ProjectIndexScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();

  if (!projectId) return null;

  return (
    <MergedStateQuery<SessionValue>
      query={(q) =>
        q
          .from({ sessions: collections.sessions })
          .where(({ sessions }) => eq(sessions.projectID, projectId))
      }
      deps={[projectId]}>
      {({ data: sessions, isLoading: sessionsLoading }) => (
        <MergedAppStateQuery<SessionMetaValue>
          query={(q) => q.from({ sessionMeta: collections.sessionMeta })}>
          {({ data: sessionMetas, isLoading: metasLoading }) => (
            <ProjectIndexContent
              projectId={projectId}
              sessions={sessions}
              sessionMetas={sessionMetas}
              isLoading={sessionsLoading || metasLoading}
            />
          )}
        </MergedAppStateQuery>
      )}
    </MergedStateQuery>
  );
}

function ProjectIndexContent({
  projectId,
  sessions,
  sessionMetas,
  isLoading,
}: {
  projectId: string;
  sessions: WithBackendUrl<SessionValue>[] | null;
  sessionMetas: WithBackendUrl<SessionMetaValue>[] | null;
  isLoading: boolean;
}) {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const { openRightDrawer } = useRightDrawer();
  const hasNavigated = useRef(false);

  useEffect(() => {
    if (hasNavigated.current) return;
    // Wait until we have a definitive answer from the streams
    if (isLoading || sessions === null || sessionMetas === null) return;

    hasNavigated.current = true;

    const archivedIds = new Set(sessionMetas.filter((m) => m.archived).map((m) => m.sessionId));

    // Find most recent top-level non-archived session for this project
    const active = sessions
      .filter((s) => !s.parentID && !archivedIds.has(s.id))
      .sort((a, b) => b.time.updated - a.time.updated);

    if (active.length > 0) {
      const s = active[0];
      router.replace({
        pathname: '/projects/[projectId]/sessions/[sessionId]',
        params: { projectId, sessionId: s.id, backendUrl: s.backendUrl },
      });
    } else {
      router.replace({
        pathname: '/projects/[projectId]/new-session',
        params: { projectId },
      });
    }
  }, [isLoading, sessions, sessionMetas, projectId, router]);

  return (
    <View className="flex-1 bg-stone-50 dark:bg-stone-950" style={{ paddingTop: insets.top }}>
      <SessionHeader
        projectName=""
        branchName=""
        relativeTime=""
        onMenuPress={() => navigation.dispatch(DrawerActions.openDrawer())}
        onProjectsPress={openRightDrawer}
      />
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="small" color={colorScheme === 'dark' ? '#A8A29E' : '#78716C'} />
      </View>
    </View>
  );
}
