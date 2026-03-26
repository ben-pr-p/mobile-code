import { ORPCError } from "@orpc/server"
import { z } from "zod/v4"
import { basename, resolve } from "node:path"
import { customAlphabet } from "nanoid"
import { base } from "./base"
import { sendPrompt } from "../prompt"
import { WorktreeDriver } from "../worktree"
import { generateWorktreeSlug } from "../worktree-name"
import { transcribeAudio } from "../transcribe"
import type { Session } from "../types"

const generateWorktreeId = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 4)

export const projects = {
  /**
   * Create a new session for a project and send the first prompt atomically.
   * If `useWorktree: true`, a git worktree is created first and the session
   * runs inside it instead of the main project directory.
   */
  createSession: base
    .input(z.object({
      projectId: z.string(),
      parts: z.array(z.union([
        z.object({ type: z.literal("text"), text: z.string() }),
        z.object({
          type: z.literal("audio"),
          audioData: z.string(),
          mimeType: z.string().optional(),
          lineReference: z.object({
            file: z.string(),
            startLine: z.number(),
            endLine: z.number(),
            side: z.enum(["additions", "deletions"]).optional(),
          }).optional(),
        }),
      ])),
      model: z.object({ providerID: z.string(), modelID: z.string() }).optional(),
      agent: z.string().optional(),
      useWorktree: z.boolean().optional(),
    }))
    .handler(async ({ input, context }) => {
      const { projectId, parts, model, useWorktree, agent } = input

      // Look up the project to get its worktree
      const projectsRes = await context.client.project.list()
      const project = (projectsRes.data ?? []).find((p: any) => p.id === projectId)
      if (!project) {
        throw new ORPCError("NOT_FOUND", {
          message: `Project not found: ${projectId}`,
        })
      }

      // Determine the directory for this session
      let directory: string = project.worktree
      let worktreePath: string | undefined

      if (useWorktree) {
        try {
          // Extract text from prompt parts — transcribe audio if needed
          let promptText = parts
            .filter((p): p is { type: "text"; text: string } => p.type === "text")
            .map((p) => p.text)
            .join(" ")
            .trim()

          if (!promptText) {
            const audioPart = parts.find(
              (p): p is { type: "audio"; audioData: string; mimeType?: string } => p.type === "audio"
            )
            if (audioPart) {
              promptText = await transcribeAudio(audioPart.audioData, audioPart.mimeType ?? "audio/aac")
            }
          }

          const slug = await generateWorktreeSlug(promptText)
          const worktreeId = `${generateWorktreeId()}-${slug}`
          const projectName = basename(project.worktree)
          // Place worktrees at ../worktrees/<project-name>/<id> relative to project root
          const targetPath = resolve(project.worktree, "..", "worktrees", projectName, worktreeId)
          const branchName = `worktree/${worktreeId}`

          const driver = await WorktreeDriver.open(project.worktree)
          await driver.create(branchName, { path: targetPath })

          directory = targetPath
          worktreePath = targetPath
        } catch (err: any) {
          console.error("[projects.createSession] worktree creation failed:", err)
          throw new ORPCError("INTERNAL_SERVER_ERROR", {
            message: `Failed to create worktree: ${err.message}`,
          })
        }
      }

      // Create the session in the chosen directory
      const createRes = await context.client.session.create({
        directory,
      })
      if (createRes.error) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "Failed to create session",
        })
      }
      const sessionId = createRes.data!.id

      // Persist the session→worktree mapping so we can clean up on delete
      if (worktreePath) {
        context.sessionWorktrees.set(sessionId, { worktreePath, projectWorktree: project.worktree })
        await context.appDs.appendToStream("/", JSON.stringify({
          type: "sessionWorktree",
          key: sessionId,
          value: { sessionId, worktreePath, projectWorktree: project.worktree },
          headers: { operation: "upsert" },
        }), { contentType: "application/json" })
      }

      // Fire the prompt in the background — don't block the response.
      // The client navigates to the session immediately and sees streaming
      // updates via the SSE durable stream.
      sendPrompt(context.client, sessionId, parts, directory, model, agent).catch(
        (err: any) => {
          console.error("[projects.createSession] prompt failed:", err)
        },
      )

      return { sessionId }
    }),

  /** List sessions for a project (queries main worktree + all git worktrees). */
  listSessions: base
    .input(z.object({ projectId: z.string() }))
    .handler(async ({ input, context }) => {
      const { projectId } = input

      // Look up the project to get its worktree
      const projectsRes = await context.client.project.list()
      const project = (projectsRes.data ?? []).find((p: any) => p.id === projectId)
      if (!project) {
        throw new ORPCError("NOT_FOUND", {
          message: `Project not found: ${projectId}`,
        })
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
          const res = await context.client.session.list({ directory: dir })
          return ((res.data ?? []) as Session[])
        })
      )
      return results.flat().sort((a, b) => b.time.updated - a.time.updated)
    }),
}
