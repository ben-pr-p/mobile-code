export interface Project {
  id: string
  name: string
  path: string
  sessionCount: number
  activeSessionCount: number
  lastActiveAt: number
}

const NOW = Date.now()
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export const FIXTURE_PROJECTS: Project[] = [
  {
    id: 'proj-1',
    name: 'opencode-rn',
    path: '~/dsa/opencode-rn',
    sessionCount: 3,
    activeSessionCount: 1,
    lastActiveAt: NOW - 2 * MINUTE, // 2m ago
  },
  {
    id: 'proj-7',
    name: 'design-system',
    path: '~/dsa/design-system',
    sessionCount: 8,
    activeSessionCount: 1,
    lastActiveAt: NOW - 15 * MINUTE, // 15m ago
  },
  {
    id: 'proj-2',
    name: 'canvass-map',
    path: '~/dsa/canvass-map',
    sessionCount: 4,
    activeSessionCount: 0,
    lastActiveAt: NOW - 3 * HOUR, // 3h ago
  },
  {
    id: 'proj-3',
    name: 'api-server',
    path: '~/projects/api-server',
    sessionCount: 2,
    activeSessionCount: 0,
    lastActiveAt: NOW - 8 * HOUR, // 8h ago
  },
  {
    id: 'proj-4',
    name: 'blog-engine',
    path: '~/projects/blog-engine',
    sessionCount: 5,
    activeSessionCount: 0,
    lastActiveAt: NOW - 1 * DAY, // 1d ago
  },
  {
    id: 'proj-5',
    name: 'ml-pipeline',
    path: '~/research/ml-pipeline',
    sessionCount: 12,
    activeSessionCount: 0,
    lastActiveAt: NOW - 3 * DAY, // 3d ago
  },
  {
    id: 'proj-6',
    name: 'auth-service',
    path: '~/projects/auth-service',
    sessionCount: 3,
    activeSessionCount: 0,
    lastActiveAt: NOW - 7 * DAY, // 1w ago
  },
  {
    id: 'proj-8',
    name: 'data-viz',
    path: '~/research/data-viz',
    sessionCount: 6,
    activeSessionCount: 0,
    lastActiveAt: NOW - 14 * DAY, // 2w ago
  },
]
