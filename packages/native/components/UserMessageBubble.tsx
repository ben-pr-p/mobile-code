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
      <View className="bg-oc-bg-surface rounded-2xl rounded-br-sm px-4 py-3 max-w-[85%]">
        {isVoice && (
          <Text className="text-[10px] text-oc-text-muted mb-1">
            🎙 voice message
          </Text>
        )}
        <Text className="text-sm text-white leading-5">{content}</Text>
        {isQueued && (
          <Text className="text-[10px] text-oc-amber mt-1.5" style={{ fontFamily: 'JetBrains Mono' }}>
            queued · will send when online
          </Text>
        )}
      </View>
    </View>
  )
}
