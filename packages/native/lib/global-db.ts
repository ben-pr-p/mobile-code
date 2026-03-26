/**
 * Global DB singleton — one DB for the entire app.
 *
 * Created once at module load time. All backends' streams attach to it via
 * appendStreamToDb(). Local-only collections (backends, backendConnections)
 * are written to directly by the client.
 */
import { createDbWithNoStreams } from './durable-streams';
import { createPersistedCollectionFn } from './persistence';
import {
  globalStateDef,
  PERSISTED_COLLECTION_NAMES,
  type GlobalDB,
} from './stream-db';

/** Collection names that are local-only (no sync, client-written). */
const LOCAL_COLLECTION_NAMES = new Set(['backends', 'backendConnections']);

/**
 * The single global DB instance. All collections for all backends live here.
 *
 * - Server-synced collections are fed by streams attached via appendStreamToDb()
 * - Local-only collections (backends, backendConnections) are written directly
 * - Persisted collections are backed by SQLite via op-sqlite
 */
export const globalDb = createDbWithNoStreams({
  state: globalStateDef,
  createCollectionFn: createPersistedCollectionFn(PERSISTED_COLLECTION_NAMES),
  localCollectionNames: LOCAL_COLLECTION_NAMES,
}) as GlobalDB & { _entries: Map<string, any> };
