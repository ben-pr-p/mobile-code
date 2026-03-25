import type { DurableStreamServer } from "durable-streams-web-standard"
import type { OpencodeClient } from "../opencode"
import type { StateStream } from "../state-stream"

/**
 * Shared context provided to every oRPC procedure.
 *
 * Injected at handler creation time in app.ts — procedures receive this
 * via oRPC's context mechanism, making them independently testable.
 */
export interface RouterContext {
  /** OpenCode SDK client for talking to the opencode backend. */
  client: OpencodeClient
  /** Persistent app-level durable stream (survives server restarts). */
  appDs: DurableStreamServer
  /** In-memory ephemeral durable stream (resets on server restart). */
  ephemeralDs: DurableStreamServer
  /** In-memory index of session → worktree mappings. */
  sessionWorktrees: Map<string, { worktreePath: string; projectWorktree: string }>
  /** Real-time state stream for pushing updates to connected clients. */
  stateStream: StateStream
}
