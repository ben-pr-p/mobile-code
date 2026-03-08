import { test, expect, describe } from "bun:test"
import { stream } from "@durable-streams/client"
import { DurableStreamServer } from "durable-streams-web-standard"
import { Hono } from "hono"
import { createApp } from "./app"

test("SSE client receives state events from the state stream", async () => {
  // Use a standalone DurableStreamServer to avoid needing a live opencode
  const ds = new DurableStreamServer()
  const app = new Hono()
  app.all("/stream/*", (c) => {
    const url = new URL(c.req.url)
    url.pathname = url.pathname.slice("/stream".length) || "/"
    const rewritten = new Request(url.toString(), c.req.raw)
    return ds.fetch(rewritten)
  })

  const server = Bun.serve({ port: 0, fetch: app.fetch })
  const baseUrl = `http://localhost:${server.port}`

  try {
    // Create the stream
    await ds.createStream("/", { contentType: "application/json" })

    // Start the client subscription from "now"
    const res = await stream({
      url: `${baseUrl}/stream`,
      offset: "now",
      live: "sse",
    })

    // Write a state protocol event
    await ds.appendToStream("/", JSON.stringify({
      type: "session",
      key: "test-123",
      value: { id: "test-123", title: "Test Session" },
      headers: { operation: "insert" },
    }), { contentType: "application/json" })

    // The client should receive the event via SSE
    const received = await new Promise<string>((resolve) => {
      const unsub = res.subscribeText((chunk) => {
        if (chunk.text.length > 0) {
          unsub()
          resolve(chunk.text)
        }
      })
    })

    const parsed = JSON.parse(received)
    // Durable streams wraps content in an array
    const event = Array.isArray(parsed) ? parsed[0] : parsed
    expect(event.type).toBe("session")
    expect(event.key).toBe("test-123")
    expect(event.value.title).toBe("Test Session")
    expect(event.headers.operation).toBe("insert")
  } finally {
    server.stop()
  }
})

describe("instance ID routing", () => {
  function startServer() {
    // createApp will fail to connect to opencode, but the app + routing still works
    const result = createApp("http://localhost:19999")
    const server = Bun.serve({ port: 0, fetch: result.app.fetch })
    const baseUrl = `http://localhost:${server.port}`
    return { ...result, server, baseUrl }
  }

  test("GET / returns instanceId", async () => {
    const { server, baseUrl, instanceId } = startServer()
    try {
      const res = await fetch(`${baseUrl}/`)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.instanceId).toBe(instanceId)
      expect(body.instanceId).toMatch(/^[a-z]{12}$/)
    } finally {
      server.stop()
    }
  })

  test("stream is accessible at /{instanceId}", async () => {
    const { server, baseUrl, ds, instanceId } = startServer()
    try {
      // Wait for StateStream.initialize to fail (it will since opencode is down),
      // then manually create the stream so we can test routing
      await new Promise((r) => setTimeout(r, 200))
      // Stream may or may not exist depending on timing; create idempotently
      try {
        await ds.createStream("/", { contentType: "application/json" })
      } catch {}

      await ds.appendToStream("/", JSON.stringify({
        type: "session",
        key: "s1",
        value: { id: "s1", title: "Hello" },
        headers: { operation: "insert" },
      }), { contentType: "application/json" })

      // Fetch the stream data via the instance ID route
      const res = await fetch(`${baseUrl}/${instanceId}`)
      expect(res.status).toBe(200)
      const body = await res.text()
      const parsed = JSON.parse(body)
      const events = Array.isArray(parsed) ? parsed : [parsed]
      expect(events.some((e: any) => e.key === "s1")).toBe(true)
    } finally {
      server.stop()
    }
  })

  test("stale instance ID returns 404", async () => {
    const { server, baseUrl } = startServer()
    try {
      const res = await fetch(`${baseUrl}/staleinstanceid`)
      expect(res.status).toBe(404)
    } finally {
      server.stop()
    }
  })

  test("two createApp calls produce different instanceIds", () => {
    const a = createApp("http://localhost:19999")
    const b = createApp("http://localhost:19999")
    expect(a.instanceId).not.toBe(b.instanceId)
  })

  test("SSE client receives events via /{instanceId}", async () => {
    const { server, baseUrl, ds, instanceId } = startServer()
    try {
      await new Promise((r) => setTimeout(r, 200))
      try {
        await ds.createStream("/", { contentType: "application/json" })
      } catch {}

      const res = await stream({
        url: `${baseUrl}/${instanceId}`,
        offset: "now",
        live: "sse",
      })

      await ds.appendToStream("/", JSON.stringify({
        type: "message",
        key: "m1",
        value: { id: "m1", sessionId: "s1", role: "user", parts: [], createdAt: 1 },
        headers: { operation: "upsert" },
      }), { contentType: "application/json" })

      const received = await new Promise<string>((resolve) => {
        const unsub = res.subscribeText((chunk) => {
          if (chunk.text.length > 0) {
            unsub()
            resolve(chunk.text)
          }
        })
      })

      const parsed = JSON.parse(received)
      const event = Array.isArray(parsed) ? parsed[0] : parsed
      expect(event.type).toBe("message")
      expect(event.key).toBe("m1")
      expect(event.headers.operation).toBe("upsert")
    } finally {
      server.stop()
    }
  })
})
