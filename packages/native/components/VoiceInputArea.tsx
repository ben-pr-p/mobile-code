import React, { useCallback } from 'react'
import { View, Text, Pressable, TextInput } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useColorScheme } from 'nativewind'
import { Mic, Plus, ChevronDown } from 'lucide-react-native'
import type { RecordingState } from '../hooks/useAudioRecorder'
import type { PendingCommand } from '../state/settings'

interface VoiceInputAreaProps {
  textValue: string
  onTextChange: (text: string) => void
  onSend: () => void
  isSending?: boolean
  onMicPressIn: () => void
  onMicPressOut: () => void
  onAttachPress: () => void
  onStopPress: () => void
  recordingState: RecordingState
  modelName: string
  sessionStatus?: 'idle' | 'busy' | 'error'
  onAbort?: () => void
  onModelPress?: () => void
  /** Current agent name displayed on the bottom-left button. */
  agentName?: string
  /** Opens the agent & command selector sheet. */
  onAgentPress?: () => void
  /** Currently queued command (shown as a badge in the text input). */
  pendingCommand?: PendingCommand | null
  /** Dismiss the queued command. */
  onClearCommand?: () => void
}

export function VoiceInputArea({
  textValue,
  onTextChange,
  onSend,
  isSending,
  onMicPressIn,
  onMicPressOut,
  onAttachPress,
  onStopPress,
  recordingState,
  modelName,
  sessionStatus,
  onAbort,
  onModelPress,
  agentName,
  onAgentPress,
  pendingCommand,
  onClearCommand,
}: VoiceInputAreaProps) {
  const insets = useSafeAreaInsets()
  const { colorScheme } = useColorScheme()
  const isDark = colorScheme === 'dark'
  const placeholderColor = isDark ? '#57534E' : '#A8A29E'
  const inputIconColor = isDark ? '#57534E' : '#A8A29E'
  const micIconColor = isDark ? '#0C0A09' : '#FAFAF9'
  const selectorColor = isDark ? '#57534E' : '#A8A29E'

  // Hold to record — release to stop and send.
  const handlePressIn = useCallback(() => {
    onMicPressIn()
  }, [onMicPressIn])

  const handlePressOut = useCallback(() => {
    if (recordingState !== 'recording') return
    onMicPressOut()
  }, [recordingState, onMicPressOut])

  return (
    <View style={{ paddingBottom: insets.bottom + 4 }}>
      {/* Text input row — plus and stop buttons inside */}
      <View className="px-4 mb-3">
        <View className="flex-row items-end bg-stone-100 dark:bg-stone-900 rounded-xl pl-3.5 pr-1.5 py-1.5 gap-2" style={{ minHeight: 44 }}>
          {sessionStatus === 'busy' && onAbort && (
            <Pressable
              onPress={onAbort}
              className="w-[34px] h-[34px] rounded-lg items-center justify-center self-end mb-0.5"
              style={{ backgroundColor: '#EF4444' }}
            >
              <View className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#0C0A09' }} />
            </Pressable>
          )}
          {pendingCommand && (
            <View className="flex-row items-center bg-amber-500/15 rounded-md px-2 py-1 gap-1 self-end mb-0.5">
              <Text
                className="text-[10px] font-semibold text-amber-600 dark:text-amber-400"
                style={{ fontFamily: 'JetBrains Mono' }}
              >
                /{pendingCommand.name}
              </Text>
              <Pressable onPress={onClearCommand} hitSlop={8}>
                <Text className="text-[10px] text-amber-600 dark:text-amber-400">{'\u2715'}</Text>
              </Pressable>
            </View>
          )}
          <TextInput
            value={textValue}
            onChangeText={onTextChange}
            multiline
            scrollEnabled
            editable={!isSending}
            placeholder={isSending ? 'Waiting for response...' : 'Ask anything...'}
            placeholderTextColor={placeholderColor}
            className="flex-1 text-sm text-stone-900 dark:text-stone-50 py-1.5"
            style={{ fontFamily: 'JetBrains Mono', maxHeight: 120 }}

          />
          <View className="flex-row items-center gap-1 pb-0.5">
            <Pressable
              onPress={onAttachPress}
              className="w-[30px] h-[30px] rounded-lg bg-stone-50 dark:bg-stone-950 items-center justify-center"
            >
              <Plus size={16} color={inputIconColor} />
            </Pressable>
            <Pressable
              onPress={isSending ? onStopPress : onSend}
              className="w-[34px] h-[34px] rounded-lg bg-stone-900 dark:bg-stone-50 items-center justify-center"
              style={{ opacity: !textValue.trim() && !isSending ? 0.5 : 1 }}
            >
              {isSending ? (
                <View className="w-3 h-3 rounded-sm bg-stone-50 dark:bg-stone-950" />
              ) : (
                <Text className="text-stone-50 dark:text-stone-900 text-xs font-bold">↑</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>

      {/* Voice control row */}
      <View className="flex-row items-center px-4 mb-2">
        <View className="flex-1 items-start">
          <Pressable className="flex-row items-center gap-1" onPress={onAgentPress}>
            <Text className="text-[11px] font-medium" style={{ fontFamily: 'JetBrains Mono', color: selectorColor }}>
              {agentName ?? 'Build'}
            </Text>
            <ChevronDown size={12} color={selectorColor} />
          </Pressable>
        </View>

        {/* Mic button — hold to record, release to send */}
        <Pressable
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          className="w-[52px] h-[52px] rounded-full items-center justify-center"
          style={{
            backgroundColor: recordingState === 'recording' ? '#EF4444' : '#F59E0B',
          }}
        >
          {recordingState === 'recording' ? (
            <View className="w-5 h-5 rounded-sm bg-stone-50 dark:bg-stone-900" />
          ) : (
            <Mic size={22} color={micIconColor} />
          )}
        </Pressable>

        <View className="flex-1 items-end">
          <Pressable className="flex-row items-center gap-1" onPress={onModelPress}>
            <Text numberOfLines={1} className="text-[11px] font-medium" style={{ fontFamily: 'JetBrains Mono', color: selectorColor, flexShrink: 1 }}>
              {modelName}
            </Text>
            <ChevronDown size={12} color={selectorColor} />
          </Pressable>
        </View>
      </View>

      {/* Recording state hint */}
      {recordingState === 'recording' && (
        <Text
          className="text-center text-xs text-stone-500 dark:text-stone-400 mt-1 mb-1"
          style={{ fontFamily: 'JetBrains Mono' }}
        >
          {'recording · release to send'}
        </Text>
      )}
    </View>
  )
}
