import { eq, useLiveQuery } from '@tanstack/react-db';
import { collections } from '../lib/collections';
import type { SessionStatusValue } from '../lib/stream-db';

/**
 * Live session status from the ephemeral stream.
 *
 * Returns the current status ('idle' | 'busy' | 'error') for a session,
 * defaulting to 'idle' when no status has been emitted yet.
 */
export function useSessionStatus(
  sessionId: string
): SessionStatusValue['status'] {
  const { data } = useLiveQuery(
    (q) =>
      q
        .from({ sessionStatuses: collections.sessionStatuses })
        .where(({ sessionStatuses }) => eq(sessionStatuses.sessionId, sessionId)),
    [sessionId]
  );
  return (data as SessionStatusValue[] | null)?.[0]?.status ?? 'idle';
}
