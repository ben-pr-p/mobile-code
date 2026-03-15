// Extracted prompt logic: resolves audio parts via transcription, then forwards to OpenCode.

import type { OpencodeClient } from "./opencode"
import { mapMessage } from "./opencode"
import { transcribeAudio } from "./transcribe"
import type { Message, PromptPartInput } from "./types"

export async function sendPrompt(
  client: OpencodeClient,
  sessionId: string,
  parts: PromptPartInput[],
  directory?: string,
  model?: { providerID: string; modelID: string },
  agent?: string,
): Promise<void> {
  // Fetch conversation context for audio transcription
  let conversationContext: Message[] | undefined
  const hasAudio = parts.some((p) => p.type === "audio")
  if (hasAudio) {
    try {
      const res = await client.session.messages({ path: { id: sessionId }, query: { directory } })
      if (!res.error && res.data) {
        conversationContext = (res.data as any[]).map(mapMessage)
      }
    } catch {}
  }

  const partSummary = parts.map((p) => p.type === "audio" ? "audio" : `text(${p.text.length})`).join(", ")
  console.log(`[prompt] session=${sessionId} received ${parts.length} part(s): ${partSummary}`)

  // Resolve all parts to text, transcribing audio via Gemini
  const textParts = await Promise.all(
    parts.map(async (p) => {
      if (p.type === "audio") {
        try {
          const transcription = await transcribeAudio(
            p.audioData,
            p.mimeType ?? "audio/mp4",
            conversationContext,
          )
          return { type: "text" as const, text: transcription || "[inaudible]" }
        } catch (err) {
          console.error(`[prompt] transcription error:`, err)
          return { type: "text" as const, text: "[transcription error]" }
        }
      }
      return { type: "text" as const, text: p.text }
    }),
  )

  const resolvedText = textParts.map((p) => p.text.slice(0, 100)).join(" | ")
  console.log(`[prompt] session=${sessionId} forwarding to opencode: ${textParts.length} part(s), text preview: "${resolvedText.slice(0, 200)}"`)

  const res = await client.session.promptAsync({
    path: { id: sessionId },
    body: {
      parts: textParts,
      // Disable the question tool — our mobile client doesn't support answering
      // questions yet, and unanswered questions cause the session to hang.
      // See: https://github.com/ben-pr-p/mobile-code/issues/2
      tools: { question: false },
      ...(model ? { model } : {}),
      ...(agent ? { agent } : {}),
    },
    query: { directory },
  })
  if (res.error) {
    console.error(`[prompt] session=${sessionId} opencode error:`, res.error)
    throw new Error(`Prompt failed: ${JSON.stringify(res.error)}`)
  }

  console.log(`[prompt] session=${sessionId} prompt accepted by opencode (async)`)
}
