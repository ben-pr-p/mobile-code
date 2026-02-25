import React, { useState } from 'react'
import { View, Text } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { SessionHeader } from './SessionHeader'
import { TabBar } from './TabBar'
import { ChatThread } from './ChatThread'
import { ChangesView } from './ChangesView'
import { VoiceInputArea } from './VoiceInputArea'
import type { Session } from '../hooks/useSession'
import type { Message } from '../hooks/useSessionMessages'
import type { ChangedFile } from '../hooks/useChanges'

interface SessionScreenProps {
  sessionId: string
  session: Session
  messages: Message[]
  changes: ChangedFile[]
  activeTab: 'session' | 'changes'
  onTabChange: (tab: 'session' | 'changes') => void
  onMenuPress: () => void
  onProjectsPress: () => void
  onToolCallPress?: (messageId: string) => void
  onSend: (text: string) => void
  isSending?: boolean
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
  emptyMessage,
}: SessionScreenProps) {
  const insets = useSafeAreaInsets()
  const [textValue, setTextValue] = useState('')

  return (
    <View className="flex-1 bg-stone-50 dark:bg-stone-950" style={{ paddingTop: insets.top }}>
      <SessionHeader
        projectName={session.name.includes('/') ? session.name : 'opencode-rn'}
        branchName={session.name}
        relativeTime={formatRelativeTime(session.updatedAt)}
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
        onMicPress={() => {}}
        onAttachPress={() => {}}
        onStopPress={() => {}}
        micHint="hold to record · tap for hands-free"
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
