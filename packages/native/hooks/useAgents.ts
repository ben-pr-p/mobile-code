import { useEffect, useCallback } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { agentCatalogAtom, type AgentInfo } from '../state/settings';
import { apiClientAtom } from '../lib/api';
import { connectionInfoAtom } from '../state/settings';

/**
 * Fetches the agent catalog from the server and exposes agent state.
 * The catalog is re-fetched whenever the connection status transitions to
 * 'connected', mirroring the pattern in useModels.
 */
export function useAgents() {
  const api = useAtomValue(apiClientAtom);
  const connection = useAtomValue(connectionInfoAtom);
  const setCatalog = useSetAtom(agentCatalogAtom);
  const catalog = useAtomValue(agentCatalogAtom);

  const fetchAgents = useCallback(async () => {
    try {
      const res = await (api.api as any).agents.$get();
      if (!res.ok) return;
      const data = await res.json();

      // The server returns an object keyed by agent name, each value has
      // name, description, mode, color, etc.
      const agents: AgentInfo[] = [];
      if (data && typeof data === 'object') {
        // Handle both array and object (keyed by name) response shapes
        if (Array.isArray(data)) {
          for (const agent of data) {
            agents.push({
              name: agent.name ?? '',
              description: agent.description,
              mode: agent.mode ?? 'primary',
              color: agent.color,
            });
          }
        } else {
          for (const [key, value] of Object.entries(data)) {
            const agent = value as any;
            agents.push({
              name: agent.name ?? key,
              description: agent.description,
              mode: agent.mode ?? 'primary',
              color: agent.color,
            });
          }
        }
      }

      setCatalog(agents);
    } catch (err) {
      console.error('[useAgents] Failed to fetch agent catalog:', err);
    }
  }, [api, setCatalog]);

  // Fetch catalog when connected
  useEffect(() => {
    if (connection.status !== 'connected') return;
    fetchAgents();
  }, [connection.status, fetchAgents]);

  // Only show primary agents in the selector (subagents are invoked by the model)
  const primaryAgents = catalog?.filter((a) => a.mode === 'primary' || a.mode === 'all') ?? null;

  return {
    agents: catalog,
    primaryAgents,
    refetchAgents: fetchAgents,
  };
}
