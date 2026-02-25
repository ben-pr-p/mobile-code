import { useAtomValue } from 'jotai'
import { apiAtom, type RpcApi } from '../lib/api'
import { useRpcTarget } from './useRpcTarget'

export interface FileDiff {
  file: string
  before: string
  after: string
  additions: number
  deletions: number
}

export function useDiffs(sessionId: string | undefined): { data: FileDiff[]; isLoading: boolean } {
  const api = useAtomValue(apiAtom)

  const { data, isLoading } = useRpcTarget(
    () => new DiffTarget(api.getSession(sessionId!)),
    [api, sessionId],
  )

  if (!sessionId) {
    return { data: [], isLoading: false }
  }

  return { data: data ?? [], isLoading }
}

class DiffTarget {
  #handle: ReturnType<RpcApi['getSession']>

  constructor(handle: ReturnType<RpcApi['getSession']>) {
    this.#handle = handle
  }

  async getState(): Promise<FileDiff[]> {
    try {
      return await this.#handle.diff()
    } catch {
      // Server may not support diff() yet — degrade gracefully
      return []
    }
  }
}
