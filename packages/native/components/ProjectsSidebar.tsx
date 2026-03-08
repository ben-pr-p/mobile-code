import React, { useState } from 'react';
import { ActivityIndicator, View, Text, Pressable, ScrollView, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColorScheme } from 'nativewind';
import { X, Plus } from 'lucide-react-native';
import { ProjectCard } from './ProjectCard';
import { useStateQuery, type ProjectValue } from '../lib/stream-db';

interface ProjectsSidebarProps {
  selectedProjectId: string | null;
  onClose: () => void;
  onAddProject: () => void;
  onSelectProject: (projectId: string) => void;
  onNewSession: (projectId: string) => void;
  onOverflow: (projectId: string) => void;
}

export function ProjectsSidebar({
  selectedProjectId,
  onClose,
  onAddProject,
  onSelectProject,
  onNewSession,
  onOverflow,
}: ProjectsSidebarProps) {
  const insets = useSafeAreaInsets();
  const [searchQuery, setSearchQuery] = useState('');
  const { data: rawProjects, isLoading } = useStateQuery((db, q) =>
    q.from({ projects: db.collections.projects })
  );
  const projects = rawProjects?.slice().sort((a, b) => b.time.created - a.time.created) ?? [];
  const { colorScheme } = useColorScheme();
  const iconColor = colorScheme === 'dark' ? '#A8A29E' : '#44403C';
  const placeholderColor = colorScheme === 'dark' ? '#57534E' : '#A8A29E';
  const showSearch = projects.length >= 8;
  const showCount = projects.length >= 8;

  const filtered = searchQuery
    ? projects.filter((p) => p.worktree.toLowerCase().includes(searchQuery.toLowerCase()))
    : projects;

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
          onPress={onAddProject}
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
            onPress={onAddProject}
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
              onPress={onSelectProject}
              onOverflow={onOverflow}
            />
          ))}
        </ScrollView>
      )}

    </View>
  );
}
