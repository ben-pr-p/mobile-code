import React from 'react'
import { View, Text, Pressable } from 'react-native'
import type { Project } from '../../server/src/types'

interface ProjectCardProps {
  project: Project
  index: number
  isSelected: boolean
  onPress: (worktree: string) => void
  onOverflow: (worktree: string) => void
}

export function ProjectCard({
  project,
  index,
  isSelected,
  onPress,
  onOverflow,
}: ProjectCardProps) {
  const name = projectName(project.worktree)
  const avatarColor = isSelected ? '#F59E0B' : (AVATAR_COLORS[index % AVATAR_COLORS.length] ?? '#78716C')
  const initial = name.charAt(0).toUpperCase()
  const lastActiveAt = (project.time as any).updated ?? project.time.created

  return (
    <Pressable
      onPress={() => onPress(project.worktree)}
      className={`rounded-xl p-4 gap-2.5 ${
        isSelected
          ? 'bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-700'
          : 'bg-white dark:bg-stone-900'
      }`}
    >
      {/* Header row: avatar + name/path + overflow */}
      <View className="flex-row items-center gap-2.5">
        <View
          className="w-9 h-9 rounded-lg items-center justify-center"
          style={{ backgroundColor: avatarColor }}
        >
          <Text className="text-sm font-semibold text-white">{initial}</Text>
        </View>

        <View className="flex-1 gap-0.5">
          <Text className="text-[15px] font-semibold text-stone-900 dark:text-stone-50" style={{ fontFamily: 'JetBrains Mono' }}>{name}</Text>
          <Text className="text-[11px] text-stone-500 font-normal" style={{ fontFamily: 'JetBrains Mono' }}>
            {project.worktree}
          </Text>
        </View>

        <Pressable onPress={() => onOverflow(project.worktree)} hitSlop={8}>
          <Text className="text-stone-500 text-base">···</Text>
        </Pressable>
      </View>

      {/* Stats row */}
      <View className="flex-row items-center gap-3">
        <Text className="text-[11px] text-stone-500" style={{ fontFamily: 'JetBrains Mono' }}>
          {formatRelativeTime(lastActiveAt)}
        </Text>
      </View>

    </Pressable>
  )
}

// Color palette for project avatars - cycles through these
const AVATAR_COLORS = ['#F59E0B', '#78716C', '#78716C', '#8B5CF6', '#EC4899', '#78716C']

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  const weeks = Math.floor(days / 7)
  return `${weeks}w ago`
}

function projectName(worktree: string): string {
  if (worktree === '/') return 'global'
  return worktree.split('/').pop() || worktree
}
