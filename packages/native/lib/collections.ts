// Polyfill must run before any TanStack DB code — idempotent, safe to import multiple times
import './polyfills';

/**
 * All TanStack DB collections for the app.
 *
 * Collections are created at module scope, following the TanStack DB pattern.
 * Stream-fed collections use a capturing sync config so that appendStreamToDb()
 * can attach streams to them later. Local-only collections have a no-op sync.
 *
 * Import individual collections directly in components:
 *   import { collections } from '../lib/collections'
 */
import { open } from '@op-engineering/op-sqlite';
import { createCollection } from '@tanstack/db';
import { localOnlyCollectionOptions } from '@tanstack/db';
import {
  createReactNativeSQLitePersistence,
  persistedCollectionOptions,
} from '@tanstack/react-native-db-sqlite-persistence';
import { createCapturingSyncConfig } from './durable-streams';
import type { Collection } from '@tanstack/db';
import type { OpSQLiteDatabaseLike } from '@tanstack/react-native-db-sqlite-persistence';
import type { CollectionEntry, CollectionDefinition } from './durable-streams';
import type {
  BackendProjectValue,
  SessionValue,
  SessionStatusValue,
  ChangeValue,
  WorktreeStatusValue,
  PermissionRequestValue,
  SessionMetaValue,
  BackendConfigValue,
  BackendConnectionValue,
} from './stream-db';
import type { Message } from '../../server/src/types';

// ---------------------------------------------------------------------------
// Shared SQLite persistence
// ---------------------------------------------------------------------------

const database = open({ name: 'flockcode.sqlite' }) as unknown as OpSQLiteDatabaseLike;
const persistence = createReactNativeSQLitePersistence<any, string>({ database });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a persisted, stream-fed collection. */
function createPersistedStreamCollection<T extends object>(
  id: string,
  definition: CollectionDefinition,
  getKey: (item: T) => string,
  schemaVersion = 1
) {
  const { syncConfig, getCallbacks } = createCapturingSyncConfig();
  const collection = createCollection<T, string>(
    persistedCollectionOptions<T, string>({
      id,
      getKey,
      sync: syncConfig,
      startSync: true,
      gcTime: 0,
      persistence,
      schemaVersion,
    })
  );
  return { collection, getCallbacks, definition };
}

/** Create a non-persisted, stream-fed collection. */
function createEphemeralStreamCollection<T extends object>(
  id: string,
  definition: CollectionDefinition,
  getKey: (item: T) => string
) {
  const { syncConfig, getCallbacks } = createCapturingSyncConfig();
  const collection = createCollection<T, string>({
    id,
    getKey,
    sync: syncConfig,
    startSync: true,
    gcTime: 0,
  });
  return { collection, getCallbacks, definition };
}

/** Create a local-only persisted collection (client-written, SQLite-backed). */
function createLocalPersistedCollection<T extends object>(
  id: string,
  definition: CollectionDefinition,
  getKey: (item: T) => string,
  schemaVersion = 1
) {
  const collection = createCollection<T, string>(
    persistedCollectionOptions<T, string>({
      ...localOnlyCollectionOptions<T, string>({
        id,
        getKey,
      }),
      persistence,
      schemaVersion,
    })
  );
  return { collection, getCallbacks: () => null, definition };
}

/** Create a local-only non-persisted collection (client-written, in-memory). */
function createLocalEphemeralCollection<T extends object>(
  id: string,
  definition: CollectionDefinition,
  getKey: (item: T) => string
) {
  const collection = createCollection<T, string>(
    localOnlyCollectionOptions<T, string>({
      id,
      getKey,
    })
  );
  return { collection, getCallbacks: () => null, definition };
}

// ---------------------------------------------------------------------------
// Import definitions from stream-db.ts (used for type/schema info)
// ---------------------------------------------------------------------------

// We re-import the defs to get the schema and type/primaryKey metadata.
// These are lightweight objects (no side effects).
import {
  globalStateDef,
  STATE_STREAM_COLLECTIONS,
  EPHEMERAL_STREAM_COLLECTIONS,
  APP_STREAM_COLLECTIONS,
} from './stream-db';

// ---------------------------------------------------------------------------
// Stream-fed persisted collections
// ---------------------------------------------------------------------------

const _backendProjects = createPersistedStreamCollection<BackendProjectValue>(
  'backendProjects',
  globalStateDef.backendProjects,
  (item) => String(item.id)
);

const _sessions = createPersistedStreamCollection<SessionValue>(
  'sessions',
  globalStateDef.sessions,
  (item) => String(item.id)
);

const _messages = createPersistedStreamCollection<Message & { backendUrl: string }>(
  'messages',
  globalStateDef.messages,
  (item) => String(item.id)
);

const _sessionMeta = createPersistedStreamCollection<SessionMetaValue>(
  'sessionMeta',
  globalStateDef.sessionMeta,
  (item) => String(item.sessionId)
);

// ---------------------------------------------------------------------------
// Stream-fed ephemeral collections
// ---------------------------------------------------------------------------

const _sessionStatuses = createEphemeralStreamCollection<SessionStatusValue>(
  'sessionStatuses',
  globalStateDef.sessionStatuses,
  (item) => String(item.sessionId)
);

const _pendingMessages = createEphemeralStreamCollection<Message & { backendUrl: string }>(
  'pendingMessages',
  globalStateDef.pendingMessages,
  (item) => String(item.id)
);

const _changes = createEphemeralStreamCollection<ChangeValue>(
  'changes',
  globalStateDef.changes,
  (item) => String(item.sessionId)
);

const _worktreeStatuses = createEphemeralStreamCollection<WorktreeStatusValue>(
  'worktreeStatuses',
  globalStateDef.worktreeStatuses,
  (item) => String(item.sessionId)
);

const _permissionRequests = createEphemeralStreamCollection<PermissionRequestValue>(
  'permissionRequests',
  globalStateDef.permissionRequests,
  (item) => String(item.sessionId)
);

// ---------------------------------------------------------------------------
// Local-only collections
// ---------------------------------------------------------------------------

const _backends = createLocalPersistedCollection<BackendConfigValue>(
  'backends',
  globalStateDef.backends,
  (item) => item.id,
  2 // bumped from 1: key changed from url to id
);

const _backendConnections = createLocalEphemeralCollection<BackendConnectionValue>(
  'backendConnections',
  globalStateDef.backendConnections,
  (item) => String(item.url)
);

// ---------------------------------------------------------------------------
// Exported collections object — import this in components and hooks
// ---------------------------------------------------------------------------

/**
 * All TanStack DB collections. Import and use directly in queries:
 *
 * ```ts
 * import { collections } from '../lib/collections';
 * useLiveQuery((q) => q.from({ sessions: collections.sessions }));
 * ```
 */
export const collections = {
  backendProjects: _backendProjects.collection,
  sessions: _sessions.collection,
  messages: _messages.collection,
  sessionMeta: _sessionMeta.collection,
  sessionStatuses: _sessionStatuses.collection,
  pendingMessages: _pendingMessages.collection,
  changes: _changes.collection,
  worktreeStatuses: _worktreeStatuses.collection,
  permissionRequests: _permissionRequests.collection,
  backends: _backends.collection,
  backendConnections: _backendConnections.collection,
};

// ---------------------------------------------------------------------------
// Collection entries (used by appendStreamToDb to wire up streams)
// ---------------------------------------------------------------------------

/** Collection entries by name — includes definition + sync callbacks for stream wiring. */
export const collectionEntries = {
  backendProjects: _backendProjects,
  sessions: _sessions,
  messages: _messages,
  sessionMeta: _sessionMeta,
  sessionStatuses: _sessionStatuses,
  pendingMessages: _pendingMessages,
  changes: _changes,
  worktreeStatuses: _worktreeStatuses,
  permissionRequests: _permissionRequests,
  backends: _backends,
  backendConnections: _backendConnections,
};

export { STATE_STREAM_COLLECTIONS, EPHEMERAL_STREAM_COLLECTIONS, APP_STREAM_COLLECTIONS };
