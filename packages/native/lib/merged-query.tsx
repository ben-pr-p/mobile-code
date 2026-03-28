/**
 * Global DB query utilities.
 *
 * With the collections, all collections from all backends live in one place.
 * Every server-synced row has a `backendUrl` field stamped by the EventDispatcher.
 * Queries can join against the `backends` and `backendConnections` collections
 * to filter by enabled/connected status.
 *
 * This module re-exports collections for convenience and provides the
 * `useGlobalQuery` hook as a simple wrapper around useLiveQuery with
 * collections.
 */
import { useLiveQuery } from '@tanstack/react-db';
import type { InitialQueryBuilder, QueryBuilder } from '@tanstack/react-db';
import { collections } from './collections';

export { collections };

/**
 * @deprecated No longer needed — all server-synced types now include `backendUrl` directly.
 * Kept for backwards compatibility. This is now a no-op identity type.
 */
export type WithBackendUrl<T> = T;

/**
 * Run a live query against the collections.
 *
 * @example
 * ```tsx
 * const { data: sessions } = useGlobalQuery<SessionValue>(
 *   (q) => q
 *     .from({ sessions: collections.sessions })
 *     .where(({ sessions }) => eq(sessions.backendUrl, backendUrl)),
 *   [backendUrl]
 * );
 * ```
 */
export function useGlobalQuery<T>(
  query: (q: InitialQueryBuilder) => QueryBuilder<any> | undefined | null,
  deps: unknown[] = []
): { data: T[] | null; isLoading: boolean } {
  const result = useLiveQuery((q) => query(q), deps);
  return {
    data: (result.data as T[] | null) ?? null,
    isLoading: result.isLoading,
  };
}

// ---------------------------------------------------------------------------
// Backwards-compatible aliases
// ---------------------------------------------------------------------------
// These are thin wrappers so that existing consumer code doesn't need to be
// rewritten in this commit. They all delegate to collections.

import React from 'react';

interface LegacyMergedQueryProps<T> {
  query: (q: InitialQueryBuilder) => QueryBuilder<any> | undefined | null;
  deps?: unknown[];
  children: (result: { data: T[] | null; isLoading: boolean }) => React.ReactNode;
}

function LegacyMergedQuery<T>({ query, deps = [], children }: LegacyMergedQueryProps<T>) {
  const result = useLiveQuery((q) => query(q), deps);
  const data = (result.data as T[] | null) ?? null;
  return <>{children({ data, isLoading: result.isLoading })}</>;
}

/** @deprecated Use useGlobalQuery or useLiveQuery with collections instead */
export const MergedQuery = LegacyMergedQuery;
/** @deprecated Use useGlobalQuery or useLiveQuery with collections instead */
export const MergedStateQuery = LegacyMergedQuery;
/** @deprecated Use useGlobalQuery or useLiveQuery with collections instead */
export const MergedEphemeralStateQuery = LegacyMergedQuery;
/** @deprecated Use useGlobalQuery or useLiveQuery with collections instead */
export const MergedAppStateQuery = LegacyMergedQuery;

/**
 * @deprecated Use useGlobalQuery instead.
 * The backendUrl parameter is ignored — filter by backendUrl in the query instead.
 */
export function useBackendQuery<T>(
  _backendUrl: string,
  query: (q: InitialQueryBuilder) => QueryBuilder<any> | undefined | null,
  deps: unknown[] = []
): { data: T[] | null; isLoading: boolean } {
  const result = useLiveQuery((q) => query(q), deps);
  return {
    data: (result.data as T[] | null) ?? null,
    isLoading: result.isLoading,
  };
}

/** @deprecated Use useGlobalQuery instead */
export const useBackendStateQuery = useBackendQuery;
/** @deprecated Use useGlobalQuery instead */
export const useBackendEphemeralStateQuery = useBackendQuery;
/** @deprecated Use useGlobalQuery instead */
export const useBackendAppStateQuery = useBackendQuery;
