import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  KeyboardAvoidingView,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColorScheme } from 'nativewind';
import {
  Menu,
  FolderOpen,
  Settings,
  X,
  GitMerge,
  Check,
  CircleDot,
  Monitor,
  Cloud,
} from 'lucide-react-native';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { ResizableSplitPane } from './ResizableSplitPane';
import { SessionHeader } from './SessionHeader';
import { ChatThread } from './ChatThread';
import { ChangesView } from './ChangesView';
import { VoiceInputArea } from './VoiceInputArea';
import { SettingsScreen } from './SettingsScreen';
import { getToolRenderers, type ToolCallProps } from './tool-calls';
import { StatusDot, TOOL_LABELS, formatDuration } from './tool-calls/shared';
import type {
  SessionValue,
  UIMessage as Message,
  ChangedFile,
  WorktreeStatusValue,
  PermissionRequestValue,
} from '../lib/stream-db';
import type { NotificationSound } from '../__fixtures__/settings';
import type { LeftPanelContent } from '../state/ui';
import type { RecordingState, AudioChunk } from '../hooks/useChunkedAudioRecorder';
import type { PendingCommand } from '../state/settings';
import type { BackendUrl } from '../state/backends';
import { collections } from '../lib/collections';
import { useSessionStatus } from '../hooks/useSessionStatus';
import { PermissionRequestBar } from './PermissionRequestBar';

interface SplitLayoutProps {
  sessionId: string;
  backendUrl: BackendUrl;
  session: SessionValue;
  /** Pre-computed display name showing project dir (and worktree dir if different) */
  projectName: string;
  messages: Message[];
  changes: ChangedFile[];
  onMenuPress: () => void;
  onProjectsPress: () => void;
  onToolCallPress?: (messageId: string) => void;
  onSend: (text: string) => void;
  isSending?: boolean;
  audioRecorder: {
    recordingState: RecordingState;
    chunks: AudioChunk[];
    totalDurationMs: number;
    startRecording: () => void;
    stopRecording: () => void;
    sendRecording: () => void;
    cancelRecording: () => void;
    sendChunks: () => void;
    discardChunk: (id: string) => void;
    discardAllChunks: () => void;
  };
  onAbort?: () => void;
  settings: {
    notificationSound: NotificationSound;
    setNotificationSound: (value: NotificationSound) => void;
    notificationSoundOptions: { label: string; value: NotificationSound }[];
    appVersion: string;
  };
  modelName: string;
  onModelPress?: () => void;
  /** Current agent name for the bottom-left selector button. */
  agentName?: string;
  /** Opens the agent & command selector sheet. */
  onAgentPress?: () => void;
  /** Currently queued command. */
  pendingCommand?: PendingCommand | null;
  /** Dismiss the queued command. */
  onClearCommand?: () => void;
  /** Worktree status for worktree sessions. */
  worktreeStatus?: WorktreeStatusValue;
  /** Whether a merge operation is in progress. */
  isMerging?: boolean;
  /** Callback to trigger a merge. */
  onMerge?: () => void;
  /** Toggle hands-free mode on/off. */
  onHandsFreeToggle?: () => void;
  /** Open the hands-free mode picker (long-press). */
  onHandsFreeLongPress?: () => void;
  /** Pending permission request for this session (replaces voice input when set). */
  pendingPermission?: PermissionRequestValue | null;
  /** Optional content rendered in place of the chat thread for new sessions (e.g. NewSessionOptions). */
  newSessionOptions?: React.ReactNode;
}

export function SplitLayout({
  sessionId,
  backendUrl,
  session,
  projectName,
  messages,
  changes,
  onMenuPress,
  onProjectsPress,
  onToolCallPress,
  onSend,
  isSending,
  audioRecorder,
  onAbort,
  settings,
  modelName,
  onModelPress,
  agentName,
  onAgentPress,
  pendingCommand,
  onClearCommand,
  worktreeStatus,
  isMerging,
  onMerge,
  onHandsFreeToggle,
  onHandsFreeLongPress,
  pendingPermission,
  newSessionOptions,
}: SplitLayoutProps) {
  const sessionStatus = useSessionStatus(sessionId);
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const iconColor = colorScheme === 'dark' ? '#A8A29E' : '#44403C';
  const mutedIconColor = colorScheme === 'dark' ? '#57534E' : '#A8A29E';
  const [textValue, setTextValue] = useState('');
  const [leftPanel, setLeftPanel] = useState<LeftPanelContent>({ type: 'changes' });
  const [settingsVisible, setSettingsVisible] = useState(false);

  // Backend connection status — mirrors SessionHeader's real connection indicator
  const { data: backendsWithConnections } = useLiveQuery(
    (q) =>
      q
        .from({ b: collections.backends })
        .leftJoin({ bc: collections.backendConnections }, ({ b, bc }) => eq(b.url, bc.url)),
    []
  );
  const backendRows = backendsWithConnections ?? [];
  const enabledRows = backendRows.filter((r) => r.b.enabled);
  const anyConnected = enabledRows.some((r) => r.bc?.status === 'connected');
  const dotColor = anyConnected ? 'bg-green-500' : 'bg-red-500';
  const hasMultipleBackends = enabledRows.length > 1;

  // Extract the short worktree ID (e.g. "x7k2" from branch "worktree/x7k2-add-button")
  const isWorktree = worktreeStatus?.isWorktreeSession && !worktreeStatus.error;
  const worktreeShortId =
    isWorktree && worktreeStatus?.branch
      ? worktreeStatus.branch.replace(/^worktree\//, '').split('-')[0]
      : null;

  const handleToolCallPress = (messageId: string) => {
    setLeftPanel({ type: 'tool-detail', messageId });
    onToolCallPress?.(messageId);
  };

  const handleSettingsPress = () => {
    setSettingsVisible(true);
  };

  const handleCloseSettings = () => {
    setSettingsVisible(false);
  };

  const handleCloseLeftPanel = () => {
    setLeftPanel({ type: 'changes' });
  };

  return (
    <View className="flex-1 bg-stone-50 dark:bg-stone-950" style={{ paddingTop: insets.top }}>
      {/* Global header spanning full width */}
      <View className="h-12 flex-row items-center justify-between border-b border-stone-200 px-4 dark:border-stone-800">
        <View className="flex-row items-center gap-3">
          <Pressable
            testID="menu-button"
            onPress={onMenuPress}
            className="h-9 w-9 items-center justify-center"
            hitSlop={8}>
            <Menu size={20} color={iconColor} />
          </Pressable>
          <View className="flex-row items-center gap-2">
            <View className={`h-2 w-2 rounded-full ${dotColor}`} />
            <Text
              className="text-sm font-semibold text-stone-900 dark:text-stone-50"
              style={{ fontFamily: 'JetBrains Mono' }}>
              {projectName}
              {worktreeShortId ? ` (${worktreeShortId})` : ''}
            </Text>
            {hasMultipleBackends && (
              <View className="flex-row items-center gap-1">
                {enabledRows.map((r) => {
                  const isConnected = r.bc?.status === 'connected';
                  const Icon = r.b.type === 'local' ? Monitor : Cloud;
                  return (
                    <Icon
                      key={r.b.url}
                      size={12}
                      color={
                        isConnected
                          ? colorScheme === 'dark'
                            ? '#A8A29E'
                            : '#44403C'
                          : colorScheme === 'dark'
                            ? '#44403C'
                            : '#D6D3D1'
                      }
                    />
                  );
                })}
              </View>
            )}
          </View>
        </View>

        <View className="flex-row items-center gap-2">
          <Pressable
            testID="settings-button"
            accessibilityLabel="Settings"
            onPress={handleSettingsPress}
            className="h-9 w-9 items-center justify-center"
            hitSlop={8}>
            <Settings size={20} color={iconColor} />
          </Pressable>
          <Pressable
            onPress={onProjectsPress}
            className="h-9 w-9 items-center justify-center"
            hitSlop={8}>
            <FolderOpen size={20} color={iconColor} />
          </Pressable>
        </View>
      </View>

      {/* Subheader bar with branch + merge/close buttons */}
      <View className="h-8 flex-row items-center justify-between border-b border-stone-200 px-4 dark:border-stone-800">
        <View className="flex-row items-center gap-1.5">
          <Text className="text-xs text-stone-700 dark:text-stone-400">
            {session.title || 'Untitled'}
          </Text>
          <Text className="text-xs text-stone-400 dark:text-stone-600">·</Text>
          <Text className="text-xs text-stone-400 dark:text-stone-600">
            {formatRelativeTime(session.time.updated)}
          </Text>
        </View>
        <View className="flex-row items-center gap-2">
          {worktreeStatus?.isWorktreeSession && !worktreeStatus.error && (
            <SplitWorktreeStatusBadge
              worktreeStatus={worktreeStatus}
              isMerging={!!isMerging}
              onMerge={onMerge}
            />
          )}
          {leftPanel.type !== 'changes' && (
            <Pressable
              onPress={handleCloseLeftPanel}
              className="h-7 w-7 items-center justify-center"
              hitSlop={8}>
              <X size={16} color={mutedIconColor} />
            </Pressable>
          )}
        </View>
      </View>

      {/* Split pane content — resizable via drag handle */}
      <ResizableSplitPane
        left={
          leftPanel.type === 'tool-detail' ? (
            <ToolDetailPanel
              messageId={leftPanel.messageId}
              messages={messages}
              onClose={handleCloseLeftPanel}
            />
          ) : (
            <ChangesView sessionId={sessionId} backendUrl={backendUrl} changes={changes} />
          )
        }
        right={
          <KeyboardAvoidingView
            className="flex-1"
            behavior="padding"
            keyboardVerticalOffset={insets.top + 48 + 32}>
            {newSessionOptions ? (
              newSessionOptions
            ) : (
              <ChatThread messages={messages} onToolCallPress={handleToolCallPress} />
            )}
            {!session.parentID &&
              (pendingPermission ? (
                <PermissionRequestBar permission={pendingPermission} backendUrl={backendUrl} />
              ) : (
                <VoiceInputArea
                  textValue={textValue}
                  onTextChange={setTextValue}
                  onSend={() => {
                    const text = textValue.trim();
                    if (!text) return;
                    setTextValue('');
                    onSend(text);
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
              ))}
          </KeyboardAvoidingView>
        }
      />

      {/* Settings modal — centered overlay on iPad */}
      <Modal
        visible={settingsVisible}
        transparent
        animationType="fade"
        onRequestClose={handleCloseSettings}>
        <View
          className="flex-1 items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          {/* Backdrop — dismiss on tap */}
          <Pressable className="absolute inset-0" onPress={handleCloseSettings} />

          {/* Modal card */}
          <View
            className="overflow-hidden rounded-2xl bg-stone-50 dark:bg-stone-950"
            style={{
              width: 480,
              height: 560,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.4,
              shadowRadius: 24,
              elevation: 16,
            }}>
            <SettingsScreen
              notificationSound={settings.notificationSound}
              onNotificationSoundChange={settings.setNotificationSound}
              notificationSoundOptions={settings.notificationSoundOptions}
              appVersion={settings.appVersion}
              onBack={handleCloseSettings}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

/** Compact worktree status badge for the SplitLayout subheader. */
function SplitWorktreeStatusBadge({
  worktreeStatus,
  isMerging,
  onMerge,
}: {
  worktreeStatus: WorktreeStatusValue;
  isMerging: boolean;
  onMerge?: () => void;
}) {
  const { colorScheme } = useColorScheme();

  if (isMerging) {
    return (
      <View className="flex-row items-center gap-1 rounded bg-stone-200 px-1.5 py-0.5 dark:bg-stone-800">
        <ActivityIndicator size="small" color={colorScheme === 'dark' ? '#A8A29E' : '#44403C'} />
        <Text
          className="text-[10px] text-stone-500 dark:text-stone-400"
          style={{ fontFamily: 'JetBrains Mono' }}>
          Merging...
        </Text>
      </View>
    );
  }

  if (worktreeStatus.hasUncommittedChanges) {
    return (
      <View className="flex-row items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 dark:bg-amber-900/30">
        <CircleDot size={10} color={colorScheme === 'dark' ? '#fbbf24' : '#d97706'} />
        <Text
          className="text-[10px] text-amber-700 dark:text-amber-400"
          style={{ fontFamily: 'JetBrains Mono' }}>
          Uncommitted
        </Text>
      </View>
    );
  }

  if (worktreeStatus.hasUnmergedCommits) {
    return (
      <Pressable
        onPress={onMerge}
        className="flex-row items-center gap-1 rounded bg-blue-100 px-1.5 py-0.5 active:opacity-70 dark:bg-blue-900/30"
        hitSlop={4}>
        <GitMerge size={10} color={colorScheme === 'dark' ? '#60a5fa' : '#2563eb'} />
        <Text
          className="text-[10px] text-blue-700 dark:text-blue-400"
          style={{ fontFamily: 'JetBrains Mono' }}>
          Merge
        </Text>
      </Pressable>
    );
  }

  if (worktreeStatus.merged) {
    return (
      <View className="flex-row items-center gap-1 rounded bg-green-100 px-1.5 py-0.5 dark:bg-green-900/30">
        <Check size={10} color={colorScheme === 'dark' ? '#4ade80' : '#16a34a'} />
        <Text
          className="text-[10px] text-green-700 dark:text-green-400"
          style={{ fontFamily: 'JetBrains Mono' }}>
          Merged
        </Text>
      </View>
    );
  }

  return null;
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function ToolDetailPanel({
  messageId,
  messages,
  onClose,
}: {
  messageId: string;
  messages: Message[];
  onClose: () => void;
}) {
  const { colorScheme } = useColorScheme();
  const iconColor = colorScheme === 'dark' ? '#A8A29E' : '#44403C';

  const message = useMemo(() => {
    return messages.find((m) => m.id === messageId);
  }, [messageId, messages]);

  if (!message || message.type !== 'tool_call') {
    return (
      <View className="flex-1 items-center justify-center p-4">
        <Text className="text-sm text-stone-400 dark:text-stone-600">Tool call not found</Text>
      </View>
    );
  }

  const toolName = message.toolName || 'Unknown';
  const description = message.content;
  const toolMeta = message.toolMeta || { status: 'pending' as const };
  const toolLabel = TOOL_LABELS[toolName] || toolName;
  const duration = toolMeta.time ? formatDuration(toolMeta.time.start, toolMeta.time.end) : null;

  const { Expanded } = getToolRenderers(toolName);

  const toolCallProps: ToolCallProps = {
    toolName,
    description,
    toolMeta,
  };

  return (
    <View className="flex-1">
      <View className="flex-row items-center justify-between border-b border-stone-200 px-4 py-3 dark:border-stone-800">
        <View className="flex-row items-center gap-2">
          <StatusDot status={toolMeta.status} />
          <Text
            className="text-sm font-semibold text-stone-900 dark:text-stone-50"
            style={{ fontFamily: 'JetBrains Mono' }}>
            {toolLabel}
          </Text>
          {duration && (
            <Text className="text-[11px] text-stone-400" style={{ fontFamily: 'JetBrains Mono' }}>
              {duration}
            </Text>
          )}
        </View>
        <Pressable onPress={onClose} className="h-8 w-8 items-center justify-center" hitSlop={8}>
          <X size={20} color={iconColor} />
        </Pressable>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16 }}>
        <Expanded {...toolCallProps} />
      </ScrollView>
    </View>
  );
}
