// Extracted prompt logic: resolves audio parts via transcription, then forwards to OpenCode.

import type { OpencodeClient } from "./opencode"
import { mapMessage } from "./opencode"
import { transcribeAudio } from "./transcribe"
import type { Message, PromptPartInput } from "./types"

/** Line reference from the diff viewer — the user selected these lines before sending. */
interface LineReference {
  file: string
  startLine: number
  endLine: number
  side?: "additions" | "deletions"
}

export async function sendPrompt(
  client: OpencodeClient,
  sessionId: string,
  parts: PromptPartInput[],
  directory?: string,
  model?: { providerID: string; modelID: string },
  agent?: string,
  lineReference?: LineReference,
): Promise<void> {
  // Fetch conversation context for audio transcription
  let conversationContext: Message[] | undefined
  const hasAudio = parts.some((p) => p.type === "audio")
  if (hasAudio) {
    try {
      const res = await client.session.messages({ sessionID: sessionId, directory })
      if (!res.error && res.data) {
        conversationContext = (res.data as any[]).map(mapMessage)
      }
    } catch {}
  }

  const partSummary = parts.map((p) => p.type === "audio" ? "audio" : `text(${p.text.length})`).join(", ")
  console.log(`[prompt] session=${sessionId} received ${parts.length} part(s): ${partSummary}`)

  // Resolve all parts to text, transcribing audio via Gemini (in parallel)
  const textParts = await Promise.all(
    parts.map(async (p) => {
      if (p.type === "audio") {
        try {
          const transcription = await transcribeAudio(
            p.audioData,
            p.mimeType ?? "audio/mp4",
            conversationContext,
          )
          let text = transcription || "[inaudible]"

          // Prepend per-chunk line reference if the audio part carries one
          if (p.lineReference) {
            const range = p.lineReference.startLine === p.lineReference.endLine
              ? `line ${p.lineReference.startLine}`
              : `lines ${p.lineReference.startLine}-${p.lineReference.endLine}`
            const side = p.lineReference.side ? ` (${p.lineReference.side} side)` : ""
            text = `[Referencing ${range} of ${p.lineReference.file}${side}]\n${text}`
          }

          return { type: "text" as const, text }
        } catch (err) {
          console.error(`[prompt] transcription error:`, err)
          return { type: "text" as const, text: "[transcription error]" }
        }
      }
      return { type: "text" as const, text: p.text }
    }),
  )

  // Prepend line reference context if the user selected lines in the diff viewer
  if (lineReference && textParts.length > 0) {
    const lineRange = lineReference.startLine === lineReference.endLine
      ? `line ${lineReference.startLine}`
      : `lines ${lineReference.startLine}-${lineReference.endLine}`
    const sideQualifier = lineReference.side ? ` (${lineReference.side} side)` : ""
    const prefix = `[The user is referencing ${lineRange} of ${lineReference.file}${sideQualifier}]\n\n`
    textParts[0] = { type: "text", text: prefix + textParts[0].text }
  }

  const resolvedText = textParts.map((p) => p.text.slice(0, 100)).join(" | ")
  console.log(`[prompt] session=${sessionId} forwarding to opencode: ${textParts.length} part(s), text preview: "${resolvedText.slice(0, 200)}"`)

  const res = await client.session.promptAsync({
    sessionID: sessionId,
    directory,
    parts: textParts,
    // Disable the question tool — our mobile client doesn't support answering
    // questions yet, and unanswered questions cause the session to hang.
    // See: https://github.com/ben-pr-p/flockcode/issues/2
    tools: { question: false },
    ...(model ? { model } : {}),
    ...(agent ? { agent } : {}),
  })
  if (res.error) {
    console.error(`[prompt] session=${sessionId} opencode error:`, res.error)
    throw new Error(`Prompt failed: ${JSON.stringify(res.error)}`)
  }

  console.log(`[prompt] session=${sessionId} prompt accepted by opencode (async)`)
}
