// Cap'n Web RPC targets: Api (root), ProjectList, SessionList, MessageList,
// ChangeList, ProjectHandle, SessionHandle.
//
// Each list/item target exposes getState() and accepts an onStateChanged
// callback so the client receives pushed updates over WebSocket.

import { RpcTarget } from "capnweb"
import type { OpencodeClient } from "./opencode"
import { Opencode, mapMessage, mapPart, getSessionId, type SessionEvent } from "./opencode"
import { transcribeAudio } from "./transcribe"
import type {
  Project,
  Session,
  File,
  Message,
  MessagePart,
  PromptPartInput,
} from "./types"

// ---------------------------------------------------------------------------
// Shared callback type for push updates
// ---------------------------------------------------------------------------

type OnStateChangedFn<T> = (newState: T) => void

// Wrap a callback so it silently no-ops if the RPC session was disposed
function safeCallback<T>(fn: OnStateChangedFn<T>): OnStateChangedFn<T> {
  return (state: T) => {
    try { fn(state) } catch {}
  }
}

// ---------------------------------------------------------------------------
// List RPC targets
// ---------------------------------------------------------------------------

export class ProjectList extends RpcTarget {
  #client: OpencodeClient

  constructor(client: OpencodeClient, onStateChanged?: OnStateChangedFn<Project[]>) {
    super()
    this.#client = client
    // TODO: wire opencode events to push project list changes via onStateChanged
  }

  async getState(): Promise<Project[]> {
    const res = await this.#client.project.list()
    if (res.error) throw new Error("Failed to list projects")
    return (res.data as Project[] ?? [])
      .sort((a, b) => ((b.time as any).updated ?? b.time.created) - ((a.time as any).updated ?? a.time.created))
  }
}

export class SessionList extends RpcTarget {
  #client: OpencodeClient
  #worktree: string | undefined
  #opencode: Opencode | undefined
  #onStateChanged: OnStateChangedFn<Session[]> | undefined

  constructor(client: OpencodeClient, worktree?: string, opencode?: Opencode, onStateChanged?: OnStateChangedFn<Session[]>) {
    super()
    this.#client = client
    this.#worktree = worktree
    this.#opencode = opencode
    this.#onStateChanged = onStateChanged

    if (opencode && onStateChanged) {
      let refreshScheduled = false
      opencode.addGlobalListener((event) => {
        // Only refresh the list on session-level status changes
        if (
          event.type === 'session.created' ||
          event.type === 'session.updated' ||
          event.type === 'session.deleted' ||
          event.type === 'session.status' ||
          event.type === 'session.idle'
        ) {
          if (refreshScheduled) return
          refreshScheduled = true
          queueMicrotask(async () => {
            refreshScheduled = false
            try {
              const state = await this.getState()
              try { onStateChanged(state) } catch {}
            } catch {}
          })
        }
      })
    }
  }

  async getState(): Promise<Session[]> {
    const query = this.#worktree && this.#worktree !== '/'
      ? { directory: this.#worktree }
      : undefined
    const res = await this.#client.session.list({ query })
    if (res.error) throw new Error("Failed to list sessions")
    const sessions = (res.data ?? []) as Session[]
    return sessions.sort((a, b) => b.time.updated - a.time.updated)
  }
}

export class MessageList extends RpcTarget {
  #client: OpencodeClient
  #sessionId: string
  #opencode: Opencode | undefined
  #onStateChanged: OnStateChangedFn<Message[]> | undefined
  // Local message state for incremental updates
  #messages: Map<string, Message> = new Map()
  #initialized = false
  #pushScheduled = false

  constructor(
    client: OpencodeClient,
    sessionId: string,
    opencode?: Opencode,
    onStateChanged?: OnStateChangedFn<Message[]>,
  ) {
    super()
    this.#client = client
    this.#sessionId = sessionId
    this.#opencode = opencode
    this.#onStateChanged = onStateChanged

    if (opencode && onStateChanged) {
      opencode.addSessionListener(sessionId, (event) => {
        this.#handleEvent(event)
      })
    }
  }

  #handleEvent(event: SessionEvent) {
    const props = event.properties as any

    switch (event.type) {
      case "message.updated": {
        // Full message metadata update (creation, token counts, finish, etc.)
        const info = props.info
        if (!info?.id) break
        const existing = this.#messages.get(info.id)
        if (existing) {
          // Update metadata fields
          existing.createdAt = info.time?.created ?? existing.createdAt
          if (info.role === "assistant") {
            existing.cost = info.cost
            existing.tokens = info.tokens
              ? { input: info.tokens.input, output: info.tokens.output, reasoning: info.tokens.reasoning }
              : existing.tokens
            existing.finish = info.finish
          }
        } else {
          // New message — create with empty parts (parts arrive via part events)
          this.#messages.set(info.id, {
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
          })
        }
        this.#schedulePush()
        break
      }

      case "message.part.updated": {
        // Full part snapshot — create or replace the part in its parent message
        const rawPart = props.part
        if (!rawPart?.messageID || !rawPart?.id) break
        const msg = this.#messages.get(rawPart.messageID)
        if (!msg) break
        const mapped = mapPart(rawPart)
        const idx = msg.parts.findIndex((p) => p.id === mapped.id)
        if (idx >= 0) {
          msg.parts[idx] = mapped
        } else {
          msg.parts.push(mapped)
        }
        this.#schedulePush()
        break
      }

      case "message.part.delta": {
        // Streaming text delta — append to existing text/reasoning part
        const { messageID, partID, field, delta } = props
        if (!messageID || !partID || !delta) break
        const msg = this.#messages.get(messageID)
        if (!msg) break
        const part = msg.parts.find((p) => p.id === partID)
        if (part && field === "text" && "text" in part) {
          (part as any).text = ((part as any).text ?? "") + delta
          this.#schedulePush()
        }
        break
      }

      case "message.removed": {
        const messageID = props.messageID
        if (messageID) {
          this.#messages.delete(messageID)
          this.#schedulePush()
        }
        break
      }

      case "message.part.removed": {
        // Remove a specific part from its message
        const { messageID, partID } = props
        if (!messageID || !partID) break
        const msg = this.#messages.get(messageID)
        if (!msg) break
        msg.parts = msg.parts.filter((p) => p.id !== partID)
        this.#schedulePush()
        break
      }

      case "session.idle": {
        // Session done — do a full sync to ensure consistency
        this.#fullSync()
        break
      }
    }
  }

  // Coalesce rapid event pushes into a single callback per microtask
  #schedulePush() {
    if (!this.#onStateChanged || this.#pushScheduled) return
    this.#pushScheduled = true
    queueMicrotask(() => {
      this.#pushScheduled = false
      try { this.#onStateChanged?.(this.#toArray()) } catch {}
    })
  }

  #toArray(): Message[] {
    return [...this.#messages.values()].sort((a, b) => a.createdAt - b.createdAt)
  }

  async #fullSync() {
    try {
      const res = await this.#client.session.messages({
        path: { id: this.#sessionId },
      })
      if (res.error) return
      this.#messages.clear()
      for (const raw of res.data ?? []) {
        const msg = mapMessage(raw)
        this.#messages.set(msg.id, msg)
      }
      try { this.#onStateChanged?.(this.#toArray()) } catch {}
    } catch {}
  }

  async getState(): Promise<Message[]> {
    if (!this.#initialized) {
      this.#initialized = true
      const res = await this.#client.session.messages({
        path: { id: this.#sessionId },
      })
      if (res.error) throw new Error(`Failed to get messages: ${this.#sessionId}`)
      this.#messages.clear()
      for (const raw of res.data ?? []) {
        const msg = mapMessage(raw)
        this.#messages.set(msg.id, msg)
      }
    }
    return this.#toArray()
  }
}

export class ChangeList extends RpcTarget {
  #client: OpencodeClient
  #sessionId: string
  #onStateChanged: OnStateChangedFn<File[]> | undefined

  constructor(
    client: OpencodeClient,
    sessionId: string,
    opencode?: Opencode,
    onStateChanged?: OnStateChangedFn<File[]>,
  ) {
    super()
    this.#client = client
    this.#sessionId = sessionId
    this.#onStateChanged = onStateChanged

    if (opencode && onStateChanged) {
      opencode.addSessionListener(sessionId, (event) => {
        // Refresh file changes on session.diff events and on session.idle
        if (event.type === "session.diff" || event.type === "session.idle") {
          this.#refresh()
        }
      })
    }
  }

  async #refresh() {
    try {
      const state = await this.getState()
      try { this.#onStateChanged?.(state) } catch {}
    } catch {}
  }

  async getState(): Promise<File[]> {
    const res = await this.#client.session.diff({
      path: { id: this.#sessionId },
    })
    if (res.error) throw new Error(`Failed to get changes: ${this.#sessionId}`)
    return (res.data ?? []).map((d: any) => ({
      path: d.file,
      added: d.additions,
      removed: d.deletions,
      status: d.status === "deleted" ? "deleted"
        : d.status === "added" ? "added"
        : "modified" as "added" | "deleted" | "modified",
    }))
  }
}

// ---------------------------------------------------------------------------
// Api (root target)
// ---------------------------------------------------------------------------

export class Api extends RpcTarget {
  #client: OpencodeClient
  #opencode: Opencode | undefined

  constructor(client: OpencodeClient, opencode?: Opencode) {
    super()
    this.#client = client
    this.#opencode = opencode
  }

  // Legacy — kept for backward compat with existing tests
  async listProjects(): Promise<Project[]> {
    const res = await this.#client.project.list()
    if (res.error) throw new Error("Failed to list projects")
    return (res.data as Project[] ?? [])
      .sort((a, b) => ((b.time as any).updated ?? b.time.created) - ((a.time as any).updated ?? a.time.created))
  }

  // Returns a reactive ProjectList RPC target
  projectList(onStateChanged?: OnStateChangedFn<Project[]>): ProjectList {
    return new ProjectList(this.#client, onStateChanged)
  }

  async getProject(id: string): Promise<ProjectHandle> {
    const res = await this.#client.project.list()
    const project = (res.data as Project[] ?? []).find((p) => p.id === id)
    if (!project) throw new Error(`Project not found: ${id}`)
    return new ProjectHandle(this.#client, project, this.#opencode)
  }

  // Legacy — kept for backward compat with existing tests
  async listSessions(projectId?: string): Promise<Session[]> {
    const res = await this.#client.session.list()
    if (res.error) throw new Error("Failed to list sessions")
    let sessions = (res.data ?? []) as Session[]
    if (projectId) {
      const projectsRes = await this.#client.project.list()
      const project = (projectsRes.data ?? []).find((p: any) => p.id === projectId)
      if (project) {
        const worktree = project.worktree
        sessions = sessions.filter((s) =>
          s.directory === worktree || s.directory.startsWith(worktree + "/")
        )
      }
    }
    return sessions.sort((a, b) => b.time.updated - a.time.updated)
  }

  // Returns a reactive SessionList RPC target filtered by worktree
  sessionList(worktree: string, onStateChanged?: OnStateChangedFn<Session[]>): SessionList {
    return new SessionList(this.#client, worktree, this.#opencode, onStateChanged)
  }

  getSession(id: string, onSessionStateChanged?: OnStateChangedFn<SessionState>): SessionHandle {
    return new SessionHandle(this.#client, id, this.#opencode, onSessionStateChanged)
  }

  async createSession(opts: {
    title?: string,
    onSessionStateChanged?: OnStateChangedFn<SessionState>,
  }): Promise<SessionHandle> {
    const res = await this.#client.session.create({
      body: { title: opts?.title },
    })
    if (res.error) throw new Error("Failed to create session")
    return new SessionHandle(this.#client, res.data!.id, this.#opencode, opts.onSessionStateChanged)
  }
}

// ---------------------------------------------------------------------------
// ProjectHandle
// ---------------------------------------------------------------------------

export class ProjectHandle extends RpcTarget {
  #client: OpencodeClient
  #project: Project
  #opencode: Opencode | undefined

  constructor(client: OpencodeClient, project: Project, opencode?: Opencode) {
    super()
    this.#client = client
    this.#project = project
    this.#opencode = opencode
  }

  get id() { return this.#project.id }
  get worktree() { return this.#project.worktree }
  get vcs() { return this.#project.vcs }
  get time() { return this.#project.time }

  // Legacy — kept for backward compat
  async listSessions(): Promise<Session[]> {
    const res = await this.#client.session.list()
    if (res.error) throw new Error("Failed to list sessions")
    const worktree = this.#project.worktree
    return ((res.data ?? []) as Session[])
      .filter((s) => s.directory === worktree || s.directory.startsWith(worktree + "/"))
      .sort((a, b) => b.time.updated - a.time.updated)
  }

  // Returns a reactive SessionList scoped to this project's worktree
  sessionList(onStateChanged?: OnStateChangedFn<Session[]>): SessionList {
    return new SessionList(this.#client, this.#project.worktree, this.#opencode, onStateChanged)
  }

  getSession(id: string, onSessionStateChanged?: OnStateChangedFn<SessionState>): SessionHandle {
    return new SessionHandle(this.#client, id, this.#opencode, onSessionStateChanged)
  }

  async createSession(onSessionStateChanged?: OnStateChangedFn<SessionState>): Promise<SessionHandle> {
    const res = await this.#client.session.create({
      query: { directory: this.#project.worktree },
    })
    if (res.error) throw new Error("Failed to create session")
    return new SessionHandle(this.#client, res.data!.id, this.#opencode, onSessionStateChanged)
  }
}

// ---------------------------------------------------------------------------
// SessionHandle
// ---------------------------------------------------------------------------

type SessionState = {
  status: 'running' | 'idle'
  opencode: Session | undefined
}

export class SessionHandle extends RpcTarget {
  #client: OpencodeClient
  #sessionId: string
  #state: SessionState
  #opencode: Opencode | undefined
  #onStateChangedCallback: OnStateChangedFn<SessionState> | undefined

  constructor(
    client: OpencodeClient,
    sessionId: string,
    opencode?: Opencode,
    onStateChanged?: OnStateChangedFn<SessionState>,
  ) {
    super()
    this.#client = client
    this.#sessionId = sessionId
    this.#state = { status: 'idle', opencode: undefined }
    this.#opencode = opencode
    this.#onStateChangedCallback = onStateChanged

    if (opencode && onStateChanged) {
      const safeCb = safeCallback(onStateChanged)
      opencode.addSessionListener(sessionId, (event) => {
        // Update status from session.status and session.idle events
        if (event.type === "session.status") {
          const statusObj = (event.properties as any).status
          this.#state = {
            ...this.#state,
            status: statusObj?.type === "busy" ? "running" : "idle",
          }
          safeCb(this.#state)
        } else if (event.type === "session.idle") {
          this.#state = { ...this.#state, status: "idle" }
          this.#refreshAndPush()
        } else if (event.type === "message.updated" || event.type === "session.updated") {
          this.#refreshAndPush()
        }
      })
    }
  }

  async #refreshAndPush() {
    try {
      const res = await this.#client.session.get({
        path: { id: this.#sessionId },
      })
      this.#state = {
        ...this.#state,
        opencode: res.data as Session,
      }
      try { this.#onStateChangedCallback?.(this.#state) } catch {}
    } catch {}
  }

  async getState(): Promise<SessionState> {
    const res = await this.#client.session.get({
      path: { id: this.#sessionId },
    })
    this.#state = {
      ...this.#state,
      opencode: res.data as Session,
    }
    return this.#state
  }

  // Legacy alias used by existing tests
  async info(): Promise<Session> {
    const res = await this.#client.session.get({
      path: { id: this.#sessionId },
    })
    return res.data as Session
  }

  // Returns a reactive MessageList RPC target
  messageList(onStateChanged?: OnStateChangedFn<Message[]>): MessageList {
    return new MessageList(this.#client, this.#sessionId, this.#opencode, onStateChanged)
  }

  // Legacy — kept for backward compat with existing tests
  async messages(): Promise<Message[]> {
    const res = await this.#client.session.messages({
      path: { id: this.#sessionId },
    })
    if (res.error) throw new Error(`Failed to get messages: ${this.#sessionId}`)
    return (res.data ?? []).map(mapMessage)
  }

  async prompt(parts: PromptPartInput[]): Promise<Message> {
    console.log(`[prompt] received ${parts.length} part(s):`, parts.map((p) => {
      if (p.type === "audio") {
        return { type: "audio", mimeType: p.mimeType, audioDataLength: p.audioData.length, first80: p.audioData.slice(0, 80) }
      }
      return { type: "text", textLength: p.text.length, text: p.text.slice(0, 100) }
    }))

    // Fetch conversation context for audio transcription
    let conversationContext: Message[] | undefined
    const hasAudio = parts.some((p) => p.type === "audio")
    if (hasAudio) {
      try {
        const res = await this.#client.session.messages({ path: { id: this.#sessionId } })
        if (!res.error && res.data) {
          conversationContext = (res.data as any[]).map(mapMessage)
        }
      } catch {}
    }

    // Resolve all parts to text, transcribing audio via Gemini
    const textParts = await Promise.all(
      parts.map(async (p) => {
        if (p.type === "audio") {
          console.log(`[prompt] transcribing audio: ${p.audioData.length} chars base64, mimeType=${p.mimeType ?? "audio/mp4"}`)
          try {
            const transcription = await transcribeAudio(
              p.audioData,
              p.mimeType ?? "audio/mp4",
              conversationContext,
            )
            console.log(`[prompt] transcription result: "${transcription}" (length=${transcription.length})`)
            return { type: "text" as const, text: transcription || "[inaudible]" }
          } catch (err) {
            console.error(`[prompt] transcription error:`, err)
            return { type: "text" as const, text: "[transcription error]" }
          }
        }
        return { type: "text" as const, text: p.text }
      }),
    )

    const res = await this.#client.session.prompt({
      path: { id: this.#sessionId },
      body: { parts: textParts },
    })
    if (res.error) throw new Error(`Prompt failed: ${JSON.stringify(res.error)}`)
    return mapMessage(res.data)
  }

  async abort(): Promise<void> {
    const res = await this.#client.session.abort({
      path: { id: this.#sessionId },
    })
    if (res.error) throw new Error(`Abort failed: ${this.#sessionId}`)
  }

  // Returns a reactive ChangeList RPC target
  changeList(onStateChanged?: OnStateChangedFn<File[]>): ChangeList {
    return new ChangeList(this.#client, this.#sessionId, this.#opencode, onStateChanged)
  }

  // Derive file-level change summary from session diffs
  async changes(): Promise<File[]> {
    const res = await this.#client.session.diff({
      path: { id: this.#sessionId },
    })
    if (res.error) throw new Error(`Failed to get changes: ${this.#sessionId}`)
    return (res.data ?? []).map((d: any) => ({
      path: d.file,
      added: d.additions,
      removed: d.deletions,
      status: d.status === "deleted" ? "deleted"
        : d.status === "added" ? "added"
        : "modified" as "added" | "deleted" | "modified",
    }))
  }

  async diff(): Promise<import("./types").FileDiff[]> {
    const res = await this.#client.session.diff({
      path: { id: this.#sessionId },
    })
    if (res.error) throw new Error(`Failed to get diff: ${this.#sessionId}`)
    return (res.data ?? []) as import("./types").FileDiff[]
  }

  async revert(messageId: string): Promise<Session> {
    const res = await this.#client.session.revert({
      path: { id: this.#sessionId },
      body: { messageID: messageId },
    })
    if (res.error) throw new Error(`Revert failed: ${this.#sessionId}`)
    return res.data as Session
  }

  async share(): Promise<{ url: string }> {
    const res = await this.#client.session.share({
      path: { id: this.#sessionId },
    })
    if (res.error) throw new Error(`Share failed: ${this.#sessionId}`)
    return { url: res.data?.share?.url ?? "" }
  }
}
