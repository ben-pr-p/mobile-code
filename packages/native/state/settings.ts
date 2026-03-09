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
