import { eq } from '@tanstack/react-db';
import { useBackendEphemeralStateQuery } from '../lib/merged-query';
import { collections } from '../lib/collections';
import type { SessionStatusValue } from '../lib/stream-db';
import type { BackendUrl } from '../state/backends';

/**
 * Live session status from the ephemeral stream.
 *
 * Returns the current status ('idle' | 'busy' | 'error') for a session,
 * defaulting to 'idle' when no status has been emitted yet.
 */
export function useSessionStatus(
  backendUrl: BackendUrl,
  sessionId: string
): SessionStatusValue['status'] {
  const { data } = useBackendEphemeralStateQuery<SessionStatusValue>(
    backendUrl,
    (q) =>
      q
        .from({ sessionStatuses: collections.sessionStatuses })
        .where(({ sessionStatuses }) => eq(sessionStatuses.sessionId, sessionId)),
    [sessionId]
  );
  return data?.[0]?.status ?? 'idle';
}
