import { FIXTURE_SESSIONS, type Session } from '../__fixtures__/sessions'

// TODO: Replace fixture with TanStack DB live query
// return useLiveQuery((q) =>
//   q.from({ session: sessionCollection })
//     .where(({ session }) => eq(session.id, sessionId))
//     .first()
// )
export function useSession(sessionId: string): { data: Session | null } {
  const session = FIXTURE_SESSIONS.find((s) => s.id === sessionId) ?? null
  return { data: session }
}
