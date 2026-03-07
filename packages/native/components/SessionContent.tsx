import React, { useState, useCallback, useMemo, useRef } from 'react'
import { View, Text } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAtomValue } from 'jotai'
import { SessionScreen } from './SessionScreen'
import { SplitLayout } from './SplitLayout'
import { SessionHeader } from './SessionHeader'
import { TabBar } from './TabBar'
import { VoiceInputArea } from './VoiceInputArea'
import { useSession, type Session } from '../hooks/useSession'
import { useSessionMessages } from '../hooks/useSessionMessages'
import { useChanges } from '../hooks/useChanges'
import { apiAtom } from '../lib/api'
import { useAudioRecorder } from '../hooks/useAudioRecorder'
import type { Message } from '../hooks/useSessionMessages'
import type { ChangedFile } from '../hooks/useChanges'
import type { ConnectionInfo, NotificationSound } from '../__fixtures__/settings'

// ---------------------------------------------------------------------------
// Settings type shared by both wrappers
// ---------------------------------------------------------------------------

export interface SessionSettings {
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

// ---------------------------------------------------------------------------
// SessionView — the shared rendering core
// ---------------------------------------------------------------------------
// Both the existing-session and new-session wrappers render through this
// component. It owns the optimistic voice-message merge, the audio recorder,
// and delegates to SessionScreen / SplitLayout.

interface SessionViewProps {
  sessionId: string
  session: Session
  serverMessages: Message[]
  changes: ChangedFile[]
  isTabletLandscape: boolean
  onMenuPress: () => void
  onProjectsPress: () => void
  settings: SessionSettings
  onSendText: (text: string) => Promise<void>
  onSendAudio: (base64: string, mimeType: string) => void
  emptyMessage?: string
}

export function SessionView({
  sessionId,
  session,
  serverMessages,
  changes,
  isTabletLandscape,
  onMenuPress,
  onProjectsPress,
  settings,
  onSendText,
  onSendAudio,
  emptyMessage,
}: SessionViewProps) {
  const [activeTab, setActiveTab] = useState<'session' | 'changes'>('session')
  const [isSending, setIsSending] = useState(false)
  const [pendingVoiceMessages, setPendingVoiceMessages] = useState<Message[]>([])
  const voiceIdCounter = useRef(0)

  // Merge server messages with optimistic voice messages, removing optimistic
  // ones once the server has caught up (new user message appeared)
  const messages = useMemo(() => {
    if (pendingVoiceMessages.length === 0) return serverMessages

    // Find the latest server user message timestamp
    const latestServerUserMsg = serverMessages
      .filter((m) => m.role === 'user')
      .reduce((latest, m) => Math.max(latest, m.createdAt), 0)

    // Keep only pending messages that are newer than the latest server user message
    const stillPending = pendingVoiceMessages.filter(
      (m) => m.createdAt > latestServerUserMsg,
    )

    // Clean up stale pending messages
    if (stillPending.length !== pendingVoiceMessages.length) {
      setPendingVoiceMessages(stillPending)
    }

    return [...serverMessages, ...stillPending]
  }, [serverMessages, pendingVoiceMessages])

  const handleSend = useCallback(async (text: string) => {
    setIsSending(true)
    try {
      await onSendText(text)
    } catch (err) {
      console.error('[SessionView] send failed:', err)
    } finally {
      setIsSending(false)
    }
  }, [onSendText])

  const handleSendAudio = useCallback((base64: string, mimeType: string) => {
    // Add an optimistic voice message immediately
    const optimisticId = `voice-pending-${++voiceIdCounter.current}`
    const optimisticMsg: Message = {
      id: optimisticId,
      sessionId,
      role: 'user',
      type: 'voice',
      content: 'Transcribing...',
      audioUri: null,
      transcription: null,
      toolName: null,
      toolMeta: null,
      syncStatus: 'sending',
      createdAt: Date.now(),
    }
    setPendingVoiceMessages((prev) => [...prev, optimisticMsg])

    onSendAudio(base64, mimeType)
  }, [sessionId, onSendAudio])

  const audioRecorder = useAudioRecorder({ onSendAudio: handleSendAudio })

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
        audioRecorder={audioRecorder}
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
      audioRecorder={audioRecorder}
      emptyMessage={emptyMessage}
    />
  )
}

// ---------------------------------------------------------------------------
// SessionContent — existing session wrapper
// ---------------------------------------------------------------------------
// Fetches real session data from the server and wires send callbacks that
// prompt the existing session.

interface SessionContentProps {
  sessionId: string
  isTabletLandscape: boolean
  onMenuPress: () => void
  onProjectsPress: () => void
  settings: SessionSettings
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
    <ExistingSessionDataLoader
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
function ExistingSessionDataLoader({
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
  settings: SessionSettings
}) {
  const api = useAtomValue(apiAtom)
  const { data: serverMessages } = useSessionMessages(sessionId)
  const { data: changes } = useChanges(sessionId)

  const handleSendText = useCallback(async (text: string) => {
    const handle = api.getSession(sessionId)
    await handle.prompt([{ type: 'text', text }])
  }, [api, sessionId])

  const handleSendAudio = useCallback((base64: string, mimeType: string) => {
    const handle = api.getSession(sessionId)
    handle.prompt([{ type: 'audio', audioData: base64, mimeType }]).catch((err) => {
      console.error('[SessionContent] audio prompt failed:', err)
    })
  }, [api, sessionId])

  return (
    <SessionView
      sessionId={sessionId}
      session={session}
      serverMessages={serverMessages}
      changes={changes}
      isTabletLandscape={isTabletLandscape}
      onMenuPress={onMenuPress}
      onProjectsPress={onProjectsPress}
      settings={settings}
      onSendText={handleSendText}
      onSendAudio={handleSendAudio}
    />
  )
}

// ---------------------------------------------------------------------------
// NewSessionContent — new session wrapper
// ---------------------------------------------------------------------------
// Provides a placeholder session and wires send callbacks that create the
// session on the server (via the atomic createSessionWithPrompt RPC) before
// navigating to the real session.

interface NewSessionContentProps {
  worktree: string
  isTabletLandscape: boolean
  onMenuPress: () => void
  onProjectsPress: () => void
  onSessionCreated: (sessionId: string, worktree: string) => void
  settings: SessionSettings
}

export function NewSessionContent({
  worktree,
  isTabletLandscape,
  onMenuPress,
  onProjectsPress,
  onSessionCreated,
  settings,
}: NewSessionContentProps) {
  const api = useAtomValue(apiAtom)
  // Guard against multiple simultaneous session creations
  const creatingRef = useRef(false)

  const projectName = worktree.split('/').pop() || worktree

  const placeholderSession: Session = {
    id: 'new',
    directory: worktree,
    name: 'New Session',
    branchName: null,
    status: 'idle',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }

  const createAndPrompt = useCallback(
    async (parts: Array<{ type: 'text'; text: string } | { type: 'audio'; audioData: string; mimeType: string }>) => {
      if (creatingRef.current) return
      creatingRef.current = true

      try {
        const { sessionId } = await api.createSessionWithPrompt({
          directory: worktree,
          parts,
        })
        onSessionCreated(sessionId, worktree)
      } catch (err) {
        console.error('[NewSessionContent] createSessionWithPrompt failed:', err)
        creatingRef.current = false
      }
    },
    [api, worktree, onSessionCreated],
  )

  const handleSendText = useCallback(async (text: string) => {
    await createAndPrompt([{ type: 'text', text }])
  }, [createAndPrompt])

  const handleSendAudio = useCallback((base64: string, mimeType: string) => {
    createAndPrompt([{ type: 'audio', audioData: base64, mimeType }]).catch((err) => {
      console.error('[NewSessionContent] audio create + prompt failed:', err)
    })
  }, [createAndPrompt])

  return (
    <SessionView
      sessionId="new"
      session={placeholderSession}
      serverMessages={[]}
      changes={[]}
      isTabletLandscape={isTabletLandscape}
      onMenuPress={onMenuPress}
      onProjectsPress={onProjectsPress}
      settings={settings}
      onSendText={handleSendText}
      onSendAudio={handleSendAudio}
      emptyMessage="Send a message to start a new session"
    />
  )
}

// ---------------------------------------------------------------------------
// SessionLoading — shown while the existing session is being fetched
// ---------------------------------------------------------------------------

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
        onMicPressIn={() => {}}
        onMicPressOut={() => {}}
        onAttachPress={() => {}}
        onStopPress={() => {}}
        recordingState="idle"
        modelName="Sonnet"
        providerName="Build"
      />
    </View>
  )
}
