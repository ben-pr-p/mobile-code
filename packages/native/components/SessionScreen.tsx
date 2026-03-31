import React, { useCallback, useState } from 'react'
import { KeyboardAvoidingView } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter, useGlobalSearchParams } from 'expo-router'
import { SessionHeader } from './SessionHeader'
import { TabBar } from './TabBar'
import { ChatThread } from './ChatThread'
import { ChangesView } from './ChangesView'
import { VoiceInputArea } from './VoiceInputArea'
import type { SessionValue, UIMessage as Message, ChangedFile, WorktreeStatusValue, PermissionRequestValue } from '../lib/stream-db'
import type { RecordingState, AudioChunk } from '../hooks/useChunkedAudioRecorder'
import type { PendingCommand } from '../state/settings'
import type { BackendUrl } from '../state/backends'
import { useSessionStatus } from '../hooks/useSessionStatus'
import { PermissionRequestBar } from './PermissionRequestBar'

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
    chunks: AudioChunk[]
    totalDurationMs: number
    startRecording: () => void
    stopRecording: () => void
    sendRecording: () => void
    cancelRecording: () => void
    sendChunks: () => void
    discardChunk: (id: string) => void
    discardAllChunks: () => void
  }
  onAbort?: () => void
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
  /** Worktree status for worktree sessions. */
  worktreeStatus?: WorktreeStatusValue
  /** Whether a merge operation is in progress. */
  isMerging?: boolean
  /** Callback to trigger a merge. */
  onMerge?: () => void
  /** Optional content rendered in place of the chat thread for new sessions (e.g. NewSessionOptions). */
  newSessionOptions?: React.ReactNode
  /** Toggle hands-free mode on/off. */
  onHandsFreeToggle?: () => void
  /** Open the hands-free mode picker (long-press). */
  onHandsFreeLongPress?: () => void
  /** Pending permission request for this session (replaces voice input when set). */
  pendingPermission?: PermissionRequestValue | null
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
  modelName,
  onModelPress,
  agentName,
  onAgentPress,
  pendingCommand,
  onClearCommand,
  worktreeStatus,
  isMerging,
  onMerge,
  newSessionOptions,
  onHandsFreeToggle,
  onHandsFreeLongPress,
  pendingPermission,
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

      {newSessionOptions ? (
        newSessionOptions
      ) : activeTab === 'session' ? (
        <ChatThread messages={messages} onToolCallPress={onToolCallPress} />
      ) : (
         <ChangesView sessionId={sessionId} backendUrl={backendUrl} changes={changes} />
      )}

      {!session.parentID && (
        pendingPermission
          ? <PermissionRequestBar permission={pendingPermission} backendUrl={backendUrl} />
          : <VoiceInputArea
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
              onSendRecording={audioRecorder.sendRecording}
              onAttachPress={() => {}}
              onStopPress={audioRecorder.cancelRecording}
              recordingState={audioRecorder.recordingState}
              chunks={audioRecorder.chunks}
              totalDurationMs={audioRecorder.totalDurationMs}
              onSendChunks={audioRecorder.sendChunks}
              onDiscardChunk={audioRecorder.discardChunk}
              onDiscardAllChunks={audioRecorder.discardAllChunks}
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
