import { useEffect, useCallback } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useLiveQuery, eq } from '@tanstack/react-db';
import {
  selectedModelAtom,
  modelCatalogAtom,
  modelDefaultsAtom,
  type ModelSelection,
} from '../state/settings';
import { collections } from '../lib/collections';
import { getApi } from '../lib/api';
import type { BackendConnectionValue } from '../lib/stream-db';

/**
 * Fetches the provider/model catalog from the server and exposes model
 * selection state.
 */
export function useModels(backendUrl: string) {
  const [selectedModel, setSelectedModel] = useAtom(selectedModelAtom);
  const setCatalog = useSetAtom(modelCatalogAtom);
  const setDefaults = useSetAtom(modelDefaultsAtom);
  const catalog = useAtomValue(modelCatalogAtom);
  const defaults = useAtomValue(modelDefaultsAtom);

  const { data: connectionRows } = useLiveQuery(
    (q) => q.from({ bc: collections.backendConnections }).where(({ bc }) => eq(bc.url, backendUrl)),
    [backendUrl]
  );
  const connectionStatus =
    (connectionRows as BackendConnectionValue[] | null)?.[0]?.status ?? 'reconnecting';

  const fetchCatalog = useCallback(async () => {
    const api = getApi(backendUrl);
    try {
      const { models, defaults } = await api.models.list();
      setCatalog(models);
      setDefaults(defaults);
    } catch (err) {
      console.error('[useModels] Failed to fetch model catalog:', err);
    }
  }, [backendUrl, setCatalog, setDefaults]);

  // Fetch catalog when backend becomes connected
  useEffect(() => {
    if (connectionStatus !== 'connected') return;
    fetchCatalog();
  }, [connectionStatus, fetchCatalog]);

  const getDisplayNames = useCallback(
    (modelID?: string, providerID?: string): { modelName: string; providerName: string } => {
      if (!modelID || !catalog) {
        return { modelName: modelID ?? 'Default', providerName: providerID ?? '' };
      }
      const match = catalog.find((m) => m.id === modelID && m.providerID === providerID);
      if (match) {
        return { modelName: match.name, providerName: match.providerName };
      }
      const byModel = catalog.find((m) => m.id === modelID);
      if (byModel) {
        return { modelName: byModel.name, providerName: byModel.providerName };
      }
      return {
        modelName: prettifyModelId(modelID),
        providerName: providerID ?? '',
      };
    },
    [catalog]
  );

  const getDefaultModel = useCallback((): ModelSelection | null => {
    const defaultStr = defaults[''];
    if (!defaultStr) return null;
    const slashIdx = defaultStr.indexOf('/');
    if (slashIdx < 0) return null;
    return {
      providerID: defaultStr.slice(0, slashIdx),
      modelID: defaultStr.slice(slashIdx + 1),
    };
  }, [defaults]);

  return {
    selectedModel,
    setSelectedModel,
    catalog,
    defaults,
    getDisplayNames,
    getDefaultModel,
    refetchCatalog: fetchCatalog,
  };
}

/** Convert a raw model ID like "claude-sonnet-4-20250514" to "Claude Sonnet 4" */
function prettifyModelId(modelId: string): string {
  const withoutDate = modelId.replace(/-\d{8}$/, '');
  return withoutDate
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
