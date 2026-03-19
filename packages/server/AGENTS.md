# @flockcode/server — Agent Guide

Hono API server running on Bun. Backend for the flock native client.

## Stack

- **Hono** 4 — lightweight HTTP framework
- **Bun** — runtime and package manager
- **TypeScript** 5.9

## Commands

```sh
bun install          # install dependencies
bun run dev          # start with hot reload (bun --hot)
bun run start        # start production server
```

## Project Structure

```
server/
├── src/
│   └── index.ts     # app entrypoint, route definitions
├── tsconfig.json
└── package.json
```

## API

The server exports a Bun-compatible default object with `port` and `fetch`. Routes are defined using Hono's router in `src/index.ts`.

### Endpoints

- `GET /` — status check
- `GET /health` — health check

## Notes

- The native client is **iOS only** — no Android support.

## Code Style Notes

- Use `/** ... */` JSDoc comments for exported components and other exported APIs that should be discoverable in IntelliSense.
- Keep multiline export docs near the exported declaration for discoverability in IntelliSense.
- Use `//` comments for inline implementation notes inside function bodies.
