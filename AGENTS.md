# flockcode — Agent Guide

A monorepo for a mobile AI coding agent client and its backend server.

## Monorepo Structure

```
flockcode/
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

### `@flockcode/native` — Mobile Client

React Native (Expo 54) app with NativeWind styling. Voice-first interface for interacting with an AI coding agent.

```sh
cd packages/native
bun run ios          # run on iOS simulator
bun run start        # start Expo dev server
```

See `packages/native/AGENTS.md` for detailed native app docs.

### `@flockcode/server` — API Server

Hono HTTP server running on Bun.

```sh
cd packages/server
bun run dev          # start with hot reload
bun run start        # start production
```

See `packages/server/AGENTS.md` for detailed server docs.

## EAS Update (OTA Updates)

Push JS/asset updates to TestFlight builds without re-submitting to App Store.

```sh
cd packages/native
eas update --branch production --message "Your update message"
```

- The `--branch` must match the channel name in `eas.json` (e.g. `production` channel → `production` branch)
- No cloud build required — uploads JS bundle and assets to Expo servers
- Uses EAS credits (free tier available, then paid)
- Only works for JS/asset changes, not native code
- New TestFlight builds reset OTA state (users get the new binary)

## GitHub CLI

The `gh` CLI is installed via Homebrew. Use the full path since it may not be on the default `$PATH`:

```sh
/opt/homebrew/bin/gh
```

Use this for issue management, PR creation, and other GitHub operations. The repo is `ben-pr-p/flockcode`.

```sh
/opt/homebrew/bin/gh issue list --repo ben-pr-p/flockcode
/opt/homebrew/bin/gh issue create --repo ben-pr-p/flockcode --title "Title" --body "Body"
/opt/homebrew/bin/gh issue close 123 --repo ben-pr-p/flockcode --reason completed
```

## Conventions

- **iOS only** — no Android support. Do not add Android-specific code or configurations.
- **Bun** for all package management, scripts, and server runtime
- **TypeScript** across all packages
- Each package has its own `AGENTS.md` with package-specific guidance
- Run commands from the package directory, not the root
- Keep this guide updated when conventions change

## Code Style Notes

- Use `/** ... */` JSDoc comments for exported components and other exported APIs that should be discoverable in IntelliSense.
- Keep multiline export docs near the exported declaration for discoverability in IntelliSense.
- Use `//` comments for inline implementation notes inside function bodies.
