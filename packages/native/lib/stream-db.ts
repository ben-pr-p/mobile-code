export {
  flattenServerMessage,
  globalStateDef,
  PERSISTED_COLLECTION_NAMES,
  STATE_STREAM_COLLECTIONS,
  EPHEMERAL_STREAM_COLLECTIONS,
  APP_STREAM_COLLECTIONS,
};
export type {
  BackendProjectValue,
  BackendProjectValue as ProjectValue,
  SessionValue,
  SessionStatusValue,
  ChangeValue,
  WorktreeStatusValue,
  PermissionRequestValue,
  PendingTranscriptionValue,
  SessionMetaValue,
  BackendConfigValue,
  BackendConnectionValue,
  PingValue,
  StreamOffsetValue,
  UIMessage,
  ToolMeta,
};
export type { ChangedFile, ToolCallStatus } from '../../server/src/types';

import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { Message, ChangedFile } from '../../server/src/types';

function passthrough<T>(): StandardSchemaV1<T> {
  return {
    '~standard': {
      version: 1 as const,
      vendor: 'passthrough',
      validate: (v: unknown) => ({ value: v as T }),
    },
  };
}

// ---------------------------------------------------------------------------
// Server-synced value types (backendUrl is stamped by EventDispatcher)
// ---------------------------------------------------------------------------

/**
 * A project as seen from a specific backend. The same physical project can
 * appear on multiple backends — each backend produces its own row.
 * Key: `${backendUrl}:${projectId}` (composite).
 */
type BackendProjectValue = {
  /** Composite key: `${backendUrl}:${projectId}` */
  id: string;
  /** The original project ID from the server */
  projectId: string;
  backendUrl: string;
  worktree: string;
  vcsDir?: string;
  vcs?: 'git';
  time: { created: number; initialized?: number };
};

type SessionValue = {
  id: string;
  backendUrl: string;
  title: string;
  directory: string;
  projectID: string;
  parentID?: string;
  version: string;
  summary?: { additions: number; deletions: number; files: number };
  share?: { url: string };
  time: { created: number; updated: number };
};

type SessionStatusValue = {
  sessionId: string;
  backendUrl: string;
  status: 'idle' | 'busy' | 'error';
  error?: string;
};

type ChangeValue = {
  sessionId: string;
  backendUrl: string;
  files: ChangedFile[];
};

type WorktreeStatusValue = {
  sessionId: string;
  backendUrl: string;
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

type PermissionRequestValue = {
  sessionId: string;
  backendUrl: string;
  requestId: string;
  permission: string;
  patterns: string[];
  description: string;
};

/**
 * Pending transcription status for a voice message, keyed by the client-generated
 * message ID. Delivered via the ephemeral stream so the client can show real-time
 * transcription progress without local state.
 */
type PendingTranscriptionValue = {
  messageId: string;
  sessionId: string;
  backendUrl: string;
  status: 'uploading' | 'upload-confirmed' | 'transcribing' | 'completed' | 'forwarded';
  /** The transcribed text, available when status is 'completed' or 'forwarded'. */
  text?: string;
};

type SessionMetaValue = {
  sessionId: string;
  backendUrl: string;
  archived: boolean;
};

// ---------------------------------------------------------------------------
// Local-only value types (client-written, no sync)
// ---------------------------------------------------------------------------

/** Backend server configuration. Replaces the old backendsAtom. */
type BackendConfigValue = {
  /** Unique ID — stable key, generated on create */
  id: string;
  /** The server URL (editable) */
  url: string;
  /** Human-readable label */
  name: string;
  /** Backend type — affects UI hints and icons */
  type: 'local' | 'sprite';
  /** Whether this backend is active */
  enabled: boolean;
  /** Optional bearer token for authenticated backends */
  authToken?: string;
};

/** Live connection state for a backend. Ephemeral (not persisted). */
type BackendConnectionValue = {
  /** The server URL — primary key */
  url: string;
  status: 'connected' | 'reconnecting' | 'error' | 'offline';
  instanceId: string | null;
  latencyMs: number | null;
  error: string | null;
};

type PingValue = {
  /** The backend URL — primary key */
  url: string;
  /** Timestamp when the ping was created (used for UI cleanup) */
  createdAt: number;
};

/** Persisted stream offset for resuming a durable stream from where we left off. */
type StreamOffsetValue = {
  /** The full stream URL — primary key */
  url: string;
  /** Opaque offset string from the durable streams protocol */
  offset: string;
};

// ---------------------------------------------------------------------------
// Collection definitions — server-synced
// ---------------------------------------------------------------------------

const stateDef = {
  backendProjects: {
    schema: passthrough<BackendProjectValue>(),
    type: 'project' as const,
    // Composite key is set by the EventDispatcher's backendUrl stamper:
    // `${backendUrl}:${originalProjectId}`
    primaryKey: 'id' as const,
  },
  sessions: {
    schema: passthrough<SessionValue>(),
    type: 'session' as const,
    primaryKey: 'id' as const,
  },
  messages: {
    schema: passthrough<Message & { backendUrl: string }>(),
    type: 'message' as const,
    primaryKey: 'id' as const,
  },
};

const ephemeralStateDef = {
  sessionStatuses: {
    schema: passthrough<SessionStatusValue>(),
    type: 'sessionStatus' as const,
    primaryKey: 'sessionId' as const,
  },
  pendingMessages: {
    schema: passthrough<Message & { backendUrl: string }>(),
    type: 'message' as const,
    primaryKey: 'id' as const,
  },
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
  permissionRequests: {
    schema: passthrough<PermissionRequestValue>(),
    type: 'permissionRequest' as const,
    primaryKey: 'sessionId' as const,
  },
  pendingTranscriptions: {
    schema: passthrough<PendingTranscriptionValue>(),
    type: 'pendingTranscription' as const,
    primaryKey: 'messageId' as const,
  },
};

const appStateDef = {
  sessionMeta: {
    schema: passthrough<SessionMetaValue>(),
    type: 'sessionMeta' as const,
    primaryKey: 'sessionId' as const,
  },
};

// ---------------------------------------------------------------------------
// Collection definitions — local-only (no sync, client-written)
// ---------------------------------------------------------------------------

const localDef = {
  backends: {
    schema: passthrough<BackendConfigValue>(),
    type: 'backend' as const,
    primaryKey: 'id' as const,
  },
  backendConnections: {
    schema: passthrough<BackendConnectionValue>(),
    type: 'backendConnection' as const,
    primaryKey: 'url' as const,
  },
  pings: {
    schema: passthrough<PingValue>(),
    type: 'ping' as const,
    primaryKey: 'url' as const,
  },
  streamOffsets: {
    schema: passthrough<StreamOffsetValue>(),
    type: 'streamOffset' as const,
    primaryKey: 'url' as const,
  },
};

// ---------------------------------------------------------------------------
// Global state definition — one DB for the entire app
// ---------------------------------------------------------------------------

/**
 * All collections in a single global DB.
 *
 * Server-synced collections have `backendUrl` stamped on every row by the
 * EventDispatcher. `backendProjects` uses a composite key (`backendUrl:projectId`)
 * since the same project can appear on multiple backends.
 *
 * Local-only collections (`backends`, `backendConnections`) are written directly
 * by the client — no sync config, no stream.
 */
const globalStateDef = {
  // State stream (persisted)
  backendProjects: stateDef.backendProjects,
  sessions: stateDef.sessions,
  messages: stateDef.messages,
  // Ephemeral stream (not persisted)
  sessionStatuses: ephemeralStateDef.sessionStatuses,
  pendingMessages: ephemeralStateDef.pendingMessages,
  changes: ephemeralStateDef.changes,
  worktreeStatuses: ephemeralStateDef.worktreeStatuses,
  permissionRequests: ephemeralStateDef.permissionRequests,
  pendingTranscriptions: ephemeralStateDef.pendingTranscriptions,
  // App stream (persisted)
  sessionMeta: appStateDef.sessionMeta,
  // Local-only
  backends: localDef.backends,
  backendConnections: localDef.backendConnections,
  pings: localDef.pings,
  streamOffsets: localDef.streamOffsets,
};

type GlobalStateDef = typeof globalStateDef;

/**
 * Collection names that should be persisted to SQLite.
 * Ephemeral and connection-status collections are excluded.
 */
const PERSISTED_COLLECTION_NAMES = new Set([
  'backendProjects',
  'sessions',
  'messages',
  'sessionMeta',
  'backends', // local-only but persisted (user config)
  'streamOffsets', // local-only but persisted (resume offsets)
]);

/**
 * Which collections each stream feeds. Used by appendStreamToDb().
 */
const STATE_STREAM_COLLECTIONS = ['backendProjects', 'sessions', 'messages'] as const;
const EPHEMERAL_STREAM_COLLECTIONS = [
  'sessionStatuses',
  'pendingMessages',
  'changes',
  'worktreeStatuses',
  'permissionRequests',
  'pendingTranscriptions',
] as const;
const APP_STREAM_COLLECTIONS = ['sessionMeta'] as const;

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
  syncStatus: 'synced' | 'pending' | 'sending' | 'uploading' | 'transcribing' | 'forwarded' | 'failed';
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
