import React from 'react'
import { View, Text, Pressable } from 'react-native'
import { Pin } from 'lucide-react-native'
import { useColorScheme } from 'nativewind'
import type { Project } from '../../server/src/types'
import { useMenuFontSize } from '../hooks/useFontSize'

interface ProjectCardProps {
  project: Project
  index: number
  isSelected: boolean
  isPinned?: boolean
  onPress: (projectId: string) => void
  onOverflow: (projectId: string) => void
  onLongPress?: (projectId: string) => void
}

export function ProjectCard({
  project,
  index,
  isSelected,
  isPinned,
  onPress,
  onOverflow,
  onLongPress,
}: ProjectCardProps) {
  const menuFs = useMenuFontSize()
  const name = projectName(project.worktree)
  const avatarColor = isSelected ? '#F59E0B' : (AVATAR_COLORS[index % AVATAR_COLORS.length] ?? '#78716C')
  const initial = name.charAt(0).toUpperCase()
  const lastActiveAt = (project.time as any).updated ?? project.time.created
  const { colorScheme } = useColorScheme()
  const pinColor = colorScheme === 'dark' ? '#D97706' : '#B45309'

  return (
    <Pressable
      onPress={() => onPress(project.id)}
      onLongPress={() => onLongPress?.(project.id)}
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
          <Text className="font-semibold text-white" style={{ fontSize: menuFs.primary }}>{initial}</Text>
        </View>

        <View className="flex-1 gap-0.5">
          <View className="flex-row items-center gap-1.5">
            <Text className="font-semibold text-stone-900 dark:text-stone-50" style={{ fontFamily: 'JetBrains Mono', fontSize: menuFs.projectName }}>{name}</Text>
            {isPinned && <Pin size={12} color={pinColor} />}
          </View>
          <Text className="text-stone-500 font-normal" style={{ fontFamily: 'JetBrains Mono', fontSize: menuFs.tertiary }}>
            {project.worktree}
          </Text>
        </View>

        <Pressable onPress={() => onOverflow(project.id)} hitSlop={8}>
          <Text className="text-stone-500 text-base">···</Text>
        </Pressable>
      </View>

      {/* Stats row */}
      <View className="flex-row items-center gap-3">
        <Text className="text-stone-500" style={{ fontFamily: 'JetBrains Mono', fontSize: menuFs.tertiary }}>
          {project.id.slice(0, 4)} · {formatRelativeTime(lastActiveAt)}
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
