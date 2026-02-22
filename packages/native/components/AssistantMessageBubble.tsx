import React from 'react'
import { View, Text } from 'react-native'

interface AssistantMessageBubbleProps {
  content: string
}

export function AssistantMessageBubble({ content }: AssistantMessageBubbleProps) {
  return (
    <View className="items-start">
      <View className="max-w-[85%]">
        <Text className="text-sm text-oc-text-secondary leading-5">{content}</Text>
      </View>
    </View>
  )
}
