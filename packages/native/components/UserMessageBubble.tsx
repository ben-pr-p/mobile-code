import React from 'react'
import { View, Text } from 'react-native'
import { Mic } from 'lucide-react-native'
import { useConversationFontSize } from '../hooks/useFontSize'

interface UserMessageBubbleProps {
  content: string
  isVoice: boolean
  syncStatus: 'synced' | 'pending' | 'sending' | 'failed'
}

export function UserMessageBubble({ content, isVoice, syncStatus }: UserMessageBubbleProps) {
  const isTranscribing = syncStatus === 'sending' && isVoice
  const isQueued = syncStatus === 'pending' || syncStatus === 'failed'
  const fontSize = useConversationFontSize()

  return (
    <View>
      <View className="bg-white dark:bg-stone-900 rounded-xl px-3.5 py-2.5 border border-amber-400 dark:border-amber-500">
        {isVoice && (
          <View className="flex-row items-center gap-1 mb-1">
            <Mic size={10} color="#A8A29E" />
            <Text className="text-stone-400 dark:text-stone-600" style={{ fontFamily: 'JetBrains Mono', fontSize: fontSize.meta }}>
              voice message
            </Text>
          </View>
        )}
        {isTranscribing ? (
          <Text className="font-medium text-stone-400 dark:text-stone-500 leading-5 italic" style={{ fontFamily: 'JetBrains Mono', fontSize: fontSize.body }}>
            Transcribing...
          </Text>
        ) : (
          <Text className="font-medium text-stone-900 dark:text-stone-50 leading-5" style={{ fontFamily: 'JetBrains Mono', fontSize: fontSize.body }}>{content}</Text>
        )}
        {isQueued && (
          <Text className="text-amber-500 mt-1.5" style={{ fontFamily: 'JetBrains Mono', fontSize: fontSize.meta }}>
            queued · will send when online
          </Text>
        )}
      </View>
    </View>
  )
}
