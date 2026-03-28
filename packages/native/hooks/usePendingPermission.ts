import { eq } from '@tanstack/react-db';
import { useBackendEphemeralStateQuery } from '../lib/merged-query';
import { collections } from '../lib/collections';
import type { PermissionRequestValue } from '../lib/stream-db';
import type { BackendUrl } from '../state/backends';

/**
 * Live pending permission request for a session from the ephemeral stream.
 *
 * Returns the current pending permission request (if any) for the given session,
 * or null when no permission is pending. OpenCode sends one permission request
 * at a time per session (it blocks until replied).
 */
export function usePendingPermission(
  backendUrl: BackendUrl,
  sessionId: string
): PermissionRequestValue | null {
  const { data } = useBackendEphemeralStateQuery<PermissionRequestValue>(
    backendUrl,
    (q) =>
      q
        .from({ permissionRequests: collections.permissionRequests })
        .where(({ permissionRequests }) => eq(permissionRequests.sessionId, sessionId)),
    [sessionId]
  );
  return data?.[0] ?? null;
}
