#!/usr/bin/env bun
/**
 * CLI entrypoint for the flockcode tool.
 *
 * Usage:
 *   flockcode start     [--opencode-url <url>] [--port <port>]         — start the HTTP server
 *   flockcode sync      [--opencode-url <url>] [--dry-run]             — sync projects to Fly Sprite
 *   flockcode configure-services [--dry-run]                            — register opencode-serve service on Sprite
 *                        [--opencode-port <port>] [--opencode-dir <dir>]
 */

import { parseArgs } from "util"
import { resolve } from "node:path"
import { createClient } from "./opencode"
import { createSpriteClientFromEnv } from "./sprites"
import { sync } from "./sprite-sync"
import { spawnServices } from "./sprite-configure-services"
import { env } from "./env"

const args = Bun.argv.slice(2)
const subcommand = args.length > 0 && !args[0].startsWith("-") ? args[0] : null

if (subcommand === "start") {
  // -------------------------------------------------------------------------
  // Start subcommand — launch the Bun HTTP server
  //
  // Delegates to server.ts which has the default export Bun needs.
  // Flags after "start" are forwarded as-is.
  // -------------------------------------------------------------------------
  const serverPath = resolve(import.meta.dir, "server.ts")
  const forwarded = args.slice(1)

  const proc = Bun.spawn(["bun", serverPath, ...forwarded], {
    stdio: ["inherit", "inherit", "inherit"],
  })

  // Forward the exit code
  const code = await proc.exited
  process.exit(code)
} else if (subcommand === "sync") {
  // -------------------------------------------------------------------------
  // Sync subcommand — sync projects to Fly Sprite, then exit
  // -------------------------------------------------------------------------
  const { values: syncValues } = parseArgs({
    args: args.slice(1),
    options: {
      "opencode-url": { type: "string" },
      "dry-run": { type: "boolean", default: false },
    },
  })

  const opencodeUrl = syncValues["opencode-url"] ?? env.OPENCODE_URL
  const dryRun = syncValues["dry-run"]!

  const opencode = createClient(opencodeUrl)
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
    process.exit(1)
  }

  process.exit(0)
} else if (subcommand === "configure-services") {
  // -------------------------------------------------------------------------
  // Configure-services subcommand — register opencode-serve service, then exit
  // -------------------------------------------------------------------------
  const { values: csValues } = parseArgs({
    args: args.slice(1),
    options: {
      "dry-run": { type: "boolean", default: false },
      "opencode-port": { type: "string" },
      "opencode-dir": { type: "string" },
    },
  })

  const dryRun = csValues["dry-run"]!
  const opencodePort = csValues["opencode-port"] ? Number(csValues["opencode-port"]) : undefined
  const opencodeDir = csValues["opencode-dir"] ?? undefined

  const sprite = createSpriteClientFromEnv()

  if (dryRun) {
    console.log("Dry run — no changes will be made.\n")
  }

  try {
    const result = await spawnServices(sprite, {
      dryRun,
      opencodePort,
      opencodeDir,
    })

    console.log("\n--- Summary ---")
    if (result.serviceCreated) {
      console.log(`Service:    opencode-serve created`)
    } else if (result.serviceUpdated) {
      console.log(`Service:    opencode-serve updated`)
    } else if (result.serviceUnchanged) {
      console.log(`Service:    opencode-serve unchanged`)
    }
  } catch (err: any) {
    console.error("Configure-services failed:", err.message ?? err)
    process.exit(1)
  }

  process.exit(0)
} else {
  // -------------------------------------------------------------------------
  // No subcommand or unknown subcommand — print usage
  // -------------------------------------------------------------------------
  console.log(`flockcode — mobile AI coding agent server

Usage:
  flockcode start     [options]   Start the HTTP server
  flockcode sync      [options]   Sync projects to Fly Sprite
  flockcode configure-services [options]   Register opencode-serve service on Sprite

start options:
  --opencode-url <url>       OpenCode server URL (default: $OPENCODE_URL or http://localhost:4096)
  --port <port>              Server port (default: $PORT or 3000)

sync options:
  --opencode-url <url>       OpenCode server URL (default: $OPENCODE_URL or http://localhost:4096)
  --dry-run                  Show what would happen without making changes

configure-services options:
  --dry-run                  Show what would happen without making changes
  --opencode-port <port>     Port for opencode serve on Sprite (default: 4096)
  --opencode-dir <dir>       Working directory for opencode serve on Sprite`)

  if (subcommand) {
    console.error(`\nUnknown command: ${subcommand}`)
    process.exit(1)
  }
}
