import { useEffect, useRef } from 'react';
import { useLiveQuery } from '@tanstack/react-db';
import { appendStreamToDb, type StreamHandle } from '../lib/durable-streams';
import { collections, collectionEntries } from '../lib/collections';
import {
  STATE_STREAM_COLLECTIONS,
  EPHEMERAL_STREAM_COLLECTIONS,
  APP_STREAM_COLLECTIONS,
  type BackendConfigValue,
  type BackendConnectionValue,
} from '../lib/stream-db';

const POLL_INTERVAL = 10_000;

/** Composite key collections whose keys are rewritten to `${backendUrl}:${originalKey}` */
const COMPOSITE_KEY_COLLECTIONS = new Set(['backendProjects']);

interface PerBackendState {
  instanceId: string | null;
  stateStream: StreamHandle | null;
  ephemeralStream: StreamHandle | null;
  appStream: StreamHandle | null;
  intervalId: ReturnType<typeof setInterval> | null;
  abortController: AbortController | null;
  cancelled: boolean;
}

/**
 * Core orchestration hook that manages connections to all enabled backends.
 *
 * Reads backend configs from the global DB's `backends` collection (local-only,
 * persisted). For each enabled backend:
 * 1. Poll GET /health every 10s — returns instanceId + health status
 * 2. Write connection status to `backendConnections` collection
 * 3. Detect instanceId changes (server restart) -> close instance-scoped
 *    streams, create new ones against the new instanceId
 * 4. Attach state/ephemeral/app streams to the global DB with backendUrl stamping
 *
 * Mount once at the app root.
 */
export function useBackendManager() {
  // Read backend configs from the global DB's local-only collection
  const { data: backendConfigs } = useLiveQuery(
    (q) => q.from({ backends: collections.backends }),
    []
  );

  // Track per-backend state across renders
  const stateRef = useRef<Map<string, PerBackendState>>(new Map());

  useEffect(() => {
    if (!backendConfigs) return;

    const enabledBackends = (backendConfigs as BackendConfigValue[]).filter((b) => b.enabled);
    const enabledUrls = new Set(enabledBackends.map((b) => b.url));

    const toTearDown = [...stateRef.current.keys()].filter((url) => !enabledUrls.has(url));
    const toStart = enabledBackends.filter((b) => !stateRef.current.has(b.url));

    // --- Tear down removed backends ---
    for (const url of toTearDown) {
      const state = stateRef.current.get(url);
      if (state) tearDown(state);
      stateRef.current.delete(url);
      // Remove connection status
      updateConnection(url, null);
    }

    // --- Initialize and start polling for new backends ---
    for (const backend of toStart) {
      const perBackend: PerBackendState = {
        instanceId: null,
        stateStream: null,
        ephemeralStream: null,
        appStream: null,
        intervalId: null,
        abortController: null,
        cancelled: false,
      };
      stateRef.current.set(backend.url, perBackend);

      // Set initial connection state
      updateConnection(backend.url, {
        url: backend.url,
        status: 'reconnecting',
        instanceId: null,
        latencyMs: null,
        error: null,
      });

      startPolling(backend, perBackend);
    }
  }, [backendConfigs]);

  // Tear down all backends only on unmount
  useEffect(() => {
    return () => {
      for (const [, state] of stateRef.current) {
        tearDown(state);
      }
      stateRef.current.clear();
    };
  }, []);
}

/**
 * Write or delete a backend connection status in the global DB's
 * backendConnections collection.
 */
function updateConnection(url: string, value: BackendConnectionValue | null) {
  if (value === null) {
    try {
      collections.backendConnections.delete(url);
    } catch {
      /* ignore if not found */
    }
  } else {
    try {
      collections.backendConnections.insert(value);
    } catch {
      // Already exists — update instead
      collections.backendConnections.update(url, (draft: any) => {
        Object.assign(draft, value);
      });
    }
  }
}

function authHeaders(authToken?: string): Record<string, string> {
  return authToken ? { Authorization: `Bearer ${authToken}` } : {};
}

function startPolling(backend: BackendConfigValue, state: PerBackendState) {
  async function poll() {
    if (state.cancelled) return;

    state.abortController?.abort();
    const controller = new AbortController();
    state.abortController = controller;

    const cleanUrl = backend.url.replace(/\/$/, '');
    const url = cleanUrl + '/health';
    const start = Date.now();

    try {
      const headers: Record<string, string> = {};
      if (backend.authToken) {
        headers.Authorization = `Bearer ${backend.authToken}`;
      }

      const res = await fetch(url, {
        signal: controller.signal,
        headers,
      });
      if (state.cancelled) return;

      if (!res.ok) {
        updateConnection(backend.url, {
          url: backend.url,
          status: 'error',
          instanceId: state.instanceId,
          latencyMs: null,
          error: `HTTP ${res.status}`,
        });
        return;
      }

      const latency = Date.now() - start;
      const data = await res.json();
      const newInstanceId = data.instanceId as string | undefined;

      console.log('[poll]', {
        newInstanceId,
        currentInstanceId: state.instanceId,
        willAttachStreams: !!(newInstanceId && newInstanceId !== state.instanceId),
      });

      // Detect instanceId change (server restart)
      if (newInstanceId && newInstanceId !== state.instanceId) {
        // Close old instance-scoped streams (state + ephemeral)
        closeStreamSafe(state.stateStream);
        closeStreamSafe(state.ephemeralStream);
        state.stateStream = null;
        state.ephemeralStream = null;

        state.instanceId = newInstanceId;

        // Attach state stream (instance-scoped)
        try {
          const stateStream = appendStreamToDb(collectionEntries, {
            streamOptions: {
              url: `${cleanUrl}/${newInstanceId}`,
              ...{ headers: authHeaders(backend.authToken) },
            },
            collectionNames: [...STATE_STREAM_COLLECTIONS],
            backendUrl: backend.url,
            compositeKeyCollections: COMPOSITE_KEY_COLLECTIONS,
          });
          await stateStream.preload();
          state.stateStream = stateStream;
          console.log('[poll] State stream attached', backend.url);
        } catch (err) {
          console.error(
            `[useBackendManager] Failed to attach state stream for ${backend.url}:`,
            err
          );
        }

        // Attach ephemeral stream (instance-scoped)
        try {
          const ephemeralStream = appendStreamToDb(collectionEntries, {
            streamOptions: {
              url: `${cleanUrl}/${newInstanceId}/ephemeral`,
              ...{ headers: authHeaders(backend.authToken) },
            },
            collectionNames: [...EPHEMERAL_STREAM_COLLECTIONS],
            backendUrl: backend.url,
          });
          await ephemeralStream.preload();
          state.ephemeralStream = ephemeralStream;
          console.log('[poll] Ephemeral stream attached', backend.url);
        } catch (err) {
          console.error(
            `[useBackendManager] Failed to attach ephemeral stream for ${backend.url}:`,
            err
          );
        }

        // Attach app stream (only once — survives instanceId changes)
        if (!state.appStream) {
          try {
            const appStream = appendStreamToDb(collectionEntries, {
              streamOptions: {
                url: `${cleanUrl}/app`,
                ...{ headers: authHeaders(backend.authToken) },
              },
              collectionNames: [...APP_STREAM_COLLECTIONS],
              backendUrl: backend.url,
            });
            await appStream.preload();
            state.appStream = appStream;
            console.log('[poll] App stream attached', backend.url);
          } catch (err) {
            console.error(
              `[useBackendManager] Failed to attach app stream for ${backend.url}:`,
              err
            );
          }
        }
      }

      // Update connection status
      updateConnection(backend.url, {
        url: backend.url,
        status: 'connected',
        instanceId: newInstanceId ?? state.instanceId,
        latencyMs: latency,
        error: null,
      });
    } catch (err: any) {
      if (state.cancelled) return;
      if (err.name === 'AbortError') return;

      updateConnection(backend.url, {
        url: backend.url,
        status: 'error',
        instanceId: state.instanceId,
        latencyMs: null,
        error: err.message || 'Connection failed',
      });
    }
  }

  poll();
  state.intervalId = setInterval(poll, POLL_INTERVAL);
}

function closeStreamSafe(handle: StreamHandle | null) {
  if (!handle) return;
  try {
    handle.close();
  } catch {
    /* ignore */
  }
}

function tearDown(state: PerBackendState) {
  state.cancelled = true;
  if (state.intervalId) clearInterval(state.intervalId);
  state.abortController?.abort();
  closeStreamSafe(state.stateStream);
  closeStreamSafe(state.ephemeralStream);
  closeStreamSafe(state.appStream);
}
