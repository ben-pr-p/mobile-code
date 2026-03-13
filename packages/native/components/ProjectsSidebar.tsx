import React, { useMemo, useState, useCallback } from 'react';
import { ActivityIndicator, View, Text, Pressable, ScrollView, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColorScheme } from 'nativewind';
import { useAtom, useAtomValue } from 'jotai';
import { X, Plus } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { ProjectCard } from './ProjectCard';
import { useStateQuery, type ProjectValue } from '../lib/stream-db';
import { projectFilterAtom } from '../state/ui';
import { apiClientAtom } from '../lib/api';

interface ProjectGroup {
  label: string;
  prefix: string | null; // null = "All"
}

/**
 * Derive filter groups from project worktree paths.
 * Finds shared parent directory prefixes where 2+ projects share the same
 * immediate parent-of-parent segment. E.g. ~/work/a and ~/work/b -> "work" group.
 */
function deriveGroups(projects: ProjectValue[]): ProjectGroup[] {
  if (projects.length === 0) return [];

  // Count projects per parent directory
  const parentCounts = new Map<string, number>();
  for (const p of projects) {
    const segments = p.worktree.split('/');
    // Take everything except the last segment (the project dir itself)
    if (segments.length >= 2) {
      const parent = segments.slice(0, -1).join('/');
      parentCounts.set(parent, (parentCounts.get(parent) ?? 0) + 1);
    }
  }

  // Only keep parents with 2+ projects
  const groups: ProjectGroup[] = [];
  for (const [prefix, count] of parentCounts) {
    if (count >= 2) {
      // Use the last segment of the parent path as the label
      const label = prefix.split('/').pop() ?? prefix;
      groups.push({ label, prefix });
    }
  }

  // Sort groups alphabetically by label
  groups.sort((a, b) => a.label.localeCompare(b.label));

  // Only return groups if there are at least 2 distinct ones
  // (a single group means all projects are in the same place — not useful)
  if (groups.length < 2) return [];

  return [{ label: 'All', prefix: null }, ...groups];
}

interface ProjectsSidebarProps {
  selectedProjectId: string | null;
  onClose: () => void;
}

/** Right drawer content — lists all projects. */
export function ProjectsSidebar({
  selectedProjectId,
  onClose,
}: ProjectsSidebarProps) {
  const insets = useSafeAreaInsets();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useAtom(projectFilterAtom);
  const { data: rawProjects, isLoading } = useStateQuery((db, q) =>
    q.from({ projects: db.collections.projects })
  );
  const projects = rawProjects?.slice().sort((a, b) => b.time.created - a.time.created) ?? [];
  const { colorScheme } = useColorScheme();
  const iconColor = colorScheme === 'dark' ? '#A8A29E' : '#44403C';
  const placeholderColor = colorScheme === 'dark' ? '#57534E' : '#A8A29E';
  const showSearch = projects.length >= 8;
  const showCount = projects.length >= 8;

  const router = useRouter();
  const api = useAtomValue(apiClientAtom);

  const groups = useMemo(() => deriveGroups(projects), [projects]);

  // Reset filter if it no longer matches any group (e.g. project was removed)
  const validFilter =
    activeFilter && groups.some((g) => g.prefix === activeFilter) ? activeFilter : null;
  if (validFilter !== activeFilter) setActiveFilter(validFilter);

  // Apply group filter, then text search
  const groupFiltered = validFilter
    ? projects.filter((p) => p.worktree.startsWith(validFilter))
    : projects;
  const filtered = searchQuery
    ? groupFiltered.filter((p) => p.worktree.toLowerCase().includes(searchQuery.toLowerCase()))
    : groupFiltered;

  const handleSelectProject = useCallback(
    async (pid: string) => {
      onClose();
      // Try to find existing sessions for this project
      try {
        const res = await api.api.projects[':projectId'].sessions.$get({
          param: { projectId: pid },
        });
        if (res.ok) {
          const sessions = (await res.json()) as any[];
          // Skip child sessions (those with a parentID) — only navigate to top-level sessions
          const topLevel = sessions.filter((s: any) => !s.parentID);
          if (topLevel.length > 0) {
            router.push({
              pathname: '/projects/[projectId]/sessions/[sessionId]',
              params: { projectId: pid, sessionId: topLevel[0].id },
            });
            return;
          }
        }
      } catch {}
      router.push({
        pathname: '/projects/[projectId]/new-session',
        params: { projectId: pid },
      });
    },
    [api, router, onClose],
  );

  return (
    <View className="flex-1 bg-stone-50 dark:bg-stone-950" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View className="h-14 flex-row items-center justify-between px-5">
        <Pressable
          onPress={onClose}
          className="h-10 w-10 items-center justify-center rounded-lg bg-white dark:bg-stone-900">
          <X size={20} color={iconColor} />
        </Pressable>

        <Text
          className="text-lg font-semibold text-stone-900 dark:text-stone-50"
          style={{ fontFamily: 'JetBrains Mono' }}>
          Projects{showCount ? ` (${projects.length})` : ''}
        </Text>

        <Pressable
          onPress={() => {}}
          className="h-10 w-10 items-center justify-center rounded-lg bg-white dark:bg-stone-900">
          <Plus size={20} color={iconColor} />
        </Pressable>
      </View>

      {/* Divider */}
      <View className="h-px bg-stone-200 dark:bg-stone-800" />

      {/* Search (only when 8+ projects) */}
      {showSearch && (
        <View className="px-4 pt-3">
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="search projects"
            placeholderTextColor={placeholderColor}
            className="h-10 rounded-lg bg-white px-3 text-sm text-stone-900 dark:bg-stone-900 dark:text-stone-50"
            style={{ fontFamily: 'JetBrains Mono' }}
          />
        </View>
      )}

      {/* Filter chips */}
      {groups.length > 0 && (
        <View style={{ flexShrink: 0 }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4, gap: 8 }}>
            {groups.map((group) => {
              const isActive = group.prefix === validFilter;
              return (
                <Pressable
                  key={group.prefix ?? '__all'}
                  onPress={() => setActiveFilter(group.prefix)}
                  className={`h-8 items-center justify-center rounded-full px-4 ${
                    isActive
                      ? 'bg-amber-100 dark:bg-amber-900/40'
                      : 'bg-white dark:bg-stone-900'
                  }`}
                  style={
                    isActive
                      ? { borderWidth: 1, borderColor: colorScheme === 'dark' ? '#B45309' : '#F59E0B' }
                      : undefined
                  }>
                  <Text
                    className={`text-xs font-medium ${
                      isActive
                        ? 'text-amber-700 dark:text-amber-400'
                        : 'text-stone-600 dark:text-stone-400'
                    }`}
                    style={{ fontFamily: 'JetBrains Mono' }}>
                    {group.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Projects list */}
      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colorScheme === 'dark' ? '#A8A29E' : '#78716C'} size="small" />
          <Text className="mt-3 text-sm text-stone-500">Loading projects...</Text>
        </View>
      ) : filtered.length === 0 && searchQuery ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-center text-sm text-stone-500">
            No projects matching "{searchQuery}"
          </Text>
        </View>
      ) : filtered.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-center text-sm font-medium text-stone-900 dark:text-stone-50">
            No projects yet
          </Text>
          <Text className="mt-1 text-center text-xs text-stone-500">
            Add a project to get started
          </Text>
          <Pressable
            onPress={() => {}}
            className="mt-4 h-8 items-center justify-center rounded-lg bg-white px-4 dark:bg-stone-900">
            <Text className="text-sm text-stone-700 dark:text-stone-400">+ New Project</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 16, gap: 8 }}
          showsVerticalScrollIndicator={false}>
          {filtered.map((project, index) => (
            <ProjectCard
              key={project.id}
              project={project}
              index={index}
              isSelected={project.id === selectedProjectId}
              onPress={handleSelectProject}
              onOverflow={() => {}}
            />
          ))}
        </ScrollView>
      )}

    </View>
  );
}
