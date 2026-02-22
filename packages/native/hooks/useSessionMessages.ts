import { FIXTURE_MESSAGES, type Message } from '../__fixtures__/messages'

// TODO: Replace fixture with TanStack DB live query
// return useLiveQuery((q) =>
//   q.from({ message: messageCollection })
//     .where(({ message }) => eq(message.sessionId, sessionId))
//     .orderBy(({ message }) => asc(message.createdAt))
// )
export function useSessionMessages(sessionId: string): { data: Message[] } {
  const messages = FIXTURE_MESSAGES
    .filter((m) => m.sessionId === sessionId)
    .sort((a, b) => a.createdAt - b.createdAt)
  return { data: messages }
}
