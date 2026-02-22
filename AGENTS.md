# mobile-agents — Agent Guide

A monorepo for a mobile AI coding agent client and its backend server.

## Monorepo Structure

```
mobile-agents/
├── packages/
│   ├── native/    # React Native (Expo) mobile client
│   └── server/    # Hono API server (Bun runtime)
├── package.json   # Bun workspace root
└── AGENTS.md      # this file
```

## Workspace Setup

This is a **Bun workspace** monorepo. The root `package.json` defines workspaces for the server. The native package manages its own `node_modules` separately (Expo/Metro requires local deps).

```sh
bun install          # install all workspace dependencies from root
```

## Packages

### `@mobile-agents/native` — Mobile Client

React Native (Expo 54) app with NativeWind styling. Voice-first interface for interacting with an AI coding agent.

```sh
cd packages/native
bun run ios          # run on iOS simulator
bun run start        # start Expo dev server
```

See `packages/native/AGENTS.md` for detailed native app docs.

### `@mobile-agents/server` — API Server

Hono HTTP server running on Bun.

```sh
cd packages/server
bun run dev          # start with hot reload
bun run start        # start production
```

See `packages/server/AGENTS.md` for detailed server docs.

## Conventions

- **iOS only** — no Android support. Do not add Android-specific code or configurations.
- **Bun** for all package management, scripts, and server runtime
- **TypeScript** across all packages
- Each package has its own `AGENTS.md` with package-specific guidance
- Run commands from the package directory, not the root
