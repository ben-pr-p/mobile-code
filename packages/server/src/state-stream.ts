export { StateStream }

import type { DurableStreamServer } from "durable-streams-web-standard"
import type { OpencodeClient } from "./opencode"
import { Opencode, mapMessage, mapPart, type SessionEvent } from "./opencode"
import type { Message, MessagePart } from "./types"

type StateEvent = {
  type: "project" | "session" | "message"
  key: string
  value?: unknown
  headers: { operation: "insert" | "update" | "upsert" | "delete" }
}

class StateStream {
  #ds: DurableStreamServer
  #client: OpencodeClient
  #opencode: Opencode
  #messages: Map<string, Message> = new Map()

  constructor(ds: DurableStreamServer, client: OpencodeClient, opencode: Opencode) {
    this.#ds = ds
    this.#client = client
    this.#opencode = opencode
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

    // Load all sessions
    const sessions = await this.#client.session.list()
    for (const session of sessions.data ?? []) {
      this.#appendEvent({
        type: "session",
        key: session.id,
        value: mapSession(session),
        headers: { operation: "insert" },
      })
    }

    // Load all messages for each session
    for (const session of sessions.data ?? []) {
      const msgs = await this.#client.session.messages({ path: { id: session.id } })
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

    // Subscribe to live events
    this.#opencode.addGlobalListener((event) => this.#handleEvent(event))
  }

  #handleEvent(event: SessionEvent) {
    switch (event.type) {
      case "session.created": {
        const { info } = event.properties
        return this.#appendEvent({
          type: "session",
          key: info.id,
          value: mapSession(info),
          headers: { operation: "insert" },
        })
      }

      case "session.updated": {
        const { info } = event.properties
        return this.#appendEvent({
          type: "session",
          key: info.id,
          value: mapSession(info),
          headers: { operation: "update" },
        })
      }

      case "session.deleted": {
        const { info } = event.properties
        return this.#appendEvent({
          type: "session",
          key: info.id,
          headers: { operation: "delete" },
        })
      }

      case "session.status":
        return this.#refetchSession(event.properties.sessionID)

      case "session.idle": {
        const { sessionID } = event.properties
        this.#refetchSession(sessionID)
        return this.#fullMessageSync(sessionID)
      }

      case "message.updated": {
        const { info } = event.properties
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
        return this.#emitMessage(info.id)
      }

      case "message.part.updated": {
        const { part } = event.properties
        const msg = this.#messages.get(part.messageID)
        if (!msg) return
        const mapped = mapPart(part)
        const idx = msg.parts.findIndex((p) => p.id === mapped.id)
        if (idx >= 0) {
          msg.parts[idx] = mapped
        } else {
          msg.parts.push(mapped)
        }
        return this.#emitMessage(part.messageID)
      }

      case "message.part.delta": {
        const { messageID, partID, field, delta } = event.properties
        const msg = this.#messages.get(messageID)
        if (!msg) return
        const part = msg.parts.find((p) => p.id === partID)
        if (part && field === "text" && "text" in part) {
          ;(part as { text: string }).text = (part.text ?? "") + delta
          return this.#emitMessage(messageID)
        }
        return
      }

      case "message.removed": {
        const { messageID } = event.properties
        this.#messages.delete(messageID)
        return this.#appendEvent({
          type: "message",
          key: messageID,
          headers: { operation: "delete" },
        })
      }

      case "message.part.removed": {
        const { messageID, partID } = event.properties
        const msg = this.#messages.get(messageID)
        if (!msg) return
        msg.parts = msg.parts.filter((p) => p.id !== partID)
        return this.#emitMessage(messageID)
      }
    }
  }

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
      const res = await this.#client.session.get({ path: { id: sessionId } })
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
      const res = await this.#client.session.messages({ path: { id: sessionId } })
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
    console.log('Appending ', event)
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
