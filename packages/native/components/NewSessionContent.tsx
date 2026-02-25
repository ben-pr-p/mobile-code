import React, { useState, useCallback, useRef } from 'react'
import { View, Text } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAtomValue } from 'jotai'
import { SessionHeader } from './SessionHeader'
import { TabBar } from './TabBar'
import { ChatThread } from './ChatThread'
import { VoiceInputArea } from './VoiceInputArea'
import { SplitLayout } from './SplitLayout'
import { apiAtom } from '../lib/api'
import { useAudioRecorder } from '../hooks/useAudioRecorder'
import type { Message } from '../hooks/useSessionMessages'
import type { ConnectionInfo, NotificationSound } from '../__fixtures__/settings'

interface NewSessionContentProps {
  worktree: string
  isTabletLandscape: boolean
  onMenuPress: () => void
  onProjectsPress: () => void
  onSessionCreated: (sessionId: string, worktree: string) => void
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

export function NewSessionContent({
  worktree,
  isTabletLandscape,
  onMenuPress,
  onProjectsPress,
  onSessionCreated,
  settings,
}: NewSessionContentProps) {
  const api = useAtomValue(apiAtom)
  const insets = useSafeAreaInsets()
  const [textValue, setTextValue] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [pendingVoiceMessages, setPendingVoiceMessages] = useState<Message[]>([])
  const voiceIdCounter = useRef(0)
  // Guard against multiple simultaneous session creations
  const creatingRef = useRef(false)

  const projectName = worktree.split('/').pop() || worktree

  const createSessionAndPrompt = useCallback(
    async (parts: Array<{ type: 'text'; text: string } | { type: 'audio'; audioData: string; mimeType: string }>) => {
      if (creatingRef.current) return
      creatingRef.current = true

      try {
        // Single atomic RPC call: creates the session and sends the prompt
        const { sessionId } = await api.createSessionWithPrompt({
          directory: worktree,
          parts,
        })

        // Navigate to the real session
        onSessionCreated(sessionId, worktree)
      } catch (err) {
        console.error('[NewSessionContent] createSessionWithPrompt failed:', err)
        creatingRef.current = false
      }
    },
    [api, worktree, onSessionCreated],
  )

  const handleSend = useCallback(
    async (text: string) => {
      setIsSending(true)
      try {
        await createSessionAndPrompt([{ type: 'text', text }])
      } finally {
        setIsSending(false)
      }
    },
    [createSessionAndPrompt],
  )

  const handleSendAudio = useCallback(
    (base64: string, mimeType: string) => {
      // Add optimistic voice message
      const optimisticId = `voice-pending-${++voiceIdCounter.current}`
      const optimisticMsg: Message = {
        id: optimisticId,
        sessionId: 'new',
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

      // Create session and send audio
      createSessionAndPrompt([{ type: 'audio', audioData: base64, mimeType }]).catch((err) => {
        console.error('[NewSessionContent] audio create + prompt failed:', err)
      })
    },
    [createSessionAndPrompt],
  )

  const audioRecorder = useAudioRecorder({ onSendAudio: handleSendAudio })

  const placeholderSession = {
    id: 'new',
    directory: worktree,
    name: 'New Session',
    branchName: null,
    status: 'idle' as const,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }

  if (isTabletLandscape) {
    return (
      <SplitLayout
        sessionId="new"
        session={placeholderSession}
        messages={pendingVoiceMessages}
        changes={[]}
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
    <View className="flex-1 bg-stone-50 dark:bg-stone-950" style={{ paddingTop: insets.top }}>
      <SessionHeader
        projectName={projectName}
        branchName="New Session"
        relativeTime="just now"
        onMenuPress={onMenuPress}
        onProjectsPress={onProjectsPress}
      />
      <TabBar activeTab="session" onTabChange={() => {}} />

      {pendingVoiceMessages.length > 0 ? (
        <ChatThread messages={pendingVoiceMessages} />
      ) : (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-stone-400 dark:text-stone-600 text-sm text-center">
            Send a message to start a new session
          </Text>
        </View>
      )}

      <VoiceInputArea
        textValue={textValue}
        onTextChange={setTextValue}
        onSend={() => {
          const text = textValue.trim()
          if (!text) return
          setTextValue('')
          handleSend(text)
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
