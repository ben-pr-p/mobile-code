/**
 * Diagnostic script: fetches all data from the durable stream and reports
 * which events are largest, helping identify what causes the
 * "String length exceeds limit" RangeError on the client.
 *
 * Usage:
 *   bun packages/server/src/diagnose-stream.ts [--url http://localhost:3000] [--token TOKEN]
 */

import { stream } from "@durable-streams/client"

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2)
function getArg(name: string, fallback: string): string {
  const idx = args.indexOf(name)
  return idx >= 0 && args[idx + 1] ? args[idx + 1]! : fallback
}

const BASE_URL = getArg("--url", "http://localhost:3000")
const AUTH_TOKEN = getArg("--token", process.env.FLOCK_AUTH_TOKEN ?? "")

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface StateEvent {
  type: string
  key: string
  value?: unknown
  headers: { operation: string }
}

function byteLen(s: string): number {
  return new TextEncoder().encode(s).byteLength
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

/** Summarize the parts of a message value to show which part is large. */
function summarizeMessageParts(value: any): string[] {
  if (!value?.parts) return []
  return (value.parts as any[]).map((p: any, i: number) => {
    const json = JSON.stringify(p)
    const size = byteLen(json)
    let label = `  part[${i}] type=${p.type}`
    if (p.type === "tool") {
      label += ` tool=${p.tool}`
      if (p.state?.status) label += ` status=${p.state.status}`
      if (p.state?.output) {
        const outLen = byteLen(p.state.output)
        label += ` output=${formatBytes(outLen)}`
      }
      if (p.state?.input) {
        const inLen = byteLen(JSON.stringify(p.state.input))
        label += ` input=${formatBytes(inLen)}`
      }
    }
    if (p.type === "text" && p.text) {
      label += ` text=${formatBytes(byteLen(p.text))}`
    }
    label += ` → total=${formatBytes(size)}`
    return label
  })
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`Connecting to ${BASE_URL} ...`)

  // 1. Discover the instanceId
  const headers: Record<string, string> = {}
  if (AUTH_TOKEN) headers["Authorization"] = `Bearer ${AUTH_TOKEN}`

  const rootRes = await fetch(BASE_URL, { headers })
  if (!rootRes.ok) {
    console.error(`Failed to reach server: ${rootRes.status} ${rootRes.statusText}`)
    process.exit(1)
  }
  const { instanceId, appStreamUrl } = (await rootRes.json()) as {
    instanceId: string
    appStreamUrl: string
  }
  console.log(`Instance ID: ${instanceId}`)

  // 2. Fetch the instance state stream (catch-up only, no live)
  const stateUrl = `${BASE_URL}/${instanceId}/`
  console.log(`\nFetching instance stream: ${stateUrl}`)

  const stateRes = await stream<StateEvent>({
    url: stateUrl,
    offset: "-1",
    live: false,
    headers: AUTH_TOKEN ? { Authorization: `Bearer ${AUTH_TOKEN}` } : undefined,
  })

  const events = await stateRes.json()
  console.log(`Total events: ${events.length}`)

  // 3. Compute sizes
  type SizedEvent = {
    index: number
    type: string
    key: string
    operation: string
    jsonSize: number
    json: string
    event: StateEvent
  }

  const sized: SizedEvent[] = events.map((e, i) => {
    const json = JSON.stringify(e)
    return {
      index: i,
      type: e.type,
      key: e.key,
      operation: e.headers.operation,
      jsonSize: byteLen(json),
      json,
      event: e,
    }
  })

  // 4. Overall stats
  const totalBytes = sized.reduce((s, e) => s + e.jsonSize, 0)
  console.log(`Total payload size: ${formatBytes(totalBytes)}`)

  // Size by type
  const byType = new Map<string, { count: number; bytes: number }>()
  for (const e of sized) {
    const entry = byType.get(e.type) ?? { count: 0, bytes: 0 }
    entry.count++
    entry.bytes += e.jsonSize
    byType.set(e.type, entry)
  }

  console.log(`\n--- Breakdown by event type ---`)
  for (const [type, { count, bytes }] of [...byType.entries()].sort(
    (a, b) => b[1].bytes - a[1].bytes,
  )) {
    console.log(`  ${type}: ${count} events, ${formatBytes(bytes)} total, ${formatBytes(bytes / count)} avg`)
  }

  // 5. Top 20 largest events
  const sorted = [...sized].sort((a, b) => b.jsonSize - a.jsonSize)
  console.log(`\n--- Top 20 largest events ---`)
  for (const e of sorted.slice(0, 20)) {
    console.log(
      `#${e.index} type=${e.type} key=${e.key} op=${e.operation} size=${formatBytes(e.jsonSize)}`,
    )
    if (e.type === "message") {
      const parts = summarizeMessageParts(e.event.value)
      for (const line of parts) console.log(line)
    }
  }

  // 6. Identify sessions with the most data
  const bySession = new Map<string, { messageCount: number; totalBytes: number; largestMessage: number }>()
  for (const e of sized) {
    if (e.type !== "message") continue
    const sessionId = (e.event.value as any)?.sessionId
    if (!sessionId) continue
    const entry = bySession.get(sessionId) ?? { messageCount: 0, totalBytes: 0, largestMessage: 0 }
    entry.messageCount++
    entry.totalBytes += e.jsonSize
    entry.largestMessage = Math.max(entry.largestMessage, e.jsonSize)
    bySession.set(sessionId, entry)
  }

  console.log(`\n--- Sessions by total message data ---`)
  const sessionsSorted = [...bySession.entries()].sort(
    (a, b) => b[1].totalBytes - a[1].totalBytes,
  )
  for (const [sessionId, { messageCount, totalBytes, largestMessage }] of sessionsSorted.slice(0, 10)) {
    console.log(
      `  session=${sessionId}  messages=${messageCount}  total=${formatBytes(totalBytes)}  largest=${formatBytes(largestMessage)}`,
    )
  }

  // 7. Check the full serialized stream size (what the client receives on initial load)
  // The server wraps all events in a single JSON array for the initial GET
  const fullPayload = JSON.stringify(events)
  const fullPayloadSize = byteLen(fullPayload)
  console.log(`\n--- Initial load payload ---`)
  console.log(`Full JSON array size: ${formatBytes(fullPayloadSize)}`)
  console.log(`String length (chars): ${fullPayload.length.toLocaleString()}`)

  // JS string length limit is ~512MB on V8 / ~1GB on JSC but some RN
  // implementations may have lower limits. Flag if over 100MB.
  if (fullPayload.length > 100_000_000) {
    console.log(`⚠️  WARNING: Payload string length exceeds 100M chars — likely cause of RangeError!`)
  } else if (fullPayload.length > 50_000_000) {
    console.log(`⚠️  WARNING: Payload string length exceeds 50M chars — may cause issues on mobile`)
  } else if (fullPayload.length > 10_000_000) {
    console.log(`⚠️  CAUTION: Payload string length exceeds 10M chars — large for mobile`)
  }

  // 8. Also check the ephemeral stream
  console.log(`\n--- Ephemeral stream ---`)
  const ephemeralUrl = `${BASE_URL}/${instanceId}/ephemeral/`
  console.log(`Fetching: ${ephemeralUrl}`)
  try {
    const ephRes = await stream<StateEvent>({
      url: ephemeralUrl,
      offset: "-1",
      live: false,
      headers: AUTH_TOKEN ? { Authorization: `Bearer ${AUTH_TOKEN}` } : undefined,
    })
    const ephEvents = await ephRes.json()
    const ephPayload = JSON.stringify(ephEvents)
    console.log(`Ephemeral events: ${ephEvents.length}`)
    console.log(`Ephemeral payload size: ${formatBytes(byteLen(ephPayload))}`)
    console.log(`Ephemeral string length: ${ephPayload.length.toLocaleString()}`)

    // Breakdown by type
    const ephByType = new Map<string, { count: number; bytes: number }>()
    for (const e of ephEvents) {
      const json = JSON.stringify(e)
      const entry = ephByType.get(e.type) ?? { count: 0, bytes: 0 }
      entry.count++
      entry.bytes += byteLen(json)
      ephByType.set(e.type, entry)
    }
    for (const [type, { count, bytes }] of [...ephByType.entries()].sort(
      (a, b) => b[1].bytes - a[1].bytes,
    )) {
      console.log(`  ${type}: ${count} events, ${formatBytes(bytes)} total`)
    }
  } catch (err) {
    console.log(`Could not fetch ephemeral stream: ${err}`)
  }

  // 9. Also check the app stream
  console.log(`\n--- App state stream ---`)
  const appUrl = `${BASE_URL}${appStreamUrl}/`
  console.log(`Fetching: ${appUrl}`)
  try {
    const appRes = await stream<StateEvent>({
      url: appUrl,
      offset: "-1",
      live: false,
      headers: AUTH_TOKEN ? { Authorization: `Bearer ${AUTH_TOKEN}` } : undefined,
    })
    const appEvents = await appRes.json()
    const appPayload = JSON.stringify(appEvents)
    console.log(`App events: ${appEvents.length}`)
    console.log(`App payload size: ${formatBytes(byteLen(appPayload))}`)
    console.log(`App string length: ${appPayload.length.toLocaleString()}`)
  } catch (err) {
    console.log(`Could not fetch app stream: ${err}`)
  }

  // 10. Check for duplicate message events (same key emitted many times)
  // The stream is append-only: every messagePartDelta and update re-emits
  // the full message, so the same message key appears many times.
  const keyCounts = new Map<string, { count: number; totalBytes: number; lastSize: number }>()
  for (const e of sized) {
    const compoundKey = `${e.type}:${e.key}`
    const entry = keyCounts.get(compoundKey) ?? { count: 0, totalBytes: 0, lastSize: 0 }
    entry.count++
    entry.totalBytes += e.jsonSize
    entry.lastSize = e.jsonSize
    keyCounts.set(compoundKey, entry)
  }

  const duplicates = [...keyCounts.entries()]
    .filter(([, v]) => v.count > 1)
    .sort((a, b) => b[1].totalBytes - a[1].totalBytes)

  console.log(`\n--- Most-duplicated keys (events re-emitted as stream appends) ---`)
  console.log(`(Each update re-appends the full object. These accumulate in the stream.)`)
  for (const [key, { count, totalBytes, lastSize }] of duplicates.slice(0, 15)) {
    console.log(
      `  ${key}: emitted ${count}x, accumulated ${formatBytes(totalBytes)}, final size ${formatBytes(lastSize)}`,
    )
  }

  // 11. Estimate the "effective" payload — only last version of each key matters
  // for state, but ALL versions are in the stream and sent to the client.
  const lastVersion = new Map<string, number>()
  for (const e of sized) {
    lastVersion.set(`${e.type}:${e.key}`, e.jsonSize)
  }
  const effectiveBytes = [...lastVersion.values()].reduce((s, v) => s + v, 0)
  console.log(`\n--- Stream efficiency ---`)
  console.log(`Total stream bytes (all appends): ${formatBytes(totalBytes)}`)
  console.log(`Effective state bytes (latest per key): ${formatBytes(effectiveBytes)}`)
  console.log(`Overhead from duplicates: ${formatBytes(totalBytes - effectiveBytes)} (${((1 - effectiveBytes / totalBytes) * 100).toFixed(1)}%)`)

  console.log(`\nDone.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
