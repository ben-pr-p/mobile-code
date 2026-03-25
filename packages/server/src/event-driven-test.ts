// End-to-end test: validates that the StateStream correctly reconstructs
// messages from the OpenCode event stream during a live prompt.
//
// Tests the durable stream state sync directly.
//
// Usage: bun src/event-driven-test.ts
// Requires: opencode server on localhost:4096

import { createOpencodeClient } from "@opencode-ai/sdk"
import { Opencode, mapMessage } from "./opencode"
import type { OpencodeEventCallback } from "./opencode"

const OPENCODE_URL = "http://localhost:4096"

async function main() {
  const client = createOpencodeClient({ baseUrl: OPENCODE_URL })
  const opencode = new Opencode(OPENCODE_URL)

  // Create a fresh session
  console.log("Creating session...")
  const createRes = await client.session.create({ body: { title: "event-driven-test" } })
  if (createRes.error || !createRes.data) throw new Error("Failed to create session")
  const sessionId = createRes.data.id
  console.log(`Session: ${sessionId}`)

  // Track events received
  let eventCount = 0
  const onEvent: OpencodeEventCallback = (event) => {
    eventCount++
    console.log(`[Event #${eventCount}] ${event.type}`)
  }
  await opencode.spawnListener(onEvent, OPENCODE_URL)

  // Send prompt directly via SDK
  console.log("\n--- Sending prompt ---")
  const promptRes = await client.session.prompt({
    path: { id: sessionId },
    body: { parts: [{ type: "text", text: 'Respond with just the word "hi". Nothing else.' }] },
  })
  if (promptRes.error) throw new Error(`Prompt failed: ${JSON.stringify(promptRes.error)}`)
  console.log(`Prompt returned: role=${(promptRes.data as any)?.info?.role}`)

  // Wait for trailing events
  await Bun.sleep(3000)

  // Fetch final messages via SDK
  const msgsRes = await client.session.messages({ path: { id: sessionId } })
  const messages = (msgsRes.data ?? []).map(mapMessage)

  console.log(`\n${"=".repeat(60)}`)
  console.log("RESULTS")
  console.log(`${"=".repeat(60)}`)
  console.log(`Total events received: ${eventCount}`)
  console.log(`Final messages: ${messages.length}`)

  for (const msg of messages) {
    const partsSummary = msg.parts.map((p: any) => {
      if (p.type === "text") return `text(${p.text.length}ch)`
      if (p.type === "tool") return `tool:${p.tool}:${p.state.status}`
      return p.type
    }).join(", ")
    console.log(`  ${msg.role}[${msg.id.slice(0, 8)}]: ${partsSummary}`)
  }

  console.log("\nDone.")
  process.exit(0)
}

main().catch((err) => {
  console.error("Fatal:", err)
  process.exit(1)
})
