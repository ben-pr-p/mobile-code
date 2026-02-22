import React from 'react'
import { View, Text, Pressable, ScrollView, TextInput } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ProjectCard } from './ProjectCard'
import { MusicPlayerBar } from './MusicPlayerBar'
import type { Project } from '../__fixtures__/projects'

interface ProjectsSidebarProps {
  projects: Project[]
  selectedProjectId: string | null
  searchQuery: string
  onSearchChange: (query: string) => void
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
  projects,
  selectedProjectId,
  searchQuery,
  onSearchChange,
  onClose,
  onAddProject,
  onSelectProject,
  onNewSession,
  onOverflow,
  musicPlayer,
}: ProjectsSidebarProps) {
  const insets = useSafeAreaInsets()
  const showSearch = projects.length >= 8
  const showCount = projects.length >= 8

  const filtered = searchQuery
    ? projects.filter((p) =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase())
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
            onChangeText={onSearchChange}
            placeholder="search projects"
            placeholderTextColor="#475569"
            className="bg-[#1E293B] rounded-lg h-10 px-3 text-sm text-white"
            style={{ fontFamily: 'JetBrains Mono' }}
          />
        </View>
      )}

      {/* Projects list */}
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

      {/* Music player */}
      <MusicPlayerBar {...musicPlayer} />
    </View>
  )
}
