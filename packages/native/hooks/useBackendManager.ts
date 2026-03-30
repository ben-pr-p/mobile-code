import { useRef } from 'react';
import { useCallback } from 'react';
import { createEffect, useLiveQuery, eq } from '@tanstack/react-db';
import { appendStreamToDb, type StreamHandle } from '../lib/durable-streams';
import { collections, collectionEntries } from '../lib/collections';
import {
  STATE_STREAM_COLLECTIONS,
  EPHEMERAL_STREAM_COLLECTIONS,
  APP_STREAM_COLLECTIONS,
  type BackendConfigValue,
  type BackendConnectionValue,
} from '../lib/stream-db';

const POLL_INTERVAL = 5_000;

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
class BackendPoller {
  private instanceId: string | null = null;
  private stateStream: StreamHandle | null = null;
  private ephemeralStream: StreamHandle | null = null;
  private appStream: StreamHandle | null = null;
  private cancelled = false;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private cleanBaseUrl: string;

  constructor(private backend: BackendConfigValue) {
    this.cleanBaseUrl = backend.url.replace(/\/$/, '');
    this.start();
  }

  private attachStream(
    pathSuffix: string,
    collectionNames: readonly string[]
  ): StreamHandle | null {
    try {
      const s = appendStreamToDb(collectionEntries, {
        streamOptions: {
          url: `${this.cleanBaseUrl}${pathSuffix}`,
          headers: authHeaders(this.backend.authToken),
        },
        collectionNames: [...collectionNames],
        backendUrl: this.backend.url,
      });
      console.log(`[poll] Preload starting: ${pathSuffix}`, this.backend.url);
      s.preload().then(
        () => console.log(`[poll] Preload completed: ${pathSuffix}`, this.backend.url),
        (err) => console.error(`[poll] Preload failed: ${pathSuffix}`, this.backend.url, err)
      );
      return s;
    } catch (err) {
      console.error(
        `[useBackendManager] Failed to attach stream ${pathSuffix} for ${this.backend.url}:`,
        err
      );
      return null;
    }
  }

  private async poll() {
    if (this.cancelled) return;

    const start = Date.now();

    try {
      const res = await fetch(this.cleanBaseUrl + '/health', {
        headers: authHeaders(this.backend.authToken),
      });

      if (this.cancelled) return;

      if (!res.ok) {
        updateConnection(this.backend.url, {
          url: this.backend.url,
          status: 'error',
          instanceId: this.instanceId,
          latencyMs: null,
          error: `HTTP ${res.status}`,
        });
        return;
      }

      const latency = Date.now() - start;

      updateConnection(this.backend.url, {
        url: this.backend.url,
        status: 'connected',
        instanceId: this.instanceId,
        latencyMs: latency,
        error: null,
      });

      const data = await res.json();
      const newInstanceId = data.instanceId as string | undefined;

      console.log('[poll]', {
        newInstanceId,
        currentInstanceId: this.instanceId,
        willAttachStreams: !!(newInstanceId && newInstanceId !== this.instanceId),
      });

      if (newInstanceId && newInstanceId !== this.instanceId) {
        closeStreamSafe(this.stateStream);
        closeStreamSafe(this.ephemeralStream);
        this.stateStream = null;
        this.ephemeralStream = null;

        this.instanceId = newInstanceId;

        this.stateStream = this.attachStream(`/${newInstanceId}`, STATE_STREAM_COLLECTIONS);
        this.ephemeralStream = this.attachStream(
          `/${newInstanceId}/ephemeral`,
          EPHEMERAL_STREAM_COLLECTIONS
        );

        if (!this.appStream) {
          this.appStream = this.attachStream('/app', APP_STREAM_COLLECTIONS);
        }
      }
    } catch (err: any) {
      if (this.cancelled) return;

      updateConnection(this.backend.url, {
        url: this.backend.url,
        status: 'error',
        instanceId: this.instanceId,
        latencyMs: null,
        error: err.message || 'Connection failed',
      });
    }
  }

  start() {
    this.poll();
    this.intervalId = setInterval(() => this.poll(), POLL_INTERVAL);
  }

  ping() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
    this.poll();
    this.intervalId = setInterval(() => this.poll(), POLL_INTERVAL);
  }

  stop() {
    this.cancelled = true;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    closeStreamSafe(this.stateStream);
    closeStreamSafe(this.ephemeralStream);
    closeStreamSafe(this.appStream);
  }
}

type BackendStateContainer = {
  url: string;
  authToken: string | null;
  poller: BackendPoller;
};
export function useBackendManager() {
  const backendPolls = useRef<Record<string, BackendStateContainer>>({});
  const pingsInProgress = useRef<string[]>([]);

  createEffect({
    query(q) {
      return q.from({ backends: collections.backends }).where((b) => eq(b.backends.enabled, true));
    },
    skipInitial: false,
    onEnter(result) {
      const backend = result.value as BackendConfigValue;
      if (backendPolls.current[backend.id]) return;
      backendPolls.current[backend.id] = {
        url: backend.url,
        authToken: backend.authToken ?? null,
        poller: new BackendPoller(backend),
      };
    },
    onUpdate(result) {
      const backend = result.value as BackendConfigValue;
      const prior = backendPolls.current[backend.id];
      if (!prior) {
        console.warn(`Polling not set up for backend ${backend.id}`);
        backendPolls.current[backend.id] = {
          url: backend.url,
          authToken: backend.authToken ?? null,
          poller: new BackendPoller(backend),
        };
      } else if (backend.url !== prior.url || backend.authToken !== prior.authToken) {
        prior.poller.stop();
        backendPolls.current[backend.id] = {
          url: backend.url,
          authToken: backend.authToken ?? null,
          poller: new BackendPoller(backend),
        };
      }
    },
    onExit(result) {
      const backend = result.value as BackendConfigValue;
      if (backendPolls.current[backend.id]) {
        backendPolls.current[backend.id].poller.stop();
        delete backendPolls.current[backend.id];
      }
    },
  });

  createEffect({
    query(q) {
      return q.from({ pings: collections.pings });
    },
    skipInitial: false,
    onEnter(result) {
      const ping = result.value;
      const backendUrl = ping.url as string;
      if (pingsInProgress.current.includes(backendUrl)) {
        console.log('[useBackendManager] Ping already in progress for:', backendUrl);
        return;
      }

      pingsInProgress.current.push(backendUrl);
      console.log('[useBackendManager] Processing ping for:', backendUrl);

      try {
        collections.backendConnections.update(backendUrl, (draft) => {
          draft.status = 'reconnecting';
          draft.latencyMs = null;
          draft.error = null;
        });
      } catch (updateErr) {
        console.log(
          '[useBackendManager] Update failed, inserting new connection:',
          backendUrl,
          updateErr
        );
        collections.backendConnections.insert({
          url: backendUrl,
          status: 'reconnecting',
          instanceId: null,
          latencyMs: null,
          error: null,
        });
      }

      const pollerEntry = Object.values(backendPolls.current).find(
        (entry) => entry.url === backendUrl
      );

      if (pollerEntry) {
        pollerEntry.poller.ping();
      } else {
        console.log('[useBackendManager] No poller found for:', backendUrl);
      }

      setTimeout(() => {
        try {
          pingsInProgress.current = pingsInProgress.current.filter((url) => url !== backendUrl);
          collections.pings.delete(backendUrl);
        } catch (deleteErr) {
          console.error(
            '[useBackendManager] Failed to delete ping - this keeps happening for some reason but Im not sure why:',
            backendUrl,
            deleteErr
          );
        }
      }, 0);
    },
  });
}

export function useInsertPing() {
  const insertPing = useCallback((backendUrl: string) => {
    collections.pings.insert({
      url: backendUrl,
      createdAt: Date.now(),
    });
  }, []);

  return { insertPing };
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

function closeStreamSafe(handle: StreamHandle | null) {
  if (!handle) return;
  try {
    handle.close();
  } catch {
    /* ignore */
  }
}
