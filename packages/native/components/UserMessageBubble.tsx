import React from 'react'
import { View, Text } from 'react-native'
import { Mic } from 'lucide-react-native'

interface UserMessageBubbleProps {
  content: string
  isVoice: boolean
  syncStatus: 'synced' | 'pending' | 'sending' | 'failed'
}

export function UserMessageBubble({ content, isVoice, syncStatus }: UserMessageBubbleProps) {
  const isTranscribing = syncStatus === 'sending' && isVoice
  const isQueued = syncStatus === 'pending' || syncStatus === 'failed'

  return (
    <View>
      <View className="bg-white dark:bg-stone-900 rounded-xl px-3.5 py-2.5 border border-amber-400 dark:border-amber-500">
        {isVoice && (
          <View className="flex-row items-center gap-1 mb-1">
            <Mic size={10} color="#A8A29E" />
            <Text className="text-[10px] text-stone-400 dark:text-stone-600" style={{ fontFamily: 'JetBrains Mono' }}>
              voice message
            </Text>
          </View>
        )}
        {isTranscribing ? (
          <Text className="text-sm font-medium text-stone-400 dark:text-stone-500 leading-5 italic" style={{ fontFamily: 'JetBrains Mono' }}>
            Transcribing...
          </Text>
        ) : (
          <Text className="text-sm font-medium text-stone-900 dark:text-stone-50 leading-5" style={{ fontFamily: 'JetBrains Mono' }}>{content}</Text>
        )}
        {isQueued && (
          <Text className="text-[10px] text-amber-500 mt-1.5" style={{ fontFamily: 'JetBrains Mono' }}>
            queued · will send when online
          </Text>
        )}
      </View>
    </View>
  )
}
