import { eq, useLiveQuery } from '@tanstack/react-db';
import { collections } from '../lib/collections';
import type { UIMessage } from '../lib/stream-db';

/**
 * Live pending voice messages for a session, returned as UIMessage objects
 * ready to render.
 *
 * Combines optimistic client-side inserts (status 'uploading') with
 * server-side pending transcription events (upload-confirmed → transcribing
 * → completed → forwarded). Automatically excludes any pending transcription
 * whose real message has already arrived in the instance or ephemeral
 * message streams.
 */
export function usePendingTranscriptions(
  sessionId: string
): UIMessage[] {
  const { data: pendingTranscriptions } = useLiveQuery(
    (q) =>
      q
        .from({ pendingTranscriptions: collections.pendingTranscriptions })
        .where(({ pendingTranscriptions }) => eq(pendingTranscriptions.sessionId, sessionId)),
    [sessionId]
  );

  // Raw messages from instance stream (finalized) — uses parent msg_* IDs
  const { data: instanceMessages } = useLiveQuery(
    (q) =>
      q
        .from({ messages: collections.messages })
        .where(({ messages }) => eq(messages.sessionId, sessionId)),
    [sessionId]
  );

  // Raw messages from ephemeral stream (in-progress) — uses parent msg_* IDs
  const { data: ephemeralMessages } = useLiveQuery(
    (q) =>
      q
        .from({ pendingMessages: collections.pendingMessages })
        .where(({ pendingMessages }) => eq(pendingMessages.sessionId, sessionId)),
    [sessionId]
  );

  // Build set of raw message IDs that exist on the server
  const serverRawIds = new Set([
    ...(instanceMessages ?? []).map((m) => m.id),
    ...(ephemeralMessages ?? []).map((m) => m.id),
  ]);

  const statusMap: Record<string, UIMessage['syncStatus']> = {
    'uploading': 'uploading',
    'upload-confirmed': 'uploading',
    'transcribing': 'transcribing',
    'completed': 'sending',
    'forwarded': 'forwarded',
  };

  return (pendingTranscriptions ?? [])
    .filter((pt) => !serverRawIds.has(pt.messageId))
    .map((pt) => ({
      id: pt.messageId,
      sessionId: pt.sessionId,
      role: 'user' as const,
      type: 'voice' as const,
      content: pt.text ?? '',
      audioUri: null,
      transcription: null,
      toolName: null,
      toolMeta: null,
      syncStatus: statusMap[pt.status] ?? 'uploading',
      createdAt: Date.now(),
      isComplete: false,
    }));
}
