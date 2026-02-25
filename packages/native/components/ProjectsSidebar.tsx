import React, { useState } from 'react'
import { ActivityIndicator, View, Text, Pressable, ScrollView, TextInput } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ProjectCard } from './ProjectCard'
import { MusicPlayerBar } from './MusicPlayerBar'
import { useProjects } from '../hooks/useProjects'

interface ProjectsSidebarProps {
  selectedProjectId: string | null
  onClose: () => void
  onAddProject: () => void
  onSelectProject: (id: string) => void
  onNewSession: (projectId: string) => void
  onOverflow: (projectId: string) => void
  musicPlayer: {
    track: { name: string; artist: string; albumArtUri: string; durationMs: number } | null
    isPlaying: boolean
    isLiked: boolean
    positionMs: number
    onPlay: () => void
    onPause: () => void
    onNext: () => void
    onPrevious: () => void
    onToggleLike: () => void
  }
}

export function ProjectsSidebar({
  selectedProjectId,
  onClose,
  onAddProject,
  onSelectProject,
  onNewSession,
  onOverflow,
  musicPlayer,
}: ProjectsSidebarProps) {
  const insets = useSafeAreaInsets()
  const [searchQuery, setSearchQuery] = useState('')
  const { data: projects, isLoading, error } = useProjects()
  const showSearch = projects.length >= 8
  const showCount = projects.length >= 8

  const filtered = searchQuery
    ? projects.filter((p) =>
        p.worktree.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : projects

  return (
    <View className="flex-1 bg-[#0A0F1C]" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View className="h-14 flex-row items-center justify-between px-5">
        <Pressable
          onPress={onClose}
          className="w-10 h-10 rounded-lg bg-[#1E293B] items-center justify-center"
        >
          <Text className="text-[#94A3B8] text-xl">✕</Text>
        </Pressable>

        <Text className="text-lg font-semibold text-white">
          Projects{showCount ? ` (${projects.length})` : ''}
        </Text>

        <Pressable
          onPress={onAddProject}
          className="w-10 h-10 rounded-lg bg-[#1E293B] items-center justify-center"
        >
          <Text className="text-[#94A3B8] text-xl">+</Text>
        </Pressable>
      </View>

      {/* Divider */}
      <View className="h-px bg-[#0F172A]" />

      {/* Search (only when 8+ projects) */}
      {showSearch && (
        <View className="px-4 pt-3">
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="search projects"
            placeholderTextColor="#475569"
            className="bg-[#1E293B] rounded-lg h-10 px-3 text-sm text-white"
            style={{ fontFamily: 'JetBrains Mono' }}
          />
        </View>
      )}

      {/* Projects list */}
      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#94A3B8" size="small" />
          <Text className="text-[#475569] text-sm mt-3">Loading projects...</Text>
        </View>
      ) : error ? (
        <View className="flex-1 items-center justify-center px-8">
          <View className="w-10 h-10 rounded-full bg-red-500/10 items-center justify-center mb-3">
            <Text className="text-red-400 text-lg">!</Text>
          </View>
          <Text className="text-red-400 text-sm font-medium text-center">
            Failed to load projects
          </Text>
          <Text className="text-[#475569] text-xs text-center mt-1">
            {error.message}
          </Text>
          <Pressable
            onPress={() => {}}
            className="mt-4 px-4 h-8 rounded-lg bg-[#1E293B] items-center justify-center"
          >
            <Text className="text-[#94A3B8] text-sm">Retry</Text>
          </Pressable>
        </View>
      ) : filtered.length === 0 && searchQuery ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-[#475569] text-sm text-center">
            No projects matching "{searchQuery}"
          </Text>
        </View>
      ) : filtered.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-white text-sm font-medium text-center">
            No projects yet
          </Text>
          <Text className="text-[#475569] text-xs text-center mt-1">
            Add a project to get started
          </Text>
          <Pressable
            onPress={onAddProject}
            className="mt-4 px-4 h-8 rounded-lg bg-[#1E293B] items-center justify-center"
          >
            <Text className="text-[#94A3B8] text-sm">+ New Project</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 16, gap: 8 }}
          showsVerticalScrollIndicator={false}
        >
          {filtered.map((project, index) => (
            <ProjectCard
              key={project.id}
              project={project}
              index={index}
              isSelected={project.id === selectedProjectId}
              onPress={onSelectProject}
              onNewSession={onNewSession}
              onOverflow={onOverflow}
            />
          ))}
        </ScrollView>
      )}

      {/* Music player */}
      <MusicPlayerBar {...musicPlayer} />
    </View>
  )
}
