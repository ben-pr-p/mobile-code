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
          <Text className="text-oc-text-secondary text-lg">☰</Text>
        </Pressable>

        <View className="flex-row items-center gap-2">
          <View className="w-2 h-2 rounded-full bg-oc-green" />
          <Text
            className="text-sm font-semibold text-white"
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
          <Text className="text-oc-text-secondary text-lg">📁</Text>
        </Pressable>
      </View>

      {/* Session info bar */}
      {branchName && (
        <View className="px-4 pb-2 flex-row items-center gap-1.5">
          <Text className="text-xs text-oc-text-secondary">
            {branchName}
          </Text>
          <Text className="text-xs text-oc-text-muted">·</Text>
          <Text className="text-xs text-oc-text-muted">{relativeTime}</Text>
        </View>
      )}
    </View>
  )
}
