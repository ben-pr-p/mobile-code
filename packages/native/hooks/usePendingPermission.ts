import { eq, useLiveQuery } from '@tanstack/react-db';
import { collections } from '../lib/collections';
import type { PermissionRequestValue } from '../lib/stream-db';

/**
 * Live pending permission request for a session from the ephemeral stream.
 *
 * Returns the current pending permission request (if any) for the given session,
 * or null when no permission is pending. OpenCode sends one permission request
 * at a time per session (it blocks until replied).
 */
export function usePendingPermission(
  sessionId: string
): PermissionRequestValue | null {
  const { data } = useLiveQuery(
    (q) =>
      q
        .from({ permissionRequests: collections.permissionRequests })
        .where(({ permissionRequests }) => eq(permissionRequests.sessionId, sessionId)),
    [sessionId]
  );
  return (data as PermissionRequestValue[] | null)?.[0] ?? null;
}
