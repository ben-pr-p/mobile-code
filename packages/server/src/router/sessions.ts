import { ORPCError } from "@orpc/server"
import { z } from "zod/v4"
import { base } from "./base"
import { sendPrompt } from "../prompt"
import { handleVoicePrompt } from "../voice-prompt"
import { WorktreeDriver } from "../worktree"

export const sessions = {
  /** Send a prompt to an existing session. */
  prompt: base
    .input(z.object({
      sessionId: z.string(),
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
      lineReference: z.object({
        file: z.string(),
        startLine: z.number(),
        endLine: z.number(),
        side: z.enum(["additions", "deletions"]).optional(),
      }).optional(),
    }))
    .handler(async ({ input, context }) => {
      const { sessionId, parts, model, agent, lineReference } = input
      try {
        const sessionRes = await context.client.session.get({ sessionID: sessionId })
        const directory = sessionRes.data?.directory
        await sendPrompt(context.client, sessionId, parts, directory, model, agent, lineReference)
        return { success: true as const }
      } catch (err: any) {
        console.error("[sessions.prompt]", err)
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: err.message ?? "Prompt failed",
        })
      }
    }),

  /** Abort a currently running session. */
  abort: base
    .input(z.object({ sessionId: z.string() }))
    .handler(async ({ input, context }) => {
      const { sessionId } = input
      try {
        const sessionRes = await context.client.session.get({ sessionID: sessionId })
        const directory = sessionRes.data?.directory
        const res = await context.client.session.abort({
          sessionID: sessionId,
          ...(directory ? { directory } : {}),
        })
        if (res.error) {
          throw new ORPCError("INTERNAL_SERVER_ERROR", {
            message: "Failed to abort session",
          })
        }
        return { success: true as const }
      } catch (err: any) {
        if (err instanceof ORPCError) throw err
        console.error("[sessions.abort]", err)
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: err.message ?? "Abort failed",
        })
      }
    }),

  /** Delete a session permanently (and remove its worktree if one exists). */
  delete: base
    .input(z.object({ sessionId: z.string() }))
    .handler(async ({ input, context }) => {
      const { sessionId } = input
      try {
        const sessionRes = await context.client.session.get({ sessionID: sessionId })
        const directory = sessionRes.data?.directory

        const res = await context.client.session.delete({
          sessionID: sessionId,
          ...(directory ? { directory } : {}),
        })
        if (res.error) {
          throw new ORPCError("INTERNAL_SERVER_ERROR", {
            message: "Failed to delete session",
          })
        }

        // Push the deletion through the durable stream immediately so
        // connected clients see it without waiting for the SSE event.
        context.stateStream.sessionDeleted({ id: sessionId })

        // Clean up the git worktree if this session had one
        const worktreeInfo = context.sessionWorktrees.get(sessionId)
        if (worktreeInfo) {
          try {
            const driver = await WorktreeDriver.open(worktreeInfo.projectWorktree)
            await driver.remove(worktreeInfo.worktreePath, { force: true, deleteBranch: true })
          } catch (err: any) {
            // Log but don't fail the delete — the session is already gone
            console.error(`[sessions.delete] worktree cleanup failed:`, err)
          }
          context.sessionWorktrees.delete(sessionId)
        }

        return { success: true as const }
      } catch (err: any) {
        if (err instanceof ORPCError) throw err
        console.error("[sessions.delete]", err)
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: err.message ?? "Delete failed",
        })
      }
    }),

  /** Execute a command on a session. */
  command: base
    .input(z.object({
      sessionId: z.string(),
      command: z.string(),
      arguments: z.string(),
      agent: z.string().optional(),
      model: z.object({ providerID: z.string(), modelID: z.string() }).optional(),
    }))
    .handler(async ({ input, context }) => {
      const { sessionId, command, arguments: args, agent, model } = input
      try {
        const sessionRes = await context.client.session.get({ sessionID: sessionId })
        const directory = sessionRes.data?.directory
        const res = await context.client.session.command({
          sessionID: sessionId,
          directory,
          command,
          arguments: args,
          ...(agent ? { agent } : {}),
          ...(model ? { model: `${model.providerID}/${model.modelID}` } : {}),
        })
        if (res.error) {
          throw new ORPCError("INTERNAL_SERVER_ERROR", {
            message: "Command failed",
          })
        }
        return { success: true as const }
      } catch (err: any) {
        if (err instanceof ORPCError) throw err
        console.error("[sessions.command]", err)
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: err.message ?? "Command failed",
        })
      }
    }),

  /** Walking-mode voice prompt: transcribe, route, optionally respond with TTS. */
  voicePrompt: base
    .input(z.object({
      sessionId: z.string(),
      audioData: z.string(),
      mimeType: z.string().optional(),
      model: z.object({ providerID: z.string(), modelID: z.string() }).optional(),
    }))
    .handler(async ({ input, context }) => {
      const { sessionId, audioData, mimeType, model } = input
      try {
        const sessionRes = await context.client.session.get({ sessionID: sessionId })
        const directory = sessionRes.data?.directory
        return await handleVoicePrompt(
          context.client,
          sessionId,
          audioData,
          mimeType ?? "audio/x-caf",
          directory,
          model,
        )
      } catch (err: any) {
        if (err instanceof ORPCError) throw err
        console.error("[sessions.voicePrompt]", err)
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: err.message ?? "Voice prompt failed",
        })
      }
    }),

  /** Archive a session (persistent app state). */
  archive: base
    .input(z.object({ sessionId: z.string() }))
    .handler(async ({ input, context }) => {
      await context.appDs.appendToStream("/", JSON.stringify({
        type: "sessionMeta",
        key: input.sessionId,
        value: { sessionId: input.sessionId, archived: true },
        headers: { operation: "upsert" },
      }), { contentType: "application/json" })
      return { success: true as const }
    }),

  /** Unarchive a session (persistent app state). */
  unarchive: base
    .input(z.object({ sessionId: z.string() }))
    .handler(async ({ input, context }) => {
      await context.appDs.appendToStream("/", JSON.stringify({
        type: "sessionMeta",
        key: input.sessionId,
        value: { sessionId: input.sessionId, archived: false },
        headers: { operation: "upsert" },
      }), { contentType: "application/json" })
      return { success: true as const }
    }),

  /** Check the merge status for a worktree session. */
  mergeStatus: base
    .input(z.object({ sessionId: z.string() }))
    .handler(async ({ input, context }) => {
      const worktreeInfo = context.sessionWorktrees.get(input.sessionId)
      if (!worktreeInfo) {
        return { isWorktreeSession: false as const }
      }

      try {
        const driver = await WorktreeDriver.open(worktreeInfo.projectWorktree)
        const branch = await driver.branchForPath(worktreeInfo.worktreePath)
        if (!branch) {
          return { isWorktreeSession: true as const, error: "Could not resolve branch for worktree" }
        }

        const merged = await driver.isMerged(branch, "main")
        const hasUnmerged = await driver.hasUnmergedCommits(branch, "main")

        return {
          isWorktreeSession: true as const,
          branch,
          merged,
          hasUnmergedCommits: hasUnmerged,
        }
      } catch (err: any) {
        console.error(`[sessions.mergeStatus]`, err)
        return { isWorktreeSession: true as const, error: err.message ?? "Failed to check merge status" }
      }
    }),

  /** Merge a worktree session's branch into main. */
  merge: base
    .input(z.object({ sessionId: z.string() }))
    .handler(async ({ input, context }) => {
      const worktreeInfo = context.sessionWorktrees.get(input.sessionId)
      if (!worktreeInfo) {
        throw new ORPCError("BAD_REQUEST", {
          message: "Session does not have an associated worktree",
        })
      }

      try {
        const driver = await WorktreeDriver.open(worktreeInfo.projectWorktree)
        const branch = await driver.branchForPath(worktreeInfo.worktreePath)
        if (!branch) {
          throw new ORPCError("BAD_REQUEST", {
            message: "Could not resolve branch for worktree",
          })
        }

        // Dry-run: check for conflicts before attempting the real merge
        const check = await driver.canMerge(branch, "main")
        if (!check.ok) {
          throw new ORPCError("CONFLICT", {
            message: "Merge would conflict",
            data: {
              reason: check.reason,
              conflictingFiles: check.conflictingFiles,
            },
          })
        }

        // Real merge: --no-ff into main (default)
        await driver.merge(branch, { into: "main" })

        // Push updated worktree status through the stream
        context.stateStream.refreshWorktreeStatus(input.sessionId)

        return { success: true as const, branch }
      } catch (err: any) {
        if (err instanceof ORPCError) throw err
        console.error(`[sessions.merge]`, err)
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: err.message ?? "Merge failed",
        })
      }
    }),
}
