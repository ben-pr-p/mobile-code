import { useAtomValue } from 'jotai'
import { apiAtom } from '../lib/api'
import { useRpcTarget } from './useRpcTarget'
import type { Message as ServerMessage } from '../../server/src/types'

// UI Message type that components expect (flat structure for rendering)
export interface Message {
  id: string
  sessionId: string
  role: 'user' | 'assistant'
  type: 'text' | 'voice' | 'tool_call' | 'tool_output' | 'status'
  content: string
  audioUri: string | null
  transcription: string | null
  toolName: string | null
  toolMeta: Record<string, unknown> | null
  syncStatus: 'synced' | 'pending' | 'sending' | 'failed'
  createdAt: number
}

export function useSessionMessages(sessionId: string | undefined): { data: Message[]; isLoading: boolean } {
  const api = useAtomValue(apiAtom)

  const { data, isLoading } = useRpcTarget<Message[]>(
    () => {
      const handle = api.getSession(sessionId!)
      const target = handle.messageList()
      return {
        async getState() {
          const serverMessages: ServerMessage[] = await target.getState()
          return serverMessages
            .sort((a, b) => a.createdAt - b.createdAt)
            .flatMap(flattenMessage)
        },
      }
    },
    [api, sessionId],
  )

  if (!sessionId) {
    return { data: [], isLoading: false }
  }

  return { data: data ?? [], isLoading }
}

function flattenMessage(msg: ServerMessage): Message[] {
  const messages: Message[] = []

  for (const part of msg.parts) {
    switch (part.type) {
      case 'text':
        messages.push({
          id: part.id,
          sessionId: msg.sessionId,
          role: msg.role,
          type: 'text',
          content: part.text,
          audioUri: null,
          transcription: null,
          toolName: null,
          toolMeta: null,
          syncStatus: 'synced',
          createdAt: msg.createdAt,
        })
        break
      case 'tool':
        messages.push({
          id: part.id,
          sessionId: msg.sessionId,
          role: msg.role,
          type: 'tool_call',
          content: part.state.title || part.tool,
          audioUri: null,
          transcription: null,
          toolName: part.tool,
          toolMeta: part.state as Record<string, unknown>,
          syncStatus: 'synced',
          createdAt: msg.createdAt,
        })
        break
      // step-start/step-finish/reasoning are internal, skip for now
    }
  }

  // If a message had no renderable parts, emit a text placeholder
  if (messages.length === 0 && msg.parts.length > 0) {
    messages.push({
      id: msg.id,
      sessionId: msg.sessionId,
      role: msg.role,
      type: 'text',
      content: '',
      audioUri: null,
      transcription: null,
      toolName: null,
      toolMeta: null,
      syncStatus: 'synced',
      createdAt: msg.createdAt,
    })
  }

  return messages
}
