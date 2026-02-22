import React from 'react'
import { View, Text } from 'react-native'

interface AgentStatusIndicatorProps {
  status: string // 'Thinking', 'Analyzing test files', 'Done', etc.
}

export function AgentStatusIndicator({ status }: AgentStatusIndicatorProps) {
  const isDone = status.toLowerCase() === 'done'
  const dotColor = isDone ? 'bg-oc-green' : 'bg-oc-accent'
  const textColor = isDone ? 'text-oc-green' : 'text-white'

  return (
    <View className="flex-row items-center gap-2">
      <View className={`w-2 h-2 rounded-sm ${dotColor}`} />
      <Text className={`text-sm font-medium ${textColor}`}>
        {status}
        {!isDone && ' ···'}
      </Text>
    </View>
  )
}
