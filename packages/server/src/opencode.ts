// Wrapper around the opencode SDK that maps responses to our types.

import {
  createOpencodeClient,
  Event as OpencodeEvent,
  type EventMessageUpdated,
  type EventMessageRemoved,
  type EventMessagePartUpdated,
  type EventMessagePartRemoved,
  type EventPermissionUpdated,
  type EventPermissionReplied,
  type EventSessionStatus,
  type EventSessionIdle,
  type EventSessionCompacted,
  type EventSessionCreated,
  type EventSessionUpdated,
  type EventSessionDeleted,
  type EventSessionDiff,
  type EventSessionError,
  type EventTodoUpdated,
  type EventCommandExecuted,
} from "@opencode-ai/sdk"

// Not exported from the v1 SDK types, but the server does emit this event
export type EventMessagePartDelta = {
  type: "message.part.delta"
  properties: {
    sessionID: string
    messageID: string
    partID: string
    field: string
    delta: string
  }
}
import { EventEmitter } from 'node:events';
import type {
  Message,
  MessagePart,
} from "./types"

export type OpencodeClient = ReturnType<typeof createOpencodeClient>

export function createClient(baseUrl: string): OpencodeClient {
  const client = createOpencodeClient({ baseUrl })
  return client
}

// --- Mappers ---

export function mapPart(p: any): MessagePart {
  switch (p.type) {
    case "text":
      return { type: "text" as const, id: p.id, text: p.text }
    case "tool":
      return {
        type: "tool" as const,
        id: p.id,
        tool: p.tool,
        state: {
          status: p.state?.status ?? "pending",
          input: p.state?.input,
          output: p.state?.output,
          title: p.state?.title,
        },
      }
    case "step-start":
      return { type: "step-start" as const, id: p.id }
    case "step-finish":
      return { type: "step-finish" as const, id: p.id }
    case "reasoning":
      return { type: "reasoning" as const, id: p.id, text: p.text }
    default:
      return { type: "text" as const, id: p.id, text: `[${p.type}]` }
  }
}

export function mapMessage(raw: any): Message {
  const info = raw.info
  const parts: MessagePart[] = (raw.parts ?? []).map(mapPart)

  const msg: Message = {
    id: info.id,
    sessionId: info.sessionID,
    role: info.role,
    parts,
    createdAt: info.time?.created ?? 0,
  }

  if (info.role === "assistant") {
    msg.cost = info.cost
    msg.tokens = info.tokens
      ? {
          input: info.tokens.input,
          output: info.tokens.output,
          reasoning: info.tokens.reasoning,
        }
      : undefined
    msg.finish = info.finish
  }

  return msg
}

export class Opencode {
  #client: OpencodeClient
  #listener: EventEmitter

  constructor(baseUrl: string) {
    this.#client = createOpencodeClient({ baseUrl })
    this.#listener = new EventEmitter()
  }

  async spawnListener() {
    const events = await this.#client.event.subscribe()
    const forwardEvents = async () => {
      for await (const event of events.stream) {
        const session = getSessionId(event)
        if (session) {
          this.#listener.emit(session.sessionId, session.event)
          this.#listener.emit('*', session.event)
        }
      }
    }
    forwardEvents()
  }

  addSessionListener(sessionId: string, fn: (event: SessionEvent) => void) {
    this.#listener.on(sessionId, fn)
  }

  // Listen for all session events (any sessionId). Useful for session list updates.
  addGlobalListener(fn: (event: SessionEvent) => void) {
    this.#listener.on('*', fn)
  }

  async listProjects() {
    const res = await this.#client.project.list()
    if (res.error) throw new Error("Failed to list projects")
    if (!res.data) throw new Error('No projects found')
    return res.data
  }

  async listSessions() {
    const res = await this.#client.session.list()
    if (res.error) throw new Error("Failed to list sessions")
    if (!res.data) throw new Error('No sessions found')
    return (res.data)
  }
}

// Events that carry a sessionID directly in properties
type DirectSessionEvent =
  | EventMessageRemoved
  | EventMessagePartDelta
  | EventMessagePartRemoved
  | EventPermissionUpdated
  | EventPermissionReplied
  | EventSessionStatus
  | EventSessionIdle
  | EventSessionCompacted
  | EventSessionDiff
  | EventSessionError
  | EventTodoUpdated
  | EventCommandExecuted

// Events where sessionID is nested inside properties.info or properties.part
type NestedSessionEvent =
  | EventMessageUpdated       // properties.info.sessionID
  | EventSessionCreated       // properties.info.id (info is a Session)
  | EventSessionUpdated       // properties.info.id
  | EventSessionDeleted       // properties.info.id
  | EventMessagePartUpdated   // properties.part.sessionID

export type SessionEvent = DirectSessionEvent | NestedSessionEvent

export function getSessionId(event: OpencodeEvent): { sessionId: string; event: SessionEvent } | undefined {
  const props = event.properties as any

  // Direct sessionID in properties
  if ('sessionID' in props && typeof props.sessionID === 'string') {
    return { sessionId: props.sessionID, event: event as DirectSessionEvent }
  }

  // session.created/updated/deleted: properties.info is a Session (use info.id)
  if (event.type === 'session.created' || event.type === 'session.updated' || event.type === 'session.deleted') {
    return { sessionId: props.info.id, event: event as NestedSessionEvent }
  }

  // message.updated: properties.info is a Message (has sessionID)
  if (event.type === 'message.updated') {
    return { sessionId: props.info.sessionID, event: event as EventMessageUpdated }
  }

  // message.part.updated: properties.part has sessionID
  if (event.type === 'message.part.updated') {
    return { sessionId: props.part.sessionID, event: event as EventMessagePartUpdated }
  }

  return undefined
}
