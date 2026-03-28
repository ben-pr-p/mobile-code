import { useAtom, useAtomValue } from 'jotai';
import * as Updates from 'expo-updates';
import Constants from 'expo-constants';
import { useLiveQuery } from '@tanstack/react-db';
import { notificationSoundAtom, connectionInfoAtom } from '../state/settings';
import { NOTIFICATION_SOUND_OPTIONS } from '../__fixtures__/settings';
import { collections } from '../lib/collections';
import type { BackendConfigValue, BackendConnectionValue } from '../lib/stream-db';

export function useSettings() {
  // Read backends and connections from global DB collections
  const { data: backendRows } = useLiveQuery((q) => q.from({ backends: collections.backends }), []);
  const backends = (backendRows as BackendConfigValue[] | null) ?? [];

  const { data: connectionRows } = useLiveQuery(
    (q) => q.from({ bc: collections.backendConnections }),
    []
  );
  const connections: Record<string, BackendConnectionValue> = {};
  for (const c of (connectionRows as BackendConnectionValue[] | null) ?? []) {
    connections[c.url] = c;
  }

  const [notificationSound, setNotificationSound] = useAtom(notificationSoundAtom);

  // Aggregate connection info across all backends
  const connection = useAtomValue(connectionInfoAtom);

  // Build version string from real app version + OTA update ID when available
  const nativeVersion = Constants.expoConfig?.version ?? '0.0.0';
  const updateId = Updates.updateId;
  const appVersion = updateId ? `${nativeVersion} (${updateId.slice(0, 8)})` : nativeVersion;

  const isEmergencyLaunch = Updates.isEmergencyLaunch;

  // Write backends to the global DB collection
  const setBackends = (newBackends: BackendConfigValue[]) => {
    const collection = collections.backends as any;
    // Simple approach: clear and re-insert all
    // (TanStack DB local collections support direct mutations)
    const current = collection.toArray as BackendConfigValue[];
    for (const b of current) {
      try {
        collection.delete(b.url);
      } catch {
        /* ignore */
      }
    }
    for (const b of newBackends) {
      try {
        collection.insert(b);
      } catch {
        /* ignore */
      }
    }
  };

  return {
    connection,

    // Multi-backend API
    backends,
    setBackends,
    connections,

    // Voice settings
    notificationSound,
    setNotificationSound,
    notificationSoundOptions: NOTIFICATION_SOUND_OPTIONS,

    // App info
    appVersion,
    isEmergencyLaunch,
  };
}
