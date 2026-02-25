import { useAtomValue } from 'jotai'
import { apiAtom } from '../lib/api'
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

  const { data, isLoading } = useRpcTarget<ChangedFile[]>(
    () => {
      const handle = api.getSession(sessionId!)
      const target = handle.changeList()
      return {
        async getState() {
          const files = await target.getState()
          return mapFiles(files)
        },
      }
    },
    [api, sessionId],
  )

  if (!sessionId) {
    return { data: [], isLoading: false }
  }

  return { data: data ?? [], isLoading }
}

function mapFiles(files: any[]): ChangedFile[] {
  return files.map((f) => ({
    path: f.path,
    added: f.added,
    removed: f.removed,
    status: f.status,
  }))
}
