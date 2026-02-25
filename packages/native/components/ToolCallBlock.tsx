import React from 'react'
import { View, Text, Pressable } from 'react-native'

interface ToolCallBlockProps {
  toolName: string
  description: string
  onPress?: () => void
}

export function ToolCallBlock({ toolName, description, onPress }: ToolCallBlockProps) {
  return (
    <View className="gap-1">
      {/* Tool name label */}
      <View className="flex-row items-center gap-1.5">
        {toolName === 'Shell' ? (
          <Text
            className="text-[11px] font-semibold text-stone-500"
            style={{ fontFamily: 'JetBrains Mono', letterSpacing: 1.5 }}
          >
            {'>'} {toolName}
          </Text>
        ) : (
          <>
            <View className="w-3.5 h-3.5 rounded-sm bg-amber-600 dark:bg-amber-500" />
            <Text
              className="text-[11px] font-semibold text-stone-500"
              style={{ fontFamily: 'JetBrains Mono', letterSpacing: 1.5 }}
            >
              {toolName}
            </Text>
          </>
        )}
      </View>

      {/* Description block */}
      <Pressable
        onPress={onPress}
        className="bg-white dark:bg-stone-900 rounded-lg p-3"
      >
        <Text className="text-[13px] font-medium text-amber-600 dark:text-amber-500" style={{ fontFamily: 'JetBrains Mono' }}>
          {description}
        </Text>
      </Pressable>
    </View>
  )
}
