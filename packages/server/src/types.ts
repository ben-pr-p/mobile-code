import { z } from "zod/v4"

/**
 * Re-export SDK types so the native package can import them without
 * depending on @opencode-ai/sdk directly.
 */
export type { Project, Session, File } from "@opencode-ai/sdk"

export interface ChangedFile {
  path: string
  status: 'added' | 'deleted' | 'modified'
  added: number
  removed: number
}

// ---------- Zod Schemas for OpenCode API messages ----------

// Shared time range used by parts and tool states
const TimeRange = z.object({
  start: z.number(),
  end: z.number().optional(),
})

// --- Tool state variants ---

const ToolStatePending = z.object({
  status: z.literal("pending"),
  input: z.record(z.string(), z.unknown()),
  raw: z.string().optional(),
})

const ToolStateRunning = z.object({
  status: z.literal("running"),
  input: z.record(z.string(), z.unknown()),
  title: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  time: z.object({ start: z.number() }),
})

const ToolStateCompleted = z.object({
  status: z.literal("completed"),
  input: z.record(z.string(), z.unknown()),
  output: z.string(),
  title: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  time: z.object({
    start: z.number(),
    end: z.number(),
    compacted: z.number().optional(),
  }),
})

const ToolStateError = z.object({
  status: z.literal("error"),
  input: z.record(z.string(), z.unknown()),
  error: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  time: z.object({
    start: z.number(),
    end: z.number(),
  }),
})

const ToolState = z.discriminatedUnion("status", [
  ToolStatePending,
  ToolStateRunning,
  ToolStateCompleted,
  ToolStateError,
])

// --- Token counts ---

const TokenCounts = z.object({
  total: z.number().optional(),
  input: z.number(),
  output: z.number(),
  reasoning: z.number(),
  cache: z.object({
    read: z.number(),
    write: z.number(),
  }),
})

// --- Part schemas ---

const TextPart = z.object({
  type: z.literal("text"),
  id: z.string(),
  sessionID: z.string(),
  messageID: z.string(),
  text: z.string(),
  synthetic: z.boolean().optional(),
  ignored: z.boolean().optional(),
  time: TimeRange.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

const ReasoningPart = z.object({
  type: z.literal("reasoning"),
  id: z.string(),
  sessionID: z.string(),
  messageID: z.string(),
  text: z.string(),
  time: TimeRange.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

const ToolPart = z.object({
  type: z.literal("tool"),
  id: z.string(),
  sessionID: z.string(),
  messageID: z.string(),
  callID: z.string(),
  tool: z.string(),
  state: ToolState,
  metadata: z.record(z.string(), z.unknown()).optional(),
})

const StepStartPart = z.object({
  type: z.literal("step-start"),
  id: z.string(),
  sessionID: z.string(),
  messageID: z.string(),
  snapshot: z.string().optional(),
})

const StepFinishPart = z.object({
  type: z.literal("step-finish"),
  id: z.string(),
  sessionID: z.string(),
  messageID: z.string(),
  reason: z.string(),
  snapshot: z.string().optional(),
  cost: z.number(),
  tokens: TokenCounts,
})

const PatchPart = z.object({
  type: z.literal("patch"),
  id: z.string(),
  sessionID: z.string(),
  messageID: z.string(),
  hash: z.string(),
  files: z.array(z.string()),
})

const CompactionPart = z.object({
  type: z.literal("compaction"),
  id: z.string(),
  sessionID: z.string(),
  messageID: z.string(),
  auto: z.boolean(),
})

const SubtaskPart = z.object({
  type: z.literal("subtask"),
  id: z.string(),
  sessionID: z.string(),
  messageID: z.string(),
  prompt: z.string(),
  description: z.string(),
  agent: z.string(),
  model: z.object({
    providerID: z.string(),
    modelID: z.string(),
  }).optional(),
  command: z.string().optional(),
})

// File-related parts (from SDK, not yet observed in test data but defined)
const FilePartSourceText = z.object({
  value: z.string(),
  start: z.number(),
  end: z.number(),
})

const FileSource = z.object({
  type: z.literal("file"),
  text: FilePartSourceText,
  path: z.string(),
})

const SymbolSource = z.object({
  type: z.literal("symbol"),
  text: FilePartSourceText,
  path: z.string(),
  range: z.object({
    start: z.object({ line: z.number(), character: z.number() }),
    end: z.object({ line: z.number(), character: z.number() }),
  }),
  name: z.string(),
  kind: z.number(),
})

const FilePart = z.object({
  type: z.literal("file"),
  id: z.string(),
  sessionID: z.string(),
  messageID: z.string(),
  mime: z.string(),
  filename: z.string().optional(),
  url: z.string(),
  source: z.discriminatedUnion("type", [FileSource, SymbolSource]).optional(),
})

const SnapshotPart = z.object({
  type: z.literal("snapshot"),
  id: z.string(),
  sessionID: z.string(),
  messageID: z.string(),
  snapshot: z.string(),
})

const RetryPart = z.object({
  type: z.literal("retry"),
  id: z.string(),
  sessionID: z.string(),
  messageID: z.string(),
  attempt: z.number(),
  error: z.record(z.string(), z.unknown()),
  time: z.object({ created: z.number() }),
})

const AgentPart = z.object({
  type: z.literal("agent"),
  id: z.string(),
  sessionID: z.string(),
  messageID: z.string(),
  name: z.string(),
  source: FilePartSourceText.optional(),
})

export const MessagePartSchema = z.discriminatedUnion("type", [
  TextPart,
  ReasoningPart,
  ToolPart,
  StepStartPart,
  StepFinishPart,
  PatchPart,
  CompactionPart,
  SubtaskPart,
  FilePart,
  SnapshotPart,
  RetryPart,
  AgentPart,
])

// --- Message error types ---

const ProviderAuthError = z.object({
  name: z.literal("ProviderAuthError"),
  data: z.object({ message: z.string() }),
})

const MessageAbortedError = z.object({
  name: z.literal("MessageAbortedError"),
  data: z.object({ message: z.string() }),
})

const MessageOutputLengthError = z.object({
  name: z.literal("MessageOutputLengthError"),
  data: z.object({ message: z.string() }),
})

const ApiError = z.object({
  name: z.literal("ApiError"),
  data: z.object({ message: z.string() }),
})

const UnknownError = z.object({
  name: z.literal("UnknownError"),
  data: z.object({ message: z.string() }),
})

const MessageError = z.discriminatedUnion("name", [
  ProviderAuthError,
  MessageAbortedError,
  MessageOutputLengthError,
  ApiError,
  UnknownError,
])

/**
 * File diff used in user message summaries and session diffs.
 */
export interface FileDiff {
  file: string
  before: string
  after: string
  additions: number
  deletions: number
}

const FileDiffSchema = z.object({
  file: z.string(),
  before: z.string(),
  after: z.string(),
  additions: z.number(),
  deletions: z.number(),
  status: z.string(), // "added", "modified", "deleted", etc.
})

/** User message schema used for message summaries. */
const UserMessageInfo = z.object({
  id: z.string(),
  sessionID: z.string(),
  role: z.literal("user"),
  time: z.object({
    created: z.number(),
  }),
  summary: z.object({
    title: z.string().optional(),
    body: z.string().optional(),
    diffs: z.array(FileDiffSchema),
  }).optional(),
  agent: z.string(),
  model: z.object({
    providerID: z.string(),
    modelID: z.string(),
  }),
  system: z.string().optional(),
  tools: z.record(z.string(), z.boolean()).optional(),
})

const AssistantMessageInfo = z.object({
  id: z.string(),
  sessionID: z.string(),
  role: z.literal("assistant"),
  time: z.object({
    created: z.number(),
    completed: z.number().optional(),
  }),
  error: MessageError.optional(),
  parentID: z.string(),
  modelID: z.string(),
  providerID: z.string(),
  mode: z.string(),
  agent: z.string().optional(),
  path: z.object({
    cwd: z.string(),
    root: z.string(),
  }),
  summary: z.boolean().optional(),
  cost: z.number(),
  tokens: TokenCounts,
  finish: z.string().optional(),
})

export const MessageInfoSchema = z.discriminatedUnion("role", [
  UserMessageInfo,
  AssistantMessageInfo,
])

/** Top-level raw message envelope as returned by the API. */
export const RawMessageSchema = z.object({
  info: MessageInfoSchema,
  parts: z.array(MessagePartSchema),
})

/**
 * Mapped types used by our app.
 */

/**
 * Simplified Message type consumed by the native app.
 * This is what mapMessage() in opencode.ts produces.
 */

export interface Message {
  id: string
  sessionId: string
  role: "user" | "assistant"
  parts: MessagePart[]
  createdAt: number
  // model info (present on both user and assistant messages)
  modelID?: string
  providerID?: string
  // assistant-specific
  cost?: number
  tokens?: {
    input: number
    output: number
    reasoning: number
  }
  finish?: string
}

export type ToolCallStatus = "pending" | "running" | "completed" | "error"

export type MessagePart =
  | { type: "text"; id: string; text: string }
  | {
      type: "tool"
      id: string
      tool: string
      state: {
        status: ToolCallStatus
        input?: Record<string, unknown>
        output?: string
        title?: string
        error?: string
        metadata?: Record<string, unknown>
        time?: { start: number; end?: number; compacted?: number }
      }
    }
  | { type: "step-start"; id: string }
  | { type: "step-finish"; id: string }
  | { type: "reasoning"; id: string; text?: string }

export type TextPartInput = { type: "text"; text: string }
export type AudioPartInput = { type: "audio"; audioData: string; mimeType?: string }
export type PromptPartInput = TextPartInput | AudioPartInput

/** Inferred types from Zod schemas. */
export type RawMessage = z.infer<typeof RawMessageSchema>
export type RawMessageInfo = z.infer<typeof MessageInfoSchema>
export type RawMessagePart = z.infer<typeof MessagePartSchema>
export type RawToolState = z.infer<typeof ToolState>
