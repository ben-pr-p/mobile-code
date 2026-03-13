import React, { useState, useCallback, useMemo, useRef } from 'react';
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
import {
  useStateQuery,
  flattenServerMessage,
  type UIMessage as Message,
  type SessionValue,
  type ProjectValue,
  type ChangeValue,
  type ChangedFile,
} from '../lib/stream-db';
import type { Message as ServerMessage } from '../../server/src/types';
import { apiClientAtom } from '../lib/api';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { useModels } from '../hooks/useModels';
import { selectedModelAtom } from '../state/settings';
import type { ConnectionInfo, NotificationSound } from '../__fixtures__/settings';

/** Settings type shared by both wrappers. */
export interface SessionSettings {
  serverUrl: string;
  setServerUrl: (url: string) => void;
  connection: ConnectionInfo;
  handsFreeAutoRecord: boolean;
  setHandsFreeAutoRecord: (value: boolean) => void;
  notificationSound: NotificationSound;
  setNotificationSound: (value: NotificationSound) => void;
  notificationSoundOptions: { label: string; value: NotificationSound }[];
  appVersion: string;
  defaultModel: string;
  onResyncConfig?: () => Promise<void>;
}

interface SessionViewProps {
  sessionId: string;
  session: SessionValue;
  serverMessages: Message[];
  changes: ChangedFile[];
  isTabletLandscape: boolean;
  onMenuPress: () => void;
  onProjectsPress: () => void;
  settings: SessionSettings;
  onSendText: (text: string) => Promise<void>;
  onSendAudio: (base64: string, mimeType: string) => void;
  onAbort?: () => void;
  emptyMessage?: string;
  /** Latest model info from the session's raw messages (for display name derivation) */
  sessionModelInfo?: { modelID?: string; providerID?: string } | null;
  /** Optional toggle element rendered below the empty message (used by new-session for worktree option) */
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
  session,
  serverMessages,
  changes,
  isTabletLandscape,
  onMenuPress,
  onProjectsPress,
  settings,
  onSendText,
  onSendAudio,
  onAbort,
  emptyMessage,
  sessionModelInfo,
  worktreeToggle,
}: SessionViewProps) {
  const [activeTab, setActiveTab] = useState<'session' | 'changes'>('session');
  const [isSending, setIsSending] = useState(false);
  const [pendingVoiceMessages, setPendingVoiceMessages] = useState<Message[]>([]);
  const voiceIdCounter = useRef(0);
  const [modelSelectorVisible, setModelSelectorVisible] = useState(false);
  const [isMerging, setIsMerging] = useState(false);

  // Worktree status (merge state + uncommitted changes) from the session stream
  const { data: worktreeStatusResults } = useStateQuery(
    (db, q) =>
      q
        .from({ worktreeStatuses: db.collections.worktreeStatuses })
        .where(({ worktreeStatuses }) => eq(worktreeStatuses.sessionId, sessionId)),
    [sessionId]
  );

  const worktreeStatus = (
    worktreeStatusResults as import('../lib/stream-db').WorktreeStatusValue[] | undefined
  )?.[0];

  console.log({ worktreeStatus });

  const api = useAtomValue(apiClientAtom);

  const handleMerge = useCallback(async () => {
    setIsMerging(true);
    try {
      const res = await (api.api.sessions[':sessionId'].merge as any).$post({
        param: { sessionId },
      });
      const data = await res.json();
      if (res.ok) {
        Alert.alert('Merged', 'Branch merged into main successfully.');
      } else if (data.conflictingFiles?.length > 0) {
        Alert.alert(
          'Merge Conflict',
          `Conflicts in:\n${data.conflictingFiles.join('\n')}\n\nAsk the agent to rebase onto main and resolve the conflicts, then try again.`
        );
      } else {
        Alert.alert('Merge Failed', data.reason ?? data.error ?? 'Unknown error');
      }
    } catch (err: any) {
      Alert.alert('Merge Failed', err.message ?? 'Unknown error');
    } finally {
      setIsMerging(false);
    }
  }, [api, sessionId]);

  // Look up the project to derive the display name from the main worktree path
  const { data: projectResults } = useStateQuery(
    (db, q) =>
      q
        .from({ projects: db.collections.projects })
        .where(({ projects }) => eq(projects.id, session.projectID)),
    [session.projectID]
  );
  const project = (projectResults as ProjectValue[] | undefined)?.[0];

  // Derive display name: show the project's main directory name, with the
  // worktree directory in parentheses when the session runs in a different path.
  const projectDisplayName = useMemo(() => {
    const projectWorktree = project?.worktree ?? '';
    const sessionDir = session.directory ?? '';
    const mainName = projectWorktree.split('/').pop() || projectWorktree || '';
    if (!mainName) return sessionDir.split('/').pop() || sessionDir;
    if (sessionDir && sessionDir !== projectWorktree) {
      const worktreeName = sessionDir.split('/').pop() || sessionDir;
      return `${mainName} (${worktreeName})`;
    }
    return mainName;
  }, [project?.worktree, session.directory]);

  // Model selection state
  const {
    selectedModel,
    setSelectedModel,
    catalog,
    getDisplayNames,
    getDefaultModel,
    refetchCatalog,
  } = useModels();

  // Merge server messages with optimistic voice messages, removing optimistic
  // ones once the server has caught up (new user message appeared)
  const messages = useMemo(() => {
    if (pendingVoiceMessages.length === 0) return serverMessages;

    // Find the latest server user message timestamp
    const latestServerUserMsg = serverMessages
      .filter((m) => m.role === 'user')
      .reduce((latest, m) => Math.max(latest, m.createdAt), 0);

    // Keep only pending messages that are newer than the latest server user message
    const stillPending = pendingVoiceMessages.filter((m) => m.createdAt > latestServerUserMsg);

    // Clean up stale pending messages
    if (stillPending.length !== pendingVoiceMessages.length) {
      setPendingVoiceMessages(stillPending);
    }

    return [...serverMessages, ...stillPending];
  }, [serverMessages, pendingVoiceMessages]);

  const handleSend = useCallback(
    async (text: string) => {
      setIsSending(true);
      try {
        await onSendText(text);
      } catch (err) {
        console.error('[SessionView] send failed:', err);
      } finally {
        setIsSending(false);
      }
    },
    [onSendText]
  );

  const handleSendAudio = useCallback(
    (base64: string, mimeType: string) => {
      // Add an optimistic voice message immediately
      const optimisticId = `voice-pending-${++voiceIdCounter.current}`;
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
        isComplete: true,
      };
      setPendingVoiceMessages((prev) => [...prev, optimisticMsg]);

      onSendAudio(base64, mimeType);
    },
    [sessionId, onSendAudio]
  );

  const audioRecorder = useAudioRecorder({ onSendAudio: handleSendAudio });

  // Derive model display names — prefer user's explicit selection, then fall
  // back to the session's latest model info, then the server default.
  const modelName = useMemo(() => {
    if (selectedModel) {
      return getDisplayNames(selectedModel.modelID, selectedModel.providerID).modelName;
    }
    if (sessionModelInfo?.modelID) {
      return getDisplayNames(sessionModelInfo.modelID, sessionModelInfo.providerID).modelName;
    }
    const defaultModel = getDefaultModel();
    if (defaultModel) {
      return getDisplayNames(defaultModel.modelID, defaultModel.providerID).modelName;
    }
    return 'Default';
  }, [selectedModel, sessionModelInfo, getDisplayNames, getDefaultModel]);

  // Display string for settings screen's "Default model" row
  const settingsDefaultModel = useMemo(() => {
    if (selectedModel) {
      const { modelName: mn, providerName: pn } = getDisplayNames(
        selectedModel.modelID,
        selectedModel.providerID
      );
      return pn ? `${pn} / ${mn}` : mn;
    }
    const dm = getDefaultModel();
    if (dm) {
      const { modelName: mn, providerName: pn } = getDisplayNames(dm.modelID, dm.providerID);
      return pn ? `${pn} / ${mn}` : mn;
    }
    return settings.defaultModel;
  }, [selectedModel, getDisplayNames, getDefaultModel, settings.defaultModel]);

  const handleModelPress = useCallback(() => {
    setModelSelectorVisible(true);
  }, []);

  const handleModelSelect = useCallback(
    (model: { providerID: string; modelID: string } | null) => {
      setSelectedModel(model);
    },
    [setSelectedModel]
  );

  const modelSheet = (
    <ModelSelectorSheet
      visible={modelSelectorVisible}
      onClose={() => setModelSelectorVisible(false)}
      catalog={catalog}
      selectedModel={selectedModel}
      onSelectModel={handleModelSelect}
      defaultModel={getDefaultModel()}
    />
  );

  if (isTabletLandscape) {
    return (
      <>
        <SplitLayout
          sessionId={sessionId}
          session={session}
          projectName={projectDisplayName}
          messages={messages}
          changes={changes}
          onMenuPress={onMenuPress}
          onProjectsPress={onProjectsPress}
          onToolCallPress={() => {}}
          onSend={handleSend}
          isSending={isSending}
          audioRecorder={audioRecorder}
          settings={{
            ...settings,
            defaultModel: settingsDefaultModel,
            onResyncConfig: refetchCatalog,
          }}
          onAbort={onAbort}
          modelName={modelName}
          onModelPress={handleModelPress}
          worktreeStatus={worktreeStatus}
          isMerging={isMerging}
          onMerge={handleMerge}
        />
        {modelSheet}
      </>
    );
  }

  return (
    <>
      <SessionScreen
        sessionId={sessionId}
        session={session}
        projectName={projectDisplayName}
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
        onAbort={onAbort}
        emptyMessage={emptyMessage}
        modelName={modelName}
        onModelPress={handleModelPress}
        worktreeToggle={worktreeToggle}
        worktreeStatus={worktreeStatus}
        isMerging={isMerging}
        onMerge={handleMerge}
      />
      {modelSheet}
    </>
  );
}

interface SessionContentProps {
  sessionId: string;
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
  isTabletLandscape,
  onMenuPress,
  onProjectsPress,
  settings,
}: SessionContentProps) {
  const { data: sessionResults, isLoading: sessionLoading } = useStateQuery(
    (db, q) =>
      q
        .from({ sessions: db.collections.sessions })
        .where(({ sessions }) => eq(sessions.id, sessionId)),
    [sessionId]
  );
  const session = (sessionResults as SessionValue[] | undefined)?.[0] ?? null;

  if (sessionLoading || !session) {
    return <SessionLoading onMenuPress={onMenuPress} onProjectsPress={onProjectsPress} />;
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
  );
}

// Separate component so hooks only mount when session exists
function ExistingSessionDataLoader({
  session,
  sessionId,
  isTabletLandscape,
  onMenuPress,
  onProjectsPress,
  settings,
}: {
  session: SessionValue;
  sessionId: string;
  isTabletLandscape: boolean;
  onMenuPress: () => void;
  onProjectsPress: () => void;
  settings: SessionSettings;
}) {
  const api = useAtomValue(apiClientAtom);
  const currentModel = useAtomValue(selectedModelAtom);

  const { data: rawMessages } = useStateQuery(
    (db, q) =>
      q
        .from({ messages: db.collections.messages })
        .where(({ messages }) => eq(messages.sessionId, sessionId)),
    [sessionId]
  );
  const sortedRawMessages = useMemo(() => {
    if (!rawMessages) return [];
    return (rawMessages as ServerMessage[]).slice().sort((a, b) => a.createdAt - b.createdAt);
  }, [rawMessages]);

  const serverMessages = useMemo(() => {
    return sortedRawMessages.flatMap(flattenServerMessage);
  }, [sortedRawMessages]);

  // Derive the session's current model from the latest user message with model info
  const sessionModelInfo = useMemo(() => {
    for (let i = sortedRawMessages.length - 1; i >= 0; i--) {
      const m = sortedRawMessages[i];
      if (m.role === 'user' && m.modelID) {
        return { modelID: m.modelID, providerID: m.providerID };
      }
    }
    return null;
  }, [sortedRawMessages]);

  const { data: changeResults } = useStateQuery(
    (db, q) =>
      q
        .from({ changes: db.collections.changes })
        .where(({ changes }) => eq(changes.sessionId, sessionId)),
    [sessionId]
  );
  const changes = useMemo(() => {
    const result = (changeResults as ChangeValue[] | undefined)?.[0];
    return result?.files ?? [];
  }, [changeResults]);

  const handleSendText = useCallback(
    async (text: string) => {
      const res = await api.api.sessions[':sessionId'].prompt.$post({
        param: { sessionId },
        json: {
          parts: [{ type: 'text' as const, text }],
          ...(currentModel ? { model: currentModel } : {}),
        },
      });
      if (!res.ok) throw new Error('Prompt failed');
    },
    [api, sessionId, currentModel]
  );

  const handleSendAudio = useCallback(
    (base64: string, mimeType: string) => {
      api.api.sessions[':sessionId'].prompt
        .$post({
          param: { sessionId },
          json: {
            parts: [{ type: 'audio' as const, audioData: base64, mimeType }],
            ...(currentModel ? { model: currentModel } : {}),
          },
        })
        .catch((err) => {
          console.error('[SessionContent] audio prompt failed:', err);
        });
    },
    [api, sessionId, currentModel]
  );

  const handleAbort = useCallback(async () => {
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
      session={session}
      serverMessages={serverMessages}
      changes={changes}
      isTabletLandscape={isTabletLandscape}
      onMenuPress={onMenuPress}
      onProjectsPress={onProjectsPress}
      settings={settings}
      onSendText={handleSendText}
      onSendAudio={handleSendAudio}
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
  onSessionCreated: (sessionId: string, projectId: string) => void;
  settings: SessionSettings;
}

/**
 * New-session wrapper.
 * Provides a placeholder session and wires send callbacks that create the
 * session on the server (via the atomic createSessionWithPrompt RPC) before
 * navigating to the real session.
 */
export function NewSessionContent({
  projectId,
  isTabletLandscape,
  onMenuPress,
  onProjectsPress,
  onSessionCreated,
  settings,
}: NewSessionContentProps) {
  const api = useAtomValue(apiClientAtom);
  const currentModel = useAtomValue(selectedModelAtom);
  // Guard against multiple simultaneous session creations
  const creatingRef = useRef(false);
  // Whether to create a git worktree for this session (for parallel work)
  const [useWorktree, setUseWorktree] = useState(false);

  // Look up the project to get worktree for display name
  const { data: projectResults } = useStateQuery(
    (db, q) =>
      q
        .from({ projects: db.collections.projects })
        .where(({ projects }) => eq(projects.id, projectId)),
    [projectId]
  );
  const project = (projectResults as import('../lib/stream-db').ProjectValue[] | undefined)?.[0];
  const worktree = project?.worktree ?? '';

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
      )[]
    ) => {
      if (creatingRef.current) return;
      creatingRef.current = true;

      try {
        const res = await api.api.projects[':projectId'].sessions.$post({
          param: { projectId },
          json: {
            parts,
            ...(currentModel ? { model: currentModel } : {}),
            ...(useWorktree ? { useWorktree: true } : {}),
          } as any,
        });
        if (!res.ok) throw new Error('Create session failed');
        const data = (await res.json()) as { sessionId: string };
        onSessionCreated(data.sessionId, projectId);
      } catch (err) {
        console.error('[NewSessionContent] createSessionWithPrompt failed:', err);
        creatingRef.current = false;
      }
    },
    [api, projectId, onSessionCreated, currentModel, useWorktree]
  );

  const handleSendText = useCallback(
    async (text: string) => {
      await createAndPrompt([{ type: 'text', text }]);
    },
    [createAndPrompt]
  );

  const handleSendAudio = useCallback(
    (base64: string, mimeType: string) => {
      createAndPrompt([{ type: 'audio', audioData: base64, mimeType }]).catch((err) => {
        console.error('[NewSessionContent] audio create + prompt failed:', err);
      });
    },
    [createAndPrompt]
  );

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
