// End-to-end test: validates that event-driven MessageList correctly
// reconstructs messages from the event stream during a live prompt.
//
// Tests the server-side logic directly (no capnweb RPC layer).
//
// Usage: bun src/event-driven-test.ts
// Requires: opencode server on localhost:4096

import { createOpencodeClient } from "@opencode-ai/sdk"
import { Opencode, mapMessage } from "./opencode"
import { MessageList } from "./rpc"
import type { Message } from "./types"

const OPENCODE_URL = "http://localhost:4096"

async function main() {
  const client = createOpencodeClient({ baseUrl: OPENCODE_URL })
  const opencode = new Opencode(OPENCODE_URL)
  await opencode.spawnListener()

  // Create a fresh session
  console.log("Creating session...")
  const createRes = await client.session.create({ body: { title: "event-driven-test" } })
  if (createRes.error || !createRes.data) throw new Error("Failed to create session")
  const sessionId = createRes.data.id
  console.log(`Session: ${sessionId}`)

  // Track callback invocations
  const messageUpdates: Message[][] = []
  let callbackCount = 0

  // Create MessageList with callback (server-side, no RPC layer)
  const messageList = new MessageList(client, sessionId, opencode, (messages) => {
    callbackCount++
    messageUpdates.push([...messages]) // snapshot
    const summary = messages.map(m => {
      const partsSummary = m.parts.map(p => {
        if (p.type === "text") return `text(${p.text.length}ch)`
        if (p.type === "tool") return `tool:${p.tool}:${p.state.status}`
        return p.type
      }).join(", ")
      return `  ${m.role}[${m.id.slice(0, 8)}]: ${partsSummary}`
    }).join("\n")
    console.log(`[Callback #${callbackCount}] ${messages.length} messages:\n${summary}`)
  })

  // Get initial (empty) state
  const initial = await messageList.getState()
  console.log(`Initial messages: ${initial.length}`)

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

  // Fetch final state via getState() for comparison
  const finalViaGetState = await messageList.getState()

  console.log(`\n${"=".repeat(60)}`)
  console.log("RESULTS")
  console.log(`${"=".repeat(60)}`)
  console.log(`Total callback invocations: ${callbackCount}`)
  console.log(`Final messages via getState(): ${finalViaGetState.length}`)

  const lastCallback = messageUpdates[messageUpdates.length - 1]
  if (lastCallback) {
    console.log(`Final messages via last callback: ${lastCallback.length}`)

    // Compare final callback state with getState
    for (const msg of finalViaGetState) {
      const fromCb = lastCallback.find(m => m.id === msg.id)
      if (!fromCb) {
        console.log(`  MISSING in callback: ${msg.id} (${msg.role})`)
        continue
      }
      if (msg.parts.length !== fromCb.parts.length) {
        console.log(`  PART COUNT MISMATCH: ${msg.id} getState=${msg.parts.length} callback=${fromCb.parts.length}`)
      }
      for (let i = 0; i < Math.max(msg.parts.length, fromCb.parts.length); i++) {
        const gsPart = msg.parts[i]
        const cbPart = fromCb.parts[i]
        if (!cbPart) { console.log(`  MISSING PART ${i} in callback`); continue }
        if (!gsPart) { console.log(`  EXTRA PART ${i} in callback`); continue }
        if (gsPart.type !== cbPart.type) {
          console.log(`  PART TYPE MISMATCH at ${i}: getState=${gsPart.type} callback=${cbPart.type}`)
        }
        if (gsPart.type === "text" && cbPart.type === "text") {
          if (gsPart.text !== cbPart.text) {
            console.log(`  TEXT DIFF at part ${i}: getState=${gsPart.text.length}ch callback=${cbPart.text.length}ch`)
          } else {
            console.log(`  OK text part ${i}: "${gsPart.text.slice(0, 60)}"`)
          }
        }
        if (gsPart.type === "tool" && cbPart.type === "tool") {
          if (gsPart.state.status !== cbPart.state.status) {
            console.log(`  TOOL STATUS DIFF: getState=${gsPart.state.status} callback=${cbPart.state.status}`)
          } else {
            console.log(`  OK tool part ${i}: ${gsPart.tool} ${gsPart.state.status}`)
          }
        }
      }
    }
  }

  // Show text streaming progression
  console.log(`\n--- Text streaming progression ---`)
  for (let i = 0; i < messageUpdates.length; i++) {
    for (const m of messageUpdates[i]) {
      if (m.role !== "assistant") continue
      for (const p of m.parts) {
        if (p.type === "text") {
          console.log(`  cb#${i}: text ${p.text.length}ch "${p.text.slice(0, 40)}..."`)
        }
      }
    }
  }

  console.log("\nDone.")
  process.exit(0)
}

main().catch((err) => {
  console.error("Fatal:", err)
  process.exit(1)
})
