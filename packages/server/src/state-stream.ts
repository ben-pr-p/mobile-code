export { StateStream }

import type { DurableStreamServer } from "durable-streams-web-standard"
import type { OpencodeClient, StateStreamSink } from "./opencode"
import { mapMessage, mapPart } from "./opencode"
import type { Message, MessagePart } from "./types"

type StateEvent = {
  type: "project" | "session" | "message"
  key: string
  value?: unknown
  headers: { operation: "insert" | "update" | "upsert" | "delete" }
}

class StateStream implements StateStreamSink {
  #ds: DurableStreamServer
  #client: OpencodeClient
  #messages: Map<string, Message> = new Map()
  #sessionDirectories: Map<string, string> = new Map()

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
          this.#appendEvent({
            type: "session",
            key: session.id,
            value: mapSession(session),
            headers: { operation: "insert" },
          })
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
  }

  // --- StateStreamSink implementation ---

  sessionCreated(info: any) {
    if (info.directory) this.#sessionDirectories.set(info.id, info.directory)
    this.#appendEvent({
      type: "session",
      key: info.id,
      value: mapSession(info),
      headers: { operation: "insert" },
    })
  }

  sessionUpdated(info: any) {
    if (info.directory) this.#sessionDirectories.set(info.id, info.directory)
    this.#appendEvent({
      type: "session",
      key: info.id,
      value: mapSession(info),
      headers: { operation: "update" },
    })
  }

  sessionDeleted(info: any) {
    this.#sessionDirectories.delete(info.id)
    this.#appendEvent({
      type: "session",
      key: info.id,
      headers: { operation: "delete" },
    })
  }

  sessionStatus(sessionId: string) {
    this.#refetchSession(sessionId)
  }

  sessionIdle(sessionId: string) {
    this.#refetchSession(sessionId)
    this.#fullMessageSync(sessionId)
  }

  sessionCompacted(_sessionId: string) {
    // No-op for now
  }

  sessionDiff(_sessionId: string, _diff: any[]) {
    // No-op for now
  }

  sessionError(_sessionId: string | undefined, _error: any) {
    // No-op for now
  }

  messageUpdated(info: any) {
    const existing = this.#messages.get(info.id)
    if (existing) {
      existing.createdAt = info.time?.created ?? existing.createdAt
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

  async #refetchSession(sessionId: string) {
    try {
      const directory = this.#sessionDirectories.get(sessionId)
      const res = await this.#client.session.get({ path: { id: sessionId }, query: { directory } })
      if (res.data) {
        this.#appendEvent({
          type: "session",
          key: sessionId,
          value: mapSession(res.data),
          headers: { operation: "update" },
        })
      }
    } catch {}
  }

  async #fullMessageSync(sessionId: string) {
    try {
      const directory = this.#sessionDirectories.get(sessionId)
      const res = await this.#client.session.messages({ path: { id: sessionId }, query: { directory } })
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

  #appendEvent(event: StateEvent) {
    // console.log('Appending ', event)
    this.#ds.appendToStream("/", JSON.stringify(event), {
      contentType: "application/json",
    })
  }
}

function mapProject(raw: any) {
  console.log('===== PROJECT =====')
  console.log(raw)
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
  console.log('===== SESSION =====')
  console.log(raw)
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
