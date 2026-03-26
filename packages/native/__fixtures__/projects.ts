import type { ProjectValue } from '../lib/stream-db'

const NOW = Date.now()
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const FIXTURE_BACKEND = 'http://localhost:3000'

export const FIXTURE_PROJECTS: ProjectValue[] = [
  { id: `${FIXTURE_BACKEND}:proj-1`, projectId: 'proj-1', backendUrl: FIXTURE_BACKEND, worktree: '/Users/me/dsa/flockcode', vcs: 'git', time: { created: NOW - 30 * DAY } },
  { id: `${FIXTURE_BACKEND}:proj-7`, projectId: 'proj-7', backendUrl: FIXTURE_BACKEND, worktree: '/Users/me/dsa/design-system', vcs: 'git', time: { created: NOW - 60 * DAY } },
  { id: `${FIXTURE_BACKEND}:proj-2`, projectId: 'proj-2', backendUrl: FIXTURE_BACKEND, worktree: '/Users/me/dsa/canvass-map', vcs: 'git', time: { created: NOW - 90 * DAY } },
  { id: `${FIXTURE_BACKEND}:proj-3`, projectId: 'proj-3', backendUrl: FIXTURE_BACKEND, worktree: '/Users/me/projects/api-server', vcs: 'git', time: { created: NOW - 20 * DAY } },
  { id: `${FIXTURE_BACKEND}:proj-4`, projectId: 'proj-4', backendUrl: FIXTURE_BACKEND, worktree: '/Users/me/projects/blog-engine', vcs: 'git', time: { created: NOW - 45 * DAY } },
  { id: `${FIXTURE_BACKEND}:proj-5`, projectId: 'proj-5', backendUrl: FIXTURE_BACKEND, worktree: '/Users/me/research/ml-pipeline', vcs: 'git', time: { created: NOW - 120 * DAY } },
  { id: `${FIXTURE_BACKEND}:proj-6`, projectId: 'proj-6', backendUrl: FIXTURE_BACKEND, worktree: '/Users/me/projects/auth-service', vcs: 'git', time: { created: NOW - 50 * DAY } },
  { id: `${FIXTURE_BACKEND}:proj-8`, projectId: 'proj-8', backendUrl: FIXTURE_BACKEND, worktree: '/Users/me/research/data-viz', vcs: 'git', time: { created: NOW - 100 * DAY } },
]
