import { FIXTURE_SESSIONS, type Session } from '../__fixtures__/sessions'
import { FIXTURE_PROJECTS } from '../__fixtures__/projects'

const DAY = 24 * 60 * 60_000

export interface SidebarSession {
  id: string
  name: string
  projectName: string
  status: 'active' | 'idle'
  relativeTime: string
  updatedAt: number
}

export interface GroupedSessions {
  recent: SidebarSession[]
  earlier: SidebarSession[]
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'yesterday'
  return `${days} days ago`
}

function toSidebarSession(session: Session): SidebarSession {
  const project = FIXTURE_PROJECTS.find((p) => p.id === session.projectId)
  return {
    id: session.id,
    name: session.name,
    projectName: project?.name ?? 'unknown',
    status: session.status,
    relativeTime: formatRelativeTime(session.updatedAt),
    updatedAt: session.updatedAt,
  }
}

// TODO: Replace fixture with TanStack DB live query
// return useLiveQuery((q) =>
//   q.from({ session: sessionCollection })
//     .orderBy(({ session }) => desc(session.updatedAt))
// )
export function useSidebarSessions(searchQuery: string): { data: GroupedSessions } {
  const allSessions = FIXTURE_SESSIONS
    .map(toSidebarSession)
    .sort((a, b) => b.updatedAt - a.updatedAt)

  const filtered = searchQuery
    ? allSessions.filter(
        (s) =>
          s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.projectName.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : allSessions

  const cutoff = Date.now() - DAY
  const recent = filtered.filter((s) => s.updatedAt >= cutoff)
  const earlier = filtered.filter((s) => s.updatedAt < cutoff)

  return { data: { recent, earlier } }
}
