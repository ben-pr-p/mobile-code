import { useAtomValue } from 'jotai'
import { apiAtom, type RpcApi } from '../lib/api'
import { useRpcTarget } from './useRpcTarget'

// UI ChangedFile type that components expect
export interface ChangedFile {
  path: string
  status: 'added' | 'deleted' | 'modified'
  added: number
  removed: number
}

export function useChanges(sessionId: string | undefined): { data: ChangedFile[]; isLoading: boolean } {
  const api = useAtomValue(apiAtom)

  const { data, isLoading } = useRpcTarget(
    () => new ChangeListTarget(api.getSession(sessionId!)),
    [api, sessionId],
  )

  if (!sessionId) {
    return { data: [], isLoading: false }
  }

  return { data: data ?? [], isLoading }
}

// Wrapper that fetches changes via the session handle
class ChangeListTarget {
  #handle: ReturnType<RpcApi['getSession']>

  constructor(handle: ReturnType<RpcApi['getSession']>) {
    this.#handle = handle
  }

  async getState(): Promise<ChangedFile[]> {
    return this.#handle.changes()
  }
}
