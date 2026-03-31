import React from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { Menu, FolderOpen, GitMerge, Check, CircleDot, Monitor, Cloud } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import { useLiveQuery, eq } from '@tanstack/react-db';
import { collections } from '../lib/collections';
import type { WorktreeStatusValue } from '../lib/stream-db';
import { useMenuFontSize } from '../hooks/useFontSize';

interface SessionHeaderProps {
  projectName: string;
  branchName: string | null;
  relativeTime: string;
  onMenuPress: () => void;
  onProjectsPress: () => void;
  /** Worktree status for worktree sessions. Omit for non-worktree sessions. */
  worktreeStatus?: WorktreeStatusValue;
  /** Whether a merge operation is in progress. */
  isMerging?: boolean;
  /** Callback to trigger a merge. */
  onMerge?: () => void;
  /** The backend URL for this session. When provided, the server name is shown in the info bar. */
  backendUrl?: string;
}

/** Session header with project name, session info, and optional worktree status. */
export function SessionHeader({
  projectName,
  branchName,
  relativeTime,
  onMenuPress,
  onProjectsPress,
  worktreeStatus,
  isMerging,
  onMerge,
  backendUrl,
}: SessionHeaderProps) {
  const menuFs = useMenuFontSize();
  const { colorScheme } = useColorScheme();
  const iconColor = colorScheme === 'dark' ? '#A8A29E' : '#44403C';
  const { data: backendsWithConnections } = useLiveQuery(
    (q) =>
      q
        .from({ b: collections.backends })
        .leftJoin({ bc: collections.backendConnections }, ({ b, bc }) => eq(b.url, bc.url)),
    []
  );
  const rows = backendsWithConnections ?? [];
  const enabledRows = rows.filter((r) => r.b.enabled);
  const anyConnected = enabledRows.some((r) => r.bc?.status === 'connected');
  const dotColor = anyConnected ? 'bg-green-500' : 'bg-red-500';
  const hasMultipleBackends = enabledRows.length > 1;

  const isWorktree = worktreeStatus?.isWorktreeSession && !worktreeStatus.error;

  // Extract the short worktree ID (e.g. "x7k2" from branch "worktree/x7k2-add-button")
  const worktreeShortId =
    isWorktree && worktreeStatus?.branch
      ? worktreeStatus.branch.replace(/^worktree\//, '').split('-')[0]
      : null;

  // Derive the server name for the info bar (only shown when multiple backends)
  const serverName =
    hasMultipleBackends && backendUrl
      ? (enabledRows.find((r) => r.b.url === backendUrl)?.b.name ?? null)
      : null;

  return (
    <View>
      {/* Top header row */}
      <View className="h-12 flex-row items-center justify-between px-4">
        <Pressable
          testID="menu-button"
          onPress={onMenuPress}
          className="h-9 w-9 items-center justify-center"
          hitSlop={8}>
          <Menu size={20} color={iconColor} />
        </Pressable>

        <View className="flex-row items-center gap-2">
          <View className={`h-2 w-2 rounded-full ${dotColor}`} />
          <Text
            className="font-semibold text-stone-900 dark:text-stone-50"
            style={{ fontFamily: 'JetBrains Mono', fontSize: menuFs.primary }}>
            {projectName}
            {worktreeShortId ? ` (${worktreeShortId})` : ''}
          </Text>
          {hasMultipleBackends && (
            <View className="flex-row items-center gap-1">
              {enabledRows.map((r) => {
                const isConnected = r.bc?.status === 'connected';
                const Icon = r.b.type === 'local' ? Monitor : Cloud;
                return (
                  <Icon
                    key={r.b.url}
                    size={12}
                    color={
                      isConnected
                        ? colorScheme === 'dark'
                          ? '#A8A29E'
                          : '#44403C'
                        : colorScheme === 'dark'
                          ? '#44403C'
                          : '#D6D3D1'
                    }
                  />
                );
              })}
            </View>
          )}
        </View>

        <Pressable
          onPress={onProjectsPress}
          className="h-9 w-9 items-center justify-center"
          hitSlop={8}>
          <FolderOpen size={20} color={iconColor} />
        </Pressable>
      </View>

      {/* Session info bar */}
      {branchName && (
        <View className="flex-row items-center justify-between px-4 pb-2">
          <View className="flex-shrink flex-row items-center gap-1.5">
            <Text
              className="text-stone-700 dark:text-stone-400"
              style={{ fontFamily: 'JetBrains Mono', fontSize: menuFs.secondary }}>
              {branchName}
            </Text>
            <Text
              className="text-stone-400 dark:text-stone-600"
              style={{ fontFamily: 'JetBrains Mono', fontSize: menuFs.secondary }}>
              ·
            </Text>
            <Text
              className="text-stone-400 dark:text-stone-600"
              style={{ fontFamily: 'JetBrains Mono', fontSize: menuFs.secondary }}>
              {relativeTime}
            </Text>
            {serverName && (
              <>
                <Text
                  className="text-stone-400 dark:text-stone-600"
                  style={{ fontFamily: 'JetBrains Mono', fontSize: menuFs.secondary }}>
                  ·
                </Text>
                <Text
                  className="text-stone-400 dark:text-stone-600"
                  style={{ fontFamily: 'JetBrains Mono', fontSize: menuFs.secondary }}>
                  {serverName}
                </Text>
              </>
            )}
          </View>

          {isWorktree && (
            <WorktreeStatusBadge
              worktreeStatus={worktreeStatus!}
              isMerging={!!isMerging}
              onMerge={onMerge}
            />
          )}
        </View>
      )}
    </View>
  );
}

/**
 * Worktree status badge shown in the session info bar.
 *
 * Three states:
 * - **Uncommitted** (yellow) — worktree has staged/unstaged changes
 * - **Merge** (blue button) — no uncommitted changes, unmerged commits exist
 * - **Merged** (green) — everything is in main
 */
function WorktreeStatusBadge({
  worktreeStatus,
  isMerging,
  onMerge,
}: {
  worktreeStatus: WorktreeStatusValue;
  isMerging: boolean;
  onMerge?: () => void;
}) {
  const menuFs = useMenuFontSize();
  const { colorScheme } = useColorScheme();

  if (isMerging) {
    return (
      <View className="flex-row items-center gap-1 rounded bg-stone-200 px-2 py-1 dark:bg-stone-800">
        <ActivityIndicator size="small" color={colorScheme === 'dark' ? '#A8A29E' : '#44403C'} />
        <Text
          className="text-stone-500 dark:text-stone-400"
          style={{ fontFamily: 'JetBrains Mono', fontSize: menuFs.secondary }}>
          Merging...
        </Text>
      </View>
    );
  }

  // Uncommitted changes take priority — can't merge until they're committed
  if (worktreeStatus.hasUncommittedChanges) {
    return (
      <View className="flex-row items-center gap-1 rounded bg-amber-100 px-2 py-1 dark:bg-amber-900/30">
        <CircleDot size={12} color={colorScheme === 'dark' ? '#fbbf24' : '#d97706'} />
        <Text
          className="text-amber-700 dark:text-amber-400"
          style={{ fontFamily: 'JetBrains Mono', fontSize: menuFs.secondary }}>
          Uncommitted
        </Text>
      </View>
    );
  }

  // Has unmerged commits — show merge button
  if (worktreeStatus.hasUnmergedCommits) {
    return (
      <Pressable
        onPress={onMerge}
        className="flex-row items-center gap-1 rounded bg-blue-100 px-2 py-1 active:opacity-70 dark:bg-blue-900/30"
        hitSlop={4}>
        <GitMerge size={12} color={colorScheme === 'dark' ? '#60a5fa' : '#2563eb'} />
        <Text
          className="text-blue-700 dark:text-blue-400"
          style={{ fontFamily: 'JetBrains Mono', fontSize: menuFs.secondary }}>
          Merge
        </Text>
      </Pressable>
    );
  }

  // Fully merged — no uncommitted changes, no unmerged commits
  if (worktreeStatus.merged) {
    return (
      <View className="flex-row items-center gap-1 rounded bg-green-100 px-2 py-1 dark:bg-green-900/30">
        <Check size={12} color={colorScheme === 'dark' ? '#4ade80' : '#16a34a'} />
        <Text
          className="text-green-700 dark:text-green-400"
          style={{ fontFamily: 'JetBrains Mono', fontSize: menuFs.secondary }}>
          Merged
        </Text>
      </View>
    );
  }

  // Worktree session with no changes yet (fresh worktree)
  return null;
}
