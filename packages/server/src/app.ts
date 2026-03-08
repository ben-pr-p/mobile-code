import { Hono } from "hono"
import { upgradeWebSocket } from "hono/bun"
import { newRpcResponse } from "@hono/capnweb"
import { DurableStreamServer } from "durable-streams-web-standard"
import { customAlphabet } from "nanoid"
import { createClient, Opencode } from "./opencode"
import { Api } from "./rpc"
import { StateStream } from "./state-stream"
import { logger } from 'hono/logger'

const generateInstanceId = customAlphabet("abcdefghijklmnopqrstuvwxyz", 12)

export function createApp(opencodeUrl: string) {
  const client = createClient(opencodeUrl)
  const opencode = new Opencode(opencodeUrl)
  opencode.spawnListener().catch((err) => {
    console.error("Failed to start opencode event listener:", err)
  })
  const app = new Hono()
  app.use(logger())

  // Unique instance ID for this server boot — clients use this to detect restarts
  const instanceId = generateInstanceId()

  // Single durable stream server for state protocol events
  const ds = new DurableStreamServer()
  const stateStream = new StateStream(ds, client, opencode)
  stateStream.initialize().catch((err) => {
    console.error("Failed to initialize state stream:", err)
  })

  // Returns the current instance ID so clients know where to connect
  app.get("/", (c) => {
    return c.json({ instanceId })
  })

  // Stream is mounted at /{instanceId} — changes on every restart
  app.all(`/${instanceId}/*`, (c) => {
    const url = new URL(c.req.url)
    url.pathname = url.pathname.slice(`/${instanceId}`.length) || "/"
    const rewritten = new Request(url.toString(), c.req.raw)
    return ds.fetch(rewritten)
  })
  app.all(`/${instanceId}`, (c) => {
    const url = new URL(c.req.url)
    url.pathname = "/"
    const rewritten = new Request(url.toString(), c.req.raw)
    return ds.fetch(rewritten)
  })

  app.all("/rpc", (c) => {
    return newRpcResponse(c, new Api(client, opencode), { upgradeWebSocket })
  })

  app.get("/health", async (c) => {
    return c.json({ healthy: true, opencodeUrl })
  })

  // API endpoint: returns { file, before, after } for a single file in a session
  app.get("/api/diff", async (c) => {
    const sessionId = c.req.query("session")
    const file = c.req.query("file")
    if (!sessionId || !file) {
      return c.json({ error: "Missing session or file query param" }, 400)
    }
    const res = await client.session.diff({ path: { id: sessionId } })
    if (res.error) {
      return c.json({ error: "Failed to fetch diffs" }, 500)
    }
    const match = (res.data ?? []).find((d: any) => d.file === file)
    if (!match) {
      return c.json({ error: `File not found: ${file}` }, 404)
    }
    return c.json({ file: match.file, before: match.before, after: match.after })
  })

  // API endpoint: returns all file diffs for a session
  app.get("/api/diffs", async (c) => {
    const sessionId = c.req.query("session")
    if (!sessionId) {
      return c.json({ error: "Missing session query param" }, 400)
    }
    const res = await client.session.diff({ path: { id: sessionId } })
    if (res.error) {
      return c.json({ error: "Failed to fetch diffs" }, 500)
    }
    const diffs = (res.data ?? []).map((d: any) => ({
      file: d.file,
      before: d.before,
      after: d.after,
    }))
    return c.json(diffs)
  })

  return { app, ds, stateStream, instanceId }
}
