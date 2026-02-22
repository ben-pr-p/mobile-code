import React from 'react'
import { View, Text } from 'react-native'

interface ToolOutputBlockProps {
  content: string
}

export function ToolOutputBlock({ content }: ToolOutputBlockProps) {
  return (
    <View className="bg-oc-bg-surface rounded-lg p-3">
      <Text
        className="text-xs text-oc-text-secondary"
        style={{ fontFamily: 'JetBrains Mono' }}
      >
        {content}
      </Text>
    </View>
  )
}
