export { StateStream }

import type { DurableStreamServer } from "durable-streams-web-standard"
import type { PermissionRequest } from "@opencode-ai/sdk/v2"
import type { OpencodeClient, StateStreamSink } from "./opencode"
import { mapMessage, mapPart } from "./opencode"
import type { Message, MessagePart, ChangedFile } from "./types"
import { WorktreeDriver } from "./worktree"

type InstanceEventType = "project" | "session" | "message"
type EphemeralEventType = "sessionStatus" | "message" | "change" | "worktreeStatus" | "permissionRequest" | "pendingTranscription"

type StateEvent = {
  type: InstanceEventType | EphemeralEventType
  key: string
  value?: unknown
  headers: { operation: "insert" | "update" | "upsert" | "delete" }
}

/** Session-to-worktree mapping shared with app.ts. */
export type SessionWorktreeMap = Map<string, { worktreePath: string; projectWorktree: string }>

type SessionStatus = "idle" | "busy" | "error"

/** Permission request value emitted to the client via the ephemeral stream. */
export type PermissionRequestValue = {
  sessionId: string
  requestId: string
  permission: string
  patterns: string[]
  description: string
}

/**
 * Pending transcription value emitted to the client via the ephemeral stream.
 *
 * Keyed by `messageId` (a client-generated UUID) so that multiple concurrent
 * voice messages to the same session can each have independent status.
 * The same `messageId` is passed to OpenCode's `promptAsync` so the real user
 * message arrives with the same ID — enabling seamless client-side dedup.
 */
export type PendingTranscriptionValue = {
  messageId: string
  sessionId: string
  status: "uploading" | "upload-confirmed" | "transcribing" | "completed" | "forwarded"
  /** The transcribed text, available when status is 'completed' or 'forwarded'. */
  text?: string
}

class StateStream implements StateStreamSink {
  #instanceDs: DurableStreamServer
  #ephemeralDs: DurableStreamServer
  #client: OpencodeClient
  #messages: Map<string, Message> = new Map()
  #sessionDirectories: Map<string, string> = new Map()
  #sessionStatuses: Map<string, { status: SessionStatus; error?: string }> = new Map()
  #pendingPermissions: Map<string, PermissionRequestValue> = new Map()
  #pendingTranscriptions: Map<string, PendingTranscriptionValue> = new Map()
  #lastEmittedSessions: Map<string, any> = new Map()
  #sessionWorktrees: SessionWorktreeMap

  constructor(instanceDs: DurableStreamServer, ephemeralDs: DurableStreamServer, client: OpencodeClient, sessionWorktrees: SessionWorktreeMap) {
    this.#instanceDs = instanceDs
    this.#ephemeralDs = ephemeralDs
    this.#client = client
    this.#sessionWorktrees = sessionWorktrees
  }

  async initialize() {
    await this.#instanceDs.createStream("/", { contentType: "application/json" })
    await this.#ephemeralDs.createStream("/", { contentType: "application/json" })

    // Load all projects
    const projects = await this.#client.project.list()
    for (const project of projects.data ?? []) {
      this.#appendInstanceEvent({
        type: "project",
        key: project.id,
        value: mapProject(project),
        headers: { operation: "insert" },
      })
    }

    // For each project, collect all directories that may contain sessions:
    // the main worktree plus any git worktrees created for parallel sessions.
    // Also build a reverse map from worktree path → project worktree so we can
    // populate sessionWorktrees for sessions discovered in worktree directories.
    const allDirectories: string[] = []
    const worktreePathToProject = new Map<string, string>()
    for (const project of projects.data ?? []) {
      allDirectories.push(project.worktree)
      try {
        const driver = await WorktreeDriver.open(project.worktree)
        const entries = await driver.list()
        for (const entry of entries) {
          if (entry.path !== project.worktree) {
            allDirectories.push(entry.path)
            worktreePathToProject.set(entry.path, project.worktree)
          }
        }
      } catch {
        // Not a git repo or worktree listing failed — skip
      }
    }

    // Load sessions for each directory in parallel
    const projectSessions = await Promise.all(
      allDirectories.map(async (directory) => {
         const res = await this.#client.session.list({ directory })

        for (const session of res.data ?? []) {
          if (session.directory) {
            this.#sessionDirectories.set(session.id, session.directory)
          }
          this.#emitSession(session.id, mapSession(session), "insert")
        }

        return res.data ?? []
      })
    )
    const sessions = projectSessions.flat()

    // Load all messages for each session
    for (const session of sessions ?? []) {
      const msgs = await this.#client.session.messages({ sessionID: session.id, directory: session.directory })
      for (const raw of msgs.data ?? []) {
        const msg = mapMessage(raw)
        this.#messages.set(msg.id, msg)
        this.#appendInstanceEvent({
          type: "message",
          key: msg.id,
          value: msg,
          headers: { operation: "insert" },
        })
      }
    }


    // Populate sessionWorktrees for any sessions discovered in worktree
    // directories that aren't already tracked (e.g. app state stream was lost
    // or the session was created while the server was down).
    for (const session of sessions ?? []) {
      const dir = session.directory
      if (dir && !this.#sessionWorktrees.has(session.id) && worktreePathToProject.has(dir)) {
        this.#sessionWorktrees.set(session.id, {
          worktreePath: dir,
          projectWorktree: worktreePathToProject.get(dir)!,
        })
      }
    }

    // Load file changes for sessions that have diffs
    for (const session of sessions ?? []) {
      if (session.summary?.files && session.summary.files > 0) {
        this.#refetchChanges(session.id)
      }
    }

    // Emit worktree status for all worktree sessions
    for (const sessionId of this.#sessionWorktrees.keys()) {
      this.#emitWorktreeStatus(sessionId)
    }
  }

  // --- StateStreamSink implementation ---

  sessionCreated(info: any) {
    if (info.directory) this.#sessionDirectories.set(info.id, info.directory)
    this.#emitSession(info.id, mapSession(info), "insert")
  }

  sessionUpdated(info: any) {
    if (info.directory) this.#sessionDirectories.set(info.id, info.directory)
    this.#emitSession(info.id, mapSession(info), "update")
  }

  sessionDeleted(info: any) {
    this.#sessionDirectories.delete(info.id)
    this.#sessionStatuses.delete(info.id)
    this.#lastEmittedSessions.delete(info.id)
    this.#appendInstanceEvent({
      type: "session",
      key: info.id,
      headers: { operation: "delete" },
    })
  }

  sessionStatus(sessionId: string, status: { type: "idle" } | { type: "busy" } | { type: "retry"; attempt: number; message: string; next: number }) {
    // Map retry to busy for the client — the session is still working
    const clientStatus: SessionStatus = status.type === "retry" ? "busy" : status.type
    this.#setSessionStatus(sessionId, clientStatus)
  }

  sessionIdle(sessionId: string) {
    this.#setSessionStatus(sessionId, "idle")
    this.#fullMessageSync(sessionId)
    this.#refetchChanges(sessionId)
    // Clear any stale pending permission when the session goes idle
    if (this.#pendingPermissions.has(sessionId)) {
      this.#pendingPermissions.delete(sessionId)
      this.#appendEphemeralEvent({
        type: "permissionRequest",
        key: sessionId,
        headers: { operation: "delete" },
      })
    }
    // Full worktree status refresh — commits happen when the session goes idle
    if (this.#sessionWorktrees.has(sessionId)) {
      this.#emitWorktreeStatus(sessionId)
    }
  }

  sessionCompacted(_sessionId: string) {
    // No-op for now
  }

  sessionDiff(sessionId: string, diff: any[]) {
    // Live diff during active work — ephemeral, not finalized
    this.#appendEphemeralEvent({
      type: "change",
      key: sessionId,
      value: { sessionId, files: this.#mapChanges(diff) },
      headers: { operation: "upsert" },
    })
  }

  sessionError(sessionId: string | undefined, error: any) {
    if (!sessionId) return
    const message = typeof error === "string" ? error
      : error?.data?.message ?? error?.message ?? "Unknown error"
    this.#setSessionStatus(sessionId, "error", message)
  }

  messageUpdated(info: any) {
    // Extract model info — user messages nest it under info.model,
    // assistant messages have it flat on info
    const modelID = info.role === "user"
      ? info.model?.modelID
      : info.modelID
    const providerID = info.role === "user"
      ? info.model?.providerID
      : info.providerID

    const agent = info.agent as string | undefined

    const existing = this.#messages.get(info.id)
    if (existing) {
      existing.createdAt = info.time?.created ?? existing.createdAt
      if (modelID) existing.modelID = modelID
      if (providerID) existing.providerID = providerID
      if (agent) existing.agent = agent
      if (info.role === "assistant") {
        existing.cost = info.cost
        existing.tokens = info.tokens
          ? { input: info.tokens.input, output: info.tokens.output, reasoning: info.tokens.reasoning }
          : existing.tokens
        existing.finish = info.finish
      }
    } else {
      const msg: Message = {
        id: info.id,
        sessionId: info.sessionID,
        role: info.role,
        parts: [],
        createdAt: info.time?.created ?? 0,
        ...(modelID ? { modelID } : {}),
        ...(providerID ? { providerID } : {}),
        ...(agent ? { agent } : {}),
        ...(info.role === "assistant" ? {
          cost: info.cost,
          tokens: info.tokens
            ? { input: info.tokens.input, output: info.tokens.output, reasoning: info.tokens.reasoning }
            : undefined,
          finish: info.finish,
        } : {}),
      }
      this.#messages.set(info.id, msg)
    }
    // If we're receiving an assistant message without a finish signal,
    // the session is actively working — mark it busy if not already
    if (info.role === "assistant" && !info.finish) {
      const current = this.#sessionStatuses.get(info.sessionID)
      if (!current || current.status !== "busy") {
        this.#setSessionStatus(info.sessionID, "busy")
      }
    }

    // Finalized messages (user messages, or assistant messages with finish signal)
    // go to the instance stream. In-progress assistant messages go to ephemeral.
    const isFinalized = info.role === "user" || !!info.finish
    this.#emitMessage(info.id, isFinalized ? "instance" : "ephemeral")
  }

  messageRemoved(_sessionId: string, messageId: string) {
    this.#messages.delete(messageId)
    this.#appendInstanceEvent({
      type: "message",
      key: messageId,
      headers: { operation: "delete" },
    })
  }

  messagePartUpdated(part: any) {
    const msg = this.#messages.get(part.messageID)
    if (!msg) return
    const mapped = mapPart(part)
    const idx = msg.parts.findIndex((p) => p.id === mapped.id)
    if (idx >= 0) {
      msg.parts[idx] = mapped
    } else {
      msg.parts.push(mapped)
    }
    // Part updates are in-progress — ephemeral
    this.#emitMessage(part.messageID, "ephemeral")

    // Refresh worktree status when a file-editing tool completes.
    // For bash, do a full refresh since it can run git commands that change
    // the commit graph (e.g. git commit). For other edit tools that only
    // produce staged changes, a partial uncommitted-changes refresh suffices.
    if (
      part.type === "tool" &&
      part.state?.status === "completed" &&
      isFileEditTool(part.tool)
    ) {
      const sessionId = msg.sessionId
      if (this.#sessionWorktrees.has(sessionId)) {
        const fullRefresh = part.tool === "bash"
        this.#debouncedWorktreeStatusRefresh(sessionId, fullRefresh)
      }
    }
  }

  messagePartDelta(messageId: string, partId: string, field: string, delta: string) {
    const msg = this.#messages.get(messageId)
    if (!msg) return
    const part = msg.parts.find((p) => p.id === partId)
    if (part && field === "text" && "text" in part) {
      ;(part as { text: string }).text = (part.text ?? "") + delta
      // Streaming deltas — ephemeral
      this.#emitMessage(messageId, "ephemeral")
    }
  }

  messagePartRemoved(_sessionId: string, messageId: string, partId: string) {
    const msg = this.#messages.get(messageId)
    if (!msg) return
    msg.parts = msg.parts.filter((p) => p.id !== partId)
    // Part removal — ephemeral
    this.#emitMessage(messageId, "ephemeral")
  }

  permissionAsked(permission: PermissionRequest) {
    const sessionId = permission.sessionID
    const value: PermissionRequestValue = {
      sessionId,
      requestId: permission.id,
      permission: permission.permission,
      patterns: permission.patterns,
      description: buildPermissionDescription(permission.permission, permission.patterns),
    }
    this.#pendingPermissions.set(sessionId, value)
    this.#appendEphemeralEvent({
      type: "permissionRequest",
      key: sessionId,
      value,
      headers: { operation: "upsert" },
    })
  }

  permissionReplied(sessionId: string, _requestId: string, _reply: string) {
    this.#pendingPermissions.delete(sessionId)
    this.#appendEphemeralEvent({
      type: "permissionRequest",
      key: sessionId,
      headers: { operation: "delete" },
    })
  }

  /** Emit a pending transcription status update for a specific message. */
  emitPendingTranscription(messageId: string, sessionId: string, status: PendingTranscriptionValue["status"], text?: string) {
    const value: PendingTranscriptionValue = { messageId, sessionId, status, ...(text ? { text } : {}) }
    this.#pendingTranscriptions.set(messageId, value)
    this.#appendEphemeralEvent({
      type: "pendingTranscription",
      key: messageId,
      value,
      headers: { operation: "upsert" },
    })
  }



  todoUpdated(_sessionId: string, _todos: any[]) {
    // No-op for now
  }

  commandExecuted(_sessionId: string, _name: string, _args: string, _messageId: string) {
    // No-op for now
  }

  // --- Snapshot ---

  /**
   * Returns the materialized ephemeral state for client bootstrapping.
   *
   * The client fetches this before subscribing to the ephemeral stream,
   * then subscribes from the returned offset to avoid missing events.
   * Since Bun is single-threaded, the offset and map reads are consistent.
   */
  getEphemeralSnapshot(): {
    offset: number
    sessionStatuses: Record<string, { status: SessionStatus; error?: string }>
    worktreeStatuses: Record<string, any>
    pendingPermissions: Record<string, PermissionRequestValue>
    pendingTranscriptions: Record<string, PendingTranscriptionValue>
  } {
    const { messages } = this.#ephemeralDs.readStream("/")
    return {
      offset: messages.length,
      sessionStatuses: Object.fromEntries(this.#sessionStatuses),
      worktreeStatuses: Object.fromEntries(this.#lastWorktreeStatus),
      pendingPermissions: Object.fromEntries(this.#pendingPermissions),
      pendingTranscriptions: Object.fromEntries(this.#pendingTranscriptions),
    }
  }

  // --- Internal helpers ---

  #emitMessage(messageId: string, target: "instance" | "ephemeral") {
    const msg = this.#messages.get(messageId)
    if (!msg) return
    const event: StateEvent = {
      type: "message",
      key: messageId,
      value: msg,
      headers: { operation: "upsert" },
    }
    if (target === "instance") {
      this.#appendInstanceEvent(event)
    } else {
      this.#appendEphemeralEvent(event)
    }
  }

  /** Emit session metadata to the instance stream (no status — that's ephemeral). */
  #emitSession(sessionId: string, sessionData: any, operation: "insert" | "update") {
    this.#lastEmittedSessions.set(sessionId, sessionData)
    this.#appendInstanceEvent({
      type: "session",
      key: sessionId,
      value: sessionData,
      headers: { operation },
    })
  }

  /** Emit session status to the ephemeral stream. */
  #setSessionStatus(sessionId: string, status: SessionStatus, error?: string) {
    this.#sessionStatuses.set(sessionId, { status, ...(error ? { error } : {}) })
    this.#appendEphemeralEvent({
      type: "sessionStatus",
      key: sessionId,
      value: { sessionId, status, ...(error ? { error } : {}) },
      headers: { operation: "upsert" },
    })
  }

  async #fullMessageSync(sessionId: string) {
    try {
      const directory = this.#sessionDirectories.get(sessionId)
      const res = await this.#client.session.messages({ sessionID: sessionId, ...(directory ? { directory } : {}) })
      if (res.error) return
      for (const raw of res.data ?? []) {
        const msg = mapMessage(raw)
        this.#messages.set(msg.id, msg)
        // Reconciliation writes finalized messages to the instance stream
        this.#appendInstanceEvent({
          type: "message",
          key: msg.id,
          value: msg,
          headers: { operation: "upsert" },
        })
      }
    } catch {}
  }

  #mapChanges(diff: any[]): ChangedFile[] {
    return diff.map((d: any) => ({
      path: d.file as string,
      status: (d.status === "deleted" ? "deleted"
        : d.status === "added" ? "added"
        : "modified") as ChangedFile["status"],
      added: d.additions as number,
      removed: d.deletions as number,
    }))
  }

  async #refetchChanges(sessionId: string) {
    try {
      const directory = this.#sessionDirectories.get(sessionId)
      const res = await this.#client.session.diff({ sessionID: sessionId, ...(directory ? { directory } : {}) })
      if (res.error) return
      // Finalized changes go to the ephemeral stream — only the latest matters
      this.#appendEphemeralEvent({
        type: "change",
        key: sessionId,
        value: { sessionId, files: this.#mapChanges(res.data ?? []) },
        headers: { operation: "upsert" },
      })
    } catch {}
  }

  // Debounce timers for worktree status refresh per session
  #worktreeStatusTimers: Map<string, ReturnType<typeof setTimeout>> = new Map()

  // Last emitted worktree status per session, used for partial updates
  #lastWorktreeStatus: Map<string, any> = new Map()

  /** Debounced worktree status refresh — coalesces rapid tool completions. */
  #debouncedWorktreeStatusRefresh(sessionId: string, fullRefresh: boolean) {
    const existing = this.#worktreeStatusTimers.get(sessionId)
    if (existing) clearTimeout(existing)
    this.#worktreeStatusTimers.set(
      sessionId,
      setTimeout(() => {
        this.#worktreeStatusTimers.delete(sessionId)
        if (fullRefresh) {
          this.#emitWorktreeStatus(sessionId)
        } else {
          this.#emitUncommittedStatus(sessionId)
        }
      }, 2000), // 2s debounce
    )
  }

  /**
   * Compute and emit full worktree status for a session: merge state,
   * unmerged commits, and uncommitted changes.
   *
   * Called during initialization, on sessionIdle, and after merge API operations.
   */
  async #emitWorktreeStatus(sessionId: string) {
    const worktreeInfo = this.#sessionWorktrees.get(sessionId)
    if (!worktreeInfo) {
      const value = { sessionId, isWorktreeSession: false }
      this.#lastWorktreeStatus.set(sessionId, value)
      this.#appendEphemeralEvent({
        type: "worktreeStatus",
        key: sessionId,
        value,
        headers: { operation: "upsert" },
      })
      return
    }

    try {
      const driver = await WorktreeDriver.open(worktreeInfo.projectWorktree)
      const branch = await driver.branchForPath(worktreeInfo.worktreePath)
      if (!branch) {
        const value = { sessionId, isWorktreeSession: true, error: "Could not resolve branch for worktree" }
        this.#lastWorktreeStatus.set(sessionId, value)
        this.#appendEphemeralEvent({
          type: "worktreeStatus",
          key: sessionId,
          value,
          headers: { operation: "upsert" },
        })
        return
      }

      const [rawMerged, hasUnmerged, hasUncommitted] = await Promise.all([
        driver.isMerged(branch, "main"),
        driver.hasUnmergedCommits(branch, "main"),
        driver.hasUncommittedChanges(worktreeInfo.worktreePath),
      ])

      // A branch that git considers "merged" but has no unmerged commits never
      // actually diverged from main — it's just sitting at the same commit.
      // Don't report that as "merged" since no merge actually happened.
      const merged = rawMerged && !hasUnmerged ? false : rawMerged

      const value = {
        sessionId,
        isWorktreeSession: true,
        branch,
        merged,
        hasUnmergedCommits: hasUnmerged,
        hasUncommittedChanges: hasUncommitted,
      }
      this.#lastWorktreeStatus.set(sessionId, value)
      this.#appendEphemeralEvent({
        type: "worktreeStatus",
        key: sessionId,
        value,
        headers: { operation: "upsert" },
      })
    } catch (err: any) {
      const value = { sessionId, isWorktreeSession: true, error: err.message ?? "Failed to check worktree status" }
      this.#lastWorktreeStatus.set(sessionId, value)
      this.#appendEphemeralEvent({
        type: "worktreeStatus",
        key: sessionId,
        value,
        headers: { operation: "upsert" },
      })
    }
  }

  /**
   * Lightweight refresh: only update the `hasUncommittedChanges` field.
   *
   * Used after edit tool completions where only the working tree changed,
   * not the commit history. Merges the result into the last-known full status.
   */
  async #emitUncommittedStatus(sessionId: string) {
    const worktreeInfo = this.#sessionWorktrees.get(sessionId)
    if (!worktreeInfo) return

    try {
      const driver = await WorktreeDriver.open(worktreeInfo.projectWorktree)
      const hasUncommitted = await driver.hasUncommittedChanges(worktreeInfo.worktreePath)

      const last = this.#lastWorktreeStatus.get(sessionId) ?? { sessionId, isWorktreeSession: true }
      const value = { ...last, hasUncommittedChanges: hasUncommitted }
      this.#lastWorktreeStatus.set(sessionId, value)
      this.#appendEphemeralEvent({
        type: "worktreeStatus",
        key: sessionId,
        value,
        headers: { operation: "upsert" },
      })
    } catch (err: any) {
      console.error(`[StateStream] Failed to refresh uncommitted status for ${sessionId}:`, err)
    }
  }

  /**
   * Public method for API endpoints to trigger a full worktree status refresh
   * after merge operations.
   */
  refreshWorktreeStatus(sessionId: string) {
    this.#emitWorktreeStatus(sessionId).catch((err) => {
      console.error(`[StateStream] Failed to refresh worktree status for ${sessionId}:`, err)
    })
  }

  #appendInstanceEvent(event: StateEvent) {
    this.#instanceDs.appendToStream("/", JSON.stringify(event), {
      contentType: "application/json",
    })
  }

  #appendEphemeralEvent(event: StateEvent) {
    this.#ephemeralDs.appendToStream("/", JSON.stringify(event), {
      contentType: "application/json",
    })
  }
}

function mapProject(raw: any) {
  return {
    id: raw.id,
    worktree: raw.worktree,
    vcsDir: raw.vcsDir,
    vcs: raw.vcs,
    time: {
      created: raw.time?.created ?? 0,
      initialized: raw.time?.initialized,
    },
  }
}

function mapSession(raw: any) {
  return {
    id: raw.id,
    title: raw.title,
    directory: raw.directory,
    projectID: raw.projectID,
    parentID: raw.parentID,
    version: raw.version,
    summary: raw.summary,
    share: raw.share,
    time: {
      created: raw.time?.created ?? 0,
      updated: raw.time?.updated ?? 0,
    },
  }
}

/** Tool names that modify files and may result in commits. */
const FILE_EDIT_TOOLS = new Set(["edit", "write", "bash", "multi_edit"])

function isFileEditTool(toolName: string): boolean {
  return FILE_EDIT_TOOLS.has(toolName)
}

/** Build a human-readable description from a permission name and glob patterns. */
function buildPermissionDescription(permission: string, patterns: string[]): string {
  const patternSuffix = patterns.length > 0 ? `: ${patterns.join(", ")}` : ""
  switch (permission) {
    case "bash":
      return `Run bash command${patternSuffix}`
    case "edit":
      return `Edit files${patternSuffix}`
    case "write":
      return `Write files${patternSuffix}`
    case "read":
      return `Read files${patternSuffix}`
    default:
      return `${permission}${patternSuffix}`
  }
}
