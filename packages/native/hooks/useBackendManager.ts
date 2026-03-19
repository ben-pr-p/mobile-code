import { useEffect, useRef } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { loadable } from 'jotai/utils';
import { hc } from 'hono/client';
import { createStreamDB } from '@durable-streams/state';
import type { AppType } from '../../server/src/app';
import {
  backendsAtom,
  backendConnectionsAtom,
  type BackendConfig,
  type BackendConnection,
  type BackendUrl,
} from '../state/backends';
import { backendResourcesAtom, type BackendResources } from '../lib/backend-streams';
import { stateSchema, appStateSchema, type StateDB, type AppStateDB } from '../lib/stream-db';
import type { ApiClient } from '../lib/api';

const POLL_INTERVAL = 10_000;

interface PerBackendState {
  instanceId: string | null;
  db: StateDB | null;
  appDb: AppStateDB | null;
  api: ApiClient | null;
  intervalId: ReturnType<typeof setInterval> | null;
  abortController: AbortController | null;
  cancelled: boolean;
}

/**
 * Creates an authenticated Hono RPC client for a backend.
 * If authToken is provided, injects the Authorization header on every request.
 */
function createApiClient(url: string, authToken?: string): ApiClient {
  const cleanUrl = url.replace(/\/$/, '');
  if (authToken) {
    return hc<AppType>(cleanUrl, {
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, {
          ...init,
          headers: {
            ...(init?.headers as Record<string, string>),
            Authorization: `Bearer ${authToken}`,
          },
        }),
    });
  }
  return hc<AppType>(cleanUrl);
}

/**
 * Creates a StateDB connected to a backend's ephemeral stream.
 */
function createStateDB(url: string, instanceId: string, authToken?: string): StateDB {
  const cleanUrl = url.replace(/\/$/, '');
  return createStreamDB({
    streamOptions: {
      url: `${cleanUrl}/${instanceId}`,
      ...(authToken ? { headers: { Authorization: `Bearer ${authToken}` } } : {}),
    },
    state: stateSchema,
  }) as StateDB;
}

/**
 * Creates an AppStateDB connected to a backend's persistent app stream.
 */
function createAppStateDB(url: string, authToken?: string): AppStateDB {
  const cleanUrl = url.replace(/\/$/, '');
  return createStreamDB({
    streamOptions: {
      url: `${cleanUrl}/app`,
      ...(authToken ? { headers: { Authorization: `Bearer ${authToken}` } } : {}),
    },
    state: appStateSchema,
  }) as AppStateDB;
}

// Loadable wrapper so we can distinguish "not yet loaded" from "loaded []"
const backendsLoadableAtom = loadable(backendsAtom);

/**
 * Core orchestration hook that manages connections to all enabled backends.
 *
 * Replaces useServerHealth, the debounce logic in useSettings, and the
 * implicit stream setup in stream-db.ts atoms.
 *
 * Responsibilities per enabled backend:
 * 1. Poll GET /health every 10s — returns instanceId + health status
 * 2. Detect instanceId changes (server restart) -> tear down and recreate StreamDBs
 * 3. Create hc<AppType>(url) API client (with auth header if authToken is set)
 * 4. Create ephemeral StreamDB at ${url}/${instanceId}
 * 5. Create persistent StreamDB at ${url}/app
 * 6. Write results to backendConnectionsAtom and backendResourcesAtom
 *
 * Mount once at the app root.
 */
export function useBackendManager() {
  const backendsLoadable = useAtomValue(backendsLoadableAtom);
  const setConnections = useSetAtom(backendConnectionsAtom);
  const setResources = useSetAtom(backendResourcesAtom);

  // Track per-backend state across renders
  const stateRef = useRef<Map<BackendUrl, PerBackendState>>(new Map());

  useEffect(() => {
    // Wait for AsyncStorage to resolve before acting
    if (backendsLoadable.state !== 'hasData') return;

    const enabledBackends = backendsLoadable.data.filter((b) => b.enabled);
    const enabledUrls = new Set(enabledBackends.map((b) => b.url));

    // Compute action buckets against the ref now (inside the effect, always current)
    const toTearDown = [...stateRef.current.keys()].filter((url) => !enabledUrls.has(url));
    const toStart = enabledBackends.filter((b) => !stateRef.current.has(b.url));
    const _alreadyRunning = enabledBackends.filter((b) => stateRef.current.has(b.url));

    // --- Tear down removed backends ---
    for (const url of toTearDown) {
      const state = stateRef.current.get(url);
      if (state) tearDown(state);
      stateRef.current.delete(url);
    }
    if (toTearDown.length > 0) {
      setConnections((prev) => {
        const next = { ...prev };
        for (const url of toTearDown) delete next[url];
        return next;
      });
      setResources((prev) => {
        const next = { ...prev };
        for (const url of toTearDown) delete next[url];
        return next;
      });
    }

    // --- Initialize and start polling for new backends ---
    for (const backend of toStart) {
      const perBackend: PerBackendState = {
        instanceId: null,
        db: null,
        appDb: null,
        api: null,
        intervalId: null,
        abortController: null,
        cancelled: false,
      };
      // Register in ref immediately so subsequent renders see it as already running
      stateRef.current.set(backend.url, perBackend);

      // Set initial connection state
      setConnections((prev) => ({
        ...prev,
        [backend.url]: {
          url: backend.url,
          status: 'reconnecting',
          instanceId: null,
          latencyMs: null,
          error: null,
        } satisfies BackendConnection,
      }));

      // Create API client and set initial resources
      perBackend.api = createApiClient(backend.url, backend.authToken);
      setResources((prev) => ({
        ...prev,
        [backend.url]: {
          url: backend.url,
          db: null,
          appDb: null,
          api: perBackend.api,
          loading: true,
        } satisfies BackendResources,
      }));

      startPolling(backend, perBackend, setConnections, setResources);
    }
    // backendsLoadable changes identity each render when state is 'loading';
    // only re-run when it transitions to hasData or the data itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendsLoadable.state === 'hasData' ? backendsLoadable.data : null]);

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

function startPolling(
  backend: BackendConfig,
  state: PerBackendState,
  setConnections: (
    fn: (prev: Record<string, BackendConnection>) => Record<string, BackendConnection>
  ) => void,
  setResources: (
    fn: (prev: Record<string, BackendResources>) => Record<string, BackendResources>
  ) => void
) {
  async function poll() {
    if (state.cancelled) return;

    state.abortController?.abort();
    const controller = new AbortController();
    state.abortController = controller;

    const url = backend.url.replace(/\/$/, '') + '/health';
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
        setConnections((prev) => ({
          ...prev,
          [backend.url]: {
            ...prev[backend.url],
            status: 'error',
            latencyMs: null,
            error: `HTTP ${res.status}`,
          } as BackendConnection,
        }));
        return;
      }

      const latency = Date.now() - start;
      const data = await res.json();
      const newInstanceId = data.instanceId as string | undefined;

      console.log('[poll]', {
        newInstanceId,
        currentInstanceId: state.instanceId,
        willCreateDB: !!(newInstanceId && newInstanceId !== state.instanceId),
      });

      // Detect instanceId change (server restart)
      if (newInstanceId && newInstanceId !== state.instanceId) {
        // Tear down old ephemeral StreamDB
        if (state.db) {
          try {
            state.db.close();
          } catch {
            /* ignore */
          }
        }

        state.instanceId = newInstanceId;

        // Create new ephemeral StreamDB
        try {
          const db = createStateDB(backend.url, newInstanceId, backend.authToken);
          await db.preload();
          state.db = db;
          console.log('[poll] StateDB created', backend.url);
        } catch (err) {
          console.error(`[useBackendManager] Failed to create StateDB for ${backend.url}:`, err);
          state.db = null;
        }

        // Create persistent app StreamDB (only once — /app stream survives restarts)
        if (!state.appDb) {
          try {
            const appDb = createAppStateDB(backend.url, backend.authToken);
            await appDb.preload();
            state.appDb = appDb;
            console.log('[poll] AppStateDB created', backend.url);
          } catch (err) {
            console.error(
              `[useBackendManager] Failed to create AppStateDB for ${backend.url}:`,
              err
            );
            state.appDb = null;
          }
        }

        // Publish updated resources
        setResources((prev) => ({
          ...prev,
          [backend.url]: {
            url: backend.url,
            db: state.db,
            appDb: state.appDb,
            api: state.api,
            loading: false,
          } satisfies BackendResources,
        }));
      }

      // Update connection status
      setConnections((prev) => ({
        ...prev,
        [backend.url]: {
          url: backend.url,
          status: 'connected',
          instanceId: newInstanceId ?? state.instanceId,
          latencyMs: latency,
          error: null,
        } satisfies BackendConnection,
      }));
    } catch (err: any) {
      if (state.cancelled) return;
      if (err.name === 'AbortError') return;

      setConnections((prev) => ({
        ...prev,
        [backend.url]: {
          ...prev[backend.url],
          status: 'error',
          latencyMs: null,
          error: err.message || 'Connection failed',
        } as BackendConnection,
      }));
    }
  }

  // Initial poll immediately, then on interval
  poll();
  state.intervalId = setInterval(poll, POLL_INTERVAL);
}

function tearDown(state: PerBackendState) {
  state.cancelled = true;
  if (state.intervalId) clearInterval(state.intervalId);
  state.abortController?.abort();
  if (state.db) {
    try {
      state.db.close();
    } catch {
      /* ignore */
    }
  }
  if (state.appDb) {
    try {
      state.appDb.close();
    } catch {
      /* ignore */
    }
  }
}
