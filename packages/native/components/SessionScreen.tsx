import React, { useCallback, useState } from 'react'
import { View, Text, KeyboardAvoidingView, Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter, useGlobalSearchParams } from 'expo-router'
import { SessionHeader } from './SessionHeader'
import { TabBar } from './TabBar'
import { ChatThread } from './ChatThread'
import { ChangesView } from './ChangesView'
import { VoiceInputArea } from './VoiceInputArea'
import type { SessionValue, UIMessage as Message, ChangedFile, WorktreeStatusValue } from '../lib/stream-db'
import type { RecordingState } from '../hooks/useAudioRecorder'
import type { PendingCommand } from '../state/settings'
import type { BackendUrl } from '../state/backends'
import { useSessionStatus } from '../hooks/useSessionStatus'

interface SessionScreenProps {
  sessionId: string
  backendUrl: BackendUrl
  session: SessionValue
  /** Pre-computed display name showing project dir (and worktree dir if different) */
  projectName: string
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
  onAbort?: () => void
  emptyMessage?: string
  modelName: string
  onModelPress?: () => void
  /** Current agent name for the bottom-left selector button. */
  agentName?: string
  /** Opens the agent & command selector sheet. */
  onAgentPress?: () => void
  /** Currently queued command. */
  pendingCommand?: PendingCommand | null
  /** Dismiss the queued command. */
  onClearCommand?: () => void
  /** Optional toggle element rendered below the empty message (e.g. worktree option) */
  worktreeToggle?: React.ReactNode
  /** Worktree status for worktree sessions. */
  worktreeStatus?: WorktreeStatusValue
  /** Whether a merge operation is in progress. */
  isMerging?: boolean
  /** Callback to trigger a merge. */
  onMerge?: () => void
  /** Optional server selector element rendered below the worktree toggle (new sessions only). */
  serverSelector?: React.ReactNode
  /** Toggle hands-free mode on/off. */
  onHandsFreeToggle?: () => void
  /** Open the hands-free mode picker (long-press). */
  onHandsFreeLongPress?: () => void
}

export function SessionScreen({
  sessionId,
  backendUrl,
  session,
  projectName,
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
  onAbort,
  emptyMessage,
  modelName,
  onModelPress,
  agentName,
  onAgentPress,
  pendingCommand,
  onClearCommand,
  worktreeToggle,
  worktreeStatus,
  isMerging,
  onMerge,
  serverSelector,
  onHandsFreeToggle,
  onHandsFreeLongPress,
}: SessionScreenProps) {
  const sessionStatus = useSessionStatus(backendUrl, sessionId)
  const insets = useSafeAreaInsets()
  const [textValue, setTextValue] = useState('')
  const router = useRouter()
  const { projectId } = useGlobalSearchParams<{ projectId: string }>()

  const handleNewSession = useCallback(() => {
    if (!projectId) return
    router.push({
      pathname: '/projects/[projectId]/new-session',
      params: { projectId },
    })
  }, [projectId, router])

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-stone-50 dark:bg-stone-950"
      style={{ paddingTop: insets.top }}
      behavior="padding"
      keyboardVerticalOffset={0}
    >
      <SessionHeader
        projectName={projectName}
        branchName={session.title || 'Untitled'}
        relativeTime={formatRelativeTime(session.time.updated)}
        onMenuPress={onMenuPress}
        onProjectsPress={onProjectsPress}
        worktreeStatus={worktreeStatus}
        isMerging={isMerging}
        onMerge={onMerge}
        backendUrl={backendUrl}
      />

      <TabBar activeTab={activeTab} onTabChange={onTabChange} onNewSession={handleNewSession} />

      {emptyMessage ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-stone-400 dark:text-stone-600 text-sm text-center">{emptyMessage}</Text>
          {worktreeToggle}
          {serverSelector}
        </View>
      ) : activeTab === 'session' ? (
        <ChatThread messages={messages} onToolCallPress={onToolCallPress} />
      ) : (
         <ChangesView sessionId={sessionId} backendUrl={backendUrl} changes={changes} />
      )}

      {!session.parentID && (
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
          modelName={modelName}
          sessionStatus={sessionStatus}
          onAbort={onAbort}
          onModelPress={onModelPress}
          agentName={agentName}
          onAgentPress={onAgentPress}
          pendingCommand={pendingCommand}
          onClearCommand={onClearCommand}
          onHandsFreeToggle={onHandsFreeToggle}
          onHandsFreeLongPress={onHandsFreeLongPress}
        />
      )}
    </KeyboardAvoidingView>
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
