import React from 'react'
import { View, Text, Pressable } from 'react-native'

interface SessionHeaderProps {
  projectName: string
  branchName: string | null
  relativeTime: string
  onMenuPress: () => void
  onProjectsPress: () => void
}

export function SessionHeader({
  projectName,
  branchName,
  relativeTime,
  onMenuPress,
  onProjectsPress,
}: SessionHeaderProps) {
  return (
    <View>
      {/* Top header row */}
      <View className="h-12 flex-row items-center justify-between px-4">
        <Pressable
          testID="menu-button"
          onPress={onMenuPress}
          className="w-9 h-9 items-center justify-center"
          hitSlop={8}
        >
          <Text className="text-stone-700 dark:text-stone-400 text-lg">☰</Text>
        </Pressable>

        <View className="flex-row items-center gap-2">
          <View className="w-2 h-2 rounded-full bg-green-500" />
          <Text
            className="text-sm font-semibold text-stone-900 dark:text-stone-50"
            style={{ fontFamily: 'JetBrains Mono' }}
          >
            {projectName}
          </Text>
        </View>

        <Pressable
          onPress={onProjectsPress}
          className="w-9 h-9 items-center justify-center"
          hitSlop={8}
        >
          <Text className="text-stone-700 dark:text-stone-400 text-lg">📁</Text>
        </Pressable>
      </View>

      {/* Session info bar */}
      {branchName && (
        <View className="px-4 pb-2 flex-row items-center gap-1.5">
          <Text className="text-xs text-stone-700 dark:text-stone-400" style={{ fontFamily: 'JetBrains Mono' }}>
            {branchName}
          </Text>
          <Text className="text-xs text-stone-400 dark:text-stone-600" style={{ fontFamily: 'JetBrains Mono' }}>·</Text>
          <Text className="text-xs text-stone-400 dark:text-stone-600" style={{ fontFamily: 'JetBrains Mono' }}>{relativeTime}</Text>
        </View>
      )}
    </View>
  )
}
