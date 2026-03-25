/**
 * Integration tests for the durable stream endpoints.
 *
 * Verifies that the instance stream (/{instanceId}), ephemeral stream
 * (/{instanceId}/ephemeral), and persistent app stream (/app) are wired
 * up and return streamed responses.
 *
 * Uses app.fetch directly — no HTTP server needed.
 *
 * Run: bun test src/streams.test.ts
 */

import { test, expect, describe } from "bun:test"
import { createApp } from "./app"

const BASE = "http://localhost"

describe("stream endpoints", () => {
  test("instance stream at /{instanceId} returns a streaming response", async () => {
    const { app, instanceId } = await createApp("http://localhost:4096")

    const res = await app.fetch(new Request(`${BASE}/${instanceId}`))

    expect(res.status).toBe(200)
    expect(res.body).not.toBeNull()
  })

  test("ephemeral stream at /{instanceId}/ephemeral returns a streaming response", async () => {
    const { app, instanceId } = await createApp("http://localhost:4096")

    const res = await app.fetch(new Request(`${BASE}/${instanceId}/ephemeral`))

    expect(res.status).toBe(200)
    expect(res.body).not.toBeNull()
  })

  test("app stream at /app returns a streaming response", async () => {
    const { app } = await createApp("http://localhost:4096")

    const res = await app.fetch(new Request(`${BASE}/app`))

    expect(res.status).toBe(200)
    expect(res.body).not.toBeNull()
  })
})
