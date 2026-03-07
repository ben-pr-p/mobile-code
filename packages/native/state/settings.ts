import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import type { ConnectionInfo, NotificationSound } from '../__fixtures__/settings';

export const serverUrlAtom = atomWithStorage(
  'settings:serverUrl',
  'http://bens-macbook-pro-2.bobtail-kelvin.ts.net:3001'
);

/**
 * Debounced version of serverUrlAtom — updates 1 s after the last write to
 * serverUrlAtom.  Downstream consumers (health check, API client) should read
 * this instead of serverUrlAtom so they don't thrash on every keystroke.
 *
 * The atom is writable so the debounce listener can push values into it, but
 * external code should treat it as read-only.
 */
export const debouncedServerUrlAtom = atom('https://api.opencode.dev');

export const handsFreeAutoRecordAtom = atom(true);
export const notificationSoundAtom = atom<NotificationSound>('chime');
export const connectionInfoAtom = atom<ConnectionInfo>({
  status: 'reconnecting',
  latencyMs: null,
  error: null,
});
