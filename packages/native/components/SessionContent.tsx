import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { View, Text, Pressable, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAtomValue } from 'jotai';
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
import { useBackendStateQuery } from '../lib/merged-query';
import { MergedStateQuery, type WithBackendUrl } from '../lib/merged-query';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { useModels } from '../hooks/useModels';
import { useAgents } from '../hooks/useAgents';
import { useCommands } from '../hooks/useCommands';
import type { ConnectionInfo, NotificationSound } from '../__fixtures__/settings';
import type { ModelSelection, PendingCommand } from '../state/settings';
import type { BackendConfig, BackendConnection, BackendUrl } from '../state/backends';

/** Settings type shared by both wrappers. */
export interface SessionSettings {
  connection: ConnectionInfo;
  backends: BackendConfig[];
  setBackends: (backends: BackendConfig[]) => void;
  connections: Record<BackendUrl, BackendConnection>;
  handsFreeAutoRecord: boolean;
  setHandsFreeAutoRecord: (value: boolean) => void;
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
  onAbort?: () => void;
  /** Whether this is a new session (no session ID yet). Commands are disabled for new sessions. */
  isNewSession?: boolean;
  emptyMessage?: string;
  sessionModelInfo?: { modelID?: string; providerID?: string } | null;
  worktreeToggle?: React.ReactNode;
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
  onAbort,
  emptyMessage,
  sessionModelInfo,
  worktreeToggle,
  isNewSession,
}: SessionViewProps) {
  const [activeTab, setActiveTab] = useState<'session' | 'changes'>('session');
  const [isSending, setIsSending] = useState(false);
  const [pendingVoiceMessages, setPendingVoiceMessages] = useState<Message[]>([]);
  const voiceIdCounter = useRef(0);
  const [modelSelectorVisible, setModelSelectorVisible] = useState(false);
  const [agentCommandSheetVisible, setAgentCommandSheetVisible] = useState(false);
  const [isMerging, setIsMerging] = useState(false);

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

  // Worktree status from this session's backend
  const { data: worktreeStatusResults } = useBackendStateQuery<WorktreeStatusValue>(
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
      const res = await (api.api.sessions[':sessionId'].merge as any).$post({
        param: { sessionId },
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.conflictingFiles?.length > 0) {
          Alert.alert(
            'Merge Conflict',
            `Conflicts in:\n${data.conflictingFiles.join('\n')}\n\nAsk the agent to rebase onto main and resolve the conflicts, then try again.`
          );
        } else {
          Alert.alert('Merge Failed', data.reason ?? data.error ?? 'Unknown error');
        }
      }
    } catch (err: any) {
      Alert.alert('Merge Failed', err.message ?? 'Unknown error');
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
    sessionDir && sessionDir !== worktree
      ? `${projectDir} / ${worktreeDir}`
      : projectDir;

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
    const latestServerUserTime = serverUserMessages.length > 0
      ? Math.max(...serverUserMessages.map((m) => m.createdAt))
      : 0;

    // Remove pending voice messages whose timestamp is at or before the latest
    // server user message — the server has caught up.
    const remaining = pendingVoiceMessages.filter(
      (vm) => vm.createdAt > latestServerUserTime
    );

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

  const audioRecorder = useAudioRecorder({
    onSendAudio: (base64, mimeType) => {
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
  });

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

  const handleModelSelect = useCallback(
    (model: ModelSelection | null) => {
      setModelOverride(model);
    },
    []
  );

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
        />
        {modelSheet}
        {agentCommandSheet}
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
      />
      {modelSheet}
      {agentCommandSheet}
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

  const { data: rawMessages } = useBackendStateQuery<ServerMessage>(
    backendUrl,
    (db, q) =>
      q
        .from({ messages: db.collections.messages })
        .where(({ messages }) => eq(messages.sessionId, sessionId)),
    [sessionId]
  );
  const sortedRawMessages = useMemo(() => {
    if (!rawMessages) return [];
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

  const { data: changeResults } = useBackendStateQuery<ChangeValue>(
    backendUrl,
    (db, q) =>
      q
        .from({ changes: db.collections.changes })
        .where(({ changes }) => eq(changes.sessionId, sessionId)),
    [sessionId]
  );
  const changes = useMemo(() => {
    const result = changeResults?.[0];
    return result?.files ?? [];
  }, [changeResults]);

  const handleSendText = useCallback(
    async (text: string, model: ModelSelection | null, agent?: string) => {
      if (!api) return;
      const res = await api.api.sessions[':sessionId'].prompt.$post({
        param: { sessionId },
        json: {
          parts: [{ type: 'text' as const, text }],
          ...(model ? { model } : {}),
          ...(agent ? { agent } : {}),
        },
      });
      if (!res.ok) throw new Error('Prompt failed');
    },
    [api, sessionId]
  );

  const handleSendAudio = useCallback(
    (base64: string, mimeType: string, model: ModelSelection | null) => {
      if (!api) return;
      api.api.sessions[':sessionId'].prompt
        .$post({
          param: { sessionId },
          json: {
            parts: [{ type: 'audio' as const, audioData: base64, mimeType }],
            ...(model ? { model } : {}),
          },
        })
        .catch((err) => {
          console.error('[SessionContent] audio prompt failed:', err);
        });
    },
    [api, sessionId]
  );

  const handleExecuteCommand = useCallback(
    async (command: string, args: string, model: ModelSelection | null) => {
      const res = await (api.api.sessions[':sessionId'].command as any).$post({
        param: { sessionId },
        json: {
          command,
          arguments: args,
          ...(model ? { model } : {}),
        },
      });
      if (!res.ok) throw new Error('Command failed');
    },
    [api, sessionId]
  );

  const handleAbort = useCallback(async () => {
    if (!api) return;
    try {
      const res = await (api.api.sessions[':sessionId'].abort as any).$post({
        param: { sessionId },
      });
      if (!res.ok) console.error('[SessionContent] abort failed');
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
 * Uses MergedStateQuery to find which backends have this project, picks the
 * first one, and wires send callbacks that create the session on that backend.
 */
export function NewSessionContent({
  projectId,
  isTabletLandscape,
  onMenuPress,
  onProjectsPress,
  onSessionCreated,
  settings,
}: NewSessionContentProps) {
  return (
    <MergedStateQuery<ProjectValue>
      query={(db, q) =>
        q
          .from({ projects: db.collections.projects })
          .where(({ projects }) => eq(projects.id, projectId))
      }
      deps={[projectId]}
    >
      {({ data: projectResults, isLoading }) => {
        const taggedProject = projectResults?.[0];
        if (isLoading || !taggedProject) {
          return <SessionLoading onMenuPress={onMenuPress} onProjectsPress={onProjectsPress} />;
        }
        return (
          <NewSessionDataLoader
            projectId={projectId}
            backendUrl={taggedProject.backendUrl}
            worktree={taggedProject.worktree}
            isTabletLandscape={isTabletLandscape}
            onMenuPress={onMenuPress}
            onProjectsPress={onProjectsPress}
            onSessionCreated={onSessionCreated}
            settings={settings}
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
}: {
  projectId: string;
  backendUrl: BackendUrl;
  worktree: string;
  isTabletLandscape: boolean;
  onMenuPress: () => void;
  onProjectsPress: () => void;
  onSessionCreated: (sessionId: string, projectId: string, backendUrl: BackendUrl) => void;
  settings: SessionSettings;
}) {
  const resources = useAtomValue(backendResourcesAtom);
  const api = resources[backendUrl]?.api;
  const creatingRef = useRef(false);
  const [useWorktree, setUseWorktree] = useState(false);

  const now = Date.now();
  const placeholderSession: SessionValue = {
    id: 'new',
    title: 'New Session',
    directory: worktree,
    projectID: projectId,
    version: '',
    time: { created: now, updated: now },
    status: 'idle',
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
        const res = await api.api.projects[':projectId'].sessions.$post({
          param: { projectId },
          json: {
            parts,
            ...(model ? { model } : {}),
            ...(useWorktree ? { useWorktree: true } : {}),
          } as any,
        });
        if (!res.ok) throw new Error('Create session failed');
        const data = (await res.json()) as { sessionId: string };
        onSessionCreated(data.sessionId, projectId, backendUrl);
      } catch (err) {
        console.error('[NewSessionContent] createSessionWithPrompt failed:', err);
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

  return (
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
              useWorktree ? 'border-blue-500 bg-blue-500' : 'border-stone-400 dark:border-stone-600'
            }`}
          />
          <Text className="text-sm text-stone-500 dark:text-stone-400">Run in worktree</Text>
        </Pressable>
      }
    />
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
