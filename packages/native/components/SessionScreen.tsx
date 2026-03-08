import React, { useState } from 'react'
import { View, Text } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { SessionHeader } from './SessionHeader'
import { TabBar } from './TabBar'
import { ChatThread } from './ChatThread'
import { ChangesView } from './ChangesView'
import { VoiceInputArea } from './VoiceInputArea'
import type { SessionValue, UIMessage as Message } from '../lib/stream-db'
import type { ChangedFile } from '../hooks/useChanges'
import type { RecordingState } from '../hooks/useAudioRecorder'

interface SessionScreenProps {
  sessionId: string
  session: SessionValue
  messages: Message[]
  changes: ChangedFile[]
  activeTab: 'session' | 'changes'
  onTabChange: (tab: 'session' | 'changes') => void
  onMenuPress: () => void
  onProjectsPress: () => void
  onToolCallPress?: (messageId: string) => void
  onSend: (text: string) => void
  isSending?: boolean
  audioRecorder: {
    recordingState: RecordingState
    startRecording: () => void
    stopRecording: () => void
    cancelRecording: () => void
  }
  emptyMessage?: string
}

export function SessionScreen({
  sessionId,
  session,
  messages,
  changes,
  activeTab,
  onTabChange,
  onMenuPress,
  onProjectsPress,
  onToolCallPress,
  onSend,
  isSending,
  audioRecorder,
  emptyMessage,
}: SessionScreenProps) {
  const insets = useSafeAreaInsets()
  const [textValue, setTextValue] = useState('')

  return (
    <View className="flex-1 bg-stone-50 dark:bg-stone-950" style={{ paddingTop: insets.top }}>
      <SessionHeader
        projectName={session.directory ? session.directory.split('/').pop() || session.directory : ''}
        branchName={session.title || 'Untitled'}
        relativeTime={formatRelativeTime(session.time.updated)}
        onMenuPress={onMenuPress}
        onProjectsPress={onProjectsPress}
      />

      <TabBar activeTab={activeTab} onTabChange={onTabChange} />

      {emptyMessage ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-stone-400 dark:text-stone-600 text-sm text-center">{emptyMessage}</Text>
        </View>
      ) : activeTab === 'session' ? (
        <ChatThread messages={messages} onToolCallPress={onToolCallPress} />
      ) : (
        <ChangesView sessionId={sessionId} changes={changes} />
      )}

      <VoiceInputArea
        textValue={textValue}
        onTextChange={setTextValue}
        onSend={() => {
          const text = textValue.trim()
          if (!text) return
          setTextValue('')
          onSend(text)
        }}
        isSending={isSending}
        onMicPressIn={audioRecorder.startRecording}
        onMicPressOut={audioRecorder.stopRecording}
        onAttachPress={() => {}}
        onStopPress={audioRecorder.cancelRecording}
        recordingState={audioRecorder.recordingState}
        modelName="Sonnet"
        providerName="Build"
      />
    </View>
  )
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}
