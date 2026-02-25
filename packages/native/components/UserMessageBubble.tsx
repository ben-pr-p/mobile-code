import React from 'react'
import { View, Text } from 'react-native'

interface UserMessageBubbleProps {
  content: string
  isVoice: boolean
  syncStatus: 'synced' | 'pending' | 'sending' | 'failed'
}

export function UserMessageBubble({ content, isVoice, syncStatus }: UserMessageBubbleProps) {
  const isQueued = syncStatus !== 'synced'

  return (
    <View className="items-end">
      <View className="bg-white dark:bg-stone-900 rounded-xl px-3.5 py-2.5 max-w-[85%]">
        {isVoice && (
          <Text className="text-[10px] text-stone-400 dark:text-stone-600 mb-1" style={{ fontFamily: 'JetBrains Mono' }}>
            🎙 voice message
          </Text>
        )}
        <Text className="text-sm font-medium text-stone-900 dark:text-stone-50 leading-5" style={{ fontFamily: 'JetBrains Mono' }}>{content}</Text>
        {isQueued && (
          <Text className="text-[10px] text-amber-500 mt-1.5" style={{ fontFamily: 'JetBrains Mono' }}>
            queued · will send when online
          </Text>
        )}
      </View>
    </View>
  )
}
