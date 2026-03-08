export { useStateQuery, flattenServerMessage };
export type { ProjectValue, SessionValue, StateDB, UIMessage };

import { atom } from 'jotai';
import { useAtomValue } from 'jotai/react';
import { createStreamDB, createStateSchema } from '@durable-streams/state';
import type { StreamDB } from '@durable-streams/state';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { useLiveQuery } from '@tanstack/react-db';
import type { InitialQueryBuilder, Context, QueryBuilder } from '@tanstack/react-db';
import { debouncedServerUrlAtom } from '../state/settings';
import type { Message } from '../../server/src/types';

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
};

type StateDef = typeof stateDef;
type StateDB = StreamDB<StateDef>;

const stateSchema = createStateSchema(stateDef);

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

// UI types derived from stream state

type UIMessage = {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  type: 'text' | 'voice' | 'tool_call' | 'tool_output' | 'status';
  content: string;
  audioUri: string | null;
  transcription: string | null;
  toolName: string | null;
  toolMeta: Record<string, unknown> | null;
  syncStatus: 'synced' | 'pending' | 'sending' | 'failed';
  createdAt: number;
};

function flattenServerMessage(msg: Message): UIMessage[] {
  const messages: UIMessage[] = [];

  for (const part of msg.parts) {
    switch (part.type) {
      case 'text':
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
        });
        break;
      case 'tool':
        messages.push({
          id: part.id,
          sessionId: msg.sessionId,
          role: msg.role,
          type: 'tool_call',
          content: part.state.title || part.tool,
          audioUri: null,
          transcription: null,
          toolName: part.tool,
          toolMeta: part.state as Record<string, unknown>,
          syncStatus: 'synced',
          createdAt: msg.createdAt,
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
