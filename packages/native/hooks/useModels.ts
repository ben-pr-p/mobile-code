import { useEffect, useCallback } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import {
  selectedModelAtom,
  modelCatalogAtom,
  modelDefaultsAtom,
  type ModelSelection,
  type CatalogModel,
} from '../state/settings';
import { apiClientAtom } from '../lib/api';
import { connectionInfoAtom } from '../state/settings';

/**
 * Fetches the provider/model catalog from the server and exposes model
 * selection state. The catalog is re-fetched whenever the connection status
 * transitions to 'connected'.
 */
export function useModels() {
  const api = useAtomValue(apiClientAtom);
  const connection = useAtomValue(connectionInfoAtom);
  const [selectedModel, setSelectedModel] = useAtom(selectedModelAtom);
  const setCatalog = useSetAtom(modelCatalogAtom);
  const setDefaults = useSetAtom(modelDefaultsAtom);
  const catalog = useAtomValue(modelCatalogAtom);
  const defaults = useAtomValue(modelDefaultsAtom);

  const fetchCatalog = useCallback(async () => {
    try {
      const res = await (api.api as any).models.$get();
      if (!res.ok) return;
      const data = await res.json();

      // data shape: { all: Provider[], default: Record<string, string>, connected: string[] }
      const connectedSet = new Set(data.connected ?? []);
      const models: CatalogModel[] = [];

      for (const provider of data.all ?? []) {
        // Only include connected providers
        if (!connectedSet.has(provider.id)) continue;

        for (const [modelId, model] of Object.entries(provider.models ?? {})) {
          const m = model as any;
          models.push({
            id: modelId,
            name: m.name ?? modelId,
            providerID: provider.id,
            providerName: provider.name ?? provider.id,
            status: m.status,
          });
        }
      }

      setCatalog(models);
      setDefaults(data.default ?? {});
    } catch (err) {
      console.error('[useModels] Failed to fetch model catalog:', err);
    }
  }, [api, setCatalog, setDefaults]);

  // Fetch catalog when connected
  useEffect(() => {
    if (connection.status !== 'connected') return;
    fetchCatalog();
  }, [connection.status, fetchCatalog]);

  /**
   * Look up display names for a modelID/providerID pair from the catalog.
   * Falls back to the raw IDs if not found.
   */
  const getDisplayNames = useCallback(
    (modelID?: string, providerID?: string): { modelName: string; providerName: string } => {
      if (!modelID || !catalog) {
        return { modelName: modelID ?? 'Default', providerName: providerID ?? '' };
      }
      const match = catalog.find((m) => m.id === modelID && m.providerID === providerID);
      if (match) {
        return { modelName: match.name, providerName: match.providerName };
      }
      // Try matching just modelID (provider might differ)
      const byModel = catalog.find((m) => m.id === modelID);
      if (byModel) {
        return { modelName: byModel.name, providerName: byModel.providerName };
      }
      // Fallback: prettify raw model ID
      return {
        modelName: prettifyModelId(modelID),
        providerName: providerID ?? '',
      };
    },
    [catalog],
  );

  /**
   * Get the default model selection from the server config.
   * The server returns defaults like { "": "anthropic/claude-sonnet-4-20250514" }
   */
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
  // Strip date suffixes like -20250514
  const withoutDate = modelId.replace(/-\d{8}$/, '');
  // Capitalize words, replace hyphens with spaces
  return withoutDate
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
