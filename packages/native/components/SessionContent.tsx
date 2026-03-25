import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { View, Text, Pressable, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { eq } from '@tanstack/react-db';
import { SessionScreen } from './SessionScreen';
import { SplitLayout } from './SplitLayout';
import { SessionHeader } from './SessionHeader';
import { TabBar } from './TabBar';
import { VoiceInputArea } from './VoiceInputArea';
import { ModelSelectorSheet } from './ModelSelectorSheet';
import { AgentCommandSheet } from './AgentCommandSheet';
import {
  flattenServerMessage,
  type UIMessage as Message,
  type SessionValue,
  type ProjectValue,
  type ChangeValue,
  type ChangedFile,
  type WorktreeStatusValue,
} from '../lib/stream-db';
import type { Message as ServerMessage } from '../../server/src/types';
import type { ApiClient } from '../lib/api';
import { backendResourcesAtom } from '../lib/backend-streams';
import { useBackendStateQuery, useBackendEphemeralStateQuery } from '../lib/merged-query';
import { MergedStateQuery, type WithBackendUrl } from '../lib/merged-query';
import { useSessionStatus } from '../hooks/useSessionStatus';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { useHandsFreeMode } from '../hooks/useHandsFreeMode';
import { useModels } from '../hooks/useModels';
import { useAgents } from '../hooks/useAgents';
import { useCommands } from '../hooks/useCommands';
import { HandsFreeModePicker } from './HandsFreeModePicker';
import type { ConnectionInfo, NotificationSound } from '../__fixtures__/settings';
import type { ModelSelection, PendingCommand, HandsFreeMode } from '../state/settings';
import { handsFreeModeAtom } from '../state/settings';
import type { VoicePromptResult } from '../hooks/useHandsFreeMode';
import { lineSelectionAtom, type LineSelection } from '../state/line-selection';
import { Server, ChevronDown } from 'lucide-react-native';
import type { BackendConfig, BackendConnection, BackendUrl } from '../state/backends';
import { BackendSelectorSheet, type BackendOption } from './BackendSelectorSheet';

/** Settings type shared by both wrappers. */
export interface SessionSettings {
  connection: ConnectionInfo;
  backends: BackendConfig[];
  setBackends: (backends: BackendConfig[]) => void;
  connections: Record<BackendUrl, BackendConnection>;
  notificationSound: NotificationSound;
  setNotificationSound: (value: NotificationSound) => void;
  notificationSoundOptions: { label: string; value: NotificationSound }[];
  appVersion: string;
}

interface SessionViewProps {
  sessionId: string;
  backendUrl: BackendUrl;
  session: SessionValue;
  serverMessages: Message[];
  changes: ChangedFile[];
  isTabletLandscape: boolean;
  onMenuPress: () => void;
  onProjectsPress: () => void;
  settings: SessionSettings;
  onSendText: (text: string, model: ModelSelection | null, agent?: string) => Promise<void>;
  onSendAudio: (base64: string, mimeType: string, model: ModelSelection | null) => void;
  onExecuteCommand?: (command: string, args: string, model: ModelSelection | null) => Promise<void>;
  /** Walking-mode voice prompt handler. */
  onVoicePrompt?: (
    base64: string,
    mimeType: string,
    model: ModelSelection | null
  ) => Promise<VoicePromptResult>;
  onAbort?: () => void;
  /** Whether this is a new session (no session ID yet). Commands are disabled for new sessions. */
  isNewSession?: boolean;
  emptyMessage?: string;
  sessionModelInfo?: { modelID?: string; providerID?: string } | null;
  worktreeToggle?: React.ReactNode;
  /** Optional server selector element rendered below the worktree toggle (new sessions only). */
  serverSelector?: React.ReactNode;
}

/**
 * Shared rendering core for a session.
 * Both the existing-session and new-session wrappers render through this
 * component. It owns the optimistic voice-message merge, the audio recorder,
 * and delegates to SessionScreen / SplitLayout.
 */
export function SessionView({
  sessionId,
  backendUrl,
  session,
  serverMessages,
  changes,
  isTabletLandscape,
  onMenuPress,
  onProjectsPress,
  settings,
  onSendText,
  onSendAudio,
  onExecuteCommand,
  onVoicePrompt,
  onAbort,
  emptyMessage,
  sessionModelInfo,
  worktreeToggle,
  isNewSession,
  serverSelector,
}: SessionViewProps) {
  const sessionStatus = useSessionStatus(backendUrl, sessionId);
  const [activeTab, setActiveTab] = useState<'session' | 'changes'>('session');
  const [isSending, setIsSending] = useState(false);
  const [pendingVoiceMessages, setPendingVoiceMessages] = useState<Message[]>([]);
  const voiceIdCounter = useRef(0);
  const [modelSelectorVisible, setModelSelectorVisible] = useState(false);
  const [agentCommandSheetVisible, setAgentCommandSheetVisible] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [modePickerVisible, setModePickerVisible] = useState(false);
  const [handsFreeMode, setHandsFreeMode] = useAtom(handsFreeModeAtom);

  // Agent & command state
  const [agentOverride, setAgentOverride] = useState<string | null>(null);
  const [pendingCommand, setPendingCommand] = useState<PendingCommand | null>(null);

  const { agents } = useAgents(backendUrl);
  const { commands } = useCommands(backendUrl);

  // Effective agent: user override > "build"
  const effectiveAgent = agentOverride ?? 'build';

  // Agent display name
  const agentDisplayName = useMemo(() => {
    const agent = agents?.find((a) => a.name === effectiveAgent);
    return agent?.name ?? effectiveAgent;
  }, [agents, effectiveAgent]);

  // Worktree status from the ephemeral stream
  const { data: worktreeStatusResults } = useBackendEphemeralStateQuery<WorktreeStatusValue>(
    backendUrl,
    (db, q) =>
      q
        .from({ worktreeStatuses: db.collections.worktreeStatuses })
        .where(({ worktreeStatuses }) => eq(worktreeStatuses.sessionId, sessionId)),
    [sessionId]
  );
  const worktreeStatus = worktreeStatusResults?.[0];

  const resources = useAtomValue(backendResourcesAtom);
  const api = resources[backendUrl]?.api;

  const handleMerge = useCallback(async () => {
    if (!api) return;
    setIsMerging(true);
    try {
      await api.sessions.merge({ sessionId });
    } catch (err: any) {
      const data = err.data;
      if (data?.conflictingFiles?.length > 0) {
        Alert.alert(
          'Merge Conflict',
          `Conflicts in:\n${data.conflictingFiles.join('\n')}\n\nAsk the agent to rebase onto main and resolve the conflicts, then try again.`
        );
      } else {
        Alert.alert('Merge Failed', data?.reason ?? err.message ?? 'Unknown error');
      }
    } finally {
      setIsMerging(false);
    }
  }, [api, sessionId]);

  // Look up the project to derive the display name
  const { data: projectResults } = useBackendStateQuery<ProjectValue>(
    backendUrl,
    (db, q) =>
      q
        .from({ projects: db.collections.projects })
        .where(({ projects }) => eq(projects.id, session.projectID)),
    [session.projectID]
  );
  const project = projectResults?.[0];
  const worktree = project?.worktree ?? '';
  const sessionDir = session.directory ?? '';
  const projectDir = worktree.split('/').pop() ?? worktree;
  const worktreeDir = sessionDir.split('/').pop() ?? sessionDir;
  const projectName =
    sessionDir && sessionDir !== worktree ? `${projectDir} / ${worktreeDir}` : projectDir;

  const serverMessagesList = useMemo(() => serverMessages, [serverMessages]);

  const { catalog, getDisplayNames, getDefaultModel } = useModels(backendUrl);

  // Per-session model override — doesn't persist globally across sessions.
  const [modelOverride, setModelOverride] = useState<ModelSelection | null>(null);

  // Effective model: session override > session's last-used model > null (server default).
  const effectiveModel = useMemo<ModelSelection | null>(() => {
    if (modelOverride) return modelOverride;
    if (sessionModelInfo?.modelID && sessionModelInfo?.providerID) {
      return { modelID: sessionModelInfo.modelID, providerID: sessionModelInfo.providerID };
    }
    return null;
  }, [modelOverride, sessionModelInfo]);

  // Derive the model display name for the input area
  const modelName = useMemo(() => {
    if (effectiveModel) {
      const { modelName: mn } = getDisplayNames(effectiveModel.modelID, effectiveModel.providerID);
      return mn;
    }
    const dm = getDefaultModel();
    if (dm) {
      const { modelName: mn } = getDisplayNames(dm.modelID, dm.providerID);
      return mn;
    }
    return 'Default';
  }, [effectiveModel, getDisplayNames, getDefaultModel]);

  const handleModelPress = useCallback(() => {
    setModelSelectorVisible(true);
  }, []);

  // Clear pending voice messages once corresponding server messages arrive.
  // When a voice message is transcribed, the server returns a real user message
  // with a different ID. We detect this by checking for server-side user
  // messages that were created after our optimistic placeholder.
  useEffect(() => {
    if (pendingVoiceMessages.length === 0) return;

    const serverUserMessages = serverMessagesList.filter((m) => m.role === 'user');
    const latestServerUserTime =
      serverUserMessages.length > 0 ? Math.max(...serverUserMessages.map((m) => m.createdAt)) : 0;

    // Remove pending voice messages whose timestamp is at or before the latest
    // server user message — the server has caught up.
    const remaining = pendingVoiceMessages.filter((vm) => vm.createdAt > latestServerUserTime);

    if (remaining.length < pendingVoiceMessages.length) {
      setPendingVoiceMessages(remaining);
    }
  }, [serverMessagesList, pendingVoiceMessages]);

  // Merge optimistic voice messages with server messages
  const allMessages = useMemo(() => {
    const merged = [...serverMessagesList];
    for (const vm of pendingVoiceMessages) {
      merged.push(vm);
    }
    return merged;
  }, [serverMessagesList, pendingVoiceMessages]);

  // Shared helper: adds a pending voice message and sends audio to the server.
  const sendVoiceAudio = useCallback(
    (base64: string, mimeType: string) => {
      const pendingId = `voice-${++voiceIdCounter.current}`;
      setPendingVoiceMessages((prev) => [
        ...prev,
        {
          id: pendingId,
          sessionId,
          role: 'user',
          type: 'voice',
          content: '',
          audioUri: null,
          transcription: null,
          toolName: null,
          toolMeta: null,
          syncStatus: 'sending',
          createdAt: Date.now(),
          isComplete: false,
        },
      ]);
      onSendAudio(base64, mimeType, effectiveModel);
    },
    [sessionId, onSendAudio, effectiveModel]
  );

  const audioRecorder = useAudioRecorder({
    onSendAudio: sendVoiceAudio,
    onRecordingComplete: async () => {
      // After expo-av recording finishes, restore the playback session so
      // hands-free headphone button works again via A2DP.
      try {
        const HandsFreeMedia = (await import('../modules/hands-free-media')).default;
        await HandsFreeMedia?.restorePlaybackSession();
      } catch {
        // Module may not be available — that's fine
      }
    },
  });

  // Walking-mode voice prompt: wraps the onVoicePrompt callback with the
  // effective model selection.
  const handleVoicePrompt = useCallback(
    async (base64: string, mimeType: string): Promise<VoicePromptResult> => {
      if (!onVoicePrompt) return { action: 'forwarded' };
      return onVoicePrompt(base64, mimeType, effectiveModel);
    },
    [onVoicePrompt, effectiveModel]
  );

  // Hands-free mode: headphone button starts a CallKit call which records
  // via AVAudioEngine natively. The recorded audio is delivered to sendVoiceAudio.
  const handsFree = useHandsFreeMode(
    audioRecorder.recordingState,
    audioRecorder.startRecording,
    audioRecorder.stopRecording,
    sendVoiceAudio,
    onVoicePrompt ? handleVoicePrompt : undefined,
    sessionStatus
  );

  const handleSend = useCallback(
    async (text: string) => {
      setIsSending(true);
      try {
        if (pendingCommand && onExecuteCommand) {
          // Execute as a command — text becomes the arguments
          await onExecuteCommand(pendingCommand.name, text, effectiveModel);
          setPendingCommand(null);
        } else {
          await onSendText(text, effectiveModel, effectiveAgent);
        }
      } catch (err) {
        console.error('[SessionView] send failed:', err);
      } finally {
        setIsSending(false);
      }
    },
    [onSendText, onExecuteCommand, effectiveModel, effectiveAgent, pendingCommand]
  );

  const handleCloseModelSelector = useCallback(() => {
    setModelSelectorVisible(false);
  }, []);

  const handleModelSelect = useCallback((model: ModelSelection | null) => {
    setModelOverride(model);
  }, []);

  const handleAgentPress = useCallback(() => {
    setAgentCommandSheetVisible(true);
  }, []);

  const handleAgentSelect = useCallback((name: string) => {
    setAgentOverride(name);
  }, []);

  const handleCommandSelect = useCallback((cmd: PendingCommand) => {
    setPendingCommand(cmd);
  }, []);

  const modelSheet = (
    <ModelSelectorSheet
      visible={modelSelectorVisible}
      onClose={handleCloseModelSelector}
      catalog={catalog}
      selectedModel={effectiveModel}
      onSelectModel={handleModelSelect}
      defaultModel={getDefaultModel()}
      backendUrl={backendUrl}
    />
  );

  // Only show commands in the selector when on an existing session
  const sheetCommands = isNewSession ? null : commands;

  const agentCommandSheet = (
    <AgentCommandSheet
      visible={agentCommandSheetVisible}
      onClose={() => setAgentCommandSheetVisible(false)}
      agents={agents}
      commands={sheetCommands}
      currentAgent={effectiveAgent}
      onSelectAgent={handleAgentSelect}
      onSelectCommand={handleCommandSelect}
    />
  );

  if (isTabletLandscape) {
    return (
      <>
        <SplitLayout
          sessionId={sessionId}
          backendUrl={backendUrl}
          session={session}
          projectName={projectName}
          messages={allMessages}
          changes={changes}
          onMenuPress={onMenuPress}
          onProjectsPress={onProjectsPress}
          onToolCallPress={(messageId) => {
            // Tool call press is handled internally by SplitLayout
          }}
          onSend={handleSend}
          isSending={isSending}
          audioRecorder={audioRecorder}
          settings={settings}
          onAbort={onAbort}
          modelName={modelName}
          onModelPress={handleModelPress}
          agentName={agentDisplayName}
          onAgentPress={handleAgentPress}
          pendingCommand={pendingCommand}
          onClearCommand={() => setPendingCommand(null)}
          worktreeStatus={worktreeStatus}
          isMerging={isMerging}
          onMerge={handleMerge}
          onHandsFreeToggle={handsFree.isHandsFreeAvailable ? handsFree.toggle : undefined}
          onHandsFreeLongPress={() => setModePickerVisible(true)}
        />
        {modelSheet}
        {agentCommandSheet}
        <HandsFreeModePicker
          visible={modePickerVisible}
          onClose={() => setModePickerVisible(false)}
          mode={handsFreeMode}
          onModeChange={setHandsFreeMode}
        />
      </>
    );
  }

  return (
    <>
      <SessionScreen
        sessionId={sessionId}
        backendUrl={backendUrl}
        session={session}
        projectName={projectName}
        messages={allMessages}
        changes={changes}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onMenuPress={onMenuPress}
        onProjectsPress={onProjectsPress}
        onSend={handleSend}
        isSending={isSending}
        audioRecorder={audioRecorder}
        onAbort={onAbort}
        emptyMessage={emptyMessage}
        modelName={modelName}
        onModelPress={handleModelPress}
        agentName={agentDisplayName}
        onAgentPress={handleAgentPress}
        pendingCommand={pendingCommand}
        onClearCommand={() => setPendingCommand(null)}
        worktreeToggle={worktreeToggle}
        worktreeStatus={worktreeStatus}
        isMerging={isMerging}
        onMerge={handleMerge}
        serverSelector={serverSelector}
        onHandsFreeToggle={handsFree.isHandsFreeAvailable ? handsFree.toggle : undefined}
        onHandsFreeLongPress={() => setModePickerVisible(true)}
      />
      {modelSheet}
      {agentCommandSheet}
      <HandsFreeModePicker
        visible={modePickerVisible}
        onClose={() => setModePickerVisible(false)}
        mode={handsFreeMode}
        onModeChange={setHandsFreeMode}
      />
    </>
  );
}

interface SessionContentProps {
  sessionId: string;
  backendUrl: BackendUrl;
  isTabletLandscape: boolean;
  onMenuPress: () => void;
  onProjectsPress: () => void;
  settings: SessionSettings;
}

/**
 * Existing session wrapper.
 * Fetches real session data from the server and wires send callbacks that
 * prompt the existing session.
 */
export function SessionContent({
  sessionId,
  backendUrl,
  isTabletLandscape,
  onMenuPress,
  onProjectsPress,
  settings,
}: SessionContentProps) {
  const { data: sessionResults, isLoading: sessionLoading } = useBackendStateQuery<SessionValue>(
    backendUrl,
    (db, q) =>
      q
        .from({ sessions: db.collections.sessions })
        .where(({ sessions }) => eq(sessions.id, sessionId)),
    [sessionId]
  );
  const session = sessionResults?.[0] ?? null;

  if (sessionLoading || !session) {
    return <SessionLoading onMenuPress={onMenuPress} onProjectsPress={onProjectsPress} />;
  }

  return (
    <ExistingSessionDataLoader
      session={session}
      sessionId={sessionId}
      backendUrl={backendUrl}
      isTabletLandscape={isTabletLandscape}
      onMenuPress={onMenuPress}
      onProjectsPress={onProjectsPress}
      settings={settings}
    />
  );
}

// Separate component so hooks only mount when session exists
function ExistingSessionDataLoader({
  session,
  sessionId,
  backendUrl,
  isTabletLandscape,
  onMenuPress,
  onProjectsPress,
  settings,
}: {
  session: SessionValue;
  sessionId: string;
  backendUrl: BackendUrl;
  isTabletLandscape: boolean;
  onMenuPress: () => void;
  onProjectsPress: () => void;
  settings: SessionSettings;
}) {
  const resources = useAtomValue(backendResourcesAtom);
  const api = resources[backendUrl]?.api;

  // Line selection — read current value via ref so memoized callbacks stay stable
  const lineSelection = useAtomValue(lineSelectionAtom);
  const setLineSelection = useSetAtom(lineSelectionAtom);
  const lineSelectionRef = useRef<LineSelection | null>(lineSelection);
  lineSelectionRef.current = lineSelection;

  // Finalized messages from the instance stream
  const { data: instanceMessages } = useBackendStateQuery<ServerMessage>(
    backendUrl,
    (db, q) =>
      q
        .from({ messages: db.collections.messages })
        .where(({ messages }) => eq(messages.sessionId, sessionId)),
    [sessionId]
  );

  // In-progress messages from the ephemeral stream
  const { data: ephemeralMessages } = useBackendEphemeralStateQuery<ServerMessage>(
    backendUrl,
    (db, q) =>
      q
        .from({ messages: db.collections.messages })
        .where(({ messages }) => eq(messages.sessionId, sessionId)),
    [sessionId]
  );

  // Merge: instance messages (finalized) override ephemeral by message ID.
  // Ephemeral messages that don't exist in the instance stream are in-progress.
  const rawMessages = useMemo(() => {
    const instanceMap = new Map<string, ServerMessage>();
    for (const msg of instanceMessages ?? []) {
      instanceMap.set(msg.id, msg);
    }
    // Start with all instance messages
    const merged = new Map(instanceMap);
    // Add ephemeral messages that aren't finalized yet
    for (const msg of ephemeralMessages ?? []) {
      if (!merged.has(msg.id)) {
        merged.set(msg.id, msg);
      }
    }
    return [...merged.values()];
  }, [instanceMessages, ephemeralMessages]);

  const sortedRawMessages = useMemo(() => {
    return rawMessages.slice().sort((a, b) => a.createdAt - b.createdAt);
  }, [rawMessages]);

  const serverMessages = useMemo(() => {
    return sortedRawMessages.flatMap(flattenServerMessage);
  }, [sortedRawMessages]);

  const sessionModelInfo = useMemo(() => {
    for (let i = sortedRawMessages.length - 1; i >= 0; i--) {
      const m = sortedRawMessages[i];
      if (m.role === 'user' && m.modelID) {
        return { modelID: m.modelID, providerID: m.providerID };
      }
    }
    return null;
  }, [sortedRawMessages]);

  // File changes from the ephemeral stream (both live and finalized)
  const { data: changeResults } = useBackendEphemeralStateQuery<ChangeValue>(
    backendUrl,
    (db, q) =>
      q
        .from({ changes: db.collections.changes })
        .where(({ changes }) => eq(changes.sessionId, sessionId)),
    [sessionId]
  );
  const changes = useMemo(() => {
    return changeResults?.[0]?.files ?? [];
  }, [changeResults]);

  const handleSendText = useCallback(
    async (text: string, model: ModelSelection | null, agent?: string) => {
      if (!api) return;
      const currentSelection = lineSelectionRef.current;
      await api.sessions.prompt({
        sessionId,
        parts: [{ type: 'text' as const, text }],
        ...(model ? { model } : {}),
        ...(agent ? { agent } : {}),
        ...(currentSelection ? { lineReference: currentSelection } : {}),
      });
      // Clear line selection after successful send
      if (currentSelection) setLineSelection(null);
    },
    [api, sessionId, setLineSelection]
  );

  const handleSendAudio = useCallback(
    (base64: string, mimeType: string, model: ModelSelection | null) => {
      if (!api) return;
      const currentSelection = lineSelectionRef.current;
      api.sessions.prompt({
        sessionId,
        parts: [{ type: 'audio' as const, audioData: base64, mimeType }],
        ...(model ? { model } : {}),
        ...(currentSelection ? { lineReference: currentSelection } : {}),
      })
        .then(() => {
          // Clear line selection after successful send
          if (currentSelection) setLineSelection(null);
        })
        .catch((err) => {
          console.error('[SessionContent] audio prompt failed:', err);
        });
    },
    [api, sessionId, setLineSelection]
  );

  const handleExecuteCommand = useCallback(
    async (command: string, args: string, model: ModelSelection | null) => {
      if (!api) throw new Error('Not connected');
      await api.sessions.command({
        sessionId,
        command,
        arguments: args,
        ...(model ? { model } : {}),
      });
    },
    [api, sessionId]
  );

  const handleVoicePrompt = useCallback(
    async (
      base64: string,
      mimeType: string,
      model: ModelSelection | null
    ): Promise<VoicePromptResult> => {
      if (!api) throw new Error('Not connected');
      return await api.sessions.voicePrompt({
        sessionId,
        audioData: base64,
        mimeType,
        ...(model ? { model } : {}),
      });
    },
    [api, sessionId]
  );

  const handleAbort = useCallback(async () => {
    if (!api) return;
    try {
      await api.sessions.abort({ sessionId });
    } catch (err) {
      console.error('[SessionContent] abort failed:', err);
    }
  }, [api, sessionId]);

  return (
    <SessionView
      sessionId={sessionId}
      backendUrl={backendUrl}
      session={session}
      serverMessages={serverMessages}
      changes={changes}
      isTabletLandscape={isTabletLandscape}
      onMenuPress={onMenuPress}
      onProjectsPress={onProjectsPress}
      settings={settings}
      onSendText={handleSendText}
      onSendAudio={handleSendAudio}
      onExecuteCommand={handleExecuteCommand}
      onVoicePrompt={handleVoicePrompt}
      onAbort={handleAbort}
      sessionModelInfo={sessionModelInfo}
    />
  );
}

interface NewSessionContentProps {
  projectId: string;
  isTabletLandscape: boolean;
  onMenuPress: () => void;
  onProjectsPress: () => void;
  onSessionCreated: (sessionId: string, projectId: string, backendUrl: BackendUrl) => void;
  settings: SessionSettings;
}

/**
 * New-session wrapper.
 * Uses MergedStateQuery to find which backends have this project, then lets
 * the user pick which server to create the session on via a selector.
 * Connected backends are selectable; offline ones are shown but disabled.
 */
export function NewSessionContent({
  projectId,
  isTabletLandscape,
  onMenuPress,
  onProjectsPress,
  onSessionCreated,
  settings,
}: NewSessionContentProps) {
  const [selectedBackendUrl, setSelectedBackendUrl] = useState<BackendUrl | null>(null);

  return (
    <MergedStateQuery<ProjectValue>
      query={(db, q) =>
        q
          .from({ projects: db.collections.projects })
          .where(({ projects }) => eq(projects.id, projectId))
      }
      deps={[projectId]}>
      {({ data: projectResults, isLoading }) => {
        if (isLoading || !projectResults || projectResults.length === 0) {
          return <SessionLoading onMenuPress={onMenuPress} onProjectsPress={onProjectsPress} />;
        }

        // Build a set of backend URLs that host this project
        const backendUrlsWithProject = new Set(projectResults.map((p) => p.backendUrl));

        // Build BackendOption[] for all backends that host the project
        const backendOptions: BackendOption[] = settings.backends
          .filter((b) => b.enabled && backendUrlsWithProject.has(b.url))
          .map((config) => ({
            config,
            connection: settings.connections[config.url],
            hasProject: true,
          }));

        // Default to the first connected backend if no selection yet
        const connectedOptions = backendOptions.filter((o) => o.connection?.status === 'connected');
        const effectiveUrl =
          selectedBackendUrl && connectedOptions.some((o) => o.config.url === selectedBackendUrl)
            ? selectedBackendUrl
            : (connectedOptions[0]?.config.url ?? null);

        if (!effectiveUrl) {
          return <SessionLoading onMenuPress={onMenuPress} onProjectsPress={onProjectsPress} />;
        }

        // Look up the worktree from the matching project result
        const matchingProject = projectResults.find((p) => p.backendUrl === effectiveUrl);

        return (
          <NewSessionDataLoader
            projectId={projectId}
            backendUrl={effectiveUrl}
            worktree={matchingProject?.worktree ?? ''}
            isTabletLandscape={isTabletLandscape}
            onMenuPress={onMenuPress}
            onProjectsPress={onProjectsPress}
            onSessionCreated={onSessionCreated}
            settings={settings}
            backendOptions={backendOptions}
            selectedBackendUrl={effectiveUrl}
            onSelectBackend={setSelectedBackendUrl}
          />
        );
      }}
    </MergedStateQuery>
  );
}

function NewSessionDataLoader({
  projectId,
  backendUrl,
  worktree,
  isTabletLandscape,
  onMenuPress,
  onProjectsPress,
  onSessionCreated,
  settings,
  backendOptions,
  selectedBackendUrl,
  onSelectBackend,
}: {
  projectId: string;
  backendUrl: BackendUrl;
  worktree: string;
  isTabletLandscape: boolean;
  onMenuPress: () => void;
  onProjectsPress: () => void;
  onSessionCreated: (sessionId: string, projectId: string, backendUrl: BackendUrl) => void;
  settings: SessionSettings;
  backendOptions: BackendOption[];
  selectedBackendUrl: BackendUrl;
  onSelectBackend: (url: BackendUrl) => void;
}) {
  const resources = useAtomValue(backendResourcesAtom);
  const api = resources[backendUrl]?.api;
  const creatingRef = useRef(false);
  const [useWorktree, setUseWorktree] = useState(false);
  const [backendSelectorVisible, setBackendSelectorVisible] = useState(false);

  // Find the display name for the currently selected backend
  const selectedBackendName = useMemo(() => {
    const opt = backendOptions.find((o) => o.config.url === selectedBackendUrl);
    return opt?.config.name || 'Server';
  }, [backendOptions, selectedBackendUrl]);

  const now = Date.now();
  const placeholderSession: SessionValue = {
    id: 'new',
    title: 'New Session',
    directory: worktree,
    projectID: projectId,
    version: '',
    time: { created: now, updated: now },
  };

  const createAndPrompt = useCallback(
    async (
      parts: (
        | { type: 'text'; text: string }
        | { type: 'audio'; audioData: string; mimeType: string }
      )[],
      model: ModelSelection | null
    ) => {
      if (creatingRef.current || !api) return;
      creatingRef.current = true;

      try {
        const input = {
          projectId,
          parts,
          ...(model ? { model } : {}),
          ...(useWorktree ? { useWorktree: true } : {}),
        };
        console.log('create session input', input);
        const data = await api.projects.createSession(input);
        onSessionCreated(data.sessionId, projectId, backendUrl);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to create session';
        Alert.alert('Session Creation Failed', message);
      } finally {
        creatingRef.current = false;
      }
    },
    [api, projectId, backendUrl, onSessionCreated, useWorktree]
  );

  const handleSendText = useCallback(
    async (text: string, model: ModelSelection | null) => {
      await createAndPrompt([{ type: 'text', text }], model);
    },
    [createAndPrompt]
  );

  const handleSendAudio = useCallback(
    (base64: string, mimeType: string, model: ModelSelection | null) => {
      createAndPrompt([{ type: 'audio', audioData: base64, mimeType }], model).catch((err) => {
        console.error('[NewSessionContent] audio create + prompt failed:', err);
      });
    },
    [createAndPrompt]
  );

  // Only show the server selector when there are multiple backends hosting this project
  const showServerSelector = backendOptions.length > 1;

  return (
    <>
      <SessionView
        sessionId="new"
        backendUrl={backendUrl}
        session={placeholderSession}
        serverMessages={[]}
        changes={[]}
        isTabletLandscape={isTabletLandscape}
        onMenuPress={onMenuPress}
        onProjectsPress={onProjectsPress}
        settings={settings}
        onSendText={handleSendText}
        onSendAudio={handleSendAudio}
        isNewSession
        emptyMessage="Send a message to start a new session"
        worktreeToggle={
          <Pressable
            onPress={() => setUseWorktree((v) => !v)}
            className="mt-4 flex-row items-center gap-2 rounded-lg bg-stone-100 px-4 py-2 dark:bg-stone-900">
            <View
              className={`h-4 w-4 rounded border ${
                useWorktree
                  ? 'border-blue-500 bg-blue-500'
                  : 'border-stone-400 dark:border-stone-600'
              }`}
            />
            <Text className="text-sm text-stone-500 dark:text-stone-400">Run in worktree</Text>
          </Pressable>
        }
        serverSelector={
          showServerSelector ? (
            <Pressable
              onPress={() => setBackendSelectorVisible(true)}
              className="mt-2 flex-row items-center gap-2 rounded-lg bg-stone-100 px-4 py-2 dark:bg-stone-900">
              <Server size={14} color="#A8A29E" />
              <Text className="text-sm text-stone-500 dark:text-stone-400">
                {selectedBackendName}
              </Text>
              <ChevronDown size={12} color="#A8A29E" />
            </Pressable>
          ) : undefined
        }
      />
      {showServerSelector && (
        <BackendSelectorSheet
          visible={backendSelectorVisible}
          onClose={() => setBackendSelectorVisible(false)}
          options={backendOptions}
          selectedUrl={selectedBackendUrl}
          onSelect={onSelectBackend}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// SessionLoading — shown while the existing session is being fetched
// ---------------------------------------------------------------------------

function SessionLoading({
  onMenuPress,
  onProjectsPress,
}: {
  onMenuPress: () => void;
  onProjectsPress: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [textValue, setTextValue] = useState('');

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
        <Text className="text-center text-sm text-stone-400 dark:text-stone-600">
          Loading session...
        </Text>
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
        modelName="..."
      />
    </View>
  );
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}
