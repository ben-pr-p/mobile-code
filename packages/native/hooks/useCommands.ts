import { useEffect, useCallback } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { commandCatalogAtom, type CommandInfo } from '../state/settings';
import { apiClientAtom } from '../lib/api';
import { connectionInfoAtom } from '../state/settings';

/**
 * Fetches the command catalog from the server and exposes command state.
 * The catalog is re-fetched whenever the connection status transitions to
 * 'connected', mirroring the pattern in useModels.
 */
export function useCommands() {
  const api = useAtomValue(apiClientAtom);
  const connection = useAtomValue(connectionInfoAtom);
  const setCatalog = useSetAtom(commandCatalogAtom);
  const catalog = useAtomValue(commandCatalogAtom);

  const fetchCommands = useCallback(async () => {
    try {
      const res = await (api.api as any).commands.$get();
      if (!res.ok) return;
      const data = await res.json();

      // The server returns an object keyed by command name, each value has
      // name, description, agent, template, etc.
      const commands: CommandInfo[] = [];
      if (data && typeof data === 'object') {
        if (Array.isArray(data)) {
          for (const cmd of data) {
            commands.push({
              name: cmd.name ?? '',
              description: cmd.description,
              agent: cmd.agent,
              template: cmd.template ?? '',
            });
          }
        } else {
          for (const [key, value] of Object.entries(data)) {
            const cmd = value as any;
            commands.push({
              name: cmd.name ?? key,
              description: cmd.description,
              agent: cmd.agent,
              template: cmd.template ?? '',
            });
          }
        }
      }

      setCatalog(commands);
    } catch (err) {
      console.error('[useCommands] Failed to fetch command catalog:', err);
    }
  }, [api, setCatalog]);

  // Fetch catalog when connected
  useEffect(() => {
    if (connection.status !== 'connected') return;
    fetchCommands();
  }, [connection.status, fetchCommands]);

  return {
    commands: catalog,
    refetchCommands: fetchCommands,
  };
}
