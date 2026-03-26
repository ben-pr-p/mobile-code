import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { ActivityIndicator, View, Text, Pressable, ScrollView, TextInput, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColorScheme } from 'nativewind';
import { useAtom } from 'jotai';
import { X, Plus } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { ProjectCard } from './ProjectCard';
import { useDeduplicatedProjects, type DeduplicatedProject } from '../hooks/useDeduplicatedProjects';
import { projectFilterAtom, pinnedProjectIdsAtom } from '../state/ui';


interface ProjectGroup {
  label: string;
  prefix: string | null; // null = "All"
}

/**
 * Derive filter groups from project worktree paths.
 * Finds shared parent directory prefixes where 2+ projects share the same
 * immediate parent-of-parent segment. E.g. ~/work/a and ~/work/b -> "work" group.
 */
function deriveGroups(projects: DeduplicatedProject[]): ProjectGroup[] {
  if (projects.length === 0) return [];

  const parentCounts = new Map<string, number>();
  for (const p of projects) {
    const segments = p.worktree.split('/');
    if (segments.length >= 2) {
      const parent = segments.slice(0, -1).join('/');
      parentCounts.set(parent, (parentCounts.get(parent) ?? 0) + 1);
    }
  }

  const groups: ProjectGroup[] = [];
  for (const [prefix, count] of parentCounts) {
    if (count >= 2) {
      const label = prefix.split('/').pop() ?? prefix;
      groups.push({ label, prefix });
    }
  }

  groups.sort((a, b) => a.label.localeCompare(b.label));

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
  const { projects, isLoading } = useDeduplicatedProjects();
  const insets = useSafeAreaInsets();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useAtom(projectFilterAtom);
  const { colorScheme } = useColorScheme();
  const iconColor = colorScheme === 'dark' ? '#A8A29E' : '#44403C';
  const placeholderColor = colorScheme === 'dark' ? '#57534E' : '#A8A29E';
  const showSearch = projects.length >= 8;
  const showCount = projects.length >= 8;

  const router = useRouter();

  const [pinnedProjectIds, setPinnedProjectIds] = useAtom(pinnedProjectIdsAtom);
  const resolvedPinnedProjectIds = pinnedProjectIds instanceof Promise ? [] : pinnedProjectIds;
  const pinnedProjectSet = useMemo(() => new Set(resolvedPinnedProjectIds), [resolvedPinnedProjectIds]);

  const toggleProjectPin = useCallback(
    (projectId: string) => {
      if (resolvedPinnedProjectIds.includes(projectId)) {
        setPinnedProjectIds(resolvedPinnedProjectIds.filter((id: string) => id !== projectId));
      } else {
        setPinnedProjectIds([...resolvedPinnedProjectIds, projectId]);
      }
    },
    [resolvedPinnedProjectIds, setPinnedProjectIds],
  );

  const handleProjectOverflow = useCallback(
    (projectId: string) => {
      const isPinned = resolvedPinnedProjectIds.includes(projectId);
      Alert.alert(
        'Project Options',
        undefined,
        [
          {
            text: isPinned ? 'Unpin Project' : 'Pin Project',
            onPress: () => toggleProjectPin(projectId),
          },
          { text: 'Cancel', style: 'cancel' },
        ],
      );
    },
    [resolvedPinnedProjectIds, toggleProjectPin],
  );

  const groups = useMemo(() => deriveGroups(projects), [projects]);

  const validFilter =
    activeFilter && groups.some((g) => g.prefix === activeFilter) ? activeFilter : null;

  useEffect(() => {
    if (validFilter !== activeFilter) setActiveFilter(validFilter);
  }, [validFilter, activeFilter, setActiveFilter]);

  // Apply group filter (pinned projects always pass), then text search, then sort pinned to top
  const groupFiltered = validFilter
    ? projects.filter((p) => pinnedProjectSet.has(p.id) || p.worktree.startsWith(validFilter))
    : projects;
  const searchFiltered = searchQuery
    ? groupFiltered.filter((p) => p.worktree.toLowerCase().includes(searchQuery.toLowerCase()))
    : groupFiltered;
  const filtered = useMemo(() => {
    return [...searchFiltered].sort((a, b) => {
      const aPinned = pinnedProjectSet.has(a.id);
      const bPinned = pinnedProjectSet.has(b.id);
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;
      return 0; // preserve existing sort order within groups
    });
  }, [searchFiltered, pinnedProjectSet]);

  const handleSelectProject = useCallback(
    (pid: string) => {
      onClose();
      // Navigate to the project index, which resolves the most recent
      // non-archived session or falls back to new-session.
      router.push({
        pathname: '/projects/[projectId]',
        params: { projectId: pid },
      });
    },
    [router, onClose],
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
              isPinned={pinnedProjectSet.has(project.id)}
              onPress={handleSelectProject}
              onOverflow={handleProjectOverflow}
              onLongPress={toggleProjectPin}
            />
          ))}
        </ScrollView>
      )}

    </View>
  );
}
