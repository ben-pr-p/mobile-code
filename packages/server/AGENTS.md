# @mobile-agents/server — Agent Guide

Hono API server running on Bun. Backend for the mobile-agents native client.

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
