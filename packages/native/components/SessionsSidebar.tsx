import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColorScheme } from 'nativewind';
import {
  Menu,
  Plus,
  Search,
  Ellipsis,
  Settings,
  Mic,
  HelpCircle,
  ChevronRight,
  ChevronDown,
  GitBranch,
  Pin,
  Archive,
  ArchiveRestore,
  CircleDot,
  Check,
  Monitor,
  Cloud,
  AlertTriangle,
} from 'lucide-react-native';
import { useAtom, useAtomValue } from 'jotai/react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import type { DrawerContentComponentProps } from '@react-navigation/drawer';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  interpolate,
  Easing,
  type SharedValue,
} from 'react-native-reanimated';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useLiveQuery } from '@tanstack/react-db';
import type {
  SessionValue,
  SessionStatusValue,
  SessionMetaValue,
  WorktreeStatusValue,
  PermissionRequestValue,
  ProjectValue,
} from '../lib/stream-db';
import type { Message as ServerMessage } from '../../server/src/types';
import {
  MergedStateQuery,
  MergedEphemeralStateQuery,
  MergedAppStateQuery,
  type WithBackendUrl,
} from '../lib/merged-query';
import { getApi, type ApiClient } from '../lib/api';
import { collections } from '../lib/collections';
import { pinnedSessionIdsAtom, pinnedProjectIdsAtom } from '../state/ui';
import type { BackendConfigValue } from '../lib/stream-db';

type BackendType = BackendConfigValue['type'];

interface SessionsSidebarProps {
  projectId: string | undefined;
  selectedSessionId: string | null;
  /** Navigation object passed from the Drawer's drawerContent render prop. */
  drawerNavigation: DrawerContentComponentProps['navigation'];
}

/** Left drawer content — lists sessions for the current project. */
export function SessionsSidebar({
  projectId,
  selectedSessionId,
  drawerNavigation,
}: SessionsSidebarProps) {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const iconColor = colorScheme === 'dark' ? '#A8A29E' : '#44403C';
  const mutedIconColor = colorScheme === 'dark' ? '#57534E' : '#A8A29E';
  const micIconColor = colorScheme === 'dark' ? '#0C0A09' : '#FFFFFF';
  const router = useRouter();

  const closeDrawer = useCallback(() => {
    drawerNavigation.closeDrawer();
  }, [drawerNavigation]);

  const handleNewSession = useCallback(
    (pid?: string) => {
      const targetProjectId = pid ?? projectId;
      if (!targetProjectId) return;
      router.push({
        pathname: '/projects/[projectId]/new-session',
        params: { projectId: targetProjectId },
      });
      closeDrawer();
    },
    [projectId, router, closeDrawer]
  );

  const handleSelectSession = useCallback(
    (sessionId: string, pid: string, backendUrl: string) => {
      router.push({
        pathname: '/projects/[projectId]/sessions/[sessionId]',
        params: { projectId: pid, sessionId, backendUrl },
      });
      closeDrawer();
    },
    [router, closeDrawer]
  );

  const handleSettingsPress = useCallback(() => {
    closeDrawer();
    router.push('/settings');
  }, [router, closeDrawer]);

  return (
    <GestureHandlerRootView
      className="flex-1 bg-stone-50 dark:bg-stone-950"
      style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View className="h-14 flex-row items-center justify-between px-5">
        <Pressable
          onPress={closeDrawer}
          className="h-10 w-10 items-center justify-center rounded-lg bg-white dark:bg-stone-900">
          <Menu size={20} color={iconColor} />
        </Pressable>

        <Text
          className="text-lg font-semibold text-stone-900 dark:text-stone-50"
          style={{ fontFamily: 'JetBrains Mono' }}>
          Sessions
        </Text>

        <Pressable
          onPress={() => handleNewSession()}
          className="h-10 w-10 items-center justify-center rounded-lg bg-white dark:bg-stone-900">
          <Plus size={20} color={iconColor} />
        </Pressable>
      </View>

      {/* Divider */}
      <View className="h-px bg-stone-200 dark:bg-stone-800" />

      {projectId ? (
        <MergedStateQuery<SessionValue> query={(q) => q.from({ sessions: collections.sessions })}>
          {({ data: allSessions }) => (
            <MergedEphemeralStateQuery<SessionStatusValue>
              query={(q) => q.from({ sessionStatuses: collections.sessionStatuses })}>
              {({ data: sessionStatuses }) => (
                <MergedEphemeralStateQuery<WorktreeStatusValue>
                  query={(q) => q.from({ worktreeStatuses: collections.worktreeStatuses })}>
                  {({ data: worktreeStatuses }) => (
                    <MergedStateQuery<ServerMessage>
                      query={(q) => q.from({ messages: collections.messages })}>
                      {({ data: allMessages }) => (
                        <MergedStateQuery<ProjectValue>
                          query={(q) => q.from({ backendProjects: collections.backendProjects })}>
                          {({ data: allProjects }) => (
                            <MergedAppStateQuery<SessionMetaValue>
                              query={(q) => q.from({ sessionMeta: collections.sessionMeta })}>
                              {({ data: sessionMetas }) => (
                                <MergedEphemeralStateQuery<PermissionRequestValue>
                                  query={(q) =>
                                    q.from({
                                      permissionRequests: collections.permissionRequests,
                                    })
                                  }>
                                  {({ data: pendingPermissions }) => (
                                    <SessionListContent
                                      projectId={projectId}
                                      selectedSessionId={selectedSessionId}
                                      onSelectSession={handleSelectSession}
                                      onNewSession={handleNewSession}
                                      allSessions={allSessions}
                                      sessionStatuses={sessionStatuses}
                                      worktreeStatuses={worktreeStatuses}
                                      allMessages={allMessages}
                                      allProjects={allProjects}
                                      sessionMetas={sessionMetas}
                                      pendingPermissions={pendingPermissions}
                                    />
                                  )}
                                </MergedEphemeralStateQuery>
                              )}
                            </MergedAppStateQuery>
                          )}
                        </MergedStateQuery>
                      )}
                    </MergedStateQuery>
                  )}
                </MergedEphemeralStateQuery>
              )}
            </MergedEphemeralStateQuery>
          )}
        </MergedStateQuery>
      ) : (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-center text-sm font-medium text-stone-700 dark:text-stone-400">
            Select a project to view sessions
          </Text>
        </View>
      )}

      {/* Bottom bar */}
      <View
        className="flex-row items-center justify-between border-t border-stone-200 px-5 pt-3 dark:border-stone-800"
        style={{
          paddingBottom: Math.max(insets.bottom, 28),
        }}>
        <Pressable testID="settings-icon" onPress={handleSettingsPress} hitSlop={8}>
          <Settings size={22} color={mutedIconColor} />
        </Pressable>

        <Pressable
          onPress={() => {}}
          className="h-12 w-12 items-center justify-center rounded-xl bg-amber-600 dark:bg-amber-500">
          <Mic size={22} color={micIconColor} />
        </Pressable>

        <Pressable onPress={() => {}} hitSlop={8}>
          <HelpCircle size={22} color={mutedIconColor} />
        </Pressable>
      </View>
    </GestureHandlerRootView>
  );
}

function SessionStatusDot({
  status,
  hasPendingPermission,
}: {
  status: SessionStatusValue['status'];
  hasPendingPermission?: boolean;
}) {
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (hasPendingPermission || status === 'busy') {
      opacity.value = withRepeat(
        withTiming(0.4, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      );
    } else {
      opacity.value = withTiming(1, { duration: 200 });
    }
  }, [status, hasPendingPermission, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  // Pending permission takes priority — pulsing amber warning triangle
  if (hasPendingPermission) {
    return (
      <Animated.View
        style={[
          animatedStyle,
          { width: 8, height: 8, alignItems: 'center', justifyContent: 'center' },
        ]}>
        <AlertTriangle size={10} color="#F59E0B" fill="#F59E0B" />
      </Animated.View>
    );
  }

  const colorClass =
    status === 'busy'
      ? 'bg-green-500'
      : status === 'error'
        ? 'bg-red-500'
        : 'bg-stone-400 dark:bg-stone-600';

  if (status === 'busy') {
    return <Animated.View style={animatedStyle} className={`h-2 w-2 rounded-full ${colorClass}`} />;
  }

  return <View className={`h-2 w-2 rounded-full ${colorClass}`} />;
}

function SessionWorktreeBadge({ worktreeStatus }: { worktreeStatus: WorktreeStatusValue }) {
  const { colorScheme } = useColorScheme();

  if (!worktreeStatus.isWorktreeSession || worktreeStatus.error) return null;

  if (worktreeStatus.hasUncommittedChanges) {
    return (
      <View className="flex-row items-center gap-0.5 rounded bg-amber-100 px-1.5 py-0.5 dark:bg-amber-900/30">
        <CircleDot size={8} color={colorScheme === 'dark' ? '#fbbf24' : '#d97706'} />
        <Text
          className="text-[9px] text-amber-700 dark:text-amber-400"
          style={{ fontFamily: 'JetBrains Mono' }}>
          Uncommitted
        </Text>
      </View>
    );
  }

  if (worktreeStatus.hasUnmergedCommits) {
    return (
      <View className="flex-row items-center gap-0.5 rounded bg-blue-100 px-1.5 py-0.5 dark:bg-blue-900/30">
        <GitBranch size={8} color={colorScheme === 'dark' ? '#60a5fa' : '#2563eb'} />
        <Text
          className="text-[9px] text-blue-700 dark:text-blue-400"
          style={{ fontFamily: 'JetBrains Mono' }}>
          Awaiting merge
        </Text>
      </View>
    );
  }

  if (worktreeStatus.merged) {
    return (
      <View className="flex-row items-center gap-0.5 rounded bg-green-100 px-1.5 py-0.5 dark:bg-green-900/30">
        <Check size={8} color={colorScheme === 'dark' ? '#4ade80' : '#16a34a'} />
        <Text
          className="text-[9px] text-green-700 dark:text-green-400"
          style={{ fontFamily: 'JetBrains Mono' }}>
          Merged
        </Text>
      </View>
    );
  }

  return null;
}

type TaggedSession = WithBackendUrl<SessionValue>;

interface SessionRowProps {
  session: TaggedSession;
  isSelected: boolean;
  isPinned: boolean;
  sessionStatus: SessionStatusValue['status'];
  /** Whether this session has a pending permission request requiring user attention. */
  hasPendingPermission?: boolean;
  worktreeStatus?: WorktreeStatusValue;
  /** Agent name used for this session (e.g. "build", "plan"). */
  agentName?: string;
  onPress: (sessionId: string, projectId: string, backendUrl: string) => void;
  onOverflow?: (id: string, backendUrl: string) => void;
  onTogglePin: (id: string) => void;
  isArchived?: boolean;
  hasChildren?: boolean;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  isSubSession?: boolean;
  /** Backend type for this session's server (shown as Monitor/Cloud icon when multiple backends exist). */
  backendType?: BackendType;
}

// Threshold in px past which the swipe commits the archive action.
const ARCHIVE_SWIPE_THRESHOLD = 100;

/** Animated right-action panel revealed behind a session row during swipe. */
function ArchiveSwipeAction({
  drag,
  isArchived,
  isLoading,
}: {
  drag: SharedValue<number>;
  isArchived: boolean;
  isLoading: boolean;
}) {
  // The icon scales up once the user drags past the threshold to confirm the action.
  const iconStyle = useAnimatedStyle(() => {
    const scale = interpolate(
      Math.abs(drag.value),
      [0, ARCHIVE_SWIPE_THRESHOLD * 0.8, ARCHIVE_SWIPE_THRESHOLD],
      [0.8, 1, 1.2],
      'clamp'
    );
    return { transform: [{ scale }] };
  });

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center rounded-lg bg-amber-600">
        <ActivityIndicator size="small" color="#FFFFFF" />
      </View>
    );
  }

  return (
    <View className="flex-1 items-center justify-center rounded-lg bg-amber-600">
      <Animated.View style={iconStyle}>
        {isArchived ? (
          <ArchiveRestore size={18} color="#FFFFFF" />
        ) : (
          <Archive size={18} color="#FFFFFF" />
        )}
      </Animated.View>
      <Text
        className="mt-1 text-[10px] font-medium text-white"
        style={{ fontFamily: 'JetBrains Mono' }}>
        {isArchived ? 'Unarchive' : 'Archive'}
      </Text>
    </View>
  );
}

function SessionRow({
  session,
  isSelected,
  isPinned,
  sessionStatus,
  hasPendingPermission,
  worktreeStatus,
  agentName,
  onPress,
  onOverflow,
  onTogglePin,
  isArchived,
  hasChildren,
  isExpanded,
  onToggleExpand,
  isSubSession,
  backendType,
}: SessionRowProps) {
  const { colorScheme } = useColorScheme();
  const overflowColor = colorScheme === 'dark' ? '#57534E' : '#A8A29E';
  const chevronColor = colorScheme === 'dark' ? '#57534E' : '#A8A29E';
  const subSessionIconColor = colorScheme === 'dark' ? '#57534E' : '#A8A29E';
  const pinColor = colorScheme === 'dark' ? '#D97706' : '#B45309';
  const [isArchiving, setIsArchiving] = useState(false);

  const archiveSession = useCallback(
    async (backendUrl: string, sessionId: string) => {
      const api = getApi(backendUrl);
      if (!api) return;
      await api.sessions.archive({ sessionId });
    },
    [getApi]
  );

  const unarchiveSession = useCallback(
    async (backendUrl: string, sessionId: string) => {
      const api = getApi(backendUrl);
      if (!api) return;
      await api.sessions.unarchive({ sessionId });
    },
    [getApi]
  );

  const handleLongPress = useCallback(() => {
    onTogglePin(session.id);
  }, [session.id, onTogglePin]);

  const renderRightActions = useCallback(
    (_progress: SharedValue<number>, drag: SharedValue<number>) => (
      <ArchiveSwipeAction drag={drag} isArchived={!!isArchived} isLoading={isArchiving} />
    ),
    [isArchived, isArchiving]
  );

  const handleSwipeOpen = useCallback(
    (direction: 'left' | 'right') => {
      if (direction === 'left') {
        setIsArchiving(true);
        if (isArchived) {
          unarchiveSession(session.backendUrl, session.id);
        } else {
          archiveSession(session.backendUrl, session.id);
        }
      }
    },
    [session.id, session.backendUrl, isArchived, archiveSession, unarchiveSession]
  );

  return (
    <ReanimatedSwipeable
      renderRightActions={renderRightActions}
      onSwipeableOpen={handleSwipeOpen}
      rightThreshold={ARCHIVE_SWIPE_THRESHOLD}
      friction={1.5}
      overshootFriction={4}>
      <Pressable
        onPress={() => onPress(session.id, session.projectID, session.backendUrl)}
        onLongPress={handleLongPress}
        className={`flex-row items-center gap-3 rounded-lg py-3 ${
          isSubSession ? 'pl-8 pr-3.5' : 'px-3.5'
        } ${
          isSelected
            ? 'border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30'
            : ''
        }`}>
        {/* Status dot — always visible */}
        <SessionStatusDot status={sessionStatus} hasPendingPermission={hasPendingPermission} />
        {/* Metadata icons */}
        {isPinned && <Pin size={12} color={pinColor} className="-ml-1" />}
        {isSubSession && <GitBranch size={12} color={subSessionIconColor} className="-ml-1" />}
        {hasChildren && (
          <Pressable onPress={onToggleExpand} hitSlop={8} className="-ml-1">
            {isExpanded ? (
              <ChevronDown size={14} color={chevronColor} />
            ) : (
              <ChevronRight size={14} color={chevronColor} />
            )}
          </Pressable>
        )}
        <View className="flex-1 gap-0.5">
          <Text
            className={`font-medium text-stone-700 dark:text-stone-400 ${isSubSession ? 'text-xs' : 'text-sm'}`}
            style={{ fontFamily: 'JetBrains Mono' }}>
            {session.title}
          </Text>
          <View className="flex-row items-center gap-1.5">
            <Text
              className="text-[11px] text-stone-400 dark:text-stone-600"
              style={{ fontFamily: 'JetBrains Mono' }}>
              {formatRelativeTime(session.time.updated)}
            </Text>
            {backendType &&
              (backendType === 'local' ? (
                <Monitor size={11} color={colorScheme === 'dark' ? '#57534E' : '#A8A29E'} />
              ) : (
                <Cloud size={11} color={colorScheme === 'dark' ? '#57534E' : '#A8A29E'} />
              ))}
            {agentName && (
              <View className="rounded bg-stone-200 px-1.5 py-0.5 dark:bg-stone-800">
                <Text
                  className="text-[9px] text-stone-500 dark:text-stone-400"
                  style={{ fontFamily: 'JetBrains Mono' }}>
                  {agentName}
                </Text>
              </View>
            )}
            {worktreeStatus && <SessionWorktreeBadge worktreeStatus={worktreeStatus} />}
          </View>
        </View>
        {onOverflow && (
          <Pressable onPress={() => onOverflow(session.id, session.backendUrl)} hitSlop={8}>
            <Ellipsis size={16} color={overflowColor} />
          </Pressable>
        )}
      </Pressable>
    </ReanimatedSwipeable>
  );
}

type SessionTree = {
  session: TaggedSession;
  children: TaggedSession[];
};

function SessionListContent({
  projectId,
  selectedSessionId,
  onSelectSession,
  onNewSession,
  allSessions,
  sessionStatuses,
  worktreeStatuses,
  allMessages,
  allProjects,
  sessionMetas,
  pendingPermissions,
}: {
  projectId: string;
  selectedSessionId: string | null;
  onSelectSession: (sessionId: string, projectId: string, backendUrl: string) => void;
  /** Create a new session for the given project ID. */
  onNewSession: (projectId: string) => void;
  allSessions: TaggedSession[] | null;
  sessionStatuses: WithBackendUrl<SessionStatusValue>[] | null;
  worktreeStatuses: WithBackendUrl<WorktreeStatusValue>[] | null;
  allMessages: WithBackendUrl<ServerMessage>[] | null;
  allProjects: WithBackendUrl<ProjectValue>[] | null;
  sessionMetas: WithBackendUrl<SessionMetaValue>[] | null;
  pendingPermissions: WithBackendUrl<PermissionRequestValue>[] | null;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());
  const [showArchived, setShowArchived] = useState(false);
  // Pinned project groups are collapsed by default
  const [expandedPinnedProjects, setExpandedPinnedProjects] = useState<Set<string>>(new Set());
  const [pinnedIds, setPinnedIds] = useAtom(pinnedSessionIdsAtom);
  const resolvedPinnedIds = pinnedIds instanceof Promise ? [] : pinnedIds;
  const pinnedSet = useMemo(() => new Set(resolvedPinnedIds), [resolvedPinnedIds]);

  // Pinned projects — sessions from these show at the top regardless of selected project
  const [pinnedProjectIds] = useAtom(pinnedProjectIdsAtom);
  const resolvedPinnedProjectIds = pinnedProjectIds instanceof Promise ? [] : pinnedProjectIds;
  const pinnedProjectSet = useMemo(
    () => new Set(resolvedPinnedProjectIds),
    [resolvedPinnedProjectIds]
  );

  // Backend type lookup — used to show Monitor/Cloud icon in session rows
  const { data: backendRows } = useLiveQuery((q) => q.from({ backends: collections.backends }), []);
  const resolvedBackends = (backendRows as BackendConfigValue[] | null) ?? [];
  const hasMultipleBackends = resolvedBackends.filter((b) => b.enabled).length > 1;
  const backendTypeMap = useMemo(() => {
    const map = new Map<string, BackendConfigValue['type']>();
    for (const b of resolvedBackends) {
      map.set(b.url, b.type);
    }
    return map;
  }, [resolvedBackends]);

  const router = useRouter();
  const params = useLocalSearchParams<{ projectId?: string; sessionId?: string }>();

  const togglePin = useCallback(
    (sessionId: string) => {
      if (resolvedPinnedIds.includes(sessionId)) {
        setPinnedIds(resolvedPinnedIds.filter((id: string) => id !== sessionId));
      } else {
        setPinnedIds([...resolvedPinnedIds, sessionId]);
      }
    },
    [resolvedPinnedIds, setPinnedIds]
  );

  const deleteSession = useCallback(
    async (sid: string, backendUrl: string) => {
      const api = getApi(backendUrl);
      if (!api) return;
      try {
        await api.sessions.delete({ sessionId: sid });
        if (sid === params.sessionId && params.projectId) {
          router.push({
            pathname: '/projects/[projectId]/new-session',
            params: { projectId: params.projectId },
          });
        }
      } catch {
        Alert.alert('Error', 'Failed to delete session.');
      }
    },
    [getApi, params.sessionId, params.projectId, router]
  );

  const handleOverflow = useCallback(
    (sid: string, backendUrl: string) => {
      const isPinned = resolvedPinnedIds.includes(sid);
      Alert.alert('Session Options', undefined, [
        {
          text: isPinned ? 'Unpin Session' : 'Pin Session',
          onPress: () => {
            if (isPinned) {
              setPinnedIds(resolvedPinnedIds.filter((id: string) => id !== sid));
            } else {
              setPinnedIds([...resolvedPinnedIds, sid]);
            }
          },
        },
        {
          text: 'Delete Session',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Delete Session',
              'This will permanently delete the session and all its data. This cannot be undone.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: () => deleteSession(sid, backendUrl),
                },
              ]
            );
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]);
    },
    [resolvedPinnedIds, setPinnedIds, deleteSession]
  );

  const sessionStatusBySession = useMemo(() => {
    const map = new Map<string, SessionStatusValue['status']>();
    for (const ss of sessionStatuses ?? []) {
      map.set(ss.sessionId, ss.status);
    }
    return map;
  }, [sessionStatuses]);

  const worktreeStatusBySession = useMemo(() => {
    const map = new Map<string, WorktreeStatusValue>();
    for (const ws of worktreeStatuses ?? []) {
      map.set(ws.sessionId, ws);
    }
    return map;
  }, [worktreeStatuses]);

  const permissionSessionIds = useMemo(() => {
    const set = new Set<string>();
    for (const pr of pendingPermissions ?? []) {
      set.add(pr.sessionId);
    }
    return set;
  }, [pendingPermissions]);

  const agentBySession = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of allMessages ?? []) {
      if (m.role === 'user' && (m as any).agent) {
        if (!map.has(m.sessionId)) {
          map.set(m.sessionId, (m as any).agent);
        }
      }
    }
    return map;
  }, [allMessages]);

  const archivedIds = useMemo(
    () => new Set(sessionMetas?.filter((m) => m.archived).map((m) => m.sessionId) ?? []),
    [sessionMetas]
  );

  // Build project name map for pinned-project session group headers.
  // Dedup by projectId since the same project can appear on multiple backends.
  const projectNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of (allProjects as ProjectValue[] | undefined) ?? []) {
      const name = p.worktree === '/' ? 'global' : p.worktree.split('/').pop() || p.worktree;
      map.set(p.projectId, name);
    }
    return map;
  }, [allProjects]);

  // Build pinned-project sessions: most recent non-archived session from each pinned project
  // (excluding the currently selected project since those already show in the main list)
  type PinnedProjectGroup = {
    projectId: string;
    projectName: string;
    sessions: SessionTree[];
  };

  const pinnedProjectGroups = useMemo((): PinnedProjectGroup[] => {
    if (resolvedPinnedProjectIds.length === 0) return [];
    const sessions = allSessions as SessionValue[] | undefined;
    if (!sessions) return [];

    // Only show pinned projects that are NOT the current project
    const otherPinnedProjectIds = resolvedPinnedProjectIds.filter((pid) => pid !== projectId);
    if (otherPinnedProjectIds.length === 0) return [];

    const groups: PinnedProjectGroup[] = [];

    for (const pid of otherPinnedProjectIds) {
      let projectSessions = sessions.filter(
        (s) => s.projectID === pid && !s.parentID && !archivedIds.has(s.id)
      );

      // Apply search filter if active
      if (searchQuery) {
        projectSessions = projectSessions.filter((s) =>
          s.title.toLowerCase().includes(searchQuery.toLowerCase())
        );
      }

      if (projectSessions.length === 0) continue;

      // Sort by updated time, take the most recent sessions
      projectSessions.sort((a, b) => b.time.updated - a.time.updated);

      // Show up to 3 most recent sessions per pinned project
      const topSessions = projectSessions.slice(0, 3).map((s) => ({
        session: s,
        children: [] as SessionValue[],
      }));

      groups.push({
        projectId: pid,
        projectName: projectNameById.get(pid) ?? pid.slice(0, 8),
        sessions: topSessions,
      });
    }

    return groups;
  }, [resolvedPinnedProjectIds, allSessions, projectId, archivedIds, searchQuery, projectNameById]);

  // Build tree structure: top-level sessions with nested children
  const { activeTree, archivedTree } = useMemo(() => {
    const byProject = allSessions?.filter((s) => s.projectID === projectId);
    if (!byProject) return { activeTree: [], archivedTree: [] };

    const filtered = searchQuery
      ? byProject.filter((s) => s.title.toLowerCase().includes(searchQuery.toLowerCase()))
      : byProject;

    // When searching, show flat list so results aren't hidden inside collapsed parents
    if (searchQuery) {
      const flat = filtered.map((s) => ({ session: s, children: [] as TaggedSession[] }));
      flat.sort((a, b) => {
        const aPinned = pinnedSet.has(a.session.id);
        const bPinned = pinnedSet.has(b.session.id);
        if (aPinned && !bPinned) return -1;
        if (!aPinned && bPinned) return 1;
        return b.session.time.updated - a.session.time.updated;
      });
      const active = flat.filter((node) => !archivedIds.has(node.session.id));
      const archived = flat.filter((node) => archivedIds.has(node.session.id));
      return { activeTree: active, archivedTree: archived };
    }

    // Build parent->children map
    const childrenByParent = new Map<string, TaggedSession[]>();
    const childIds = new Set<string>();

    for (const s of filtered) {
      if (s.parentID) {
        childIds.add(s.id);
        const existing = childrenByParent.get(s.parentID) ?? [];
        existing.push(s);
        childrenByParent.set(s.parentID, existing);
      }
    }

    for (const children of childrenByParent.values()) {
      children.sort((a, b) => b.time.updated - a.time.updated);
    }

    const tree: SessionTree[] = [];
    for (const s of filtered) {
      if (childIds.has(s.id)) continue;
      tree.push({
        session: s,
        children: childrenByParent.get(s.id) ?? [],
      });
    }

    tree.sort((a, b) => {
      const aPinned = pinnedSet.has(a.session.id);
      const bPinned = pinnedSet.has(b.session.id);
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;
      return b.session.time.updated - a.session.time.updated;
    });

    const active = tree.filter((node) => !archivedIds.has(node.session.id));
    const archived = tree.filter((node) => archivedIds.has(node.session.id));

    return { activeTree: active, archivedTree: archived };
  }, [allSessions, projectId, searchQuery, pinnedSet, archivedIds]);

  // Auto-expand parent if selected session is a child
  useMemo(() => {
    if (!selectedSessionId) return;
    for (const node of [...activeTree, ...archivedTree]) {
      if (node.children.some((c) => c.id === selectedSessionId)) {
        setExpandedParents((prev) => {
          if (prev.has(node.session.id)) return prev;
          const next = new Set(prev);
          next.add(node.session.id);
          return next;
        });
      }
    }
  }, [selectedSessionId, activeTree, archivedTree]);

  const toggleExpand = (sessionId: string) => {
    setExpandedParents((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) {
        next.delete(sessionId);
      } else {
        next.add(sessionId);
      }
      return next;
    });
  };

  const { colorScheme } = useColorScheme();
  const searchIconColor = colorScheme === 'dark' ? '#57534E' : '#A8A29E';
  const placeholderColor = colorScheme === 'dark' ? '#57534E' : '#A8A29E';
  const mutedIconColor = colorScheme === 'dark' ? '#57534E' : '#A8A29E';

  return (
    <>
      {/* Search */}
      <View className="px-5 pb-3 pt-1">
        <View className="h-11 flex-row items-center gap-2.5 rounded-lg bg-white px-3.5 dark:bg-stone-900">
          <Search size={16} color={searchIconColor} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="search --sessions"
            placeholderTextColor={placeholderColor}
            className="flex-1 text-xs text-stone-900 dark:text-stone-50"
            style={{ fontFamily: 'JetBrains Mono' }}
          />
        </View>
      </View>

      {/* Divider */}
      <View className="h-px bg-stone-200 dark:bg-stone-800" />

      {/* Sessions list */}
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 12, gap: 2 }}
        showsVerticalScrollIndicator={false}>
        {/* Pinned project sessions — from other projects, always visible */}
        {pinnedProjectGroups.map((group) => {
          const isExpanded = expandedPinnedProjects.has(group.projectId);
          return (
            <View key={group.projectId} className="mb-1">
              {/* Collapsible header row: chevron + pin icon + name + new session button */}
              <View className="flex-row items-center px-3.5 pb-1 pt-2">
                <Pressable
                  onPress={() => {
                    setExpandedPinnedProjects((prev) => {
                      const next = new Set(prev);
                      if (next.has(group.projectId)) {
                        next.delete(group.projectId);
                      } else {
                        next.add(group.projectId);
                      }
                      return next;
                    });
                  }}
                  hitSlop={8}
                  className="flex-1 flex-row items-center gap-1.5">
                  {isExpanded ? (
                    <ChevronDown size={12} color={colorScheme === 'dark' ? '#D97706' : '#B45309'} />
                  ) : (
                    <ChevronRight
                      size={12}
                      color={colorScheme === 'dark' ? '#D97706' : '#B45309'}
                    />
                  )}
                  <Pin size={10} color={colorScheme === 'dark' ? '#D97706' : '#B45309'} />
                  <Text
                    className="text-[11px] font-semibold text-amber-700 dark:text-amber-500"
                    style={{ fontFamily: 'JetBrains Mono' }}>
                    {group.projectName}
                  </Text>
                </Pressable>
                <Pressable onPress={() => onNewSession(group.projectId)} hitSlop={8}>
                  <Plus size={14} color={colorScheme === 'dark' ? '#D97706' : '#B45309'} />
                </Pressable>
              </View>
              {isExpanded &&
                group.sessions.map((node) => (
                  <SessionRow
                    key={node.session.id}
                    session={node.session}
                    isSelected={node.session.id === selectedSessionId}
                    isPinned={pinnedSet.has(node.session.id)}
                    sessionStatus={sessionStatusBySession.get(node.session.id) ?? 'idle'}
                    hasPendingPermission={permissionSessionIds.has(node.session.id)}
                    worktreeStatus={worktreeStatusBySession.get(node.session.id)}
                    onPress={onSelectSession}
                    onOverflow={handleOverflow}
                    onTogglePin={togglePin}
                    backendType={
                      hasMultipleBackends ? backendTypeMap.get(node.session.backendUrl) : undefined
                    }
                  />
                ))}
            </View>
          );
        })}

        {/* Divider between pinned projects and current project sessions */}
        {pinnedProjectGroups.length > 0 && activeTree.length > 0 && (
          <View className="mx-3.5 mb-1 mt-1 h-px bg-stone-200 dark:bg-stone-800" />
        )}

        {/* Active sessions */}
        {activeTree.map((node) => (
          <React.Fragment key={node.session.id}>
            <SessionRow
              session={node.session}
              isSelected={node.session.id === selectedSessionId}
              isPinned={pinnedSet.has(node.session.id)}
              sessionStatus={sessionStatusBySession.get(node.session.id) ?? 'idle'}
              hasPendingPermission={permissionSessionIds.has(node.session.id)}
              worktreeStatus={worktreeStatusBySession.get(node.session.id)}
              agentName={agentBySession.get(node.session.id)}
              onPress={onSelectSession}
              onOverflow={handleOverflow}
              onTogglePin={togglePin}
              hasChildren={node.children.length > 0}
              isExpanded={expandedParents.has(node.session.id)}
              onToggleExpand={() => toggleExpand(node.session.id)}
              backendType={
                hasMultipleBackends ? backendTypeMap.get(node.session.backendUrl) : undefined
              }
            />
            {expandedParents.has(node.session.id) &&
              node.children.map((child) => (
                <SessionRow
                  key={child.id}
                  session={child}
                  isSelected={child.id === selectedSessionId}
                  isPinned={pinnedSet.has(child.id)}
                  sessionStatus={sessionStatusBySession.get(child.id) ?? 'idle'}
                  hasPendingPermission={permissionSessionIds.has(child.id)}
                  worktreeStatus={worktreeStatusBySession.get(child.id)}
                  agentName={agentBySession.get(child.id)}
                  onPress={onSelectSession}
                  onOverflow={handleOverflow}
                  onTogglePin={togglePin}
                  isSubSession
                  backendType={
                    hasMultipleBackends ? backendTypeMap.get(child.backendUrl) : undefined
                  }
                />
              ))}
          </React.Fragment>
        ))}

        {/* Archived section — only shown if there are archived sessions */}
        {archivedTree.length > 0 && (
          <>
            <Pressable
              onPress={() => setShowArchived(!showArchived)}
              className="mt-4 flex-row items-center gap-2 px-3.5 py-2">
              {showArchived ? (
                <ChevronDown size={14} color={mutedIconColor} />
              ) : (
                <ChevronRight size={14} color={mutedIconColor} />
              )}
              <Text
                className="text-xs text-stone-400 dark:text-stone-600"
                style={{ fontFamily: 'JetBrains Mono' }}>
                Archived ({archivedTree.length})
              </Text>
            </Pressable>

            {showArchived &&
              archivedTree.map((node) => (
                <React.Fragment key={node.session.id}>
                  <SessionRow
                    session={node.session}
                    isSelected={node.session.id === selectedSessionId}
                    isPinned={pinnedSet.has(node.session.id)}
                    sessionStatus={sessionStatusBySession.get(node.session.id) ?? 'idle'}
                    hasPendingPermission={permissionSessionIds.has(node.session.id)}
                    worktreeStatus={worktreeStatusBySession.get(node.session.id)}
                    agentName={agentBySession.get(node.session.id)}
                    onPress={onSelectSession}
                    onOverflow={handleOverflow}
                    onTogglePin={togglePin}
                    isArchived
                    hasChildren={node.children.length > 0}
                    isExpanded={expandedParents.has(node.session.id)}
                    onToggleExpand={() => toggleExpand(node.session.id)}
                    backendType={
                      hasMultipleBackends ? backendTypeMap.get(node.session.backendUrl) : undefined
                    }
                  />
                  {expandedParents.has(node.session.id) &&
                    node.children.map((child) => (
                      <SessionRow
                        key={child.id}
                        session={child}
                        isSelected={child.id === selectedSessionId}
                        isPinned={pinnedSet.has(child.id)}
                        sessionStatus={sessionStatusBySession.get(child.id) ?? 'idle'}
                        hasPendingPermission={permissionSessionIds.has(child.id)}
                        worktreeStatus={worktreeStatusBySession.get(child.id)}
                        agentName={agentBySession.get(child.id)}
                        onPress={onSelectSession}
                        onOverflow={handleOverflow}
                        onTogglePin={togglePin}
                        isArchived
                        isSubSession
                        backendType={
                          hasMultipleBackends ? backendTypeMap.get(child.backendUrl) : undefined
                        }
                      />
                    ))}
                </React.Fragment>
              ))}
          </>
        )}
      </ScrollView>
    </>
  );
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}
