import type { ToolCallStatus } from '../../server/src/types'

export interface ToolMeta {
  status: ToolCallStatus
  input?: Record<string, unknown>
  output?: string
  title?: string
  error?: string
  metadata?: Record<string, unknown>
  time?: { start: number; end?: number; compacted?: number }
}

export interface Message {
  id: string
  sessionId: string
  role: 'user' | 'assistant'
  type: 'text' | 'voice' | 'tool_call' | 'status'
  content: string
  audioUri: string | null
  transcription: string | null
  toolName: string | null
  toolMeta: ToolMeta | null
  syncStatus: 'synced' | 'pending' | 'sending' | 'failed'
  createdAt: number
  isComplete: boolean
}

const NOW = Date.now()
const MINUTE = 60_000

export const FIXTURE_MESSAGES: Message[] = [
  // Tool call: bash (completed)
  {
    id: 'msg-1',
    sessionId: 'session-1',
    role: 'assistant',
    type: 'tool_call',
    content: 'Pull latest changes from main branch',
    audioUri: null,
    transcription: null,
    toolName: 'bash',
    toolMeta: {
      status: 'completed',
      input: { command: 'git pull origin main', description: 'Pull latest changes' },
      output: 'Already up to date with origin/main.',
      title: 'Pull latest changes from main branch',
      time: { start: NOW - 10 * MINUTE, end: NOW - 10 * MINUTE + 1200 },
    },
    syncStatus: 'synced',
    createdAt: NOW - 10 * MINUTE,
    isComplete: true,
  },
  // Tool call: task (completed)
  {
    id: 'msg-3',
    sessionId: 'session-1',
    role: 'assistant',
    type: 'tool_call',
    content: 'Explore codebase structure',
    audioUri: null,
    transcription: null,
    toolName: 'task',
    toolMeta: {
      status: 'completed',
      input: { description: 'Explore codebase structure', prompt: 'Find all components', subagent_type: 'explore' },
      output: 'Found 12 components in src/components/',
      title: 'Explore codebase structure',
      time: { start: NOW - 8 * MINUTE, end: NOW - 8 * MINUTE + 4200 },
    },
    syncStatus: 'synced',
    createdAt: NOW - 8 * MINUTE,
    isComplete: true,
  },
  // Agent status
  {
    id: 'msg-4',
    sessionId: 'session-1',
    role: 'assistant',
    type: 'status',
    content: 'Thinking',
    audioUri: null,
    transcription: null,
    toolName: null,
    toolMeta: null,
    syncStatus: 'synced',
    createdAt: NOW - 5 * MINUTE,
    isComplete: true,
  },
  // User voice message
  {
    id: 'msg-5',
    sessionId: 'session-1',
    role: 'user',
    type: 'voice',
    content: 'what does this project do?',
    audioUri: null,
    transcription: 'what does this project do?',
    toolName: null,
    toolMeta: null,
    syncStatus: 'synced',
    createdAt: NOW - 3 * MINUTE,
    isComplete: true,
  },
]

export interface ChangedFile {
  path: string
  additions: string[]
  deletions: string[]
}

export const FIXTURE_CHANGES: ChangedFile[] = [
  {
    path: 'src/settings/theme.ts',
    additions: [
      "export const theme = createTheme('dark')",
      "export const lightTheme = createTheme('light')",
    ],
    deletions: [],
  },
  {
    path: 'src/components/Settings.tsx',
    additions: [
      '<View style={styles.item}>',
      '  <View style={styles.itemText}>',
    ],
    deletions: [],
  },
]
