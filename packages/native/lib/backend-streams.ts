import { atom } from 'jotai';
import type { BackendUrl } from '../state/backends';
import type { StateDB, EphemeralStateDB, AppStateDB } from './stream-db';
import type { ApiClient } from './api';

/** Per-backend resources: StreamDBs + API client. */
export interface BackendResources {
  url: BackendUrl;
  db: StateDB | null;
  ephemeralDb: EphemeralStateDB | null;
  appDb: AppStateDB | null;
  api: ApiClient | null;
  loading: boolean;
}

/**
 * Map of backend URL -> BackendResources.
 * Populated by the connection manager; consumed by merged query hooks.
 */
export const backendResourcesAtom = atom<Record<BackendUrl, BackendResources>>(
  {} as Record<BackendUrl, BackendResources>,
);
