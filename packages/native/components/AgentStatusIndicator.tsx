import React from 'react'
import { View, Text } from 'react-native'

interface AgentStatusIndicatorProps {
  status: string // 'Thinking', 'Analyzing test files', 'Done', etc.
}

export function AgentStatusIndicator({ status }: AgentStatusIndicatorProps) {
  const isDone = status.toLowerCase() === 'done'
  const dotColor = isDone ? 'bg-green-500' : 'bg-amber-600 dark:bg-amber-500'
  const textColor = isDone ? 'text-green-500' : 'text-amber-600 dark:text-amber-500'

  return (
    <View className="flex-row items-center gap-2">
      <View className={`w-3.5 h-3.5 rounded-sm ${dotColor}`} />
      <Text className={`text-[13px] font-medium ${textColor}`} style={{ fontFamily: 'JetBrains Mono' }}>
        {status}
        {!isDone && ' ···'}
      </Text>
    </View>
  )
}
