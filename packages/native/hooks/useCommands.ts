import { useEffect, useCallback, useMemo } from 'react';
import { useSetAtom, useAtomValue } from 'jotai';
import { useLiveQuery, eq } from '@tanstack/react-db';
import { commandCatalogAtom, type CommandInfo } from '../state/settings';
import { collections } from '../lib/collections';
import { getApi } from '../lib/api';
import type { BackendConnectionValue } from '../lib/stream-db';

/**
 * Fetches the command catalog from a specific backend and exposes command state.
 * The catalog is re-fetched whenever the backend transitions to 'connected'.
 */
export function useCommands(backendUrl: string) {
  const setCatalog = useSetAtom(commandCatalogAtom);
  const catalog = useAtomValue(commandCatalogAtom);

  const { data: connectionRows } = useLiveQuery(
    (q) => q.from({ bc: collections.backendConnections }).where(({ bc }) => eq(bc.url, backendUrl)),
    [backendUrl]
  );
  const connectionStatus =
    (connectionRows as BackendConnectionValue[] | null)?.[0]?.status ?? 'reconnecting';

  const fetchCommands = useCallback(async () => {
    const api = getApi(backendUrl);
    try {
      const commands = await api.commands.list();
      setCatalog(commands);
    } catch (err) {
      console.error('[useCommands] Failed to fetch command catalog:', err);
    }
  }, [backendUrl, setCatalog]);

  // Fetch catalog when backend becomes connected
  useEffect(() => {
    if (connectionStatus !== 'connected') return;
    fetchCommands();
  }, [connectionStatus, fetchCommands]);

  return {
    commands: catalog,
    refetchCommands: fetchCommands,
  };
}
