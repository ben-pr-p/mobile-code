// oRPC client — type-safe API calls inferred from the server's router types.

import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import type { RouterClient } from '@orpc/server';
import type { Router } from '../../server/src/router';
import { collections } from './collections';
import type { BackendConfigValue } from './stream-db';

/** Type-safe oRPC client for one backend server. */
export type ApiClient = RouterClient<Router>;

/**
 * Creates an oRPC client pointed at a backend server.
 * If authToken is provided, injects the Authorization header on every request.
 */
export function createApiClient(url: string, authToken?: string): ApiClient {
  const cleanUrl = url.replace(/\/$/, '');
  const link = new RPCLink({
    url: `${cleanUrl}/api`,
    ...(authToken
      ? {
          headers: () => ({
            Authorization: `Bearer ${authToken}`,
          }),
        }
      : {}),
  });
  return createORPCClient(link);
}

/**
 * Get an API client for a backend by URL. Reads the auth token from the
 * global DB's `backends` collection. Stateless — creates a new client
 * on each call (oRPC clients are lightweight).
 */
export function getApi(backendUrl: string): ApiClient {
  // Find the backend config by URL (key is id, not url)
  let authToken: string | undefined;
  const state = (collections.backends as any).state as Map<string, BackendConfigValue> | undefined;
  if (state) {
    for (const config of state.values()) {
      if (config.url === backendUrl) {
        authToken = config.authToken;
        break;
      }
    }
  }
  return createApiClient(backendUrl, authToken);
}
