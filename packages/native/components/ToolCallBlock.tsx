import React from 'react'
import { View, Text, Pressable } from 'react-native'

interface ToolCallBlockProps {
  toolName: string
  description: string
  onPress?: () => void
}

export function ToolCallBlock({ toolName, description, onPress }: ToolCallBlockProps) {
  return (
    <View className="gap-1.5">
      {/* Tool name label */}
      <View className="flex-row items-center gap-1.5">
        {toolName === 'Shell' ? (
          <Text className="text-xs text-oc-text-muted" style={{ fontFamily: 'JetBrains Mono' }}>
            {'>'} {toolName}
          </Text>
        ) : (
          <>
            <View className="w-2 h-2 rounded-sm bg-oc-accent" />
            <Text className="text-xs text-oc-text-muted" style={{ fontFamily: 'JetBrains Mono' }}>
              {toolName}
            </Text>
          </>
        )}
      </View>

      {/* Description block */}
      <Pressable
        onPress={onPress}
        className="bg-oc-bg-surface rounded-lg p-3"
      >
        <Text className="text-sm text-oc-accent" style={{ fontFamily: 'JetBrains Mono' }}>
          {description}
        </Text>
      </Pressable>
    </View>
  )
}
