/**
 * Spawn and manage an `opencode serve` child process.
 *
 * When no explicit OpenCode URL is provided, this module finds an available
 * port, starts `opencode serve` on it, waits for it to become ready, and
 * returns the URL. The child process is killed when the parent process exits.
 *
 * The managed port is persisted to the crust store so other processes can
 * discover the running opencode instance.
 */

import { createStore, stateDir } from "@crustjs/store"

const OPENCODE_BIN = "opencode"
const DEFAULT_START_PORT = 4097
const MAX_PORT_ATTEMPTS = 100
const READY_TIMEOUT_MS = 30_000
const READY_POLL_INTERVAL_MS = 250

export const opencodeStore = createStore({
  dirPath: stateDir("flockcode"),
  name: "opencode",
  fields: {
    port: {
      type: "number",
      description: "Port of the flock-managed opencode serve process",
      validate: (v) => {
        if (v < 1 || v > 65535) throw new Error("port must be 1–65535")
      },
    },
  },
})

/** Result of ensuring an OpenCode server is available. */
export interface EnsureOpenCodeResult {
  /** The base URL of the OpenCode server. */
  url: string
  /** The spawned subprocess, if one was started. `null` when connecting to an existing server. */
  child: Bun.Subprocess | null
}

/**
 * Check if a TCP port is available by trying to listen on it.
 */
async function isPortAvailable(port: number): Promise<boolean> {
  try {
    const server = Bun.serve({
      port,
      fetch() {
        return new Response("probe")
      },
    })
    server.stop()
    return true
  } catch {
    return false
  }
}

/**
 * Find the first available port starting from `startFrom`.
 */
export async function findAvailablePort(startFrom: number = DEFAULT_START_PORT): Promise<number> {
  for (let port = startFrom; port < startFrom + MAX_PORT_ATTEMPTS; port++) {
    if (await isPortAvailable(port)) {
      return port
    }
  }
  throw new Error(`No available port found in range ${startFrom}–${startFrom + MAX_PORT_ATTEMPTS - 1}`)
}

/**
 * Poll the OpenCode server until it responds or the timeout expires.
 */
async function waitForReady(url: string, timeoutMs: number = READY_TIMEOUT_MS): Promise<void> {
  const deadline = Date.now() + timeoutMs
  const healthUrl = `${url}/health`

  while (Date.now() < deadline) {
    try {
      const res = await fetch(healthUrl, { signal: AbortSignal.timeout(2000) })
      if (res.ok) return
    } catch {
      // Not ready yet
    }
    await Bun.sleep(READY_POLL_INTERVAL_MS)
  }

  throw new Error(`OpenCode server at ${url} did not become ready within ${timeoutMs}ms`)
}

/**
 * Spawn `opencode serve` as a child process on the given port.
 */
function spawnProcess(port: number): Bun.Subprocess {
  const child = Bun.spawn([OPENCODE_BIN, "serve", "--port", String(port)], {
    stdout: "pipe",
    stderr: "pipe",
  })

  // Forward stderr so startup errors are visible
  const reader = child.stderr.getReader()
  const decoder = new TextDecoder()
  child.exited.then(async () => {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const text = decoder.decode(value, { stream: true })
      for (const line of text.split("\n")) {
        if (line) console.error(`[opencode] ${line}`)
      }
    }
  })

  return child
}

/**
 * Ensure an OpenCode server is available.
 *
 * - If `explicitUrl` is a non-empty string, it is returned directly (assumes
 *   an OpenCode server is already running there).
 * - Otherwise, finds an available port, spawns `opencode serve`, waits for
 *   it to become ready, and returns the URL plus the child process handle.
 */
export async function ensureOpenCode(explicitUrl?: string): Promise<EnsureOpenCodeResult> {
  if (explicitUrl) {
    return { url: explicitUrl, child: null }
  }

  const port = await findAvailablePort()
  console.log(`Spawning opencode serve on port ${port}...`)

  const child = spawnProcess(port)
  const url = `http://localhost:${port}`

  await waitForReady(url)
  console.log(`OpenCode server ready at ${url}`)

  await opencodeStore.patch({ port })

  return { url, child }
}

/**
 * Register signal handlers to kill a spawned child process on exit.
 * Clears the stored port before exiting.
 */
export function cleanupOnExit(child: Bun.Subprocess): void {
  const kill = async () => {
    try {
      child.kill()
    } catch {
      // Process may have already exited
    }
    try {
      await opencodeStore.update(() => ({ port: undefined }))
    } catch {
      // Store write best-effort during shutdown
    }
    process.exit(0)
  }

  process.on("SIGINT", kill)
  process.on("SIGTERM", kill)
}
