import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import type { ConnectionInfo, NotificationSound } from '../__fixtures__/settings';
import { asyncStorageAdapter } from '../lib/jotai-async-storage';

const DEFAULT_SERVER_URL = 'http://localhost:3000';

export const serverUrlAtom = atomWithStorage('settings:serverUrl', DEFAULT_SERVER_URL, asyncStorageAdapter<string>());

/**
 * Debounced version of serverUrlAtom — updates 1 s after the last write to
 * serverUrlAtom.  Downstream consumers (health check, API client) should read
 * this instead of serverUrlAtom so they don't thrash on every keystroke.
 *
 * The atom is writable so the debounce listener can push values into it, but
 * external code should treat it as read-only.
 */
export const debouncedServerUrlAtom = atom(DEFAULT_SERVER_URL);

export const handsFreeAutoRecordAtom = atom(true);
export const notificationSoundAtom = atom<NotificationSound>('chime');
export const connectionInfoAtom = atom<ConnectionInfo>({
  status: 'reconnecting',
  latencyMs: null,
  error: null,
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
  asyncStorageAdapter<ModelSelection | null>(),
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
