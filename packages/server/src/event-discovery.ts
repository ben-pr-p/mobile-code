// Event discovery driver: sends a real prompt and logs every event to understand
// how events map to messages, tool calls, and file changes.
//
// Usage: bun src/event-discovery.ts
//
// Requires: opencode server running on localhost:4096

import { createOpencodeClient, type Event as OpencodeEvent } from "@opencode-ai/sdk"
import { getSessionId, mapMessage } from "./opencode"

const client = createOpencodeClient({ baseUrl: "http://localhost:4096" })

// ─── Event collection ────────────────────────────────────────────────
type CollectedEvent = {
  index: number
  timestamp: number
  type: string
  sessionId: string | undefined
  raw: any
}

const events: CollectedEvent[] = []
let eventIndex = 0

// ─── Start event subscription ────────────────────────────────────────
async function subscribeToEvents(targetSessionId: string): Promise<() => void> {
  const subscription = await client.event.subscribe()
  let running = true

  const loop = async () => {
    for await (const event of subscription.stream) {
      if (!running) break
      const parsed = getSessionId(event)
      const sessionId = parsed?.sessionId

      // Only collect events for our target session
      if (sessionId !== targetSessionId) continue

      const collected: CollectedEvent = {
        index: eventIndex++,
        timestamp: Date.now(),
        type: event.type,
        sessionId,
        raw: event,
      }
      events.push(collected)

      // Print event in real-time
      const props = event.properties as any
      const summary = summarizeEvent(event)
      console.log(`[EVENT ${collected.index}] ${event.type} ${summary}`)
    }
  }
  loop().catch(() => {})

  return () => { running = false }
}

function summarizeEvent(event: OpencodeEvent): string {
  const props = event.properties as any
  switch (event.type) {
    case "message.updated": {
      const info = props.info
      return `role=${info?.role} msgId=${info?.id?.slice(0, 8)}`
    }
    case "message.part.updated": {
      const part = props.part
      return `partType=${part?.type} tool=${part?.tool ?? "-"} status=${part?.state?.status ?? "-"} partId=${part?.id?.slice(0, 8)}`
    }
    case "session.updated":
      return `title="${props.info?.title ?? ""}"`
    case "session.status":
      return `status=${props.status}`
    case "session.idle":
      return ""
    case "session.diff":
      return `files=${JSON.stringify(props.files?.map((f: any) => f.file) ?? [])}`
    case "session.error":
      return `error=${JSON.stringify(props.error)}`
    case "message.removed":
      return `msgId=${props.messageID?.slice(0, 8)}`
    case "message.part.removed":
      return `partId=${props.partID?.slice(0, 8)}`
    case "todo.updated":
      return `todo=${JSON.stringify(props.todo?.title ?? "")}`
    case "command.executed":
      return `cmd=${props.command}`
    default:
      return JSON.stringify(props).slice(0, 120)
  }
}

// ─── Run a prompt and collect everything ─────────────────────────────

async function runPrompt(sessionId: string, text: string) {
  console.log(`\n${"=".repeat(70)}`)
  console.log(`PROMPTING: "${text}"`)
  console.log(`${"=".repeat(70)}\n`)

  const res = await client.session.prompt({
    path: { id: sessionId },
    body: { parts: [{ type: "text", text }] },
  })
  if (res.error) {
    console.error("Prompt error:", res.error)
    return
  }
  console.log(`\nPrompt returned. Response message role=${(res.data as any)?.info?.role}`)
}

async function fetchMessages(sessionId: string) {
  const res = await client.session.messages({ path: { id: sessionId } })
  if (res.error) throw new Error("Failed to fetch messages")
  return (res.data ?? []).map(mapMessage)
}

async function fetchDiffs(sessionId: string) {
  const res = await client.session.diff({ path: { id: sessionId } })
  if (res.error) throw new Error("Failed to fetch diffs")
  return res.data ?? []
}

// ─── Analysis ────────────────────────────────────────────────────────

function analyzeEvents() {
  console.log(`\n${"=".repeat(70)}`)
  console.log("EVENT ANALYSIS")
  console.log(`${"=".repeat(70)}`)

  // Event type frequencies
  const typeCounts = new Map<string, number>()
  for (const e of events) {
    typeCounts.set(e.type, (typeCounts.get(e.type) ?? 0) + 1)
  }
  console.log("\nEvent type frequencies:")
  for (const [type, count] of [...typeCounts].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type}: ${count}`)
  }

  // Message part events breakdown
  const partEvents = events.filter(e => e.type === "message.part.updated")
  const partTypeBreakdown = new Map<string, number>()
  const toolEvents: CollectedEvent[] = []
  for (const e of partEvents) {
    const part = (e.raw.properties as any).part
    const key = part.type === "tool"
      ? `tool:${part.tool}:${part.state?.status}`
      : part.type
    partTypeBreakdown.set(key, (partTypeBreakdown.get(key) ?? 0) + 1)
    if (part.type === "tool") toolEvents.push(e)
  }
  console.log("\nPart event breakdown:")
  for (const [key, count] of [...partTypeBreakdown].sort()) {
    console.log(`  ${key}: ${count}`)
  }

  // Tool lifecycle analysis
  if (toolEvents.length > 0) {
    console.log("\nTool call lifecycle (events in order):")
    const toolCalls = new Map<string, { tool: string; events: { status: string; index: number; title?: string }[] }>()
    for (const e of toolEvents) {
      const part = (e.raw.properties as any).part
      const callId = part.callID ?? part.id
      if (!toolCalls.has(callId)) {
        toolCalls.set(callId, { tool: part.tool, events: [] })
      }
      toolCalls.get(callId)!.events.push({
        status: part.state?.status,
        index: e.index,
        title: part.state?.title,
      })
    }
    for (const [callId, info] of toolCalls) {
      console.log(`  ${info.tool} (${callId.slice(0, 8)}):`)
      for (const ev of info.events) {
        console.log(`    [${ev.index}] ${ev.status}${ev.title ? ` "${ev.title}"` : ""}`)
      }
    }
  }

  // Text streaming analysis
  const textEvents = partEvents.filter(e => (e.raw.properties as any).part.type === "text")
  if (textEvents.length > 0) {
    console.log(`\nText part updates: ${textEvents.length} events`)
    // Show first and last text content to understand streaming
    const firstText = (textEvents[0].raw.properties as any).part.text
    const lastText = (textEvents[textEvents.length - 1].raw.properties as any).part.text
    console.log(`  First text length: ${firstText?.length ?? 0}`)
    console.log(`  Last text length: ${lastText?.length ?? 0}`)
    console.log(`  First 100 chars: ${(firstText ?? "").slice(0, 100)}`)
  }

  // Session status events
  const statusEvents = events.filter(e => e.type === "session.status" || e.type === "session.idle")
  if (statusEvents.length > 0) {
    console.log("\nSession status timeline:")
    for (const e of statusEvents) {
      const props = e.raw.properties as any
      console.log(`  [${e.index}] ${e.type} ${props.status ?? ""}`)
    }
  }

  // Diff events
  const diffEvents = events.filter(e => e.type === "session.diff")
  if (diffEvents.length > 0) {
    console.log("\nDiff events:")
    for (const e of diffEvents) {
      const props = e.raw.properties as any
      console.log(`  [${e.index}]`, JSON.stringify(props).slice(0, 200))
    }
  }
}

// ─── Main ────────────────────────────────────────────────────────────

async function main() {
  // Create a fresh session
  console.log("Creating session...")
  const createRes = await client.session.create({
    body: { title: "event-discovery-test" },
  })
  if (createRes.error || !createRes.data) {
    console.error("Failed to create session:", createRes.error)
    process.exit(1)
  }
  const sessionId = createRes.data.id
  console.log(`Session created: ${sessionId}`)

  // Start listening for events
  const stopListening = await subscribeToEvents(sessionId)

  // Wait a beat for subscription to be ready
  await Bun.sleep(500)

  // ─── Test 1: Simple grep task ───────────────────────────────────────
  await runPrompt(
    sessionId,
    `Use the Grep tool to search for "export function" in the file src/opencode.ts. Then briefly tell me what you found. Do NOT create or modify any files.`,
  )

  // Wait for events to settle
  await Bun.sleep(3000)

  // Fetch final state
  console.log("\n--- Final messages state ---")
  const messages1 = await fetchMessages(sessionId)
  for (const m of messages1) {
    console.log(`Message ${m.id.slice(0, 8)} role=${m.role} parts=${m.parts.length}`)
    for (const p of m.parts) {
      if (p.type === "text") {
        console.log(`  text: ${p.text.slice(0, 100)}...`)
      } else if (p.type === "tool") {
        console.log(`  tool: ${p.tool} status=${p.state.status} title=${p.state.title ?? "-"}`)
      } else {
        console.log(`  ${p.type}`)
      }
    }
  }

  // Analyze events from test 1
  analyzeEvents()

  // ─── Test 2: File creation task ─────────────────────────────────────
  const test2StartIndex = events.length
  console.log(`\n\n${"#".repeat(70)}`)
  console.log("TEST 2: File creation")
  console.log(`${"#".repeat(70)}`)

  await runPrompt(
    sessionId,
    `Create a new file called /tmp/event-discovery-test.txt with the content "hello from event discovery". Use the write tool.`,
  )

  await Bun.sleep(3000)

  // Check diffs
  console.log("\n--- Diffs after file creation ---")
  const diffs = await fetchDiffs(sessionId)
  console.log("Diffs:", JSON.stringify(diffs, null, 2).slice(0, 500))

  // Analyze new events
  const test2Events = events.slice(test2StartIndex)
  console.log(`\nTest 2 events (${test2Events.length}):`)
  for (const e of test2Events) {
    console.log(`  [${e.index}] ${e.type} ${summarizeEvent(e.raw)}`)
  }

  // Final full analysis
  analyzeEvents()

  // ─── Dump raw events for offline analysis ─────────────────────────
  const dumpPath = "/tmp/event-discovery-dump.json"
  await Bun.write(dumpPath, JSON.stringify(events.map(e => ({
    index: e.index,
    type: e.type,
    sessionId: e.sessionId,
    properties: e.raw.properties,
  })), null, 2))
  console.log(`\nRaw events dumped to ${dumpPath}`)

  // Summary of findings
  console.log(`\n${"=".repeat(70)}`)
  console.log("RECONSTRUCTION GUIDE")
  console.log(`${"=".repeat(70)}`)
  console.log(`
Key findings for reconstructing session state from events:

1. MESSAGE UPDATES:
   - "message.updated" fires when a message is created/modified
   - properties.info contains full message metadata (id, role, sessionID, etc.)
   - Use message.info.id to track which message is being updated

2. MESSAGE PARTS (streaming):
   - "message.part.updated" fires for each part creation/update
   - properties.part contains: { type, id, sessionID, messageID, ... }
   - Text parts: text field grows as content streams in
   - Tool parts: state transitions through pending → running → completed/error

3. TOOL CALL LIFECYCLE:
   - part.type === "tool" with part.state.status tracking:
     pending → running → completed (or error)
   - part.tool = tool name, part.callID = unique call ID
   - part.state.input = tool arguments
   - part.state.output = tool result (on completed)
   - part.state.title = human-readable description (on running/completed)

4. FILE CHANGES:
   - "session.diff" event fires when files are modified
   - Use session.diff API to get full before/after content
   - Part type "patch" in messages tracks which files were affected

5. SESSION STATUS:
   - "session.status" = session is busy (running)
   - "session.idle" = session is done processing

6. RECONSTRUCTION STRATEGY:
   - Listen to all events for a session
   - On "message.part.updated": update the specific part in your local state
   - On "message.updated": update message metadata
   - On "session.diff": refresh file changes
   - On "session.idle": mark session as idle, do final state sync
`)

  stopListening()
  process.exit(0)
}

main().catch((err) => {
  console.error("Fatal:", err)
  process.exit(1)
})
