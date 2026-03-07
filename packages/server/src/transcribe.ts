import { chat } from "@tanstack/ai"
import { geminiText } from "@tanstack/ai-gemini"
import type { Message } from "./types"

export async function transcribeAudio(
  base64Audio: string,
  mimeType: string,
  conversationContext?: Message[],
): Promise<string> {
  // Normalize MIME types that Gemini doesn't recognize
  const normalizedMime = normalizeMimeType(mimeType)
  console.log(`[transcribe] input: ${base64Audio.length} chars base64, mimeType=${mimeType} -> ${normalizedMime}, context=${conversationContext?.length ?? 0} messages`)
  const contextSummary = buildContextSummary(conversationContext)

  const systemPrompt = `\
## General Instructions
You are a voice transcription layer between a human user and an AI coding agent.
The user is speaking voice commands/messages that will be forwarded to the coding agent.
You will be provided recent conversation history to help you resolve ambiguous words, technical terms,
variable names, file paths, and other domain-specific vocabulary.
The final message will be an audio recording from the user to transcribe.

## Transcription Intent Correction
Transcribe the user's audio message. Transcribe the intent of it - you should not transcribe umms.
If the user corrects themselves in natural speech, only output the correction.

## Reference Resolution
Resolve the user's references to real files that may have been recently referenced. If the user says "Add server dot env to gitignore",
and the agent recently edited \`./server/.env\`, then output \`Add ./server/.env to .gitignore\`.

## Output Instructions
Output ONLY the text that you believe should be forwarded to the coding agent, nothing else.
If the audio is unclear or empty, respond with an empty string and nothing will happen.`

  const contextMessages = [
    {
      role: "user",
      content: `Recent conversation for context:\n${contextSummary}`,
    },
    {
      role: "assistant",
      content: "Understood, I'll use this context to help transcribe the next audio message.",
    }
  ] as const;

  const result = await chat({
    adapter: geminiText("gemini-3-flash-preview"),
    systemPrompts: [systemPrompt],
    messages: [
      ...contextMessages,
      {
          role: 'user',
          content: [
            {
              type: "audio",
              source: {
                type: "data",
                value: base64Audio,
                mimeType: normalizedMime,
              }
            }
          ]
        }
    ],
    stream: false,
  })

  console.log(`[transcribe] raw result: "${result}"`)
  return result.trim()
}

function normalizeMimeType(mime: string): string {
  // Gemini only supports: wav, mp3, aiff, aac, ogg, flac
  // iOS records m4a (AAC in MP4 container) — map to audio/aac
  const map: Record<string, string> = {
    "audio/x-m4a": "audio/aac",
    "audio/m4a": "audio/aac",
    "audio/mp4": "audio/aac",
    "audio/x-caf": "audio/aac",
    "audio/mpeg": "audio/mp3",
  }
  return map[mime] ?? mime
}

function buildContextSummary(messages?: Message[]): string {
  if (!messages?.length) return ""

  // Take last 10 messages, extract text content
  const recent = messages.slice(-10)
  return recent
    .map((m) => {
      const textParts = m.parts
        .filter((p): p is { type: "text"; id: string; text: string } => p.type === "text")
        .map((p) => p.text)
        .join(" ")
      if (!textParts) return null
      return `${m.role}: ${textParts.slice(0, 200)}`
    })
    .filter(Boolean)
    .join("\n")
}
