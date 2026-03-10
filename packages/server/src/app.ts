import { Hono } from "hono"
import { DurableStreamServer } from "durable-streams-web-standard"
import { customAlphabet } from "nanoid"
import { z } from "zod/v4"
import { zValidator } from "@hono/zod-validator"
import { createClient, Opencode, handleOpencodeEvent } from "./opencode"
import { StateStream } from "./state-stream"
import { sendPrompt } from "./prompt"
import { logger } from 'hono/logger'
import type { Session } from "./types"

const generateInstanceId = customAlphabet("abcdefghijklmnopqrstuvwxyz", 12)

// Shared schema for prompt parts
const PromptPartsSchema = z.object({
  parts: z.array(
    z.union([
      z.object({ type: z.literal("text"), text: z.string() }),
      z.object({ type: z.literal("audio"), audioData: z.string(), mimeType: z.string().optional() }),
    ])
  ),
})

export function createApp(opencodeUrl: string) {
  const client = createClient(opencodeUrl)
  const opencode = new Opencode(opencodeUrl)

  // Unique instance ID for this server boot — clients use this to detect restarts
  const instanceId = generateInstanceId()

  // Single durable stream server for state protocol events
  const ds = new DurableStreamServer()
  const stateStream = new StateStream(ds, client)
  stateStream.initialize().catch((err) => {
    console.error("Failed to initialize state stream:", err)
  })

  // Subscribe to opencode events and route them to the state stream
  opencode.spawnListener((event) => handleOpencodeEvent(event, stateStream), opencodeUrl).catch((err) => {
    console.error("Failed to start opencode event listener:", err)
  })

  const app = new Hono()
  app.use(logger())

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

  app.get("/health", async (c) => {
    return c.json({ healthy: true, opencodeUrl })
  })

  // -----------------------------------------------------------------------
  // API routes — chained so Hono can infer the full type for the RPC client
  // -----------------------------------------------------------------------

  const api = new Hono()

    // Send a prompt to an existing session
    .post(
      "/sessions/:sessionId/prompt",
      zValidator("json", PromptPartsSchema),
      async (c) => {
        const sessionId = c.req.param("sessionId")
        const { parts } = c.req.valid("json")
        try {
          // Look up the session to get its directory
          const sessionRes = await client.session.get({ path: { id: sessionId } })
          const directory = (sessionRes.data as any)?.directory as string | undefined
          const message = await sendPrompt(client, sessionId, parts, directory)
          return c.json(message)
        } catch (err: any) {
          console.error("[POST /api/sessions/:sessionId/prompt]", err)
          return c.json({ error: err.message ?? "Prompt failed" }, 500)
        }
      },
    )

    /**
     * Create a new session for a project and send the first prompt atomically
     */
    .post(
      "/projects/:projectId/sessions",
      zValidator("json", PromptPartsSchema),
      async (c) => {
        const projectId = c.req.param("projectId")
        const { parts } = c.req.valid("json")

        // Look up the project to get its worktree
        const projectsRes = await client.project.list()
        const project = (projectsRes.data ?? []).find((p: any) => p.id === projectId)
        if (!project) {
          return c.json({ error: `Project not found: ${projectId}` }, 404)
        }

        // Create the session in the project's worktree
        const createRes = await client.session.create({
          query: { directory: project.worktree },
        })
        if (createRes.error) {
          return c.json({ error: "Failed to create session" }, 500)
        }
        const sessionId = createRes.data!.id

        // Fire the prompt in the background — don't block the response.
        // The client navigates to the session immediately and sees streaming
        // updates via the SSE durable stream.
        sendPrompt(client, sessionId, parts, project.worktree).catch(
          (err: any) => {
            console.error("[POST /api/projects/:projectId/sessions] prompt failed:", err)
          },
        )

        return c.json({ sessionId })
      },
    )

    // List sessions for a project (filtered by worktree)
    .get("/projects/:projectId/sessions", async (c) => {
      const projectId = c.req.param("projectId")

      // Look up the project to get its worktree
      const projectsRes = await client.project.list()
      const project = (projectsRes.data ?? []).find((p: any) => p.id === projectId)
      if (!project) {
        return c.json({ error: `Project not found: ${projectId}` }, 404)
      }

      const sessionsRes = await client.session.list()
      if (sessionsRes.error) {
        return c.json({ error: "Failed to list sessions" }, 500)
      }
      const worktree = project.worktree
      const sessions = ((sessionsRes.data ?? []) as Session[])
        .filter((s) => s.directory === worktree || s.directory.startsWith(worktree + "/"))
        .sort((a, b) => b.time.updated - a.time.updated)

      return c.json(sessions)
    })

    // Returns { file, before, after } for a single file in a session
    .get("/diff", async (c) => {
      const sessionId = c.req.query("session")
      const file = c.req.query("file")
      if (!sessionId || !file) {
        return c.json({ error: "Missing session or file query param" }, 400)
      }
      const sessionRes = await client.session.get({ path: { id: sessionId } })
      const directory = (sessionRes.data as any)?.directory as string | undefined
      const res = await client.session.diff({ path: { id: sessionId }, query: { directory } })
      if (res.error) {
        return c.json({ error: "Failed to fetch diffs" }, 500)
      }
      const match = (res.data ?? []).find((d: any) => d.file === file)
      if (!match) {
        return c.json({ error: `File not found: ${file}` }, 404)
      }
      return c.json({ file: match.file as string, before: match.before as string, after: match.after as string })
    })

    // Abort a currently running session
    .post("/sessions/:sessionId/abort", async (c) => {
      const sessionId = c.req.param("sessionId")
      try {
        const sessionRes = await client.session.get({ path: { id: sessionId } })
        const directory = (sessionRes.data as any)?.directory as string | undefined
        const res = await client.session.abort({
          path: { id: sessionId },
          ...(directory ? { query: { directory } } : {}),
        })
        if (res.error) {
          return c.json({ error: "Failed to abort session" }, 500)
        }
        return c.json({ success: true })
      } catch (err: any) {
        console.error("[POST /api/sessions/:sessionId/abort]", err)
        return c.json({ error: err.message ?? "Abort failed" }, 500)
      }
    })

    // Delete a session permanently
    .delete("/sessions/:sessionId", async (c) => {
      const sessionId = c.req.param("sessionId")
      try {
        // Look up the session to get its directory for the SDK call
        const sessionRes = await client.session.get({ path: { id: sessionId } })
        const directory = (sessionRes.data as any)?.directory as string | undefined

        const res = await client.session.delete({
          path: { id: sessionId },
          ...(directory ? { query: { directory } } : {}),
        })
        if (res.error) {
          return c.json({ error: "Failed to delete session" }, 500)
        }

        // Push the deletion through the durable stream immediately so
        // connected clients see it without waiting for the SSE event.
        stateStream.sessionDeleted({ id: sessionId })

        return c.json({ success: true })
      } catch (err: any) {
        console.error("[DELETE /api/sessions/:sessionId]", err)
        return c.json({ error: err.message ?? "Delete failed" }, 500)
      }
    })

    // Returns all file diffs for a session
    .get("/diffs", async (c) => {
      const sessionId = c.req.query("session")
      if (!sessionId) {
        return c.json({ error: "Missing session query param" }, 400)
      }
      const sessionRes = await client.session.get({ path: { id: sessionId } })
      const directory = (sessionRes.data as any)?.directory as string | undefined
      const res = await client.session.diff({ path: { id: sessionId }, query: { directory } })
      if (res.error) {
        return c.json({ error: "Failed to fetch diffs" }, 500)
      }
      const diffs = (res.data ?? []).map((d: any) => ({
        file: d.file as string,
        before: d.before as string,
        after: d.after as string,
      }))
      return c.json(diffs)
    })

  const routes = app.route("/api", api)

  return { app, routes, ds, stateStream, instanceId }
}

export type AppType = ReturnType<typeof createApp>["routes"]
