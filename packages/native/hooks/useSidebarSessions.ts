import { useMemo } from 'react'
import { useAtomValue } from 'jotai'
import { apiAtom } from '../lib/api'
import { useRpcTarget } from './useRpcTarget'
import type { Session } from '../../server/src/types'

export interface SidebarSession {
  id: string
  worktree: string
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

export function useSidebarSessions(
  worktree: string,
  searchQuery: string
): { data: GroupedSessions; isLoading: boolean } {
  const api = useAtomValue(apiAtom)

  const { data: sessions, isLoading } = useRpcTarget<Session[]>(
    () => api.sessionList(worktree),
    [api, worktree],
  )

  const grouped = useMemo(() => {
    const mapped = (sessions ?? [])
      .map((s): SidebarSession => {
        const isActive = Date.now() - s.time.updated < 5 * 60_000
        return {
          id: s.id,
          worktree: s.directory,
          name: s.title || 'Untitled',
          projectName: projectName(s.directory),
          status: isActive ? 'active' : 'idle',
          relativeTime: formatRelativeTime(s.time.updated),
          updatedAt: s.time.updated,
        }
      })
      .sort((a, b) => b.updatedAt - a.updatedAt)

    const filtered = searchQuery
      ? mapped.filter(
          (s) =>
            s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.projectName.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : mapped

    const cutoff = Date.now() - DAY
    return {
      recent: filtered.filter((s) => s.updatedAt >= cutoff),
      earlier: filtered.filter((s) => s.updatedAt < cutoff),
    }
  }, [sessions, searchQuery])

  return { data: grouped, isLoading }
}

const DAY = 24 * 60 * 60_000

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

function projectName(worktree: string): string {
  if (worktree === '/') return 'global'
  return worktree.split('/').pop() || worktree
}
