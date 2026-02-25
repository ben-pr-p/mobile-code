import { useAtomValue } from 'jotai'
import { apiAtom, type RpcApi } from '../lib/api'
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

  const { data, isLoading } = useRpcTarget(
    () => new SessionStateTarget(api.getSession(sessionId!)),
    [api, sessionId],
  )

  if (!sessionId) {
    return { data: null, isLoading: false }
  }

  return { data, isLoading }
}

// Wrapper RPC target that maps the raw server state to the UI Session shape
class SessionStateTarget {
  #handle: ReturnType<RpcApi['getSession']>

  constructor(handle: ReturnType<RpcApi['getSession']>) {
    this.#handle = handle
  }

  async getState(): Promise<Session> {
    const info = await this.#handle.info()
    const isActive = Date.now() - info.time.updated < 5 * 60_000
    return {
      id: info.id,
      directory: info.directory,
      name: info.title || 'Untitled',
      branchName: null,
      status: isActive ? 'active' : 'idle',
      createdAt: info.time.created,
      updatedAt: info.time.updated,
    }
  }
}
