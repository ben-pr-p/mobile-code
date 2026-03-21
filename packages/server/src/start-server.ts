/**
 * Shared server bootstrap — used by both the CLI `start` command and
 * the standalone `server.ts` entrypoint.
 */

import { createApp } from "./app"
import diffPage from "./diff-page/index.html"

/** Options for {@link startServer}. */
export interface StartServerOptions {
  /** OpenCode server URL to bridge. */
  opencodeUrl: string
  /** Port for the Bun HTTP server. */
  port: number
}

/**
 * Create the Hono app and start the Bun HTTP server.
 *
 * Returns the app internals alongside the Bun `Server` handle so the
 * caller can inspect or stop the server if needed.
 */
export async function startServer(options: StartServerOptions) {
  const { opencodeUrl, port } = options
  const { app, routes, ds, appDs, stateStream, instanceId } = await createApp(opencodeUrl)

  console.log(`Server starting on port ${port} (opencode: ${opencodeUrl})`)

  const server = Bun.serve({
    port,
    idleTimeout: 255, // seconds — must exceed durable streams long-poll timeout (30s)
    routes: {
      "/diff": diffPage,
    },
    fetch: app.fetch,
  })

  return { app, ds, appDs, stateStream, instanceId, server }
}
