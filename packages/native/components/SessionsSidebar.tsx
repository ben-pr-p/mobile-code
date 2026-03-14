import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColorScheme } from 'nativewind';
import { Menu, Plus, Search, Ellipsis, Settings, Mic, HelpCircle, ChevronRight, ChevronDown, GitBranch, Pin, Archive, ArchiveRestore, CircleDot, Check } from 'lucide-react-native';
import { useAtom, useAtomValue } from 'jotai/react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import type { DrawerContentComponentProps } from '@react-navigation/drawer';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing } from 'react-native-reanimated';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useStateQuery, useAppStateQuery, type SessionValue, type SessionMetaValue, type WorktreeStatusValue } from '../lib/stream-db';
import { pinnedSessionIdsAtom } from '../state/ui';
import { apiClientAtom } from '../lib/api';

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

  const handleNewSession = useCallback(() => {
    if (!projectId) return;
    router.push({
      pathname: '/projects/[projectId]/new-session',
      params: { projectId },
    });
    closeDrawer();
  }, [projectId, router, closeDrawer]);

  const handleSelectSession = useCallback(
    (sessionId: string, pid: string) => {
      router.push({
        pathname: '/projects/[projectId]/sessions/[sessionId]',
        params: { projectId: pid, sessionId },
      });
      closeDrawer();
    },
    [router, closeDrawer],
  );

  const handleSettingsPress = useCallback(() => {
    closeDrawer();
    router.push('/settings');
  }, [router, closeDrawer]);

  return (
    <GestureHandlerRootView className="flex-1 bg-stone-50 dark:bg-stone-950" style={{ paddingTop: insets.top }}>
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
          onPress={handleNewSession}
          className="h-10 w-10 items-center justify-center rounded-lg bg-white dark:bg-stone-900">
          <Plus size={20} color={iconColor} />
        </Pressable>
      </View>

      {/* Divider */}
      <View className="h-px bg-stone-200 dark:bg-stone-800" />

      {projectId ? (
        <SessionListContent
          projectId={projectId}
          selectedSessionId={selectedSessionId}
          onSelectSession={handleSelectSession}
        />
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

function SessionStatusDot({ status }: { status: SessionValue['status'] }) {
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (status === 'busy') {
      opacity.value = withRepeat(
        withTiming(0.4, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      );
    } else {
      opacity.value = withTiming(1, { duration: 200 });
    }
  }, [status, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const colorClass =
    status === 'busy'
      ? 'bg-green-500'
      : status === 'error'
        ? 'bg-red-500'
        : 'bg-stone-400 dark:bg-stone-600';

  if (status === 'busy') {
    return (
      <Animated.View
        style={animatedStyle}
        className={`h-2 w-2 rounded-full ${colorClass}`}
      />
    );
  }

  return <View className={`h-2 w-2 rounded-full ${colorClass}`} />;
}

function SessionWorktreeBadge({ worktreeStatus }: { worktreeStatus: WorktreeStatusValue }) {
  const { colorScheme } = useColorScheme();

  if (!worktreeStatus.isWorktreeSession || worktreeStatus.error) return null;

  if (worktreeStatus.hasUncommittedChanges) {
    return (
      <View className="flex-row items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30">
        <CircleDot size={8} color={colorScheme === 'dark' ? '#fbbf24' : '#d97706'} />
        <Text className="text-[9px] text-amber-700 dark:text-amber-400" style={{ fontFamily: 'JetBrains Mono' }}>
          Uncommitted
        </Text>
      </View>
    );
  }

  if (worktreeStatus.hasUnmergedCommits) {
    return (
      <View className="flex-row items-center gap-0.5 px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30">
        <GitBranch size={8} color={colorScheme === 'dark' ? '#60a5fa' : '#2563eb'} />
        <Text className="text-[9px] text-blue-700 dark:text-blue-400" style={{ fontFamily: 'JetBrains Mono' }}>
          Awaiting merge
        </Text>
      </View>
    );
  }

  if (worktreeStatus.merged) {
    return (
      <View className="flex-row items-center gap-0.5 px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/30">
        <Check size={8} color={colorScheme === 'dark' ? '#4ade80' : '#16a34a'} />
        <Text className="text-[9px] text-green-700 dark:text-green-400" style={{ fontFamily: 'JetBrains Mono' }}>
          Merged
        </Text>
      </View>
    );
  }

  return null;
}

interface SessionRowProps {
  session: SessionValue;
  isSelected: boolean;
  isPinned: boolean;
  sessionStatus: SessionValue['status'];
  worktreeStatus?: WorktreeStatusValue;
  onPress: (sessionId: string, projectId: string) => void;
  onOverflow?: (id: string) => void;
  onTogglePin: (id: string) => void;
  onArchive?: (id: string) => void;
  isArchived?: boolean;
  hasChildren?: boolean;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  isSubSession?: boolean;
}

function SessionRow({ session, isSelected, isPinned, sessionStatus, worktreeStatus, onPress, onOverflow, onTogglePin, onArchive, isArchived, hasChildren, isExpanded, onToggleExpand, isSubSession }: SessionRowProps) {
  const { colorScheme } = useColorScheme();
  const overflowColor = colorScheme === 'dark' ? '#57534E' : '#A8A29E';
  const chevronColor = colorScheme === 'dark' ? '#57534E' : '#A8A29E';
  const subSessionIconColor = colorScheme === 'dark' ? '#57534E' : '#A8A29E';
  const pinColor = colorScheme === 'dark' ? '#D97706' : '#B45309';
  const swipeableRef = useRef<Swipeable>(null);

  const handleLongPress = useCallback(() => {
    onTogglePin(session.id);
  }, [session.id, onTogglePin]);

  const renderRightActions = useCallback(() => (
    <Pressable
      onPress={() => {
        onArchive?.(session.id);
        swipeableRef.current?.close();
      }}
      className="items-center justify-center rounded-lg bg-amber-600 px-4">
      {isArchived ? (
        <ArchiveRestore size={18} color="#FFFFFF" />
      ) : (
        <Archive size={18} color="#FFFFFF" />
      )}
      <Text className="mt-1 text-[10px] font-medium text-white"
        style={{ fontFamily: 'JetBrains Mono' }}>
        {isArchived ? 'Unarchive' : 'Archive'}
      </Text>
    </Pressable>
  ), [session.id, isArchived, onArchive]);

  return (
    <Swipeable
      ref={swipeableRef}
      renderRightActions={onArchive ? renderRightActions : undefined}
      overshootRight={false}>
      <Pressable
        onPress={() => onPress(session.id, session.projectID)}
        onLongPress={handleLongPress}
        className={`flex-row items-center gap-3 rounded-lg py-3 ${
          isSubSession ? 'pl-8 pr-3.5' : 'px-3.5'
        } ${
          isSelected
            ? 'border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30'
            : ''
        }`}>
        {/* Status dot — always visible */}
        <SessionStatusDot status={sessionStatus} />
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
            {worktreeStatus && <SessionWorktreeBadge worktreeStatus={worktreeStatus} />}
          </View>
        </View>
        {onOverflow && (
          <Pressable onPress={() => onOverflow(session.id)} hitSlop={8}>
            <Ellipsis size={16} color={overflowColor} />
          </Pressable>
        )}
      </Pressable>
    </Swipeable>
  );
}

type SessionTree = {
  session: SessionValue;
  children: SessionValue[];
};

function SessionListContent({
  projectId,
  selectedSessionId,
  onSelectSession,
}: {
  projectId: string;
  selectedSessionId: string | null;
  onSelectSession: (sessionId: string, projectId: string) => void;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());
  const [showArchived, setShowArchived] = useState(false);
  const [pinnedIds, setPinnedIds] = useAtom(pinnedSessionIdsAtom);
  const resolvedPinnedIds = pinnedIds instanceof Promise ? [] : pinnedIds;
  const pinnedSet = useMemo(() => new Set(resolvedPinnedIds), [resolvedPinnedIds]);

  const api = useAtomValue(apiClientAtom);
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
    [resolvedPinnedIds, setPinnedIds],
  );

  const deleteSession = useCallback(
    async (sid: string) => {
      try {
        const res = await api.api.sessions[':sessionId'].$delete({
          param: { sessionId: sid },
        });
        if (!res.ok) {
          Alert.alert('Error', 'Failed to delete session.');
          return;
        }
        // If we just deleted the active session, navigate away
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
    [api, params.sessionId, params.projectId, router],
  );

  const handleOverflow = useCallback(
    (sid: string) => {
      const isPinned = resolvedPinnedIds.includes(sid);
      Alert.alert(
        'Session Options',
        undefined,
        [
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
                    onPress: () => deleteSession(sid),
                  },
                ],
              );
            },
          },
          { text: 'Cancel', style: 'cancel' },
        ],
      );
    },
    [resolvedPinnedIds, setPinnedIds, deleteSession],
  );

  const archiveSession = useCallback(async (sessionId: string) => {
    await api.api.sessions[':sessionId'].archive.$post({
      param: { sessionId },
    });
  }, [api]);

  const unarchiveSession = useCallback(async (sessionId: string) => {
    await api.api.sessions[':sessionId'].unarchive.$post({
      param: { sessionId },
    });
  }, [api]);

  const { data: allSessions } = useStateQuery(
    (db, q) => q.from({ sessions: db.collections.sessions }),
  );

  const { data: worktreeStatusResults } = useStateQuery(
    (db, q) => q.from({ worktreeStatuses: db.collections.worktreeStatuses }),
  );
  const worktreeStatusBySession = useMemo(() => {
    const map = new Map<string, WorktreeStatusValue>();
    for (const ws of (worktreeStatusResults as WorktreeStatusValue[] | undefined) ?? []) {
      map.set(ws.sessionId, ws);
    }
    return map;
  }, [worktreeStatusResults]);

  // Query archived session IDs from persistent app state stream
  const { data: sessionMetas } = useAppStateQuery(
    (db, q) => q.from({ sessionMeta: db.collections.sessionMeta }),
  );
  const archivedIds = useMemo(
    () => new Set(
      (sessionMetas as SessionMetaValue[] | undefined)
        ?.filter(m => m.archived)
        .map(m => m.sessionId) ?? []
    ),
    [sessionMetas],
  );

  // Build tree structure: top-level sessions with nested children
  const { activeTree, archivedTree } = useMemo(() => {
    const byProject = (allSessions as SessionValue[] | undefined)?.filter(
      (s) => s.projectID === projectId,
    );
    if (!byProject) return { activeTree: [], archivedTree: [] };

    const filtered = searchQuery
      ? byProject.filter((s) => s.title.toLowerCase().includes(searchQuery.toLowerCase()))
      : byProject;

    // When searching, show flat list so results aren't hidden inside collapsed parents
    if (searchQuery) {
      const flat = filtered.map((s) => ({ session: s, children: [] as SessionValue[] }));
      // Pinned sessions still sort to top in search results
      flat.sort((a, b) => {
        const aPinned = pinnedSet.has(a.session.id);
        const bPinned = pinnedSet.has(b.session.id);
        if (aPinned && !bPinned) return -1;
        if (!aPinned && bPinned) return 1;
        return b.session.time.updated - a.session.time.updated;
      });
      const active = flat.filter(node => !archivedIds.has(node.session.id));
      const archived = flat.filter(node => archivedIds.has(node.session.id));
      return { activeTree: active, archivedTree: archived };
    }

    // Build parent->children map
    const childrenByParent = new Map<string, SessionValue[]>();
    const childIds = new Set<string>();

    for (const s of filtered) {
      if (s.parentID) {
        childIds.add(s.id);
        const existing = childrenByParent.get(s.parentID) ?? [];
        existing.push(s);
        childrenByParent.set(s.parentID, existing);
      }
    }

    // Sort children by updated time (newest first)
    for (const children of childrenByParent.values()) {
      children.sort((a, b) => b.time.updated - a.time.updated);
    }

    // Build tree: only top-level sessions (not children) appear at root
    const tree: SessionTree[] = [];
    for (const s of filtered) {
      if (childIds.has(s.id)) continue;
      tree.push({
        session: s,
        children: childrenByParent.get(s.id) ?? [],
      });
    }

    // Sort: pinned sessions first, then by updated time (newest first)
    tree.sort((a, b) => {
      const aPinned = pinnedSet.has(a.session.id);
      const bPinned = pinnedSet.has(b.session.id);
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;
      return b.session.time.updated - a.session.time.updated;
    });

    // Split into active and archived
    const active = tree.filter(node => !archivedIds.has(node.session.id));
    const archived = tree.filter(node => archivedIds.has(node.session.id));

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
        {/* Active sessions */}
        {activeTree.map((node) => (
          <React.Fragment key={node.session.id}>
            <SessionRow
              session={node.session}
              isSelected={node.session.id === selectedSessionId}
              isPinned={pinnedSet.has(node.session.id)}
              sessionStatus={node.session.status}
              worktreeStatus={worktreeStatusBySession.get(node.session.id)}
              onPress={onSelectSession}
              onOverflow={handleOverflow}
              onTogglePin={togglePin}
              onArchive={archiveSession}
              hasChildren={node.children.length > 0}
              isExpanded={expandedParents.has(node.session.id)}
              onToggleExpand={() => toggleExpand(node.session.id)}
            />
            {expandedParents.has(node.session.id) &&
              node.children.map((child) => (
                <SessionRow
                  key={child.id}
                  session={child}
                  isSelected={child.id === selectedSessionId}
                  isPinned={pinnedSet.has(child.id)}
                  sessionStatus={child.status}
                  worktreeStatus={worktreeStatusBySession.get(child.id)}
                  onPress={onSelectSession}
                  onOverflow={handleOverflow}
                  onTogglePin={togglePin}
                  onArchive={archiveSession}
                  isSubSession
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

            {showArchived && archivedTree.map((node) => (
              <React.Fragment key={node.session.id}>
                <SessionRow
                  session={node.session}
                  isSelected={node.session.id === selectedSessionId}
                  isPinned={pinnedSet.has(node.session.id)}
                  sessionStatus={node.session.status}
                  worktreeStatus={worktreeStatusBySession.get(node.session.id)}
                  onPress={onSelectSession}
                  onOverflow={handleOverflow}
                  onTogglePin={togglePin}
                  onArchive={unarchiveSession}
                  isArchived
                  hasChildren={node.children.length > 0}
                  isExpanded={expandedParents.has(node.session.id)}
                  onToggleExpand={() => toggleExpand(node.session.id)}
                />
                {expandedParents.has(node.session.id) &&
                  node.children.map((child) => (
                    <SessionRow
                      key={child.id}
                      session={child}
                      isSelected={child.id === selectedSessionId}
                      isPinned={pinnedSet.has(child.id)}
                      sessionStatus={child.status}
                      worktreeStatus={worktreeStatusBySession.get(child.id)}
                      onPress={onSelectSession}
                      onOverflow={handleOverflow}
                      onTogglePin={togglePin}
                      onArchive={unarchiveSession}
                      isArchived
                      isSubSession
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
