import { useMemo } from 'react';
import { eq } from '@tanstack/react-db';
import { useAppStateQuery, type SessionMetaValue } from '../lib/stream-db';

/** Returns a Set of session IDs that have been archived. */
export function useArchivedSessionIds(): Set<string> {
  const { data: archivedMetas } = useAppStateQuery(
    (db, q) =>
      q.from({ sessionMeta: db.collections.sessionMeta })
        .where(({ sessionMeta }) => eq(sessionMeta.archived, true)),
  );
  return useMemo(
    () => new Set((archivedMetas as SessionMetaValue[] | undefined)?.map(m => m.sessionId) ?? []),
    [archivedMetas],
  );
}
