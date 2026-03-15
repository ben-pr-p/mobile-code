import { Hono } from "hono"
import { DurableStreamServer } from "durable-streams-web-standard"
import { FileBackedStreamStore } from "@durable-streams/server"
import { join, basename, resolve } from "node:path"
import { homedir } from "node:os"
import { customAlphabet } from "nanoid"
import { z } from "zod/v4"
import { zValidator } from "@hono/zod-validator"
import { createClient, Opencode, handleOpencodeEvent } from "./opencode"
import { StateStream } from "./state-stream"
import { sendPrompt } from "./prompt"
import { WorktreeDriver } from "./worktree"
import { logger } from 'hono/logger'
import type { Session } from "./types"

const generateInstanceId = customAlphabet("abcdefghijklmnopqrstuvwxyz", 12)
const generateWorktreeId = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 6)

// Shared schema for prompt parts
const PromptPartsSchema = z.object({
  parts: z.array(
    z.union([
      z.object({ type: z.literal("text"), text: z.string() }),
      z.object({ type: z.literal("audio"), audioData: z.string(), mimeType: z.string().optional() }),
    ])
  ),
  model: z.object({
    providerID: z.string(),
    modelID: z.string(),
  }).optional(),
  agent: z.string().optional(),
})

// Extended schema for session creation — adds optional worktree flag
const CreateSessionSchema = PromptPartsSchema.extend({
  useWorktree: z.boolean().optional(),
})

export async function createApp(opencodeUrl: string) {
  const client = createClient(opencodeUrl)
  const opencode = new Opencode(opencodeUrl)

  // Unique instance ID for this server boot — clients use this to detect restarts
  const instanceId = generateInstanceId()

  // Persistent app state stream — survives server restarts
  const dataDir = join(homedir(), ".local", "share", "mobile-agents")
  const appStore = new FileBackedStreamStore({ dataDir })
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

  // Single durable stream server for state protocol events.
  // Created after sessionWorktrees so initialization can emit merge status.
  const ds = new DurableStreamServer()
  const stateStream = new StateStream(ds, client, sessionWorktrees)
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
    return c.json({ instanceId, appStreamUrl: "/app" })
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

  // Persistent app state stream — fixed path, never resets
  app.all("/app/*", (c) => {
    const url = new URL(c.req.url)
    url.pathname = url.pathname.slice("/app".length) || "/"
    return appDs.fetch(new Request(url.toString(), c.req.raw))
  })
  app.all("/app", (c) => {
    const url = new URL(c.req.url)
    url.pathname = "/"
    return appDs.fetch(new Request(url.toString(), c.req.raw))
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
        const { parts, model, agent } = c.req.valid("json")
        try {
          // Look up the session to get its directory
          const sessionRes = await client.session.get({ path: { id: sessionId } })
          const directory = (sessionRes.data as any)?.directory as string | undefined
          await sendPrompt(client, sessionId, parts, directory, model, agent)
          return c.json({ success: true })
        } catch (err: any) {
          console.error("[POST /api/sessions/:sessionId/prompt]", err)
          return c.json({ error: err.message ?? "Prompt failed" }, 500)
        }
      },
    )

    /**
     * Create a new session for a project and send the first prompt atomically.
     * If `useWorktree: true`, a git worktree is created first and the session
     * runs inside it instead of the main project directory.
     */
    .post(
      "/projects/:projectId/sessions",
      zValidator("json", CreateSessionSchema),
      async (c) => {
        const projectId = c.req.param("projectId")
        const { parts, model, useWorktree, agent } = c.req.valid("json")

        // Look up the project to get its worktree
        const projectsRes = await client.project.list()
        const project = (projectsRes.data ?? []).find((p: any) => p.id === projectId)
        if (!project) {
          return c.json({ error: `Project not found: ${projectId}` }, 404)
        }

        // Determine the directory for this session
        let directory: string = project.worktree
        let worktreePath: string | undefined

        if (useWorktree) {
          try {
            const worktreeId = generateWorktreeId()
            const projectName = basename(project.worktree)
            // Place worktrees at ../worktrees/<project-name>/<id> relative to project root
            const targetPath = resolve(project.worktree, "..", "worktrees", projectName, worktreeId)
            const branchName = `worktree/${worktreeId}`

            const driver = await WorktreeDriver.open(project.worktree)
            await driver.create(branchName, { path: targetPath })

            directory = targetPath
            worktreePath = targetPath
          } catch (err: any) {
            console.error("[POST /api/projects/:projectId/sessions] worktree creation failed:", err)
            return c.json({ error: `Failed to create worktree: ${err.message}` }, 500)
          }
        }

        // Create the session in the chosen directory
        const createRes = await client.session.create({
          query: { directory },
        })
        if (createRes.error) {
          return c.json({ error: "Failed to create session" }, 500)
        }
        const sessionId = createRes.data!.id

        // Persist the session→worktree mapping so we can clean up on delete
        if (worktreePath) {
          sessionWorktrees.set(sessionId, { worktreePath, projectWorktree: project.worktree })
          await appDs.appendToStream("/", JSON.stringify({
            type: "sessionWorktree",
            key: sessionId,
            value: { sessionId, worktreePath, projectWorktree: project.worktree },
            headers: { operation: "upsert" },
          }), { contentType: "application/json" })
        }

        // Fire the prompt in the background — don't block the response.
        // The client navigates to the session immediately and sees streaming
        // updates via the SSE durable stream.
        sendPrompt(client, sessionId, parts, directory, model, agent).catch(
          (err: any) => {
            console.error("[POST /api/projects/:projectId/sessions] prompt failed:", err)
          },
        )

        return c.json({ sessionId })
      },
    )

    // List sessions for a project (queries main worktree + all git worktrees)
    .get("/projects/:projectId/sessions", async (c) => {
      const projectId = c.req.param("projectId")

      // Look up the project to get its worktree
      const projectsRes = await client.project.list()
      const project = (projectsRes.data ?? []).find((p: any) => p.id === projectId)
      if (!project) {
        return c.json({ error: `Project not found: ${projectId}` }, 404)
      }

      // Collect all directories: main worktree + any git worktrees
      const directories: string[] = [project.worktree]
      try {
        const driver = await WorktreeDriver.open(project.worktree)
        const entries = await driver.list()
        for (const entry of entries) {
          if (entry.path !== project.worktree) {
            directories.push(entry.path)
          }
        }
      } catch {
        // Not a git repo or worktree listing failed — just use main directory
      }

      // Query sessions for each directory in parallel
      const results = await Promise.all(
        directories.map(async (dir) => {
          const res = await client.session.list({ query: { directory: dir } })
          return ((res.data ?? []) as Session[])
        })
      )
      const sessions = results.flat().sort((a, b) => b.time.updated - a.time.updated)

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

    // Delete a session permanently (and remove its worktree if one exists)
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

        // Clean up the git worktree if this session had one
        const worktreeInfo = sessionWorktrees.get(sessionId)
        if (worktreeInfo) {
          try {
            const driver = await WorktreeDriver.open(worktreeInfo.projectWorktree)
            await driver.remove(worktreeInfo.worktreePath, { force: true, deleteBranch: true })
          } catch (err: any) {
            // Log but don't fail the delete — the session is already gone
            console.error(`[DELETE /api/sessions/${sessionId}] worktree cleanup failed:`, err)
          }
          sessionWorktrees.delete(sessionId)
        }

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

    // List available providers and models
    .get("/models", async (c) => {
      try {
        const res = await client.provider.list()
        if (res.error) {
          return c.json({ error: "Failed to list providers" }, 500)
        }
        return c.json(res.data)
      } catch (err: any) {
        console.error("[GET /api/models]", err)
        return c.json({ error: err.message ?? "Failed to list models" }, 500)
      }
    })

    // List available agents
    .get("/agents", async (c) => {
      try {
        const res = await (client.app as any).agents()
        if (res.error) return c.json({ error: "Failed to list agents" }, 500)
        return c.json(res.data)
      } catch (err: any) {
        console.error("[GET /api/agents]", err)
        return c.json({ error: err.message ?? "Failed to list agents" }, 500)
      }
    })

    // List available commands
    .get("/commands", async (c) => {
      try {
        const res = await (client.command as any).list()
        if (res.error) return c.json({ error: "Failed to list commands" }, 500)
        return c.json(res.data)
      } catch (err: any) {
        console.error("[GET /api/commands]", err)
        return c.json({ error: err.message ?? "Failed to list commands" }, 500)
      }
    })

    // Execute a command on a session
    .post(
      "/sessions/:sessionId/command",
      zValidator("json", z.object({
        command: z.string(),
        arguments: z.string(),
        agent: z.string().optional(),
        model: z.object({
          providerID: z.string(),
          modelID: z.string(),
        }).optional(),
      })),
      async (c) => {
        const sessionId = c.req.param("sessionId")
        const { command, arguments: args, agent, model } = c.req.valid("json")
        try {
          const sessionRes = await client.session.get({ path: { id: sessionId } })
          const directory = (sessionRes.data as any)?.directory as string | undefined
          const res = await (client.session as any).command({
            path: { id: sessionId },
            body: {
              command,
              arguments: args,
              ...(agent ? { agent } : {}),
              ...(model ? { model: `${model.providerID}/${model.modelID}` } : {}),
            },
            query: { directory },
          })
          if (res.error) return c.json({ error: "Command failed" }, 500)
          return c.json({ success: true })
        } catch (err: any) {
          console.error("[POST /api/sessions/:sessionId/command]", err)
          return c.json({ error: err.message ?? "Command failed" }, 500)
        }
      },
    )

    // Archive a session (persistent app state)
    .post("/sessions/:sessionId/archive", async (c) => {
      const sessionId = c.req.param("sessionId")
      await appDs.appendToStream("/", JSON.stringify({
        type: "sessionMeta",
        key: sessionId,
        value: { sessionId, archived: true },
        headers: { operation: "upsert" },
      }), { contentType: "application/json" })
      return c.json({ success: true })
    })

    // Unarchive a session (persistent app state)
    .post("/sessions/:sessionId/unarchive", async (c) => {
      const sessionId = c.req.param("sessionId")
      await appDs.appendToStream("/", JSON.stringify({
        type: "sessionMeta",
        key: sessionId,
        value: { sessionId, archived: false },
        headers: { operation: "upsert" },
      }), { contentType: "application/json" })
      return c.json({ success: true })
    })

    /**
     * Check the merge status for a worktree session.
     *
     * Returns whether the worktree branch has been merged into main and
     * whether there are unmerged commits. Uses `git branch --merged` which
     * works reliably for --no-ff merges (our default).
     */
    .get("/sessions/:sessionId/merge-status", async (c) => {
      const sessionId = c.req.param("sessionId")
      const worktreeInfo = sessionWorktrees.get(sessionId)
      if (!worktreeInfo) {
        return c.json({ isWorktreeSession: false })
      }

      try {
        const driver = await WorktreeDriver.open(worktreeInfo.projectWorktree)
        const branch = await driver.branchForPath(worktreeInfo.worktreePath)
        if (!branch) {
          return c.json({ isWorktreeSession: true, error: "Could not resolve branch for worktree" })
        }

        const merged = await driver.isMerged(branch, "main")
        const hasUnmerged = await driver.hasUnmergedCommits(branch, "main")

        return c.json({
          isWorktreeSession: true,
          branch,
          merged,
          hasUnmergedCommits: hasUnmerged,
        })
      } catch (err: any) {
        console.error(`[GET /api/sessions/${sessionId}/merge-status]`, err)
        return c.json({ isWorktreeSession: true, error: err.message ?? "Failed to check merge status" })
      }
    })

    /**
     * Merge a worktree session's branch into main.
     *
     * Performs a dry-run first to check for conflicts. If conflicts are
     * detected, returns an error with the list of conflicting files so the
     * user can instruct the agent to rebase and resolve them.
     */
    .post("/sessions/:sessionId/merge", async (c) => {
      const sessionId = c.req.param("sessionId")
      const worktreeInfo = sessionWorktrees.get(sessionId)
      if (!worktreeInfo) {
        return c.json({ error: "Session does not have an associated worktree" }, 400)
      }

      try {
        const driver = await WorktreeDriver.open(worktreeInfo.projectWorktree)
        const branch = await driver.branchForPath(worktreeInfo.worktreePath)
        if (!branch) {
          return c.json({ error: "Could not resolve branch for worktree" }, 400)
        }

        // Dry-run: check for conflicts before attempting the real merge
        const check = await driver.canMerge(branch, "main")
        if (!check.ok) {
          return c.json({
            error: "Merge would conflict",
            reason: check.reason,
            conflictingFiles: check.conflictingFiles,
          }, 409)
        }

        // Real merge: --no-ff into main (default)
        await driver.merge(branch, { into: "main" })

        // Push updated worktree status through the stream
        stateStream.refreshWorktreeStatus(sessionId)

        return c.json({ success: true, branch })
      } catch (err: any) {
        console.error(`[POST /api/sessions/${sessionId}/merge]`, err)
        return c.json({ error: err.message ?? "Merge failed" }, 500)
      }
    })

  const routes = app.route("/api", api)

  return { app, routes, ds, appDs, stateStream, instanceId }
}

export type AppType = Awaited<ReturnType<typeof createApp>>["routes"]
