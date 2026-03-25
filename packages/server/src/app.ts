import { Hono, type Context } from "hono"
import { DurableStreamServer } from "durable-streams-web-standard"
import { FileBackedStreamStore } from "@durable-streams/server"
import { dataDir } from "@crustjs/store"
import { customAlphabet } from "nanoid"
import { RPCHandler } from "@orpc/server/fetch"
import { onError } from "@orpc/server"
import { createClient, Opencode, handleOpencodeEvent } from "./opencode"
import { env } from "./env"
import { StateStream } from "./state-stream"
import { router } from "./router"
import type { RouterContext } from "./router"
import { logger } from 'hono/logger'

/** Hono handler that strips a prefix from the URL and forwards to a DurableStreamServer. */
function rewriteToDs(prefix: string, ds: DurableStreamServer) {
  return (c: Context) => {
    const url = new URL(c.req.url)
    url.pathname = url.pathname.slice(prefix.length) || "/"
    return ds.fetch(new Request(url.toString(), c.req.raw))
  }
}

const generateInstanceId = customAlphabet("abcdefghijklmnopqrstuvwxyz", 12)

export async function createApp(opencodeUrl: string) {
  const client = createClient(opencodeUrl)
  const opencode = new Opencode(opencodeUrl)

  // Unique instance ID for this server boot — clients use this to detect restarts
  const instanceId = generateInstanceId()

  // Persistent app state stream — survives server restarts
  const appDataDir = dataDir("flockcode")
  const appStore = new FileBackedStreamStore({ dataDir: appDataDir })
  const appDs = new DurableStreamServer({ store: appStore })
  await appDs.createStream("/", { contentType: "application/json" })

  // In-memory index of session→worktree mappings, rebuilt from the persistent
  // app state stream on startup so worktree cleanup survives server restarts.
  const sessionWorktrees = new Map<string, { worktreePath: string; projectWorktree: string }>()
  try {
    const { messages } = appDs.readStream("/")
    const decoder = new TextDecoder()
    for (const msg of messages) {
      const event = JSON.parse(decoder.decode(msg.data))
      if (event.type === "sessionWorktree" && event.value) {
        sessionWorktrees.set(event.key, {
          worktreePath: event.value.worktreePath,
          projectWorktree: event.value.projectWorktree,
        })
      }
    }
  } catch {
    // Stream may be empty on first boot — that's fine
  }

  // Instance stream — finalized, replayable state events.
  // Created after sessionWorktrees so initialization can emit merge status.
  const instanceDs = new DurableStreamServer()

  // Ephemeral stream — live-only UI state (session status, in-progress messages, worktree status).
  const ephemeralDs = new DurableStreamServer()

  const stateStream = new StateStream(instanceDs, ephemeralDs, client, sessionWorktrees)
  stateStream.initialize().catch((err) => {
    console.error("Failed to initialize state stream:", err)
  })

  // Subscribe to opencode events and route them to the state stream
  opencode.spawnListener((event) => handleOpencodeEvent(event, stateStream), opencodeUrl).catch((err) => {
    console.error("Failed to start opencode event listener:", err)
  })

  const app = new Hono()
  app.use(logger())

  // Optional bearer token auth — required when FLOCK_AUTH_TOKEN is set
  // (e.g., on a publicly accessible Fly Sprite). No-op when running locally.
  const authToken = env.FLOCK_AUTH_TOKEN
  if (authToken) {
    app.use('*', async (c, next) => {
      const header = c.req.header('Authorization')
      if (header !== `Bearer ${authToken}`) {
        return c.json({ error: 'Unauthorized' }, 401)
      }
      return next()
    })
  }

  // Returns the current instance ID so clients know where to connect
  app.get("/", (c) => {
    return c.json({ instanceId, appStreamUrl: "/app" })
  })

  // Ephemeral stream — live-only state, no catch-up replay
  // Must be mounted before the instance stream catch-all so it matches first.
  const ephemeralPrefix = `/${instanceId}/ephemeral`
  app.all(`${ephemeralPrefix}/*`, rewriteToDs(ephemeralPrefix, ephemeralDs))
  app.all(ephemeralPrefix, rewriteToDs(ephemeralPrefix, ephemeralDs))

  // Instance stream — finalized, replayable state events
  const instancePrefix = `/${instanceId}`
  app.all(`${instancePrefix}/*`, rewriteToDs(instancePrefix, instanceDs))
  app.all(instancePrefix, rewriteToDs(instancePrefix, instanceDs))

  // Persistent app state stream — fixed path, never resets
  app.all("/app/*", rewriteToDs("/app", appDs))
  app.all("/app", rewriteToDs("/app", appDs))

  app.get("/health", async (c) => {
    return c.json({ healthy: true, opencodeUrl, instanceId })
  })

  // -----------------------------------------------------------------------
  // oRPC handler — serves all typed API procedures at /api/*
  // -----------------------------------------------------------------------

  const routerContext: RouterContext = {
    client,
    appDs,
    ephemeralDs,
    sessionWorktrees,
    stateStream,
  }

  const rpcHandler = new RPCHandler(router, {
    interceptors: [
      onError((error) => {
        console.error("[oRPC]", error)
      }),
    ],
  })

  app.use("/api/*", async (c, next) => {
    const { matched, response } = await rpcHandler.handle(c.req.raw, {
      prefix: "/api",
      context: routerContext,
    })
    if (matched) {
      return c.newResponse(response.body, response)
    }
    await next()
  })

  return { app, instanceDs, ephemeralDs, appDs, stateStream, instanceId }
}

export type { Router } from "./router"
