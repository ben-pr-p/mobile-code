import React, { useEffect, useRef } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useNavigation, DrawerActions } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColorScheme } from 'nativewind';
import { SessionHeader } from '../../../../components/SessionHeader';
import { useRightDrawer } from '../../../../lib/drawer-context';
import { collections } from '../../../../lib/collections';
import type { SessionValue, SessionMetaValue } from '../../../../lib/stream-db';
import { eq, useLiveQuery } from '@tanstack/react-db';

/**
 * Project root route — auto-navigates to the most recent non-archived session,
 * or to new-session if none exist. Shows a loading spinner while resolving.
 */
export default function ProjectIndexScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();

  const { data: sessions, isLoading: sessionsLoading } = useLiveQuery(
    (q) =>
      projectId
        ? q
            .from({ sessions: collections.sessions })
            .where(({ sessions }) => eq(sessions.projectID, projectId))
        : null,
    [projectId]
  );
  const { data: sessionMetas, isLoading: metasLoading } = useLiveQuery(
    (q) => q.from({ sessionMeta: collections.sessionMeta }),
    []
  );

  if (!projectId) return null;

  return (
    <ProjectIndexContent
      projectId={projectId}
      sessions={sessions as SessionValue[] | null}
      sessionMetas={sessionMetas as SessionMetaValue[] | null}
      isLoading={sessionsLoading || metasLoading}
    />
  );
}

function ProjectIndexContent({
  projectId,
  sessions,
  sessionMetas,
  isLoading,
}: {
  projectId: string;
  sessions: SessionValue[] | null;
  sessionMetas: SessionMetaValue[] | null;
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
