# Persistent App State Stream — Implementation Plan

## Overview

Add a second durable stream to the server for mobile-app-specific state that persists across server restarts. The first use case is session archiving. Unlike the existing ephemeral stream (rebuilt from OpenCode on each boot, URL rotates via `instanceId`), this stream has a **fixed URL** and is backed by `FileBackedStreamStore` so data survives restarts.

---

## Server Changes

### 1. Add `FileBackedStreamStore` and create the persistent stream

**File: `packages/server/src/app.ts`**

Create a second `DurableStreamServer` instance backed by `FileBackedStreamStore`, storing data at `~/.local/share/flockcode/` (XDG convention, matches OpenCode's `~/.local/share/opencode/`).

```typescript
import { FileBackedStreamStore } from "@durable-streams/server"
import { join } from "path"
import { homedir } from "os"

const dataDir = join(homedir(), ".local", "share", "flockcode")

const appStore = new FileBackedStreamStore({ dir: dataDir })
const appDs = new DurableStreamServer({ store: appStore })
await appDs.createStream("/", { contentType: "application/json" })
```

> **Note:** If `FileBackedStreamStore` is not available in `@durable-streams/server@0.2.1` (the current transitive dep), bump the version or add it as a direct dependency. The `DurableStreamServer` constructor already accepts `FileBackedStreamStore` in its type signature. As a fallback during development, a plain `StreamStore()` can be used — the architecture is identical, just without disk persistence.

### 2. Mount at a fixed path `/app`

The URL never changes because the data is never reset.

```typescript
app.all("/app/*", (c) => {
  const url = new URL(c.req.url)
  url.pathname = url.pathname.slice("/app".length) || "/"
  return appDs.fetch(new Request(url.toString(), c.req.raw))
})
app.all("/app", (c) => {
  const url = new URL(c.req.url)
  url.pathname = "/"
  return appDs.fetch(new Request(url.toString(), c.req.raw))
})
```

### 3. Add archive/unarchive API endpoints

**Append to the existing `api` chain in `app.ts`:**

```typescript
.post("/sessions/:sessionId/archive", async (c) => {
  const sessionId = c.req.param("sessionId")
  appDs.appendToStream("/", JSON.stringify({
    type: "sessionMeta",
    key: sessionId,
    value: { sessionId, archived: true },
    headers: { operation: "upsert" },
  }), { contentType: "application/json" })
  return c.json({ success: true })
})

.post("/sessions/:sessionId/unarchive", async (c) => {
  const sessionId = c.req.param("sessionId")
  appDs.appendToStream("/", JSON.stringify({
    type: "sessionMeta",
    key: sessionId,
    value: { sessionId, archived: false },
    headers: { operation: "upsert" },
  }), { contentType: "application/json" })
  return c.json({ success: true })
})
```

Uses the same state protocol event shape (`type`/`key`/`value`/`headers.operation`) as the ephemeral stream. The type is `"sessionMeta"` (not `"session"`) to avoid collision.

### 4. Update `GET /` response

```typescript
app.get("/", (c) => {
  return c.json({ instanceId, appStreamUrl: "/app" })
})
```

### 5. Return `appDs` from `createApp`

So it's accessible for testing and shutdown:

```typescript
return { app, routes, ds, appDs, stateStream, instanceId }
```

---

## Native Client Changes

### 1. Add a second `StreamDB` for app state

**File: `packages/native/lib/stream-db.ts`**

Define a new state schema and atom for the persistent app state stream:

```typescript
type SessionMetaValue = {
  sessionId: string
  archived: boolean
}

const appStateDef = {
  sessionMeta: {
    schema: passthrough<SessionMetaValue>(),
    type: "sessionMeta" as const,
    primaryKey: "sessionId" as const,
  },
}

const appStateSchema = createStateSchema(appStateDef)

const appDbAtom = atom(async (get) => {
  const serverUrl = get(debouncedServerUrlAtom).replace(/\/$/, '')
  try {
    const db = createStreamDB({
      streamOptions: { url: `${serverUrl}/app` },  // fixed URL, no instanceId
      state: appStateSchema,
    })
    await db.preload()
    return { db, loading: false }
  } catch {
    return { db: null, loading: true }
  }
})
```

Export a `useAppStateQuery` hook mirroring `useStateQuery`:

```typescript
function useAppStateQuery<TContext extends Context>(
  queryFn: (db: AppStateDB, q: InitialQueryBuilder) => QueryBuilder<TContext> | undefined | null,
  deps: unknown[] = []
) {
  const { db, loading } = useAtomValue(appDbAtom)
  const result = useLiveQuery((q) => db && queryFn(db, q), [db, ...deps])
  if (!db) return { data: null, isLoading: true, error: null }
  return { ...result, isLoading: loading || result.isLoading }
}
```

### 2. Swipe-to-archive on `SessionRow`

**File: `packages/native/components/SessionsSidebar.tsx`**

Replace the `Pressable` wrapper in `SessionRow` with a `Swipeable` from `react-native-gesture-handler` (already an Expo dependency). A left swipe reveals an archive action.

```tsx
import { Swipeable } from 'react-native-gesture-handler'
import { Archive } from 'lucide-react-native'

function SessionRow({ session, onArchive, ...props }: SessionRowProps) {
  const swipeableRef = useRef<Swipeable>(null)

  const renderRightActions = () => (
    <Pressable
      onPress={() => {
        onArchive(session.id)
        swipeableRef.current?.close()
      }}
      className="items-center justify-center rounded-lg bg-amber-600 px-4">
      <Archive size={18} color="#FFFFFF" />
      <Text className="mt-1 text-[10px] font-medium text-white"
        style={{ fontFamily: 'JetBrains Mono' }}>
        Archive
      </Text>
    </Pressable>
  )

  return (
    <Swipeable
      ref={swipeableRef}
      renderRightActions={renderRightActions}
      overshootRight={false}>
      {/* existing Pressable content unchanged */}
    </Swipeable>
  )
}
```

Add `onArchive` to `SessionRowProps` and thread it through from `SessionListContent`.

### 3. Archive action handler

In `SessionListContent`, add:

```typescript
const { apiClient } = useAtomValue(apiClientAtom)

const archiveSession = useCallback(async (sessionId: string) => {
  await apiClient.api.sessions[':sessionId'].archive.$post({
    param: { sessionId },
  })
}, [apiClient])

const unarchiveSession = useCallback(async (sessionId: string) => {
  await apiClient.api.sessions[':sessionId'].unarchive.$post({
    param: { sessionId },
  })
}, [apiClient])
```

### 4. Filter archived sessions and add "Archived" expandable section

In the `sessionTree` memo inside `SessionListContent`:

```typescript
// Query archived session IDs from persistent app state stream
const { data: sessionMetas } = useAppStateQuery(
  (db, q) => q.from({ sessionMeta: db.collections.sessionMeta }),
)
const archivedIds = useMemo(
  () => new Set(
    (sessionMetas as SessionMetaValue[] | undefined)
      ?.filter(m => m.archived)
      .map(m => m.sessionId) ?? []
  ),
  [sessionMetas],
)
```

Split the tree into active and archived:

```typescript
const { activeTree, archivedTree } = useMemo(() => {
  // ... existing tree-building logic, then:
  const active = tree.filter(node => !archivedIds.has(node.session.id))
  const archived = tree.filter(node => archivedIds.has(node.session.id))
  return { activeTree: active, archivedTree: archived }
}, [allSessions, projectId, searchQuery, pinnedSet, archivedIds])
```

### 5. Render the "Archived" section at the bottom of the list

Add a collapsible section at the end of the `ScrollView`, after the active session list:

```tsx
const [showArchived, setShowArchived] = useState(false)

{/* Active sessions */}
{activeTree.map((node) => (
  // ... existing rendering, with swipe-to-archive added
))}

{/* Archived section — only shown if there are archived sessions */}
{archivedTree.length > 0 && (
  <>
    <Pressable
      onPress={() => setShowArchived(!showArchived)}
      className="mt-4 flex-row items-center gap-2 px-3.5 py-2">
      {showArchived ? (
        <ChevronDown size={14} color={mutedIconColor} />
      ) : (
        <ChevronRight size={14} color={mutedIconColor} />
      )}
      <Text
        className="text-xs text-stone-400 dark:text-stone-600"
        style={{ fontFamily: 'JetBrains Mono' }}>
        Archived ({archivedTree.length})
      </Text>
    </Pressable>

    {showArchived && archivedTree.map((node) => (
      // Same SessionRow rendering, but swipe reveals "Unarchive" instead
    ))}
  </>
)}
```

For archived rows, the swipe action calls `unarchiveSession` instead of `archiveSession`.

---

## Data Storage

| Concern | Location | Persistence |
|---------|----------|-------------|
| Archive status | `FileBackedStreamStore` at `~/.local/share/flockcode/` | Survives server restarts |
| Pinned sessions | `AsyncStorage` on device (existing `pinnedSessionIdsAtom`) | Client-side only, unchanged |
| Sessions, messages, projects, changes | In-memory `StreamStore`, rebuilt from OpenCode on boot | Ephemeral |

The `FileBackedStreamStore` writes:
- One segment log file per stream (`segment_00000.log`)
- A shared LMDB database (`metadata.lmdb`) for stream metadata and offsets

For our workload (infrequent archive/unarchive actions, small payloads), the `fdatasync`-on-every-append behavior is fine.

---

## Future Extensions

This persistent stream is designed to hold more app-specific metadata over time:
- **Read/unread tracking** — `{ sessionId, lastReadMessageId }` as another field on `sessionMeta`
- **Last-opened session per project** — a `"projectMeta"` type with `{ projectId, lastSessionId }`
- **Pinned sessions** — could eventually migrate from client-side `AsyncStorage` to this stream for cross-client visibility

Each new field is just another upsert to the `"sessionMeta"` (or new type) collection. The append-only log stays small since these are low-frequency user actions.
