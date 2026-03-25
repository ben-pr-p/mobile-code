/**
 * Sprite configure-services — registers `opencode-serve` and `flock-server`
 * services on the Fly Sprite so they auto-start on Sprite wake.
 *
 * Also writes a `.flockenv` file to the Sprite's home directory containing
 * the environment variables needed by the flock server (auth token, API keys).
 *
 * Intended to be called independently from sync. Run `sync` first to clone
 * repos, then `configure-services` to set up background services.
 */

import type { SpriteClient } from "./sprites"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result for a single service registration. */
export interface ServiceResult {
  /** Whether the service was created fresh. */
  created: boolean
  /** Whether an existing service was updated. */
  updated: boolean
  /** Whether the service was already configured and left unchanged. */
  unchanged: boolean
}

/** Full result of a configure-services run. */
export interface ConfigureServicesResult {
  /** Result for the `opencode-serve` service. */
  opencodeServe: ServiceResult
  /** Result for the `flock-server` service. */
  flockServer: ServiceResult
  /** Whether the `.flockenv` file was written to the Sprite. */
  flockenvWritten: boolean
  /** Whether the `.flockenv` file was already up-to-date. */
  flockenvUnchanged: boolean
}

/** Options for {@link configureServices}. */
export interface ConfigureServicesOptions {
  /** If true, report what would happen without making changes. */
  dryRun?: boolean
  /**
   * The port opencode should listen on inside the Sprite.
   * @default 4096
   */
  opencodePort?: number
  /**
   * Working directory for the opencode serve process on the Sprite.
   * If not set, no `--dir` flag is passed (opencode uses its default).
   */
  opencodeDir?: string
  /**
   * The port the flock server should listen on inside the Sprite.
   * @default 3000
   */
  flockServerPort?: number
  /**
   * Bearer token for authenticating mobile clients to the flock server.
   * Written to `.flockenv` on the Sprite as `FLOCK_AUTH_TOKEN`.
   */
  flockAuthToken?: string
  /**
   * Google / Gemini API key for audio transcription.
   * Written to `.flockenv` on the Sprite as `GEMINI_API_KEY`.
   */
  geminiApiKey?: string
  /**
   * Callback for progress messages. If not provided, messages are printed to
   * stdout via `console.log`.
   */
  onProgress?: (message: string) => void
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OPENCODE_SERVICE = "opencode-serve"
const FLOCK_SERVICE = "flock-server"
const FLOCKENV_FILENAME = ".flockenv"

// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------

/**
 * Configure services and environment on the Fly Sprite.
 *
 * 1. Writes a `.flockenv` file to `$HOME/.flockenv` with env vars the flock
 *    server needs (auth token, API keys, opencode URL).
 * 2. Registers `opencode-serve` — runs `opencode serve --port <port>` as an
 *    internal service (no `http_port`, not externally proxied).
 * 3. Registers `flock-server` — sources `.flockenv` and runs
 *    `bunx @bprp/flockcode start` as the externally-proxied HTTP service.
 */
export async function configureServices(
  sprite: SpriteClient,
  options: ConfigureServicesOptions = {},
): Promise<ConfigureServicesResult> {
  const {
    opencodePort = 4096,
    opencodeDir,
    flockServerPort = 3000,
    flockAuthToken,
    geminiApiKey,
    dryRun = false,
  } = options
  const log = options.onProgress ?? console.log

  const result: ConfigureServicesResult = {
    opencodeServe: { created: false, updated: false, unchanged: false },
    flockServer: { created: false, updated: false, unchanged: false },
    flockenvWritten: false,
    flockenvUnchanged: false,
  }

  // -- 1. Write .flockenv -------------------------------------------------

  const homeDir = await sprite.homeDir()
  const flockenvPath = `${homeDir}/${FLOCKENV_FILENAME}`
  const desiredEnv = buildFlockenv({
    opencodePort,
    flockAuthToken,
    geminiApiKey,
  })

  // Check if the existing file already matches
  let existingEnv: string | null = null
  try {
    const buf = await sprite.readFile(flockenvPath)
    existingEnv = buf.toString("utf-8")
  } catch {
    // File doesn't exist yet
  }

  if (existingEnv === desiredEnv) {
    log(`  ${FLOCKENV_FILENAME} — already up-to-date`)
    result.flockenvUnchanged = true
  } else {
    if (dryRun) {
      log(`  ${FLOCKENV_FILENAME} — would write to ${flockenvPath}`)
    } else {
      log(`  ${FLOCKENV_FILENAME} — writing to ${flockenvPath}...`)
      await sprite.writeFile(flockenvPath, Buffer.from(desiredEnv, "utf-8"))
      log(`  ${FLOCKENV_FILENAME} — written`)
    }
    result.flockenvWritten = true
  }

  // -- 2. opencode-serve (internal, no http_port) -------------------------

  log("")
  const opencodeArgs = buildOpencodeArgs(opencodePort, opencodeDir)
  result.opencodeServe = await ensureService(sprite, {
    serviceName: OPENCODE_SERVICE,
    desiredCmd: "opencode",
    desiredArgs: opencodeArgs,
    desiredHttpPort: null,
    needs: [],
    dryRun,
    log,
  })

  // -- 3. flock-server (externally proxied) --------------------------------

  log("")
  const flockCmd = `source ${flockenvPath} && exec bunx @bprp/flockcode start --port ${flockServerPort}`
  result.flockServer = await ensureService(sprite, {
    serviceName: FLOCK_SERVICE,
    desiredCmd: "bash",
    desiredArgs: ["-c", flockCmd],
    desiredHttpPort: flockServerPort,
    needs: [OPENCODE_SERVICE],
    dryRun,
    log,
  })

  return result
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build the `.flockenv` file contents. */
function buildFlockenv(opts: {
  opencodePort: number
  flockAuthToken?: string
  geminiApiKey?: string
}): string {
  const lines: string[] = [
    "# Flockcode environment — managed by `flock sprite configure-services`",
    "# Do not edit manually; re-run configure-services to update.",
    "",
    `export OPENCODE_URL="http://localhost:${opts.opencodePort}"`,
  ]
  if (opts.flockAuthToken) {
    lines.push(`export FLOCK_AUTH_TOKEN="${opts.flockAuthToken}"`)
  }
  if (opts.geminiApiKey) {
    lines.push(`export GEMINI_API_KEY="${opts.geminiApiKey}"`)
  }
  lines.push("") // trailing newline
  return lines.join("\n")
}

/** Build the args array for the opencode serve command. */
function buildOpencodeArgs(port: number, dir?: string): string[] {
  const args = ["serve", "--port", String(port)]
  if (dir) {
    args.push("--dir", dir)
  }
  return args
}

/** Options for {@link ensureService}. */
interface EnsureServiceOptions {
  serviceName: string
  desiredCmd: string
  desiredArgs: string[]
  desiredHttpPort: number | null
  needs: string[]
  dryRun: boolean
  log: (message: string) => void
}

/**
 * Ensure a single service is registered on the Sprite with the desired
 * configuration. Creates, updates, or leaves it unchanged as appropriate.
 */
async function ensureService(
  sprite: SpriteClient,
  opts: EnsureServiceOptions,
): Promise<ServiceResult> {
  const { serviceName, desiredCmd, desiredArgs, desiredHttpPort, needs, dryRun, log } = opts
  const result: ServiceResult = { created: false, updated: false, unchanged: false }

  const existing = await sprite.getService(serviceName)

  const putConfig = {
    cmd: desiredCmd,
    args: desiredArgs,
    ...(desiredHttpPort != null ? { httpPort: desiredHttpPort } : {}),
    ...(needs.length > 0 ? { needs } : {}),
  }

  if (existing) {
    const matches =
      existing.cmd === desiredCmd &&
      arraysEqual(existing.args, desiredArgs) &&
      (existing.http_port ?? null) === desiredHttpPort &&
      arraysEqual(existing.needs, needs)

    if (matches) {
      log(`  ${serviceName} — already configured (${existing.state?.status ?? "unknown"})`)
      result.unchanged = true
    } else {
      if (dryRun) {
        log(`  ${serviceName} — would update (config changed)`)
        log(`    current: ${existing.cmd} ${existing.args.join(" ")} (port ${existing.http_port ?? "none"})`)
        log(`    desired: ${desiredCmd} ${desiredArgs.join(" ")} (port ${desiredHttpPort ?? "none"})`)
      } else {
        log(`  ${serviceName} — updating...`)
        await sprite.putService(serviceName, putConfig)
        log(`  ${serviceName} — updated`)
      }
      result.updated = true
    }
  } else {
    if (dryRun) {
      log(`  ${serviceName} — would create: ${desiredCmd} ${desiredArgs.join(" ")} (port ${desiredHttpPort ?? "none"})`)
    } else {
      log(`  ${serviceName} — creating...`)
      await sprite.putService(serviceName, putConfig)
      log(`  ${serviceName} — created`)
    }
    result.created = true
  }

  return result
}

/** Shallow array equality. */
function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}
