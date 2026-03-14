# Multi-Backend Support: Laptop + Fly Sprite

## Overview

Enable the mobile client to connect to **multiple servers simultaneously** — a local
machine (via localhost/Tailscale) and a Fly Sprite — presenting a unified view of
projects and sessions. Each server runs the same stack (Hono + opencode) independently.
The client merges their streams and routes actions to the correct backend.

### Key Insight: Project IDs Already Match Across Machines

OpenCode generates project IDs deterministically from the **git root commit hash**
(`git rev-list --max-parents=0 HEAD`). Two clones of the same repo on different
machines produce the same project ID. This means:

- No custom project correlation logic needed
- Sessions already carry `projectID` that matches across backends
- The client can group sessions under projects naturally

The ID is cached in `.git/opencode` and shared across worktrees via the git common
directory.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   Mobile Client (iOS)                   │
│                                                         │
│  ┌─────────────────┐         ┌─────────────────┐       │
│  │ Backend A State  │         │ Backend B State  │       │
│  │ (StreamDB + API) │         │ (StreamDB + API) │       │
│  └────────┬────────┘         └────────┬────────┘       │
│           │                           │                 │
│           └─────────┬─────────────────┘                 │
│                     ▼                                   │
│           ┌─────────────────┐                           │
│           │  Merged Queries  │                           │
│           │  (unified view)  │                           │
│           └─────────────────┘                           │
└─────────────────────────────────────────────────────────┘
        │                             │
        ▼                             ▼
┌───────────────┐            ┌───────────────┐
│   Laptop       │            │  Fly Sprite    │
│   (Tailscale)  │            │  (HTTPS URL)   │
│                │            │                │
│  Hono server   │            │  Hono server   │
│  opencode      │            │  opencode      │
│  git repos     │            │  git repos     │
└───────────────┘            └───────────────┘
```

Each backend is fully independent. No server-to-server communication. The client
is the only thing that knows about both.

---

## Phase 1: Server Changes (Minimal)

The server doesn't need to identify itself — the client already knows each
backend by its URL, which serves as a stable unique identifier. The only
server-side change is optional auth for publicly accessible Sprites.

### 1.1 Server Auth Middleware (for Sprite)

**File:** `packages/server/src/app.ts`

When the server runs on a Fly Sprite (publicly accessible), it needs auth. Add
optional bearer token middleware:

```typescript
// If MOBILE_AGENTS_AUTH_TOKEN is set, require it on all requests
const authToken = process.env.MOBILE_AGENTS_AUTH_TOKEN;
if (authToken) {
  app.use('*', async (c, next) => {
    const header = c.req.header('Authorization');
    if (header !== `Bearer ${authToken}`) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    return next();
  });
}
```

No auth when running locally (env var not set). On the Sprite, set the env var.

**Estimated scope:** ~15 lines in `app.ts`.

### 1.2 Add `instanceId` to Health Endpoint

**File:** `packages/server/src/app.ts`, line 117–119

The health endpoint should return `instanceId` so the client can detect server
restarts without a separate `GET /` call:

```typescript
// Current:
return c.json({ healthy: true, opencodeUrl });

// New:
return c.json({ healthy: true, opencodeUrl, instanceId });
```

**Estimated scope:** ~1 line.

### 1.3 No Other Server Changes Needed

- No `serverId` generation — the client uses the backend URL as the identifier
- No changes to `mapSession()` or session events — the client tags sessions with
  the backend URL client-side when it receives them from a stream
- No changes to `types.ts`, `state-stream.ts`, or `opencode.ts`

---

## Phase 2: Client — Backend Registry

Replace the single server URL with a list of named backends.

### 2.1 Backend Type Definition

**New file:** `packages/native/state/backends.ts`

```typescript
import { atomWithStorage } from 'jotai/utils';
import { asyncStorageAdapter } from '../lib/jotai-async-storage';

export type BackendType = 'local' | 'sprite';

export interface BackendConfig {
  /**
   * The server URL — serves as both the connection target and the stable unique
   * identifier for this backend. e.g. "http://localhost:3000" or
   * "https://my-sprite.sprites.dev"
   */
  url: string;
  /** Human-readable label, e.g. "My MacBook", "Fly Sprite" */
  name: string;
  /** Backend type — affects UI hints and icons */
  type: BackendType;
  /** Whether this backend is active. Disabled backends are not connected to. */
  enabled: boolean;
  /** Optional bearer token for authenticated backends (Sprites). */
  authToken?: string;
}

export const backendsAtom = atomWithStorage<BackendConfig[]>(
  'settings:backends',
  [
    {
      url: 'http://localhost:3000',
      name: 'Local',
      type: 'local',
      enabled: true,
    },
  ],
  asyncStorageAdapter<BackendConfig[]>(),
);
```

**Estimated scope:** ~40 lines.

### 2.2 Migration from Single Server URL

On first launch after the update, migrate `settings:serverUrl` from AsyncStorage
into the new `backendsAtom` format. Then delete the old key.

**File:** `packages/native/state/backends.ts` (add migration logic)

```typescript
import AsyncStorage from '@react-native-async-storage/async-storage';

export async function migrateServerUrl() {
  const existing = await AsyncStorage.getItem('settings:serverUrl');
  const backends = await AsyncStorage.getItem('settings:backends');
  if (existing && !backends) {
    const parsed = JSON.parse(existing);  // atomWithStorage wraps in JSON
    const migrated: BackendConfig[] = [{
      url: typeof parsed === 'string' ? parsed : 'http://localhost:3000',
      name: 'Local',
      type: 'local',
      enabled: true,
    }];
    await AsyncStorage.setItem('settings:backends', JSON.stringify(migrated));
    await AsyncStorage.removeItem('settings:serverUrl');
  }
}
```

Call `migrateServerUrl()` early in app startup (e.g., in `App.tsx` or a root
provider).

**Estimated scope:** ~25 lines.

---

## Phase 3: Client — Per-Backend Connection Manager

Each backend gets its own health check, instance ID, Durable Streams, and API client.

### 3.1 Per-Backend Connection State

**New file:** `packages/native/state/connections.ts`

```typescript
import { atom } from 'jotai';

export type BackendStatus = 'connected' | 'reconnecting' | 'error' | 'offline';

export interface BackendConnection {
  /** The backend URL — matches BackendConfig.url */
  url: string;
  status: BackendStatus;
  instanceId: string | null;
  latencyMs: number | null;
  error: string | null;
}

/**
 * Map of backend URL → BackendConnection.
 * Updated by the connection manager hook.
 */
export const backendConnectionsAtom = atom<Record<string, BackendConnection>>({});
```

**Estimated scope:** ~25 lines.

### 3.2 Per-Backend Stream + API Atoms

**New file:** `packages/native/lib/backend-streams.ts`

Each backend needs its own StreamDB pair and API client. Since we're capping at a
small fixed number of backends (2–3), we store them in a map atom:

```typescript
import { atom } from 'jotai';
import type { StateDB, AppStateDB } from './stream-db';
import type { ApiClient } from './api';

export interface BackendResources {
  /** The backend URL — matches BackendConfig.url */
  url: string;
  db: StateDB | null;
  appDb: AppStateDB | null;
  api: ApiClient | null;
  loading: boolean;
}

/**
 * Map of backend URL → BackendResources.
 * Populated by the connection manager; consumed by merged query hooks.
 */
export const backendResourcesAtom = atom<Record<string, BackendResources>>({});
```

**Estimated scope:** ~20 lines.

### 3.3 Connection Manager Hook

**New file:** `packages/native/hooks/useBackendManager.ts`

This is the core orchestration hook. It replaces `useServerHealth`, the debounce
logic in `useSettings`, and the implicit stream setup in `stream-db.ts` atoms.

Responsibilities per enabled backend:
1. Poll `GET /health` (every 10s) — returns `instanceId` + health status
2. Detect `instanceId` changes (server restart) → tear down and recreate StreamDBs
3. Create `hc<AppType>(url)` API client (with auth header if `authToken` is set)
4. Create ephemeral `StreamDB` at `${url}/${instanceId}`
5. Create persistent `StreamDB` at `${url}/app`
6. Write results to `backendConnectionsAtom` and `backendResourcesAtom`
   (keyed by backend URL)

```typescript
export function useBackendManager() {
  const [backends] = useAtom(backendsAtom);
  const setConnections = useSetAtom(backendConnectionsAtom);
  const setResources = useSetAtom(backendResourcesAtom);

   // For each enabled backend, run an effect that:
  // - Polls /health every 10s (returns instanceId)
  // - Creates/recreates StreamDBs when instanceId changes
  // - Creates hc() API client (with optional auth header)
  // - Updates connection and resource atoms (keyed by backend URL)

  // Cleanup: when a backend is removed or disabled, tear down its resources.
}
```

**Key design decision — auth headers for Hono client:**

The `hc()` client from Hono supports custom fetch. For backends with `authToken`:

```typescript
const api = hc<AppType>(backend.url, {
  fetch: (input, init) =>
    fetch(input, {
      ...init,
      headers: {
        ...init?.headers,
        Authorization: `Bearer ${backend.authToken}`,
      },
    }),
});
```

The same `Authorization` header needs to be passed to `createStreamDB`'s
`streamOptions`. Check whether `@durable-streams/client` supports custom headers
or a custom fetch — if not, this may need a small wrapper.

**This hook should be mounted once**, at the app root (e.g., in `App.tsx` or a
`<BackendProvider>`). It replaces:
- `useServerHealth` (currently called from `useSettings`)
- The implicit atom chain: `debouncedServerUrlAtom` → `instanceIdAtom` → `dbAtom` / `appDbAtom`
- `apiClientAtom`

**Estimated scope:** ~120–150 lines. This is the largest single piece of new code.

### 3.4 Instance ID Change Detection (Bug Fix)

The current architecture has a bug: if the server restarts but the URL stays the
same, the client's `instanceIdAtom` never re-evaluates, and the ephemeral stream
silently breaks while the health check still reports "connected."

The connection manager fixes this by:
1. Polling `GET /health` which now returns `instanceId` (see Phase 1.2)
2. Comparing the returned `instanceId` against the stored one
3. If different: tear down the old `StreamDB`, create a new one with the new
   `instanceId`

This fix benefits both single-backend and multi-backend usage.

---

## Phase 4: Client — Merged Query Layer

The client needs to query across multiple StreamDBs and present unified results.

### 4.1 Merged State Query Hook

**File:** `packages/native/lib/stream-db.ts` (extend, or new file
`packages/native/lib/merged-queries.ts`)

Since React hooks can't be called in variable-length loops, and we're targeting a
small fixed number of backends (2–3), we use a pattern with explicit per-backend
queries:

```typescript
import { useLiveQuery } from '@tanstack/react-db';

/**
 * Queries a single collection from all connected backends, merges results.
 *
 * For "owned" data (sessions, messages, changes, worktreeStatuses):
 *   Concatenate. No dedup needed — each item exists on exactly one backend.
 *
 * For "shared" data (projects):
 *   Deduplicate by primary key (project ID), since the same project may
 *   appear on multiple backends. Merge metadata (e.g., combine worktree
 *   paths, track which backends have the project).
 */
```

**Approach — wrapper component per backend:**

Instead of trying to call N `useLiveQuery` hooks dynamically, use a component
tree pattern:

```
<BackendQueryProvider backendId="laptop">
  <BackendQueryProvider backendId="sprite">
    <App />
  </BackendQueryProvider>
</BackendQueryProvider>
```

Each `BackendQueryProvider` is a React context that exposes its backend's
`StateDB`. Child components use `useMergedStateQuery` which internally:

1. Reads all backend DBs from context
2. Calls `useLiveQuery` once per backend (fixed order, always called — returns
   null data for disconnected backends)
3. Merges the arrays

**Alternative simpler approach — atom-based merging:**

Since `useLiveQuery` is tightly coupled to `@tanstack/react-db`, an alternative
is to have the connection manager push raw data into atoms as it arrives from
each stream, and merge at the atom level:

```typescript
// Per-backend atoms (populated by connection manager, keyed by backend URL)
const backendSessionsAtom = atom<Record<string, AugmentedSession[]>>({});
const backendProjectsAtom = atom<Record<string, ProjectValue[]>>({});
const backendMessagesAtom = atom<Record<string, Message[]>>({});

// Merged atoms (derived)
const mergedSessionsAtom = atom((get) => {
  const byBackend = get(backendSessionsAtom);
  return Object.values(byBackend).flat();
});

const mergedProjectsAtom = atom((get) => {
  const byBackend = get(backendProjectsAtom);
  // Dedup by project ID — same ID means same repo (root commit hash)
  const seen = new Map<string, MergedProject>();
  for (const [backendUrl, projects] of Object.entries(byBackend)) {
    for (const p of projects) {
      const existing = seen.get(p.id);
      if (existing) {
        existing.backendUrls.push(backendUrl);
        existing.worktrees[backendUrl] = p.worktree;
      } else {
        seen.set(p.id, {
          ...p,
          backendUrls: [backendUrl],
          worktrees: { [backendUrl]: p.worktree },
        });
      }
    }
  }
  return Array.from(seen.values());
});
```

This approach decouples from `useLiveQuery` and avoids the hooks-in-a-loop
problem entirely. The connection manager subscribes to each StreamDB's changes
and pushes snapshots into the atoms.

**Recommendation:** Start with the atom-based approach. It's simpler, avoids
React hook ordering constraints, and works with any number of backends. The
connection manager already owns the StreamDBs — it can subscribe to their
changes and update the atoms.

**Estimated scope:** ~80–100 lines for the merged atom layer.

### 4.2 Augmented Session Type

Extend `SessionValue` on the client to carry backend attribution:

**File:** `packages/native/lib/stream-db.ts`

```typescript
// Current SessionValue (lines 42-54):
export type SessionValue = {
  id: string; title: string; directory: string; projectID: string;
  parentID?: string; version: string;
  summary?: { additions: number; deletions: number; files: number };
  share?: { url: string };
  time: { created: number; updated: number };
  status: 'idle' | 'busy' | 'error'; error?: string;
};

// New: add backend attribution (client-side only)
export type AugmentedSession = SessionValue & {
  /** The backend URL that owns this session — added client-side by the
   *  connection manager when it receives sessions from a backend's stream. */
  backendUrl: string;
};
```

No server-side changes needed. The client tags each session with its source
backend URL when populating the merged atoms.

### 4.3 Augmented Project Type

**File:** `packages/native/lib/stream-db.ts`

```typescript
// Current ProjectValue (lines 34-40):
export type ProjectValue = {
  id: string; worktree: string; vcsDir?: string; vcs?: 'git';
  time: { created: number; initialized?: number };
};

// New: track which backends have this project
export type MergedProject = ProjectValue & {
  /** Backend URLs where this project exists */
  backendUrls: string[];
  /** Per-backend worktree paths (differ across machines) */
  worktrees: Record<string, string>;  // backend URL → worktree path
};
```

---

## Phase 5: Client — UI Changes

### 5.1 Settings Screen — Backend Management

**File:** `packages/native/components/SettingsScreen.tsx`

Replace the single "Server URL" field with a "Servers" section:

```
┌──────────────────────────────────┐
│ SERVERS                          │
│                                  │
│ 🖥  My MacBook                   │
│    http://192.168.1.5:3000       │
│    ● Connected · 12ms            │
│                        [Edit]    │
│                                  │
│ ☁  Fly Sprite                    │
│    https://my-sprite.sprites.dev │
│    ● Connected · 45ms            │
│                        [Edit]    │
│                                  │
│ [+ Add Server]                   │
└──────────────────────────────────┘
```

Each entry shows:
- Icon based on `type` (laptop for `local`, cloud for `sprite`)
- Name and URL
- Connection status badge (reuse existing `ConnectionStatusBadge`)
- Edit button → modal for name, URL, type, auth token, enable/disable, delete

**Add Server** flow:
- Name (required)
- URL (required)
- Type: Local / Fly Sprite (affects icon and hints)
- Auth Token (optional, shown for Sprite type)

**Props refactor:** `SettingsScreen` currently receives a single `serverUrl` +
`connection`. Refactor to receive `backends: BackendConfig[]` and
`connections: Record<string, BackendConnection>`, with callbacks for CRUD.

**Estimated scope:** ~100–150 lines of new UI code, ~30 lines of prop refactoring.

### 5.2 Sessions Sidebar — Backend Attribution

**File:** `packages/native/components/SessionsSidebar.tsx`

Changes to `SessionRow` (line 167):
- Add a small backend icon (laptop/cloud) next to the session title or status dot
- If the session's backend is offline, dim the row and show "Offline" in the
  subtitle area
- Disable swipe actions (archive, delete) for sessions on offline backends

Changes to `SessionListContent` (line 270):
- Replace `useStateQuery` call (line 379) with merged sessions atom
- Replace `useAppStateQuery` call (line 384) with client-side archive state
- The `projectID` filter (line 399) works unchanged since project IDs match

Changes to the "New Session" button:
- If the current project exists on multiple backends, show a backend picker
  (small dropdown or segmented control: laptop / cloud)
- If only one backend has the project, use it automatically

**Estimated scope:** ~50 lines of modifications to existing code.

### 5.3 Session Content — Route Actions to Correct Backend

**File:** `packages/native/components/SessionContent.tsx`

When sending a prompt, aborting, or performing other mutations on a session:

```typescript
// Current pattern:
const api = useAtomValue(apiClientAtom);
api.api.sessions[':sessionId'].prompt.$post({ ... });

// New pattern:
const api = useBackendApi(session.backendUrl);
if (!api) {
  // Backend is offline — show error toast
  return;
}
api.api.sessions[':sessionId'].prompt.$post({ ... });
```

Create a helper hook:

```typescript
function useBackendApi(backendUrl: string): ApiClient | null {
  const resources = useAtomValue(backendResourcesAtom);
  return resources[backendUrl]?.api ?? null;
}
```

**Estimated scope:** ~20 lines for the hook, ~10–15 lines per component that
calls the API (SessionContent, SessionsSidebar, SessionHeader).

### 5.4 Project Display

**File:** `packages/native/components/SessionsSidebar.tsx` (project header area)

If the current project exists on multiple backends, show which backends have it:

```
┌──────────────────────────────────┐
│ mobile-agents  🖥 ☁              │
│ ──────────────────────────────── │
│ Sessions:                        │
│ ...                              │
```

The laptop and cloud icons indicate which backends have the project. An icon
is dimmed if that backend is currently offline.

**Estimated scope:** ~15 lines.

---

## Phase 6: Client-Side Metadata

### 6.1 Move Archive State Client-Side

Currently, archive status lives on the server's persistent app stream (`/app`).
With multiple backends, this creates a problem: archiving a session on one server
only affects that server's app stream.

**Solution:** Move archive state to AsyncStorage on the client.

**File:** `packages/native/state/ui.ts`

```typescript
// New: keyed by (backendUrl, sessionId) to avoid cross-backend collisions
export type SessionCompositeKey = `${string}::${string}`;  // backendUrl::sessionId

export const archivedSessionsAtom = atomWithStorage<SessionCompositeKey[]>(
  'sessions:archived',
  [],
  asyncStorageAdapter<SessionCompositeKey[]>(),
);
```

Remove the server-side archive/unarchive endpoints (or keep them for backward
compatibility but stop relying on them).

**Estimated scope:** ~20 lines in `state/ui.ts`, ~15 lines to update sidebar
filtering logic.

### 6.2 Update Pinned Sessions

**File:** `packages/native/state/ui.ts`, line 6

Current: `pinnedSessionIdsAtom` stores bare `string[]`.

New: Store composite keys to avoid ID collisions across backends:

```typescript
export const pinnedSessionIdsAtom = atomWithStorage<SessionCompositeKey[]>(
  'sessions:pinned',
  [],
  asyncStorageAdapter<SessionCompositeKey[]>(),
);
```

Migration: On first load, if existing pinned IDs don't contain `:`, assume
they belong to the `default-local` backend and prefix accordingly.

**Estimated scope:** ~15 lines for migration, ~5 lines for type change.

---

## Phase 7: Edge Cases

### 7.1 Session ID Collisions

Two independent opencode instances could theoretically generate the same session
ID. Use composite keys `(backendUrl, sessionId)` everywhere internally. In the
merged sessions atom, each session is uniquely identified by
`${backendUrl}::${session.id}`.

### 7.2 Server Restart Detection

Fixed as part of Phase 3.4. The connection manager polls `GET /health` which
now returns `instanceId`. On change, it reconnects the stream. This fixes the
existing single-backend bug too.

### 7.3 Offline Backend — Cached Session List

When a backend goes offline, the last-known session list should persist in the
merged atoms until the backend reconnects (or the app restarts). The connection
manager should NOT clear the session atoms on disconnect — only clear them if
the backend is removed.

On app restart, sessions from offline backends will be absent until those backends
come back online. This is acceptable — the user sees "Backend offline" and
understands those sessions aren't loaded yet.

**Future enhancement:** Persist last-known sessions to AsyncStorage per backend
for instant display on app cold start, even before backends connect.

### 7.4 Model Selection Per Backend

Different backends may have different providers/models configured. The model
catalog (`modelCatalogAtom`) should become per-backend:

```typescript
const modelCatalogByBackendAtom = atom<Record<string, CatalogModel[]>>({});
```

The model picker in the UI should show models from the backend that will handle
the next prompt (determined by the new-session backend picker or the current
session's backend).

### 7.5 Two "Mains" — Git Branch Divergence

When the same project exists on two backends, each has its own `main` branch.
They can diverge if both backends merge worktrees into main.

**Convention (documented, not enforced by code):**
- All agent work happens on branches (worktrees), never directly on main
- After merging a worktree into main, push to origin immediately
- Before starting a new session, pull from origin

**Future enhancement:** The server could expose `git log main..origin/main` and
`git log origin/main..main` status, and the client could show divergence warnings.

---

## Phase 8: Fly Sprite Setup (Independent Track)

This can be done in parallel with the client multi-backend work.

### 8.1 Sprite Provisioning Script

A one-time setup script that runs on a new Sprite:

```bash
#!/bin/bash
# Install Bun
curl -fsSL https://bun.sh/install | bash

# Install git (usually pre-installed on Sprites)
sudo apt-get update && sudo apt-get install -y git

# Clone the mobile-agents repo
git clone https://github.com/ben-pr-p/mobile-code.git ~/mobile-agents
cd ~/mobile-agents && bun install

# Set up git credentials
# Option A: SSH key (copy from local or generate)
# Option B: GitHub PAT in git credential helper
git config --global credential.helper store
echo "https://oauth2:${GITHUB_TOKEN}@github.com" > ~/.git-credentials

# Set up environment
export MOBILE_AGENTS_AUTH_TOKEN="your-secret-token"
export MOBILE_AGENTS_SERVER_NAME="Fly Sprite"

# Clone project repos
git clone https://github.com/you/your-project.git ~/projects/your-project
```

### 8.2 Register Services on the Sprite

Use the Sprites service API so opencode and the Hono server auto-restart on
Sprite wake:

```bash
# Register opencode as a service
sprite-env services create opencode \
  --command "opencode serve --port 4096" \
  --working-dir ~/projects/your-project

# Register the Hono server as a service
sprite-env services create mobile-agents-server \
  --command "bun run start" \
  --working-dir ~/mobile-agents/packages/server
```

### 8.3 Checkpoint After Setup

After the Sprite is fully set up:

```bash
sprite checkpoint create "base-setup"
```

This snapshots the entire filesystem. If anything goes wrong later, restore
in ~1 second.

---

## Implementation Order

| Step | Phase | Description | Dependencies | Est. Effort |
|------|-------|-------------|--------------|-------------|
| 1 | 1.1–1.2 | Server auth middleware + instanceId in /health | None | Small (30 min) |
| 2 | 2.1–2.2 | Backend registry + migration | None | Small (1–2 hrs) |
| 3 | 3.1–3.3 | Connection manager hook | Steps 1, 2 | Medium (4–6 hrs) |
| 4 | 3.4 | Instance ID change detection | Step 3 | Small (1 hr) |
| 5 | 4.1–4.3 | Merged query layer + augmented types | Step 3 | Medium (3–4 hrs) |
| 6 | 5.1 | Settings screen — backend management UI | Steps 2, 3 | Medium (3–4 hrs) |
| 7 | 5.2 | Sessions sidebar — backend attribution | Step 5 | Medium (2–3 hrs) |
| 8 | 5.3 | Session content — route actions to backend | Step 5 | Small (1–2 hrs) |
| 9 | 6.1–6.2 | Client-side archive/pin metadata | Step 5 | Small (1–2 hrs) |
| 10 | 5.4 | Project display — multi-backend indicators | Step 5 | Small (30 min) |
| 11 | 7.4 | Per-backend model selection | Step 3 | Small (1 hr) |
| 12 | 8.1–8.3 | Fly Sprite setup | Step 1 | Medium (2–3 hrs) |

**Critical path:** Steps 2 → 3 → 5 → 7 (registry → connection manager →
merged queries → sidebar). Everything else is parallel or follow-up polish.

**Total estimated effort:** ~20–30 hours of implementation.

---

## Files Changed Summary

### Server (minimal changes)

| File | Change |
|------|--------|
| `packages/server/src/app.ts` | Add `serverId` generation, update `GET /` and `GET /health` responses, add auth middleware |
| `packages/server/src/state-stream.ts` | Pass `serverId` to `mapSession()`, include in emitted session events |

### Client (bulk of changes)

| File | Change |
|------|--------|
| `packages/native/state/backends.ts` | **New.** Backend registry type + atom + migration |
| `packages/native/state/connections.ts` | **New.** Per-backend connection state atom |
| `packages/native/lib/backend-streams.ts` | **New.** Per-backend resource (StreamDB, API) atom |
| `packages/native/lib/merged-queries.ts` | **New.** Merged session/project/message atoms |
| `packages/native/hooks/useBackendManager.ts` | **New.** Core orchestration hook |
| `packages/native/state/settings.ts` | Remove `serverUrlAtom`, `debouncedServerUrlAtom`, `connectionInfoAtom` (replaced by backends) |
| `packages/native/state/ui.ts` | Update pin/archive keys to composite `backendId:sessionId` |
| `packages/native/lib/api.ts` | Remove `apiClientAtom` (replaced by per-backend API in connection manager) |
| `packages/native/lib/stream-db.ts` | Remove `instanceIdAtom`, `dbAtom`, `appDbAtom`. Keep type defs and `createStreamDB` usage. Add `serverId`/`backendId` to `SessionValue`. |
| `packages/native/hooks/useSettings.ts` | Remove server URL debounce + health check (moved to connection manager). Keep voice/notification settings. |
| `packages/native/hooks/useServerHealth.ts` | **Delete.** Absorbed into connection manager. |
| `packages/native/components/SettingsScreen.tsx` | Replace single URL field with backend list UI |
| `packages/native/components/SessionsSidebar.tsx` | Use merged queries, add backend icons, handle offline backends |
| `packages/native/components/SessionContent.tsx` | Route API calls through `useSessionApi(backendId)` |
| `packages/native/components/SessionHeader.tsx` | Route merge actions through correct backend API |

### Unchanged

- `packages/server/src/types.ts` — No changes needed
- `packages/server/src/opencode.ts` — No changes needed
- `packages/server/src/worktree.ts` — No changes needed
- `packages/native/hooks/useAudioRecorder.ts` — No changes needed
- `packages/native/hooks/useLayout.ts` — No changes needed
