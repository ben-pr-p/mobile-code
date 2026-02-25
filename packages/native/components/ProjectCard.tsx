import React from 'react'
import { View, Text, Pressable } from 'react-native'
import type { Project } from '../../server/src/types'

interface ProjectCardProps {
  project: Project
  index: number
  isSelected: boolean
  onPress: (worktree: string) => void
  onNewSession: (worktree: string) => void
  onOverflow: (worktree: string) => void
}

export function ProjectCard({
  project,
  index,
  isSelected,
  onPress,
  onNewSession,
  onOverflow,
}: ProjectCardProps) {
  const name = projectName(project.worktree)
  const avatarColor = isSelected ? '#22D3EE' : (AVATAR_COLORS[index % AVATAR_COLORS.length] ?? '#475569')
  const initial = name.charAt(0).toUpperCase()
  const lastActiveAt = (project.time as any).updated ?? project.time.created

  return (
    <Pressable
      onPress={() => onPress(project.worktree)}
      className="rounded-xl bg-[#1E293B] p-4 gap-2.5"
    >
      {/* Header row: avatar + name/path + overflow */}
      <View className="flex-row items-center gap-2.5">
        <View
          className="w-9 h-9 rounded-lg items-center justify-center"
          style={{ backgroundColor: avatarColor }}
        >
          <Text className="text-sm font-semibold text-[#0A0F1C]">{initial}</Text>
        </View>

        <View className="flex-1 gap-0.5">
          <Text className="text-[15px] font-semibold text-white">{name}</Text>
          <Text className="text-[11px] text-[#475569] font-normal" style={{ fontFamily: 'JetBrains Mono' }}>
            {project.worktree}
          </Text>
        </View>

        <Pressable onPress={() => onOverflow(project.worktree)} hitSlop={8}>
          <Text className="text-[#475569] text-base">···</Text>
        </Pressable>
      </View>

      {/* Stats row */}
      <View className="flex-row items-center gap-3">
        <Text className="text-[11px] text-[#475569]" style={{ fontFamily: 'JetBrains Mono' }}>
          {formatRelativeTime(lastActiveAt)}
        </Text>
      </View>

      {/* New session button - only shown on selected project */}
      {isSelected && (
        <Pressable
          onPress={() => onNewSession(project.worktree)}
          className="bg-[#0F172A] rounded-lg h-[38px] items-center justify-center flex-row gap-1.5"
        >
          <Text className="text-[#64748B] text-sm">+</Text>
          <Text className="text-xs text-[#64748B] font-medium" style={{ fontFamily: 'JetBrains Mono' }}>
            New session
          </Text>
        </Pressable>
      )}
    </Pressable>
  )
}

// Color palette for project avatars - cycles through these
const AVATAR_COLORS = ['#22D3EE', '#475569', '#475569', '#8B5CF6', '#EC4899', '#475569']

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
