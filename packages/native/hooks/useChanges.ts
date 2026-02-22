import { FIXTURE_CHANGES, type ChangedFile } from '../__fixtures__/messages'

// TODO: Replace fixture with real file diff data from server
// This will likely come from a TanStack DB collection or a direct API call
export function useChanges(sessionId: string): { data: ChangedFile[] } {
  return { data: FIXTURE_CHANGES }
}
