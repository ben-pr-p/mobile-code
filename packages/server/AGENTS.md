# @flockcode/server — Agent Guide

Hono API server running on Bun. Backend for the flock native client.

## Stack

- **Hono** 4 — lightweight HTTP framework
- **Bun** — runtime and package manager
- **TypeScript** 5.9
- **Crust** — CLI framework (`@crustjs/core`, `@crustjs/plugins`, `@crustjs/validate`, `@crustjs/store`)

## Commands

```sh
bun install          # install dependencies
bun run dev          # start with hot reload (bun --hot)
bun run start        # start production server
```

### CLI (`src/index.ts`)

The CLI uses the [Crust](https://crustjs.com) framework with a chainable builder API:

```sh
flock start [--opencode-url <url>] [--port <port>]    # start the HTTP server
flock sprite sync [--opencode-url <url>] [--dry-run]   # sync projects to Fly Sprite
flock sprite configure-services [--dry-run]             # configure services & env on Sprite
                [--opencode-port <port>] [--opencode-dir <dir>]
                [--flock-server-port <port>]
                [--flock-auth-token <token>] [--gemini-api-key <key>]
flock --help                                            # show help
flock --version                                         # show version
```

The `sprite` command is a container grouping Sprite-related subcommands (`sync`, `configure-services`).

Flags use `@crustjs/validate/zod` for runtime validation (Zod schemas as the single source of truth for types, defaults, and help text).

## Project Structure

```
server/
├── src/
│   ├── index.ts     # CLI entrypoint (Crust builder)
│   ├── server.ts    # Bun HTTP server (spawned by `flock start`)
│   ├── app.ts       # Hono app, route definitions
│   └── env.ts       # Validated environment variables
├── tsconfig.json
└── package.json
```

## API

The server exports a Bun-compatible default object with `port` and `fetch`. Routes are defined using Hono's router in `src/app.ts`.

### Endpoints

- `GET /` — status check (returns instanceId)
- `GET /health` — health check

## Notes

- The native client is **iOS only** — no Android support.

## Code Style Notes

- Use `/** ... */` JSDoc comments for exported components and other exported APIs that should be discoverable in IntelliSense.
- Keep multiline export docs near the exported declaration for discoverability in IntelliSense.
- Use `//` comments for inline implementation notes inside function bodies.
