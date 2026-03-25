#!/usr/bin/env bun
/**
 * Standalone Bun HTTP server entrypoint for `bun run dev` / `bun run start`.
 *
 * Reads configuration from environment variables only (no CLI arg parsing).
 * The CLI entrypoint (`index.ts`) calls {@link startServer} directly.
 */

import { startServer } from "./start-server"
import { env } from "./env"

export const { app, instanceDs, ephemeralDs, appDs, stateStream, instanceId, server } = await startServer({
  opencodeUrl: env.OPENCODE_URL,
  port: env.PORT,
})
