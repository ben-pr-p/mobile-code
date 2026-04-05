import React from 'react'
import { View, Text, ActivityIndicator } from 'react-native'
import { Mic, Upload, AudioLines } from 'lucide-react-native'
import { useConversationFontSize } from '../hooks/useFontSize'

interface UserMessageBubbleProps {
  content: string
  isVoice: boolean
  syncStatus: 'synced' | 'pending' | 'sending' | 'uploading' | 'transcribing' | 'forwarded' | 'failed'
}

/**
 * Renders a user message bubble with distinct visual states for voice messages:
 * - **uploading** — audio is being transmitted to the server (not safe to navigate away)
 * - **transcribing** — server has the audio and is processing it (safe to navigate away)
 * - **sending** — transcription complete, text available, waiting for OpenCode
 * - **forwarded** — prompt accepted by agent, waiting for response
 */
export function UserMessageBubble({ content, isVoice, syncStatus }: UserMessageBubbleProps) {
  const isUploading = syncStatus === 'uploading' && isVoice
  const isTranscribing = syncStatus === 'transcribing' && isVoice
  const isForwarded = syncStatus === 'forwarded' && isVoice
  const isSendingVoice = syncStatus === 'sending' && isVoice && !content
  const isQueued = syncStatus === 'pending' || syncStatus === 'failed'
  const fontSize = useConversationFontSize()

  // In-progress states (transcribing, sending, forwarded) use blue border
  const isInProgress = isTranscribing || isSendingVoice || isForwarded
  const borderClass = isUploading
    ? 'border-amber-400 dark:border-amber-500'
    : isInProgress
      ? 'border-blue-400 dark:border-blue-500'
      : 'border-amber-400 dark:border-amber-500'

  return (
    <View>
      <View className={`bg-white dark:bg-stone-900 rounded-xl px-3.5 py-2.5 border ${borderClass}`}>
        {isVoice && (
          <View className="flex-row items-center gap-1 mb-1">
            <Mic size={10} color="#A8A29E" />
            <Text className="text-stone-400 dark:text-stone-600" style={{ fontFamily: 'JetBrains Mono', fontSize: fontSize.meta }}>
              voice message
            </Text>
          </View>
        )}
        {isUploading ? (
          <View className="flex-row items-center gap-2">
            <Upload size={12} color="#F59E0B" />
            <Text className="font-medium text-amber-500 dark:text-amber-400 leading-5" style={{ fontFamily: 'JetBrains Mono', fontSize: fontSize.body }}>
              Uploading audio...
            </Text>
          </View>
        ) : isTranscribing ? (
          <View className="flex-row items-center gap-2">
            <AudioLines size={12} color="#3B82F6" />
            <Text className="font-medium text-blue-500 dark:text-blue-400 leading-5" style={{ fontFamily: 'JetBrains Mono', fontSize: fontSize.body }}>
              Transcribing...
            </Text>
          </View>
        ) : isSendingVoice ? (
          <View className="flex-row items-center gap-2">
            <ActivityIndicator size="small" color="#3B82F6" />
            <Text className="font-medium text-blue-500 dark:text-blue-400 leading-5" style={{ fontFamily: 'JetBrains Mono', fontSize: fontSize.body }}>
              Sending to agent...
            </Text>
          </View>
        ) : isForwarded ? (
          <>
            <Text className="font-medium text-stone-900 dark:text-stone-50 leading-5" style={{ fontFamily: 'JetBrains Mono', fontSize: fontSize.body }}>{content}</Text>
            <View className="flex-row items-center gap-1.5 mt-1.5">
              <ActivityIndicator size="small" color="#3B82F6" />
              <Text className="text-blue-500 dark:text-blue-400" style={{ fontFamily: 'JetBrains Mono', fontSize: fontSize.meta }}>
                sent to agent
              </Text>
            </View>
          </>
        ) : (
          <Text className="font-medium text-stone-900 dark:text-stone-50 leading-5" style={{ fontFamily: 'JetBrains Mono', fontSize: fontSize.body }}>{content}</Text>
        )}
        {isUploading && (
          <Text className="text-amber-500 mt-1.5" style={{ fontFamily: 'JetBrains Mono', fontSize: fontSize.meta }}>
            don't navigate away
          </Text>
        )}
        {(isTranscribing || isSendingVoice) && (
          <Text className="text-blue-400 dark:text-blue-500 mt-1.5" style={{ fontFamily: 'JetBrains Mono', fontSize: fontSize.meta }}>
            safe to navigate away
          </Text>
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
