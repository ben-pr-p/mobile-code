export { StateStream }

import type { DurableStreamServer } from "durable-streams-web-standard"
import type { OpencodeClient, StateStreamSink } from "./opencode"
import { mapMessage, mapPart } from "./opencode"
import type { Message, MessagePart, ChangedFile } from "./types"

type StateEvent = {
  type: "project" | "session" | "message" | "change"
  key: string
  value?: unknown
  headers: { operation: "insert" | "update" | "upsert" | "delete" }
}

type SessionStatus = "idle" | "busy" | "error"

class StateStream implements StateStreamSink {
  #ds: DurableStreamServer
  #client: OpencodeClient
  #messages: Map<string, Message> = new Map()
  #sessionDirectories: Map<string, string> = new Map()
  #sessionStatuses: Map<string, { status: SessionStatus; error?: string }> = new Map()
  #lastEmittedSessions: Map<string, any> = new Map()

  constructor(ds: DurableStreamServer, client: OpencodeClient) {
    this.#ds = ds
    this.#client = client
  }

  async initialize() {
    await this.#ds.createStream("/", { contentType: "application/json" })

    // Load all projects
    const projects = await this.#client.project.list()
    for (const project of projects.data ?? []) {
      this.#appendEvent({
        type: "project",
        key: project.id,
        value: mapProject(project),
        headers: { operation: "insert" },
      })
    }

    // Load each projects sessions in parallel
    const projectSessions = await Promise.all(
      projects.data?.map(async (project) => {
        const res = await this.#client.session.list({ query: { directory: project.worktree } })

        for (const session of res.data ?? []) {
          if ((session as any).directory) {
            this.#sessionDirectories.set(session.id, (session as any).directory)
          }
          this.#emitSession(session.id, mapSession(session), "insert")
        }

        return res.data ?? []
      }) ?? []
    )
    const sessions = projectSessions.flat()

    // Load all messages for each session
    for (const session of sessions ?? []) {
      const msgs = await this.#client.session.messages({ path: { id: session.id }, query: { directory: (session as any).directory } })
      for (const raw of msgs.data ?? []) {
        const msg = mapMessage(raw)
        this.#messages.set(msg.id, msg)
        this.#appendEvent({
          type: "message",
          key: msg.id,
          value: msg,
          headers: { operation: "insert" },
        })
      }
    }

    // Load file changes for sessions that have diffs
    for (const session of sessions ?? []) {
      if ((session as any).summary?.files > 0) {
        this.#refetchChanges(session.id)
      }
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
    this.#appendEvent({
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
  }

  sessionCompacted(_sessionId: string) {
    // No-op for now
  }

  sessionDiff(sessionId: string, diff: any[]) {
    this.#appendEvent({
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

    const existing = this.#messages.get(info.id)
    if (existing) {
      existing.createdAt = info.time?.created ?? existing.createdAt
      if (modelID) existing.modelID = modelID
      if (providerID) existing.providerID = providerID
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
    this.#emitMessage(info.id)
  }

  messageRemoved(_sessionId: string, messageId: string) {
    this.#messages.delete(messageId)
    this.#appendEvent({
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
    this.#emitMessage(part.messageID)
  }

  messagePartDelta(messageId: string, partId: string, field: string, delta: string) {
    const msg = this.#messages.get(messageId)
    if (!msg) return
    const part = msg.parts.find((p) => p.id === partId)
    if (part && field === "text" && "text" in part) {
      ;(part as { text: string }).text = (part.text ?? "") + delta
      this.#emitMessage(messageId)
    }
  }

  messagePartRemoved(_sessionId: string, messageId: string, partId: string) {
    const msg = this.#messages.get(messageId)
    if (!msg) return
    msg.parts = msg.parts.filter((p) => p.id !== partId)
    this.#emitMessage(messageId)
  }

  permissionUpdated(_permission: any) {
    // No-op for now
  }

  permissionReplied(_sessionId: string, _permissionId: string, _response: string) {
    // No-op for now
  }

  todoUpdated(_sessionId: string, _todos: any[]) {
    // No-op for now
  }

  commandExecuted(_sessionId: string, _name: string, _args: string, _messageId: string) {
    // No-op for now
  }

  // --- Internal helpers ---

  #emitMessage(messageId: string) {
    const msg = this.#messages.get(messageId)
    if (!msg) return
    this.#appendEvent({
      type: "message",
      key: messageId,
      value: msg,
      headers: { operation: "upsert" },
    })
  }

  #emitSession(sessionId: string, sessionData: any, operation: "insert" | "update") {
    const statusInfo = this.#sessionStatuses.get(sessionId)
    const value = {
      ...sessionData,
      status: statusInfo?.status ?? "idle",
      ...(statusInfo?.error ? { error: statusInfo.error } : {}),
    }
    this.#lastEmittedSessions.set(sessionId, sessionData)
    this.#appendEvent({
      type: "session",
      key: sessionId,
      value,
      headers: { operation },
    })
  }

  #setSessionStatus(sessionId: string, status: SessionStatus, error?: string) {
    this.#sessionStatuses.set(sessionId, { status, ...(error ? { error } : {}) })
    // Re-emit the session with the updated status using the last known session data
    const lastSession = this.#lastEmittedSessions.get(sessionId)
    if (lastSession) {
      this.#emitSession(sessionId, lastSession, "update")
    }
  }

  async #fullMessageSync(sessionId: string) {
    try {
      const directory = this.#sessionDirectories.get(sessionId)
      const res = await this.#client.session.messages({ path: { id: sessionId }, ...(directory ? { query: { directory } } : {}) })
      if (res.error) return
      for (const raw of res.data ?? []) {
        const msg = mapMessage(raw)
        this.#messages.set(msg.id, msg)
        this.#appendEvent({
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
      const res = await this.#client.session.diff({ path: { id: sessionId }, ...(directory ? { query: { directory } } : {}) })
      if (res.error) return
      this.#appendEvent({
        type: "change",
        key: sessionId,
        value: { sessionId, files: this.#mapChanges(res.data ?? []) },
        headers: { operation: "upsert" },
      })
    } catch {}
  }

  #appendEvent(event: StateEvent) {
    // console.log('Appending ', event)
    this.#ds.appendToStream("/", JSON.stringify(event), {
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
