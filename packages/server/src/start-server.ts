/**
 * Shared server bootstrap — used by both the CLI `start` command and
 * the standalone `server.ts` entrypoint.
 */

import { createApp } from "./app"
import { ensureOpenCode, cleanupOnExit } from "./spawn-opencode"

/** Options for {@link startServer}. */
export interface StartServerOptions {
  /**
   * OpenCode server URL to bridge. Empty string or undefined means
   * "spawn one automatically".
   */
  opencodeUrl?: string
  /** Port for the Bun HTTP server. */
  port: number
}

/**
 * Create the Hono app and start the Bun HTTP server.
 *
 * When no `opencodeUrl` is provided, an `opencode serve` child process
 * is spawned on an available port. It is killed when the flock server exits.
 *
 * Returns the app internals alongside the Bun `Server` handle so the
 * caller can inspect or stop the server if needed.
 */
export async function startServer(options: StartServerOptions) {
  const { port } = options

  const { url: opencodeUrl, child: opencodeChild } = await ensureOpenCode(options.opencodeUrl)

  if (opencodeChild) {
    cleanupOnExit(opencodeChild)
  }

  const { app, instanceDs, ephemeralDs, appDs, stateStream, instanceId } = await createApp(opencodeUrl)

  console.log(`Server starting on port ${port} (opencode: ${opencodeUrl})`)

  const server = Bun.serve({
    port,
    idleTimeout: 255, // seconds — must exceed durable streams long-poll timeout (30s)
    fetch: app.fetch,
  })

  return { app, instanceDs, ephemeralDs, appDs, stateStream, instanceId, server }
}
