import React from 'react'
import { View, Text } from 'react-native'

interface ToolOutputBlockProps {
  content: string
}

export function ToolOutputBlock({ content }: ToolOutputBlockProps) {
  return (
    <View className="bg-stone-100 dark:bg-stone-950 rounded-md p-3">
      <Text
        className="text-[11px] text-stone-700 dark:text-stone-400"
        style={{ fontFamily: 'JetBrains Mono' }}
      >
        {content}
      </Text>
    </View>
  )
}
