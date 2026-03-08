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
  isComplete: boolean
}

const NOW = Date.now()
const MINUTE = 60_000

export const FIXTURE_MESSAGES: Message[] = [
  // Tool call: Shell
  {
    id: 'msg-1',
    sessionId: 'session-1',
    role: 'assistant',
    type: 'tool_call',
    content: 'Pull latest changes from main branch',
    audioUri: null,
    transcription: null,
    toolName: 'Shell',
    toolMeta: {
      command: 'git pull origin main',
      exitCode: 0,
      duration: '1.2s',
      directory: '~/dsa/opencode-rn',
    },
    syncStatus: 'synced',
    createdAt: NOW - 10 * MINUTE,
    isComplete: true,
  },
  // Tool output
  {
    id: 'msg-2',
    sessionId: 'session-1',
    role: 'assistant',
    type: 'tool_output',
    content: 'Already up to date with origin/main.',
    audioUri: null,
    transcription: null,
    toolName: 'Shell',
    toolMeta: null,
    syncStatus: 'synced',
    createdAt: NOW - 10 * MINUTE + 1000,
    isComplete: true,
  },
  // Tool call: Explore Agent
  {
    id: 'msg-3',
    sessionId: 'session-1',
    role: 'assistant',
    type: 'tool_call',
    content: 'Explore codebase structure',
    audioUri: null,
    transcription: null,
    toolName: 'Explore Agent',
    toolMeta: {
      status: 'running',
      duration: '4.2s',
      filesExplored: ['src/App.tsx', 'src/components/', 'src/hooks/'],
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
