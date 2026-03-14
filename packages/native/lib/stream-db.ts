export { useStateQuery, useAppStateQuery, flattenServerMessage };
export type {
  ProjectValue,
  SessionValue,
  ChangeValue,
  WorktreeStatusValue,
  SessionMetaValue,
  StateDB,
  AppStateDB,
  UIMessage,
  ToolMeta,
};
export type { ChangedFile, ToolCallStatus } from '../../server/src/types';

import { atom } from 'jotai';
import { useAtomValue } from 'jotai/react';
import { createStreamDB, createStateSchema } from '@durable-streams/state';
import type { StreamDB } from '@durable-streams/state';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { useLiveQuery } from '@tanstack/react-db';
import type { InitialQueryBuilder, Context, QueryBuilder } from '@tanstack/react-db';
import { debouncedServerUrlAtom } from '../state/settings';
import type { Message, ChangedFile, ToolCallStatus } from '../../server/src/types';

function passthrough<T>(): StandardSchemaV1<T> {
  return {
    '~standard': {
      version: 1 as const,
      vendor: 'passthrough',
      validate: (v: unknown) => ({ value: v as T }),
    },
  };
}

type ProjectValue = {
  id: string;
  worktree: string;
  vcsDir?: string;
  vcs?: 'git';
  time: { created: number; initialized?: number };
};

type SessionValue = {
  id: string;
  title: string;
  directory: string;
  projectID: string;
  parentID?: string;
  version: string;
  summary?: { additions: number; deletions: number; files: number };
  share?: { url: string };
  time: { created: number; updated: number };
  status: 'idle' | 'busy' | 'error';
  error?: string;
};

type ChangeValue = {
  sessionId: string;
  files: ChangedFile[];
};

type WorktreeStatusValue = {
  sessionId: string;
  isWorktreeSession: boolean;
  branch?: string;
  /** Whether the branch has been merged into main (via --no-ff). */
  merged?: boolean;
  /** Whether there are commits on the branch not yet in main. */
  hasUnmergedCommits?: boolean;
  /** Whether the worktree has staged or unstaged changes. */
  hasUncommittedChanges?: boolean;
  error?: string;
};

const stateDef = {
  projects: {
    schema: passthrough<ProjectValue>(),
    type: 'project' as const,
    primaryKey: 'id' as const,
  },
  sessions: {
    schema: passthrough<SessionValue>(),
    type: 'session' as const,
    primaryKey: 'id' as const,
  },
  messages: { schema: passthrough<Message>(), type: 'message' as const, primaryKey: 'id' as const },
  changes: {
    schema: passthrough<ChangeValue>(),
    type: 'change' as const,
    primaryKey: 'sessionId' as const,
  },
  worktreeStatuses: {
    schema: passthrough<WorktreeStatusValue>(),
    type: 'worktreeStatus' as const,
    primaryKey: 'sessionId' as const,
  },
};

type StateDef = typeof stateDef;
type StateDB = StreamDB<StateDef>;

const stateSchema = createStateSchema(stateDef);

// --- Persistent app state (archive status, etc.) ---

type SessionMetaValue = {
  sessionId: string;
  archived: boolean;
};

const appStateDef = {
  sessionMeta: {
    schema: passthrough<SessionMetaValue>(),
    type: 'sessionMeta' as const,
    primaryKey: 'sessionId' as const,
  },
};

type AppStateDef = typeof appStateDef;
type AppStateDB = StreamDB<AppStateDef>;

const appStateSchema = createStateSchema(appStateDef);

const instanceIdAtom = atom(async (get) => {
  const serverUrl = get(debouncedServerUrlAtom).replace(/\/$/, '');
  try {
    const res = await fetch(`${serverUrl}/`);
    if (!res.ok) return null;
    const { instanceId } = await res.json();
    return instanceId as string;
  } catch {
    return null;
  }
});

const dbAtom = atom(async (get) => {
  const serverUrl = get(debouncedServerUrlAtom).replace(/\/$/, '');
  const instanceId = await get(instanceIdAtom);

  if (!instanceId) return { db: null, loading: true };

  try {
    const db = createStreamDB({
      streamOptions: { url: `${serverUrl}/${instanceId}` },
      state: stateSchema,
    }) as StateDB;

    await db.preload();
    return { db, loading: false };
  } catch {
    return { db: null, loading: true };
  }
});

const appDbAtom = atom(async (get) => {
  const serverUrl = get(debouncedServerUrlAtom).replace(/\/$/, '');
  try {
    const db = createStreamDB({
      streamOptions: { url: `${serverUrl}/app` }, // fixed URL, no instanceId
      state: appStateSchema,
    }) as AppStateDB;

    await db.preload();
    return { db, loading: false };
  } catch {
    return { db: null, loading: true };
  }
});

// UI types derived from stream state

/** Tool call state passed through to the UI via `toolMeta`. */
type ToolMeta = {
  status: ToolCallStatus;
  input?: Record<string, unknown>;
  output?: string;
  title?: string;
  error?: string;
  metadata?: Record<string, unknown>;
  time?: { start: number; end?: number; compacted?: number };
};

type UIMessage = {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  type: 'text' | 'voice' | 'tool_call' | 'status';
  content: string;
  audioUri: string | null;
  transcription: string | null;
  toolName: string | null;
  toolMeta: ToolMeta | null;
  syncStatus: 'synced' | 'pending' | 'sending' | 'failed';
  createdAt: number;
  isComplete: boolean;
};

function flattenServerMessage(msg: Message): UIMessage[] {
  const messages: UIMessage[] = [];
  const isComplete = msg.role === 'user' || !!msg.finish;

  for (const part of msg.parts) {
    switch (part.type) {
      case 'text': {
        const prev = messages[messages.length - 1];
        if (prev && prev.type === 'text' && prev.role === msg.role) {
          prev.content += part.text;
        } else {
          messages.push({
            id: part.id,
            sessionId: msg.sessionId,
            role: msg.role,
            type: 'text',
            content: part.text,
            audioUri: null,
            transcription: null,
            toolName: null,
            toolMeta: null,
            syncStatus: 'synced',
            createdAt: msg.createdAt,
            isComplete,
          });
        }
        break;
      }
      case 'tool':
        messages.push({
          id: part.id,
          sessionId: msg.sessionId,
          role: msg.role,
          type: 'tool_call',
          content: part.state.title || part.state.error || part.tool,
          audioUri: null,
          transcription: null,
          toolName: part.tool,
          toolMeta: part.state as ToolMeta,
          syncStatus: 'synced',
          createdAt: msg.createdAt,
          isComplete,
        });
        break;
    }
  }

  if (messages.length === 0 && msg.parts.length > 0) {
    messages.push({
      id: msg.id,
      sessionId: msg.sessionId,
      role: msg.role,
      type: 'text',
      content: '',
      audioUri: null,
      transcription: null,
      toolName: null,
      toolMeta: null,
      syncStatus: 'synced',
      createdAt: msg.createdAt,
      isComplete,
    });
  }

  return messages;
}

function useStateQuery<TContext extends Context>(
  queryFn: (db: StateDB, q: InitialQueryBuilder) => QueryBuilder<TContext> | undefined | null,
  deps: unknown[] = []
) {
  const { db, loading } = useAtomValue(dbAtom);
  const result = useLiveQuery((q) => db && queryFn(db, q), [db, ...deps]);
  if (!db) return { data: null, isLoading: true, error: null };
  return { ...result, isLoading: loading || result.isLoading };
}

function useAppStateQuery<TContext extends Context>(
  queryFn: (db: AppStateDB, q: InitialQueryBuilder) => QueryBuilder<TContext> | undefined | null,
  deps: unknown[] = []
) {
  const { db, loading } = useAtomValue(appDbAtom);
  const result = useLiveQuery((q) => db && queryFn(db, q), [db, ...deps]);
  if (!db) return { data: null, isLoading: true, error: null };
  return { ...result, isLoading: loading || result.isLoading };
}
