#!/usr/bin/env bun
/**
 * CLI entrypoint for the flockcode tool.
 *
 * Usage:
 *   flock start     [--opencode-url <url>] [--port <port>]         — start the HTTP server
 *   flock attach                                              — attach to the managed opencode server
 *   flock sprite sync      [--opencode-url <url>] [--dry-run]      — sync projects to Fly Sprite
 *   flock sprite configure-services [--dry-run]                     — configure services & env on Sprite
 *                          [--opencode-port <port>] [--opencode-dir <dir>]
 *                          [--flock-server-port <port>]
 *                          [--flock-auth-token <token>] [--gemini-api-key <key>]
 *                          [--transcription-model <model>]
 */

import { Crust } from "@crustjs/core"
import { helpPlugin, versionPlugin } from "@crustjs/plugins"
import { flag, commandValidator } from "@crustjs/validate/zod"
import { z } from "zod/v4"
import { createClient } from "./opencode"
import { ensureOpenCode, opencodeStore } from "./spawn-opencode"
import { createSpriteClientFromEnv } from "./sprites"
import { sync } from "./sprite-sync"
import { configureServices, type ServiceResult } from "./sprite-configure-services"
import { startServer } from "./start-server"
import { env } from "./env"

/** Format a service result as a human-readable status string. */
function serviceStatus(r: ServiceResult): string {
  if (r.created) return "created"
  if (r.updated) return "updated"
  return "unchanged"
}

// ---------------------------------------------------------------------------
// start — launch the Bun HTTP server
// ---------------------------------------------------------------------------

const start = new Crust("start")
  .meta({ description: "Start the HTTP server" })
  .flags({
    "opencode-url": flag(
      z.string().url().optional().describe("OpenCode server URL"),
      { short: "u" },
    ),
    port: flag(
      z.coerce.number().int().positive().optional().describe("Server port"),
      { short: "p" },
    ),
  })
  .run(commandValidator(async ({ flags }) => {
    const opencodeUrl = flags["opencode-url"] || undefined
    const port = flags.port ?? env.PORT

    await startServer({ opencodeUrl, port })

    // Keep the process alive — Bun.serve runs in the background
    await new Promise(() => {})
  }))

// ---------------------------------------------------------------------------
// attach — connect to a flock-managed opencode server
// ---------------------------------------------------------------------------

const attach = new Crust("attach")
  .meta({ description: "Attach to the flock-managed opencode server" })
  .run(commandValidator(async () => {
    const { port } = await opencodeStore.read()
    if (!port) {
      console.error("No managed opencode server found. Start one with `flock start` first.")
      process.exit(1)
    }

    const url = `http://localhost:${port}`
    const cwd = process.cwd()
    const child = Bun.spawn(["opencode", "attach", url, "--dir", cwd], {
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    })

    const exitCode = await child.exited
    process.exit(exitCode)
  }))

// ---------------------------------------------------------------------------
// sprite sync — sync projects to Fly Sprite
// ---------------------------------------------------------------------------

const spriteSync = new Crust("sync")
  .meta({ description: "Sync projects to Fly Sprite" })
  .flags({
    "opencode-url": flag(
      z.string().url().optional().describe("OpenCode server URL"),
      { short: "u" },
    ),
    "dry-run": flag(
      z.boolean().default(false).describe("Show what would happen without making changes"),
      { short: "n" },
    ),
  })
  .run(commandValidator(async ({ flags }) => {
    const opencodeUrl = flags["opencode-url"] || env.OPENCODE_URL || undefined
    const { url, child } = await ensureOpenCode(opencodeUrl)
    const dryRun = flags["dry-run"]

    const opencode = createClient(url)
    const sprite = createSpriteClientFromEnv()

    if (dryRun) {
      console.log("Dry run — no changes will be made.\n")
    }

    try {
      const result = await sync(sprite, opencode, { dryRun })

      console.log("\n--- Summary ---")
      console.log(`Cloned:     ${result.cloned.length}`)
      console.log(`Existing:   ${result.alreadyExists.length}`)
      console.log(`Uploaded:   ${result.filesUploaded.length}`)
      if (result.filesSkipped.length > 0) {
        console.log(`Skipped:    ${result.filesSkipped.length}`)
      }
      if (result.warnings.length > 0) {
        console.log(`Warnings:   ${result.warnings.length}`)
      }
    } catch (err: any) {
      console.error("Sync failed:", err.message ?? err)
    } finally {
      if (child) {
        try { child.kill() } catch {}
      }
    }
  }))

// ---------------------------------------------------------------------------
// sprite configure-services — configure services & env on Sprite
// ---------------------------------------------------------------------------

const spriteConfigure = new Crust("configure-services")
  .meta({ description: "Configure services and environment on Sprite" })
  .flags({
    "dry-run": flag(
      z.boolean().default(false).describe("Show what would happen without making changes"),
      { short: "n" },
    ),
    "opencode-port": flag(
      z.coerce.number().int().positive().optional().describe("Port for opencode serve on Sprite"),
    ),
    "opencode-dir": flag(
      z.string().optional().describe("Working directory for opencode serve on Sprite"),
    ),
    "flock-server-port": flag(
      z.coerce.number().int().positive().optional().describe("Port for the flock server on Sprite"),
    ),
    "flock-auth-token": flag(
      z.string().optional().describe("Bearer token for mobile client auth (written to .flockenv)"),
    ),
    "gemini-api-key": flag(
      z.string().optional().describe("Gemini API key for transcription (written to .flockenv)"),
    ),
    "transcription-model": flag(
      z.string().optional().describe("Gemini model for transcription (gemini-3-flash-preview or gemini-3.1-flash-lite-preview)"),
    ),
  })
  .run(commandValidator(async ({ flags }) => {
    const dryRun = flags["dry-run"]
    const opencodePort = flags["opencode-port"]
    const opencodeDir = flags["opencode-dir"]
    const flockServerPort = flags["flock-server-port"]
    const flockAuthToken = flags["flock-auth-token"] ?? (env.FLOCK_AUTH_TOKEN || undefined)
    const geminiApiKey = flags["gemini-api-key"] ?? (env.GEMINI_API_KEY || undefined)
    const transcriptionModel = flags["transcription-model"] ?? (env.TRANSCRIPTION_MODEL || undefined)

    const sprite = createSpriteClientFromEnv()

    if (dryRun) {
      console.log("Dry run — no changes will be made.\n")
    }

    try {
      const result = await configureServices(sprite, {
        dryRun,
        opencodePort,
        opencodeDir,
        flockServerPort,
        flockAuthToken,
        geminiApiKey,
        transcriptionModel,
      })

      console.log("\n--- Summary ---")
      console.log(`Env file:   .flockenv ${result.flockenvWritten ? "written" : "unchanged"}`)
      console.log(`Service:    opencode-serve ${serviceStatus(result.opencodeServe)}`)
      console.log(`Service:    flock-server ${serviceStatus(result.flockServer)}`)
    } catch (err: any) {
      console.error("Configure-services failed:", err.message ?? err)
      process.exit(1)
    }
  }))

// ---------------------------------------------------------------------------
// sprite — container command grouping Sprite operations
// ---------------------------------------------------------------------------

const sprite = new Crust("sprite")
  .meta({ description: "Fly Sprite management commands" })
  .command(spriteSync)
  .command(spriteConfigure)

// ---------------------------------------------------------------------------
// root — flockcode CLI
// ---------------------------------------------------------------------------

const main = new Crust("flock")
  .meta({ description: "Mobile AI coding agent server" })
  .use(versionPlugin("0.0.1"))
  .use(helpPlugin())
  .command(start)
  .command(attach)
  .command(sprite)

await main.execute()
