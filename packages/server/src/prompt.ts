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
): Promise<Message> {
  console.log(`[prompt] received ${parts.length} part(s):`, parts.map((p) => {
    if (p.type === "audio") {
      return { type: "audio", mimeType: p.mimeType, audioDataLength: p.audioData.length, first80: p.audioData.slice(0, 80) }
    }
    return { type: "text", textLength: p.text.length, text: p.text.slice(0, 100) }
  }))

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

  // Resolve all parts to text, transcribing audio via Gemini
  const textParts = await Promise.all(
    parts.map(async (p) => {
      if (p.type === "audio") {
        console.log(`[prompt] transcribing audio: ${p.audioData.length} chars base64, mimeType=${p.mimeType ?? "audio/mp4"}`)
        try {
          const transcription = await transcribeAudio(
            p.audioData,
            p.mimeType ?? "audio/mp4",
            conversationContext,
          )
          console.log(`[prompt] transcription result: "${transcription}" (length=${transcription.length})`)
          return { type: "text" as const, text: transcription || "[inaudible]" }
        } catch (err) {
          console.error(`[prompt] transcription error:`, err)
          return { type: "text" as const, text: "[transcription error]" }
        }
      }
      return { type: "text" as const, text: p.text }
    }),
  )

  const res = await client.session.prompt({
    path: { id: sessionId },
    body: { parts: textParts },
    query: { directory },
  })
  if (res.error) throw new Error(`Prompt failed: ${JSON.stringify(res.error)}`)
  return mapMessage(res.data)
}
