import React, { useState } from 'react'
import { View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { SessionHeader } from './SessionHeader'
import { TabBar } from './TabBar'
import { ChatThread } from './ChatThread'
import { ChangesView } from './ChangesView'
import { VoiceInputArea } from './VoiceInputArea'
import type { Session } from '../__fixtures__/sessions'
import type { Message, ChangedFile } from '../__fixtures__/messages'

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

interface SessionScreenProps {
  session: Session
  messages: Message[]
  changes: ChangedFile[]
  activeTab: 'session' | 'changes'
  onTabChange: (tab: 'session' | 'changes') => void
  onMenuPress: () => void
  onProjectsPress: () => void
  onToolCallPress?: (messageId: string) => void
}

export function SessionScreen({
  session,
  messages,
  changes,
  activeTab,
  onTabChange,
  onMenuPress,
  onProjectsPress,
  onToolCallPress,
}: SessionScreenProps) {
  const insets = useSafeAreaInsets()
  const [textValue, setTextValue] = useState('')

  return (
    <View className="flex-1 bg-oc-bg-primary" style={{ paddingTop: insets.top }}>
      <SessionHeader
        projectName={session.name.includes('/') ? session.name : 'opencode-rn'}
        branchName={session.name}
        relativeTime={formatRelativeTime(session.updatedAt)}
        onMenuPress={onMenuPress}
        onProjectsPress={onProjectsPress}
      />

      <TabBar activeTab={activeTab} onTabChange={onTabChange} />

      {activeTab === 'session' ? (
        <ChatThread messages={messages} onToolCallPress={onToolCallPress} />
      ) : (
        <ChangesView changes={changes} />
      )}

      <VoiceInputArea
        textValue={textValue}
        onTextChange={setTextValue}
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
