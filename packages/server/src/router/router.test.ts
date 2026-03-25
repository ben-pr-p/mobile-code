/**
 * Integration tests for read-only oRPC procedures.
 *
 * These tests call procedures directly via oRPC's `createRouterClient`
 * (no HTTP server), against a live OpenCode server at localhost:4096.
 *
 * They verify that the response shapes match what the native client expects.
 *
 * Run: bun test src/router/router.test.ts
 */

import { test, expect, describe } from "bun:test"
import { createRouterClient } from "@orpc/server"
import { createClient } from "../opencode"
import { router } from "./index"
import type { RouterContext } from "./context"

const client = createClient("http://localhost:4096")

// Minimal context — only `client` is needed for read procedures.
// The other fields are stubs since read procedures don't use them.
const context: RouterContext = {
  client,
  appDs: {} as any,
  ephemeralDs: {} as any,
  sessionWorktrees: new Map(),
  stateStream: {} as any,
}

const api = createRouterClient(router, { context })

describe("models.list", () => {
  test("returns { models, defaults } with expected shapes", async () => {
    const result = await api.models.list()

    expect(result).toHaveProperty("models")
    expect(result).toHaveProperty("defaults")
    expect(Array.isArray(result.models)).toBe(true)
    expect(typeof result.defaults).toBe("object")

    // Every model has the fields the native CatalogModel type expects
    for (const model of result.models) {
      expect(typeof model.id).toBe("string")
      expect(typeof model.name).toBe("string")
      expect(typeof model.providerID).toBe("string")
      expect(typeof model.providerName).toBe("string")
    }

    // Should have at least one connected model
    expect(result.models.length).toBeGreaterThan(0)
  })
})

describe("agents.list", () => {
  test("returns an array of agents with expected shapes", async () => {
    const result = await api.agents.list()

    expect(Array.isArray(result)).toBe(true)

    // Every agent has the fields the native AgentInfo type expects
    for (const agent of result) {
      expect(typeof agent.name).toBe("string")
      expect(typeof agent.mode).toBe("string")
      // description and color are optional
      if (agent.description !== undefined) {
        expect(typeof agent.description).toBe("string")
      }
      if (agent.color !== undefined) {
        expect(typeof agent.color).toBe("string")
      }
    }

    // Should have at least one agent
    expect(result.length).toBeGreaterThan(0)
  })
})

describe("commands.list", () => {
  test("returns an array of commands with expected shapes", async () => {
    const result = await api.commands.list()

    expect(Array.isArray(result)).toBe(true)

    // Every command has the fields the native CommandInfo type expects
    for (const cmd of result) {
      expect(typeof cmd.name).toBe("string")
      expect(typeof cmd.template).toBe("string")
      // description and agent are optional
      if (cmd.description !== undefined) {
        expect(typeof cmd.description).toBe("string")
      }
      if (cmd.agent !== undefined) {
        expect(typeof cmd.agent).toBe("string")
      }
    }
  })
})

describe("diffs.list", () => {
  test("returns an array of { file, before, after } for a real session", async () => {
    // Find a session that has diffs
    const sessionsRes = await client.session.list()
    const sessions = sessionsRes.data ?? []
    expect(sessions.length).toBeGreaterThan(0)

    const sessionId = sessions[0].id
    const result = await api.diffs.list({ session: sessionId })

    expect(Array.isArray(result)).toBe(true)

    for (const diff of result) {
      expect(typeof diff.file).toBe("string")
      expect(typeof diff.before).toBe("string")
      expect(typeof diff.after).toBe("string")
    }
  })
})

describe("snapshot.ephemeral", () => {
  test("returns { offset, sessionStatuses, worktreeStatuses }", async () => {
    // The snapshot procedure reads from the in-memory StateStream,
    // not the OpenCode API. Use a mock with getEphemeralSnapshot.
    const snapshotContext: RouterContext = {
      client,
      appDs: {} as any,
      ephemeralDs: {} as any,
      sessionWorktrees: new Map(),
      stateStream: {
        getEphemeralSnapshot: () => ({
          offset: 0,
          sessionStatuses: {},
          worktreeStatuses: {},
        }),
      } as any,
    }

    const snapshotApi = createRouterClient(router, { context: snapshotContext })
    const result = await snapshotApi.snapshot.ephemeral()

    expect(result).toHaveProperty("offset")
    expect(result).toHaveProperty("sessionStatuses")
    expect(result).toHaveProperty("worktreeStatuses")
    expect(typeof result.offset).toBe("number")
    expect(typeof result.sessionStatuses).toBe("object")
    expect(typeof result.worktreeStatuses).toBe("object")
  })
})
