import type { ProjectValue } from '../lib/stream-db'

const NOW = Date.now()
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export const FIXTURE_PROJECTS: ProjectValue[] = [
  { id: 'proj-1', worktree: '/Users/me/dsa/flockcode', vcs: 'git', time: { created: NOW - 30 * DAY } },
  { id: 'proj-7', worktree: '/Users/me/dsa/design-system', vcs: 'git', time: { created: NOW - 60 * DAY } },
  { id: 'proj-2', worktree: '/Users/me/dsa/canvass-map', vcs: 'git', time: { created: NOW - 90 * DAY } },
  { id: 'proj-3', worktree: '/Users/me/projects/api-server', vcs: 'git', time: { created: NOW - 20 * DAY } },
  { id: 'proj-4', worktree: '/Users/me/projects/blog-engine', vcs: 'git', time: { created: NOW - 45 * DAY } },
  { id: 'proj-5', worktree: '/Users/me/research/ml-pipeline', vcs: 'git', time: { created: NOW - 120 * DAY } },
  { id: 'proj-6', worktree: '/Users/me/projects/auth-service', vcs: 'git', time: { created: NOW - 50 * DAY } },
  { id: 'proj-8', worktree: '/Users/me/research/data-viz', vcs: 'git', time: { created: NOW - 100 * DAY } },
]
