import { useEffect, useCallback } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { useLiveQuery, eq } from '@tanstack/react-db';
import { agentCatalogAtom, connectionInfoAtom, type AgentInfo } from '../state/settings';
import { globalDb } from '../lib/global-db';
import { getApi } from '../lib/api';
import type { BackendConnectionValue } from '../lib/stream-db';

/**
 * Fetches the agent catalog from a specific backend and exposes agent state.
 * The catalog is re-fetched whenever the backend transitions to 'connected'.
 */
export function useAgents(backendUrl: string) {
  const setCatalog = useSetAtom(agentCatalogAtom);
  const catalog = useAtomValue(agentCatalogAtom);

  const { data: connectionRows } = useLiveQuery(
    (q) =>
      q
        .from({ bc: globalDb.collections.backendConnections })
        .where(({ bc }) => eq(bc.url, backendUrl)),
    [backendUrl]
  );
  const connectionStatus = (connectionRows as BackendConnectionValue[] | null)?.[0]?.status ?? 'reconnecting';

  const fetchAgents = useCallback(async () => {
    const api = getApi(backendUrl);
    try {
      const agents = await api.agents.list();

      setCatalog(agents.map((a: any) => ({
        name: a.name,
        description: a.description,
        mode: (a.mode as AgentInfo['mode']) ?? 'primary',
        color: a.color,
      })));
    } catch (err) {
      console.error('[useAgents] Failed to fetch agent catalog:', err);
    }
  }, [backendUrl, setCatalog]);

  // Fetch catalog when backend becomes connected
  useEffect(() => {
    if (connectionStatus !== 'connected') return;
    fetchAgents();
  }, [connectionStatus, fetchAgents]);

  // Only show primary agents in the selector (subagents are invoked by the model)
  const primaryAgents = catalog?.filter((a) => a.mode === 'primary' || a.mode === 'all') ?? null;

  return {
    agents: catalog,
    primaryAgents,
    refetchAgents: fetchAgents,
  };
}
