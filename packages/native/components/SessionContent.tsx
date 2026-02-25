import React, { useState, useCallback } from 'react'
import { View, Text } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAtomValue } from 'jotai'
import { SessionScreen } from './SessionScreen'
import { SplitLayout } from './SplitLayout'
import { SessionHeader } from './SessionHeader'
import { TabBar } from './TabBar'
import { VoiceInputArea } from './VoiceInputArea'
import { useSession } from '../hooks/useSession'
import { useSessionMessages } from '../hooks/useSessionMessages'
import { useChanges } from '../hooks/useChanges'
import { apiAtom } from '../lib/api'
import type { ConnectionInfo, NotificationSound } from '../__fixtures__/settings'

interface SessionContentProps {
  sessionId: string
  isTabletLandscape: boolean
  onMenuPress: () => void
  onProjectsPress: () => void
  settings: {
    serverUrl: string
    setServerUrl: (url: string) => void
    connection: ConnectionInfo
    handsFreeAutoRecord: boolean
    setHandsFreeAutoRecord: (value: boolean) => void
    notificationSound: NotificationSound
    setNotificationSound: (value: NotificationSound) => void
    notificationSoundOptions: { label: string; value: NotificationSound }[]
    appVersion: string
    defaultModel: string
  }
}

export function SessionContent({
  sessionId,
  isTabletLandscape,
  onMenuPress,
  onProjectsPress,
  settings,
}: SessionContentProps) {
  const { data: session, isLoading: sessionLoading } = useSession(sessionId)

  if (sessionLoading || !session) {
    return (
      <SessionLoading
        onMenuPress={onMenuPress}
        onProjectsPress={onProjectsPress}
      />
    )
  }

  return (
    <SessionDataLoader
      session={session}
      sessionId={sessionId}
      isTabletLandscape={isTabletLandscape}
      onMenuPress={onMenuPress}
      onProjectsPress={onProjectsPress}
      settings={settings}
    />
  )
}

// Separate component so useSessionMessages/useChanges only mount when session exists
function SessionDataLoader({
  session,
  sessionId,
  isTabletLandscape,
  onMenuPress,
  onProjectsPress,
  settings,
}: {
  session: NonNullable<ReturnType<typeof useSession>['data']>
  sessionId: string
  isTabletLandscape: boolean
  onMenuPress: () => void
  onProjectsPress: () => void
  settings: SessionContentProps['settings']
}) {
  const api = useAtomValue(apiAtom)
  const { data: messages } = useSessionMessages(sessionId)
  const { data: changes } = useChanges(sessionId)
  const [activeTab, setActiveTab] = useState<'session' | 'changes'>('session')
  const [isSending, setIsSending] = useState(false)

  const handleSend = useCallback(async (text: string) => {
    setIsSending(true)
    try {
      const handle = api.getSession(sessionId)
      await handle.prompt([{ type: 'text', text }])
    } catch (err) {
      console.error('[SessionContent] prompt failed:', err)
    } finally {
      setIsSending(false)
    }
  }, [api, sessionId])

  if (isTabletLandscape) {
    return (
      <SplitLayout
        sessionId={sessionId}
        session={session}
        messages={messages}
        changes={changes}
        onMenuPress={onMenuPress}
        onProjectsPress={onProjectsPress}
        onToolCallPress={() => {}}
        onSend={handleSend}
        isSending={isSending}
        settings={settings}
      />
    )
  }

  return (
    <SessionScreen
      sessionId={sessionId}
      session={session}
      messages={messages}
      changes={changes}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      onMenuPress={onMenuPress}
      onProjectsPress={onProjectsPress}
      onToolCallPress={() => {}}
      onSend={handleSend}
      isSending={isSending}
    />
  )
}

function SessionLoading({
  onMenuPress,
  onProjectsPress,
}: {
  onMenuPress: () => void
  onProjectsPress: () => void
}) {
  const insets = useSafeAreaInsets()
  const [textValue, setTextValue] = useState('')

  return (
    <View className="flex-1 bg-stone-50 dark:bg-stone-950" style={{ paddingTop: insets.top }}>
      <SessionHeader
        projectName=""
        branchName=""
        relativeTime=""
        onMenuPress={onMenuPress}
        onProjectsPress={onProjectsPress}
      />
      <TabBar activeTab="session" onTabChange={() => {}} />
      <View className="flex-1 items-center justify-center px-8">
        <Text className="text-stone-400 dark:text-stone-600 text-sm text-center">Loading session...</Text>
      </View>
      <VoiceInputArea
        textValue={textValue}
        onTextChange={setTextValue}
        onSend={() => {}}
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
