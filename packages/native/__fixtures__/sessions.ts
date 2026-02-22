export interface Session {
  id: string
  projectId: string
  name: string
  branchName: string | null
  status: 'active' | 'idle'
  createdAt: number
  updatedAt: number
}

const NOW = Date.now()
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export const FIXTURE_SESSIONS: Session[] = [
  {
    id: 'session-1',
    projectId: 'proj-1',
    name: 'Pull from main',
    branchName: 'main',
    status: 'active',
    createdAt: NOW - 30 * MINUTE,
    updatedAt: NOW - 2 * MINUTE,
  },
  {
    id: 'session-2',
    projectId: 'proj-2',
    name: 'Fix auth middleware',
    branchName: 'fix/auth',
    status: 'idle',
    createdAt: NOW - 2 * HOUR,
    updatedAt: NOW - 15 * MINUTE,
  },
  {
    id: 'session-3',
    projectId: 'proj-1',
    name: 'Add voice recording',
    branchName: 'feat/voice',
    status: 'idle',
    createdAt: NOW - 3 * HOUR,
    updatedAt: NOW - 1 * HOUR,
  },
  {
    id: 'session-4',
    projectId: 'proj-2',
    name: 'Refactor navigation',
    branchName: 'refactor/nav',
    status: 'idle',
    createdAt: NOW - 5 * HOUR,
    updatedAt: NOW - 3 * HOUR,
  },
  {
    id: 'session-5',
    projectId: 'proj-1',
    name: 'Setup CI pipeline',
    branchName: 'ci/setup',
    status: 'idle',
    createdAt: NOW - 1 * DAY,
    updatedAt: NOW - 1 * DAY,
  },
  {
    id: 'session-6',
    projectId: 'proj-2',
    name: 'Debug websocket',
    branchName: 'fix/ws',
    status: 'idle',
    createdAt: NOW - 3 * DAY,
    updatedAt: NOW - 2 * DAY,
  },
]
