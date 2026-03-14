import type { ToolMeta } from '../../lib/stream-db'

/**
 * Props passed to every tool-call collapsed and expanded component.
 * Each tool type receives the same shape and extracts what it needs
 * from `toolMeta.input` / `toolMeta.output`.
 */
export interface ToolCallProps {
  /** Raw tool name from the server (e.g. "bash", "edit", "read"). */
  toolName: string
  /** Human-readable description — `state.title || state.error || toolName`. */
  description: string
  /** Full tool state including input, output, status, timing, etc. */
  toolMeta: ToolMeta
}
