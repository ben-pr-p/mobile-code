import React, { useRef, useState, useCallback, useMemo } from 'react'
import { View, Text, Pressable, TextInput, ScrollView } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useColorScheme } from 'nativewind'
import { useAtomValue, useSetAtom } from 'jotai'
import { Mic, Pause, Plus, ChevronDown, Droplets, Footprints, Trash2 } from 'lucide-react-native'
import type { RecordingState, AudioChunk } from '../hooks/useChunkedAudioRecorder'
import type { PendingCommand } from '../state/settings'
import { handsFreeActiveAtom, nativeRecordingAtom, handsFreeModeAtom } from '../state/settings'
import { lineSelectionAtom } from '../state/line-selection'

/** Format milliseconds as M:SS */
function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

/** Format a line reference as a compact label like "prompt.ts:42-67" */
function formatLineRef(ref: AudioChunk['lineReference']): string | null {
  if (!ref) return null
  const parts = ref.file.split('/')
  const basename = parts[parts.length - 1]
  if (ref.startLine === ref.endLine) {
    return `${basename}:${ref.startLine}`
  }
  return `${basename}:${ref.startLine}-${ref.endLine}`
}

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
  /** Toggle hands-free mode on/off. */
  onHandsFreeToggle?: () => void
  /** Open the hands-free mode picker (long-press). */
  onHandsFreeLongPress?: () => void
  /** Stop current recording (if any), add to queue, and send all chunks. */
  onSendRecording: () => void
  /** Queued audio chunks. */
  chunks: AudioChunk[]
  /** Total duration of all queued chunks in ms. */
  totalDurationMs: number
  /** Send all queued chunks (when not currently recording). */
  onSendChunks: () => void
  /** Remove a specific chunk from the queue. */
  onDiscardChunk: (id: string) => void
  /** Clear the entire chunk queue. */
  onDiscardAllChunks: () => void
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
  onHandsFreeToggle,
  onHandsFreeLongPress,
  onSendRecording,
  chunks,
  totalDurationMs,
  onSendChunks,
  onDiscardChunk,
  onDiscardAllChunks,
}: VoiceInputAreaProps) {
  const insets = useSafeAreaInsets()
  const { colorScheme } = useColorScheme()
  const isDark = colorScheme === 'dark'
  const isHandsFreeActive = useAtomValue(handsFreeActiveAtom)
  const isNativeRecording = useAtomValue(nativeRecordingAtom)
  const handsFreeMode = useAtomValue(handsFreeModeAtom)
  const HandsFreeIcon = handsFreeMode === 'walking' ? Footprints : Droplets
  const placeholderColor = isDark ? '#57534E' : '#A8A29E'
  const inputIconColor = isDark ? '#57534E' : '#A8A29E'
  const micIconColor = isDark ? '#0C0A09' : '#FAFAF9'
  const selectorColor = isDark ? '#57534E' : '#A8A29E'

  // Whether we're in "audio mode" — recording or have queued chunks
  const isAudioMode = recordingState === 'recording' || chunks.length > 0

  // Line selection from the diff viewer
  const lineSelection = useAtomValue(lineSelectionAtom)
  const setLineSelection = useSetAtom(lineSelectionAtom)
  const lineSelectionLabel = useMemo(() => {
    if (!lineSelection) return null
    const parts = lineSelection.file.split('/')
    const basename = parts[parts.length - 1]
    if (lineSelection.startLine === lineSelection.endLine) {
      return `${basename}:${lineSelection.startLine}`
    }
    return `${basename}:${lineSelection.startLine}-${lineSelection.endLine}`
  }, [lineSelection])

  // Tap: starts recording, locked on — tap again to pause (add to queue).
  // Hold (>300ms): starts recording — release to pause (add to queue).
  const pressInTimeRef = useRef(0)
  const [locked, setLocked] = useState(false)
  // Ref guards against the race condition where handlePressIn stops a locked
  // recording and handlePressOut fires in the same gesture, seeing stale state.
  const handledRef = useRef(false)

  const handlePressIn = useCallback(() => {
    handledRef.current = false

    if (recordingState === 'recording' && locked) {
      // Tap to pause: stop chunk → add to queue
      handledRef.current = true
      setLocked(false)
      onMicPressOut()
      return
    }

    pressInTimeRef.current = Date.now()
    onMicPressIn()
  }, [recordingState, locked, onMicPressIn, onMicPressOut])

  const handlePressOut = useCallback(() => {
    // If we already handled this gesture in handlePressIn (paused a locked
    // recording), skip so we don't double-fire.
    if (handledRef.current) return
    if (recordingState !== 'recording') return

    const holdDuration = Date.now() - pressInTimeRef.current
    if (holdDuration < 300) {
      // Quick tap — lock recording on, user will tap again to pause
      setLocked(true)
      return
    }

    // Long hold — release to pause (add to queue)
    onMicPressOut()
  }, [recordingState, onMicPressOut])

  // Send button handler: context-dependent
  const handleSendPress = useCallback(() => {
    if (isSending) {
      onStopPress()
      return
    }
    if (recordingState === 'recording') {
      // Stop current recording + send all chunks
      onSendRecording()
      return
    }
    if (chunks.length > 0) {
      // Send all queued chunks
      onSendChunks()
      return
    }
    // Normal text send
    onSend()
  }, [isSending, recordingState, chunks.length, onStopPress, onSendRecording, onSendChunks, onSend])

  // Whether the send button should be active
  const isSendActive = isSending || recordingState === 'recording' || chunks.length > 0 || !!textValue.trim()

  return (
    <View style={{ paddingBottom: insets.bottom + 4 }}>
      {/* Top row: text input OR audio chunk list */}
      <View className="px-4 mb-3">
        {isAudioMode ? (
          /* Audio mode: chunk list + send */
          <View className="bg-stone-100 dark:bg-stone-900 rounded-xl px-3 py-2" style={{ minHeight: 44 }}>
            {/* Action row: discard all + send (top) */}
            <View className="flex-row items-center justify-between mb-1">
              <Pressable
                onPress={onDiscardAllChunks}
                className="flex-row items-center gap-1 py-1"
              >
                <Trash2 size={12} color={isDark ? '#78716C' : '#A8A29E'} />
                <Text
                  className="text-[10px] text-stone-400 dark:text-stone-500"
                  style={{ fontFamily: 'JetBrains Mono' }}
                >
                  discard all
                </Text>
              </Pressable>
              <Pressable
                onPress={handleSendPress}
                className="h-[34px] rounded-lg bg-stone-900 dark:bg-stone-50 items-center justify-center px-4"
              >
                <Text className="text-stone-50 dark:text-stone-900 text-xs font-bold" style={{ fontFamily: 'JetBrains Mono' }}>
                  ↑ Send {chunks.length > 0 ? `(${chunks.length})` : ''}
                </Text>
              </Pressable>
            </View>

            {/* Chunk list */}
            {chunks.length > 0 && (
              <ScrollView style={{ maxHeight: 120 }} showsVerticalScrollIndicator={false}>
                {chunks.map((chunk, index) => {
                  const refLabel = formatLineRef(chunk.lineReference)
                  return (
                    <View key={chunk.id} className="flex-row items-center py-2 gap-2">
                      <Pressable onPress={() => onDiscardChunk(chunk.id)} hitSlop={12} style={{ minWidth: 34, minHeight: 34, alignItems: 'center', justifyContent: 'center' }}>
                        <Text className="text-[13px] text-stone-400 dark:text-stone-500">{'\u2715'}</Text>
                      </Pressable>
                      <Text
                        className="text-[11px] text-stone-500 dark:text-stone-400 w-5"
                        style={{ fontFamily: 'JetBrains Mono' }}
                      >
                        {index + 1}.
                      </Text>
                      <Text
                        className="text-[11px] text-stone-700 dark:text-stone-300"
                        style={{ fontFamily: 'JetBrains Mono' }}
                      >
                        {formatDuration(chunk.durationMs)}
                      </Text>
                      {refLabel ? (
                        <Text
                          className="text-[10px] text-blue-600 dark:text-blue-400 flex-1"
                          style={{ fontFamily: 'JetBrains Mono' }}
                          numberOfLines={1}
                        >
                          {refLabel}
                        </Text>
                      ) : (
                        <View className="flex-1" />
                      )}
                    </View>
                  )
                })}
              </ScrollView>
            )}

            {/* Recording indicator */}
            {recordingState === 'recording' && (
              <View className="flex-row items-center py-1 gap-2">
                <View className="w-2 h-2 rounded-full bg-red-500" />
                <Text
                  className="text-[11px] text-red-500 dark:text-red-400"
                  style={{ fontFamily: 'JetBrains Mono' }}
                >
                  recording...
                </Text>
              </View>
            )}

            {/* Line selection badge for next recording (bottom) */}
            {lineSelectionLabel && (
              <View className="flex-row items-center mt-2">
                <View className="flex-row items-center bg-blue-500/15 rounded-md px-2 py-1 gap-1">
                  <Text
                    className="text-[10px] font-semibold text-blue-600 dark:text-blue-400"
                    style={{ fontFamily: 'JetBrains Mono' }}
                    numberOfLines={1}
                  >
                    {lineSelectionLabel}
                  </Text>
                  <Pressable onPress={() => setLineSelection(null)} hitSlop={8}>
                    <Text className="text-[10px] text-blue-600 dark:text-blue-400">{'\u2715'}</Text>
                  </Pressable>
                </View>
                <Text
                  className="text-[10px] text-stone-400 dark:text-stone-500 ml-2"
                  style={{ fontFamily: 'JetBrains Mono' }}
                >
                  next recording
                </Text>
              </View>
            )}
          </View>
        ) : (
          /* Text mode: normal text input (unchanged) */
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
            {lineSelectionLabel && (
              <View className="flex-row items-center bg-blue-500/15 rounded-md px-2 py-1 gap-1 self-end mb-0.5">
                <Text
                  className="text-[10px] font-semibold text-blue-600 dark:text-blue-400"
                  style={{ fontFamily: 'JetBrains Mono' }}
                  numberOfLines={1}
                >
                  {lineSelectionLabel}
                </Text>
                <Pressable onPress={() => setLineSelection(null)} hitSlop={8}>
                  <Text className="text-[10px] text-blue-600 dark:text-blue-400">{'\u2715'}</Text>
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
                onPress={handleSendPress}
                className="w-[34px] h-[34px] rounded-lg bg-stone-900 dark:bg-stone-50 items-center justify-center"
                style={{ opacity: !isSendActive ? 0.5 : 1 }}
              >
                {isSending ? (
                  <View className="w-3 h-3 rounded-sm bg-stone-50 dark:bg-stone-950" />
                ) : (
                  <Text className="text-stone-50 dark:text-stone-900 text-xs font-bold">↑</Text>
                )}
              </Pressable>
            </View>
          </View>
        )}
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

        {/* Hands-free toggle + mic button */}
        <View className="flex-row items-center gap-3">
          {onHandsFreeToggle && (
            <Pressable
              onPress={onHandsFreeToggle}
              onLongPress={onHandsFreeLongPress}
              delayLongPress={400}
              className="w-11 h-11 rounded-full items-center justify-center"
              style={{
                backgroundColor: isHandsFreeActive
                  ? (isDark ? '#7C3AED' : '#8B5CF6')
                  : (isDark ? '#292524' : '#E7E5E4'),
              }}
            >
              <HandsFreeIcon
                size={18}
                color={isHandsFreeActive ? '#FAFAF9' : selectorColor}
              />
            </Pressable>
          )}

          {/* Mic button — tap to lock record, hold to record.
              Disabled during native CallKit recording (headphone-initiated). */}
          <View>
            <Pressable
              onPressIn={isNativeRecording ? undefined : handlePressIn}
              onPressOut={isNativeRecording ? undefined : handlePressOut}
              disabled={isNativeRecording}
              className="w-[52px] h-[52px] rounded-full items-center justify-center"
              style={{
                backgroundColor: isNativeRecording
                  ? (isDark ? '#292524' : '#D6D3D1')
                  : recordingState === 'recording' ? '#EF4444' : '#F59E0B',
                opacity: isNativeRecording ? 0.5 : 1,
              }}
            >
              {recordingState === 'recording' ? (
                <Pause size={22} color={micIconColor} />
              ) : (
                <Mic size={22} color={isNativeRecording ? selectorColor : micIconColor} />
              )}
            </Pressable>
            {/* Chunk count badge on mic button */}
            {chunks.length > 0 && recordingState === 'idle' && (
              <View
                className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 items-center justify-center"
                pointerEvents="none"
              >
                <Text className="text-[10px] font-bold text-white">{chunks.length}</Text>
              </View>
            )}
          </View>
        </View>

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
      {isNativeRecording && (
        <Text
          className="text-center text-xs text-purple-500 dark:text-purple-400 mt-1 mb-1"
          style={{ fontFamily: 'JetBrains Mono' }}
        >
          recording · press pause to send
        </Text>
      )}
      {!isNativeRecording && recordingState === 'recording' && (
        <Text
          className="text-center text-xs text-stone-500 dark:text-stone-400 mt-1 mb-1"
          style={{ fontFamily: 'JetBrains Mono' }}
        >
          {locked
            ? 'recording · tap to pause · ↑ to send'
            : 'recording · release to pause · ↑ to send'}
        </Text>
      )}
      {isHandsFreeActive && !isNativeRecording && recordingState !== 'recording' && chunks.length === 0 && (
        <Text
          className="text-center text-xs text-purple-500 dark:text-purple-400 mt-1 mb-1"
          style={{ fontFamily: 'JetBrains Mono' }}
        >
          {handsFreeMode === 'walking' ? 'walking' : 'washing dishes'} · press pause to record
        </Text>
      )}
    </View>
  )
}
