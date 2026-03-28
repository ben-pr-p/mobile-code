import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import type { ConnectionInfo, NotificationSound } from '../__fixtures__/settings';
import { asyncStorageAdapter } from '../lib/jotai-async-storage';
import { collections } from '../lib/collections';
import type { BackendConnectionValue } from '../lib/stream-db';

export const notificationSoundAtom = atom<NotificationSound>('chime');

/** Hands-free mode: determines behavior when headphone button recording completes. */
export type HandsFreeMode = 'washing-dishes' | 'walking';

/**
 * User's preferred hands-free mode. Persisted to AsyncStorage so it
 * survives app restarts. Defaults to 'washing-dishes'.
 */
export const handsFreeModeAtom = atomWithStorage<HandsFreeMode>(
  'settings:handsFreeMode',
  'washing-dishes',
  asyncStorageAdapter<HandsFreeMode>()
);

/** Whether hands-free (headphone button) mode is currently active. */
export const handsFreeActiveAtom = atom(false);

/** Whether a native CallKit recording is in progress (headphone-initiated). */
export const nativeRecordingAtom = atom(false);

/**
 * Aggregate connection info across all backends.
 * Reports 'connected' if any backend is connected, 'reconnecting' if any is
 * reconnecting and none are connected, 'error' otherwise.
 */
export const connectionInfoAtom = atom<ConnectionInfo>(() => {
  // Read connections directly from the global DB collection (synchronous)
  const connectionsCollection = collections.backendConnections as any;
  const connections = (connectionsCollection.toArray ?? []) as BackendConnectionValue[];
  if (connections.length === 0) {
    return { status: 'reconnecting', latencyMs: null, error: null };
  }
  const connected = connections.find((c) => c.status === 'connected');
  if (connected) {
    return { status: 'connected', latencyMs: connected.latencyMs, error: null };
  }
  const reconnecting = connections.find((c) => c.status === 'reconnecting');
  if (reconnecting) {
    return { status: 'reconnecting', latencyMs: null, error: null };
  }
  const errored = connections[0];
  return {
    status: 'error',
    latencyMs: null,
    error: errored.error,
  };
});

/** Model selection. */
export type ModelSelection = { providerID: string; modelID: string };

/**
 * User's preferred model for the next prompt. Persisted to AsyncStorage so it
 * survives app restarts. `null` means "use server default".
 */
export const selectedModelAtom = atomWithStorage<ModelSelection | null>(
  'settings:selectedModel',
  null,
  asyncStorageAdapter<ModelSelection | null>()
);

/** Model info for a single model from the provider catalog */
export type CatalogModel = {
  id: string;
  name: string;
  providerID: string;
  providerName: string;
  status?: string;
};

/** Provider catalog fetched from the server. `null` means not yet loaded. */
export const modelCatalogAtom = atom<CatalogModel[] | null>(null);

/** The server-reported defaults: e.g. { "": "anthropic/claude-sonnet-4-20250514" } */
export const modelDefaultsAtom = atom<Record<string, string>>({});

/** Agent from the OpenCode server. */
export type AgentInfo = {
  name: string;
  description?: string;
  mode: 'subagent' | 'primary' | 'all';
  color?: string;
};

/** Command from the OpenCode server. */
export type CommandInfo = {
  name: string;
  description?: string;
  agent?: string;
  template: string;
};

/** A pending command queued for the next message. */
export type PendingCommand = {
  name: string;
  description?: string;
};

/** Agent catalog fetched from the server. `null` means not yet loaded. */
export const agentCatalogAtom = atom<AgentInfo[] | null>(null);

/** Command catalog fetched from the server. `null` means not yet loaded. */
export const commandCatalogAtom = atom<CommandInfo[] | null>(null);
