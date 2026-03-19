/**
 * MergedQuery — runs the same useLiveQuery against every connected backend's
 * StateDB (or AppStateDB), concatenates the results, and passes them to a
 * render function.
 *
 * Each result item is augmented with a `backendUrl` field so the caller knows
 * which backend it came from.
 *
 * Uses a recursive component pattern to satisfy React's rules of hooks:
 * each recursion level renders one component that calls useLiveQuery exactly
 * once, then renders the next level with accumulated results.
 */
import React from 'react';
import { useAtomValue } from 'jotai/react';
import { useLiveQuery } from '@tanstack/react-db';
import type { InitialQueryBuilder, QueryBuilder } from '@tanstack/react-db';
import { backendResourcesAtom, type BackendResources } from './backend-streams';
import type { BackendUrl } from '../state/backends';
import type { StateDB, AppStateDB } from './stream-db';

/** Every item returned by a merged query carries its source backend URL. */
export type WithBackendUrl<T> = T & { backendUrl: BackendUrl };

// --- State query merging ---

interface MergedStateQueryProps<T> {
  /** Build a query from a StateDB. Same API as the old useStateQuery's first arg. */
  query: (db: StateDB, q: InitialQueryBuilder) => QueryBuilder<any> | undefined | null;
  /** Extra deps for the query. */
  deps?: unknown[];
  /** Render function receiving the merged, backend-tagged results. */
  children: (result: { data: WithBackendUrl<T>[] | null; isLoading: boolean }) => React.ReactNode;
}

/**
 * Runs a StateDB live query against every connected backend, tags each
 * result with its source `backendUrl`, and concatenates them.
 *
 * ```tsx
 * <MergedStateQuery<ProjectValue>
 *   query={(db, q) => q.from({ projects: db.collections.projects })}
 * >
 *   {({ data, isLoading }) => <ProjectList projects={data} />}
 * </MergedStateQuery>
 * ```
 */
export function MergedStateQuery<T>({ query, deps = [], children }: MergedStateQueryProps<T>) {
  const resourceMap = useAtomValue(backendResourcesAtom);
  const backends = Object.values(resourceMap).filter((r) => r.db != null);

  if (backends.length === 0) {
    return <>{children({ data: null, isLoading: true })}</>;
  }

  return (
    <StateQueryAccumulator<T>
      backends={backends}
      index={0}
      accumulated={[]}
      anyLoading={false}
      query={query}
      deps={deps}>
      {children}
    </StateQueryAccumulator>
  );
}

interface StateQueryAccumulatorProps<T> {
  backends: BackendResources[];
  index: number;
  accumulated: WithBackendUrl<T>[];
  anyLoading: boolean;
  query: (db: StateDB, q: InitialQueryBuilder) => QueryBuilder<any> | undefined | null;
  deps: unknown[];
  children: (result: { data: WithBackendUrl<T>[] | null; isLoading: boolean }) => React.ReactNode;
}

function StateQueryAccumulator<T>({
  backends,
  index,
  accumulated,
  anyLoading,
  query,
  deps,
  children,
}: StateQueryAccumulatorProps<T>) {
  const backend = backends[index];
  const db = backend.db!;

  const result = useLiveQuery((q) => query(db, q), [db, ...deps]);
  const rawData = (result.data as T[] | null) ?? [];
  const tagged = rawData.map((item) => ({ ...item, backendUrl: backend.url }));
  const merged = [...accumulated, ...tagged];
  const loading = anyLoading || backend.loading || result.isLoading;

  if (index + 1 < backends.length) {
    return (
      <StateQueryAccumulator<T>
        backends={backends}
        index={index + 1}
        accumulated={merged}
        anyLoading={loading}
        query={query}
        deps={deps}>
        {children}
      </StateQueryAccumulator>
    );
  }

  return <>{children({ data: merged.length > 0 ? merged : null, isLoading: loading })}</>;
}

// --- App state query merging ---

interface MergedAppStateQueryProps<T> {
  query: (db: AppStateDB, q: InitialQueryBuilder) => QueryBuilder<any> | undefined | null;
  deps?: unknown[];
  children: (result: { data: WithBackendUrl<T>[] | null; isLoading: boolean }) => React.ReactNode;
}

/**
 * Same as MergedStateQuery but for AppStateDB (persistent per-backend state
 * like archive/session metadata).
 */
export function MergedAppStateQuery<T>({
  query,
  deps = [],
  children,
}: MergedAppStateQueryProps<T>) {
  const resourceMap = useAtomValue(backendResourcesAtom);
  const backends = Object.values(resourceMap).filter((r) => r.appDb != null);

  if (backends.length === 0) {
    return <>{children({ data: null, isLoading: true })}</>;
  }

  return (
    <AppStateQueryAccumulator<T>
      backends={backends}
      index={0}
      accumulated={[]}
      anyLoading={false}
      query={query}
      deps={deps}>
      {children}
    </AppStateQueryAccumulator>
  );
}

interface AppStateQueryAccumulatorProps<T> {
  backends: BackendResources[];
  index: number;
  accumulated: WithBackendUrl<T>[];
  anyLoading: boolean;
  query: (db: AppStateDB, q: InitialQueryBuilder) => QueryBuilder<any> | undefined | null;
  deps: unknown[];
  children: (result: { data: WithBackendUrl<T>[] | null; isLoading: boolean }) => React.ReactNode;
}

function AppStateQueryAccumulator<T>({
  backends,
  index,
  accumulated,
  anyLoading,
  query,
  deps,
  children,
}: AppStateQueryAccumulatorProps<T>) {
  const backend = backends[index];
  const db = backend.appDb!;

  const result = useLiveQuery((q) => query(db, q), [db, ...deps]);
  const rawData = (result.data as T[] | null) ?? [];
  const tagged = rawData.map((item) => ({ ...item, backendUrl: backend.url }));
  const merged = [...accumulated, ...tagged];
  const loading = anyLoading || backend.loading || result.isLoading;

  if (index + 1 < backends.length) {
    return (
      <AppStateQueryAccumulator<T>
        backends={backends}
        index={index + 1}
        accumulated={merged}
        anyLoading={loading}
        query={query}
        deps={deps}>
        {children}
      </AppStateQueryAccumulator>
    );
  }

  return <>{children({ data: merged.length > 0 ? merged : null, isLoading: loading })}</>;
}

// --- Single-backend query hook ---

/**
 * Runs a StateDB live query against a single specific backend.
 * Use this when you know which backend owns the data (e.g., session-scoped queries).
 */
export function useBackendStateQuery<T>(
  backendUrl: BackendUrl,
  query: (db: StateDB, q: InitialQueryBuilder) => QueryBuilder<any> | undefined | null,
  deps: unknown[] = []
): { data: T[] | null; isLoading: boolean } {
  const resourceMap = useAtomValue(backendResourcesAtom);
  const resources = resourceMap[backendUrl];
  const db = resources?.db ?? null;
  const loading = resources?.loading ?? true;

  const result = useLiveQuery((q) => db && query(db, q), [db, ...deps]);
  if (!db) return { data: null, isLoading: true };
  return { data: result.data as T[] | null, isLoading: loading || result.isLoading };
}

/**
 * Runs an AppStateDB live query against a single specific backend.
 */
export function useBackendAppStateQuery<T>(
  backendUrl: BackendUrl,
  query: (db: AppStateDB, q: InitialQueryBuilder) => QueryBuilder<any> | undefined | null,
  deps: unknown[] = []
): { data: T[] | null; isLoading: boolean } {
  const resourceMap = useAtomValue(backendResourcesAtom);
  const resources = resourceMap[backendUrl];
  const db = resources?.appDb ?? null;
  const loading = resources?.loading ?? true;

  const result = useLiveQuery((q) => db && query(db, q), [db, ...deps]);
  if (!db) return { data: null, isLoading: true };
  return { data: result.data as T[] | null, isLoading: loading || result.isLoading };
}
