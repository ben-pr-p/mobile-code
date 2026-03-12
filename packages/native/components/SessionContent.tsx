import React, { useState, useCallback, useMemo, useRef } from 'react';
import { View, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAtomValue } from 'jotai';
import { eq } from '@tanstack/react-db';
import { SessionScreen } from './SessionScreen';
import { SplitLayout } from './SplitLayout';
import { SessionHeader } from './SessionHeader';
import { TabBar } from './TabBar';
import { VoiceInputArea } from './VoiceInputArea';
import { ModelSelectorSheet, type RecentModel } from './ModelSelectorSheet';
import {
  useStateQuery,
  flattenServerMessage,
  type UIMessage as Message,
  type SessionValue,
  type ChangeValue,
  type ChangedFile,
} from '../lib/stream-db';
import type { Message as ServerMessage } from '../../server/src/types';
import { apiClientAtom } from '../lib/api';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { useModels } from '../hooks/useModels';
import { selectedModelAtom } from '../state/settings';
import type { ConnectionInfo, NotificationSound } from '../__fixtures__/settings';

// ---------------------------------------------------------------------------
// Settings type shared by both wrappers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// SessionView — the shared rendering core
// ---------------------------------------------------------------------------
// Both the existing-session and new-session wrappers render through this
// component. It owns the optimistic voice-message merge, the audio recorder,
// and delegates to SessionScreen / SplitLayout.

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
  onAbort,
  emptyMessage,
  sessionModelInfo,
}: SessionViewProps) {
  const [activeTab, setActiveTab] = useState<'session' | 'changes'>('session');
  const [isSending, setIsSending] = useState(false);
  const [pendingVoiceMessages, setPendingVoiceMessages] = useState<Message[]>([]);
  const voiceIdCounter = useRef(0);
  const [modelSelectorVisible, setModelSelectorVisible] = useState(false);

  // Model selection state
  const { selectedModel, setSelectedModel, catalog, getDisplayNames, getDefaultModel, refetchCatalog } = useModels();

  // Query all messages to derive recently used models
  const { data: allRawMessages } = useStateQuery(
    (db, q) => q.from({ messages: db.collections.messages }),
  );
  const recentModels: RecentModel[] = useMemo(() => {
    if (!allRawMessages) return [];
    const msgs = allRawMessages as ServerMessage[];
    // Build a map of modelID+providerID -> latest timestamp
    const seen = new Map<string, RecentModel>();
    for (const m of msgs) {
      if (m.modelID && m.providerID) {
        const key = `${m.providerID}/${m.modelID}`;
        const existing = seen.get(key);
        if (!existing || m.createdAt > existing.lastUsedAt) {
          seen.set(key, {
            modelID: m.modelID,
            providerID: m.providerID,
            lastUsedAt: m.createdAt,
          });
        }
      }
    }
    // Sort newest-first, take top 5
    return Array.from(seen.values())
      .sort((a, b) => b.lastUsedAt - a.lastUsedAt)
      .slice(0, 5);
  }, [allRawMessages]);

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
      const { modelName: mn, providerName: pn } = getDisplayNames(selectedModel.modelID, selectedModel.providerID);
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
    [setSelectedModel],
  );

  const modelSheet = (
    <ModelSelectorSheet
      visible={modelSelectorVisible}
      onClose={() => setModelSelectorVisible(false)}
      catalog={catalog}
      selectedModel={selectedModel}
      onSelectModel={handleModelSelect}
      defaultModel={getDefaultModel()}
      recentModels={recentModels}
    />
  );

  if (isTabletLandscape) {
    return (
      <>
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
          settings={{ ...settings, defaultModel: settingsDefaultModel, onResyncConfig: refetchCatalog }}
          onAbort={onAbort}
          modelName={modelName}
          onModelPress={handleModelPress}
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
      />
      {modelSheet}
    </>
  );
}

// ---------------------------------------------------------------------------
// SessionContent — existing session wrapper
// ---------------------------------------------------------------------------
// Fetches real session data from the server and wires send callbacks that
// prompt the existing session.

interface SessionContentProps {
  sessionId: string;
  isTabletLandscape: boolean;
  onMenuPress: () => void;
  onProjectsPress: () => void;
  settings: SessionSettings;
}

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
    return (rawMessages as ServerMessage[])
      .slice()
      .sort((a, b) => a.createdAt - b.createdAt);
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

// ---------------------------------------------------------------------------
// NewSessionContent — new session wrapper
// ---------------------------------------------------------------------------
// Provides a placeholder session and wires send callbacks that create the
// session on the server (via the atomic createSessionWithPrompt RPC) before
// navigating to the real session.

interface NewSessionContentProps {
  projectId: string;
  isTabletLandscape: boolean;
  onMenuPress: () => void;
  onProjectsPress: () => void;
  onSessionCreated: (sessionId: string, projectId: string) => void;
  settings: SessionSettings;
}

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
          },
        });
        if (!res.ok) throw new Error('Create session failed');
        const data = (await res.json()) as { sessionId: string };
        onSessionCreated(data.sessionId, projectId);
      } catch (err) {
        console.error('[NewSessionContent] createSessionWithPrompt failed:', err);
        creatingRef.current = false;
      }
    },
    [api, projectId, onSessionCreated, currentModel]
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
