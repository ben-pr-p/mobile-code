// Wrapper around the opencode SDK that maps responses to our types.

import {
  createOpencodeClient,
  Event as OpencodeEvent,
} from "@opencode-ai/sdk"
import type {
  Message,
  MessagePart,
} from "./types"

export type { OpencodeEvent }

/**
 * Event shape emitted by the server but not exported from v1 SDK types.
 */
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

export type OpencodeClient = ReturnType<typeof createOpencodeClient>

export function createClient(baseUrl: string): OpencodeClient {
  const client = createOpencodeClient({ baseUrl })
  return client
}

/** Map SDK event parts into our app message types. */

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
          error: p.state?.error,
          metadata: p.state?.metadata,
          time: p.state?.time,
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

  // Extract model info — user messages nest it under info.model,
  // assistant messages have it flat on info
  const modelID = info.role === "user"
    ? info.model?.modelID
    : info.modelID
  const providerID = info.role === "user"
    ? info.model?.providerID
    : info.providerID

  const agent = info.agent as string | undefined

  const msg: Message = {
    id: info.id,
    sessionId: info.sessionID,
    role: info.role,
    parts,
    createdAt: info.time?.created ?? 0,
    ...(modelID ? { modelID } : {}),
    ...(providerID ? { providerID } : {}),
    ...(agent ? { agent } : {}),
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

/** Callback signature for receiving Opencode events. */
export type OpencodeEventCallback = (event: OpencodeEvent | EventMessagePartDelta) => void

export class Opencode {
  #client: OpencodeClient

  constructor(baseUrl: string) {
    this.#client = createOpencodeClient({ baseUrl })
  }

  async spawnListener(callback: OpencodeEventCallback, baseUrl: string) {
    const url = `${baseUrl}/global/event`
    const res = await fetch(url)
    if (!res.ok || !res.body) throw new Error(`Failed to connect to ${url}: ${res.status}`)
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""
    const processStream = async () => {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() ?? ""
        for (const line of lines) {
          if (!line.startsWith("data:")) continue
          const json = line.slice("data:".length).trim()
          if (!json) continue
          try {
            const parsed = JSON.parse(json)
            // Global events wrap the payload: { directory, payload: <event> }
            const event = parsed.payload ?? parsed
            if (event.type === "server.heartbeat" || event.type === "server.connected") continue
            callback(event)
          } catch {}
        }
      }
    }
    processStream()
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

/**
 * Exhaustive event handler contract.
 * Translates every OpencodeEvent into the appropriate StateStream calls.
 */
export type StateStreamSink = {
  sessionCreated(info: any): void
  sessionUpdated(info: any): void
  sessionDeleted(info: any): void
  sessionStatus(sessionId: string, status: { type: "idle" } | { type: "busy" } | { type: "retry"; attempt: number; message: string; next: number }): void
  sessionIdle(sessionId: string): void
  sessionCompacted(sessionId: string): void
  sessionDiff(sessionId: string, diff: any[]): void
  sessionError(sessionId: string | undefined, error: any): void
  messageUpdated(info: any): void
  messageRemoved(sessionId: string, messageId: string): void
  messagePartUpdated(part: any): void
  messagePartDelta(messageId: string, partId: string, field: string, delta: string): void
  messagePartRemoved(sessionId: string, messageId: string, partId: string): void
  permissionUpdated(permission: any): void
  permissionReplied(sessionId: string, permissionId: string, response: string): void
  todoUpdated(sessionId: string, todos: any[]): void
  commandExecuted(sessionId: string, name: string, args: string, messageId: string): void
}

export function handleOpencodeEvent(
  event: OpencodeEvent | EventMessagePartDelta,
  sink: StateStreamSink,
): void {
  switch (event.type) {
    // --- Session lifecycle ---
    case "session.created":
      return sink.sessionCreated(event.properties.info)
    case "session.updated":
      return sink.sessionUpdated(event.properties.info)
    case "session.deleted":
      return sink.sessionDeleted(event.properties.info)
    case "session.status":
      return sink.sessionStatus(event.properties.sessionID, (event.properties as any).status ?? { type: "busy" })
    case "session.idle":
      return sink.sessionIdle(event.properties.sessionID)
    case "session.compacted":
      return sink.sessionCompacted(event.properties.sessionID)
    case "session.diff":
      return sink.sessionDiff(event.properties.sessionID, event.properties.diff)
    case "session.error":
      return sink.sessionError(event.properties.sessionID, event.properties.error)

    // --- Messages ---
    case "message.updated":
      return sink.messageUpdated(event.properties.info)
    case "message.removed":
      return sink.messageRemoved(event.properties.sessionID, event.properties.messageID)

    // --- Message parts ---
    case "message.part.updated":
      return sink.messagePartUpdated(event.properties.part)
    case "message.part.delta":
      return sink.messagePartDelta(
        event.properties.messageID,
        event.properties.partID,
        event.properties.field,
        event.properties.delta,
      )
    case "message.part.removed":
      return sink.messagePartRemoved(
        event.properties.sessionID,
        event.properties.messageID,
        event.properties.partID,
      )

    // --- Permissions ---
    case "permission.updated":
      return sink.permissionUpdated(event.properties)
    case "permission.replied":
      return sink.permissionReplied(
        event.properties.sessionID,
        event.properties.permissionID,
        event.properties.response,
      )

    // --- Todos & commands ---
    case "todo.updated":
      return sink.todoUpdated(event.properties.sessionID, event.properties.todos)
    case "command.executed":
      return sink.commandExecuted(
        event.properties.sessionID,
        event.properties.name,
        event.properties.arguments,
        event.properties.messageID,
      )

    // --- Non-session events (no-ops for state stream) ---
    case "server.instance.disposed":
    case "server.connected":
    case "installation.updated":
    case "installation.update-available":
    case "lsp.client.diagnostics":
    case "lsp.updated":
    case "file.edited":
    case "file.watcher.updated":
    case "vcs.branch.updated":
    case "tui.prompt.append":
    case "tui.command.execute":
    case "tui.toast.show":
    case "pty.created":
    case "pty.updated":
    case "pty.exited":
    case "pty.deleted":
      return

    default: {
      // Exhaustive check: if TypeScript complains here, a new event type
      // was added to the SDK and needs to be handled above.
      const _exhaustive: never = event
      console.warn("Unhandled opencode event type:", (event as any).type)
    }
  }
}
