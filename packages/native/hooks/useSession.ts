import { useAtomValue } from 'jotai'
import { apiAtom } from '../lib/api'
import { useRpcTarget } from './useRpcTarget'

// Re-export the UI Session type that components expect
export interface Session {
  id: string
  directory: string
  name: string
  branchName: string | null
  status: 'active' | 'idle'
  createdAt: number
  updatedAt: number
}

export function useSession(sessionId: string | undefined): { data: Session | null; isLoading: boolean } {
  const api = useAtomValue(apiAtom)

  const { data, isLoading } = useRpcTarget<Session>(
    () => {
      const handle = api.getSession(sessionId!)
      return {
        async getState() {
          const state = await handle.getState()
          return mapSessionState(state)
        },
      }
    },
    [api, sessionId],
  )

  if (!sessionId) {
    return { data: null, isLoading: false }
  }

  return { data, isLoading }
}

function mapSessionState(state: any): Session {
  const info = state.opencode
  if (!info) {
    return {
      id: '',
      directory: '',
      name: 'Loading...',
      branchName: null,
      status: state.status === 'running' ? 'active' : 'idle',
      createdAt: 0,
      updatedAt: 0,
    }
  }
  return {
    id: info.id,
    directory: info.directory,
    name: info.title || 'Untitled',
    branchName: null,
    status: state.status === 'running' ? 'active' : 'idle',
    createdAt: info.time.created,
    updatedAt: info.time.updated,
  }
}
