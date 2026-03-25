# Implementation Plan: Three-Stream Migration

Split the current single ephemeral stream into an **instance stream** (finalized, replayable) and an **ephemeral stream** (live-only, no catch-up), alongside the existing **app stream** (file-backed). Add a snapshot endpoint for ephemeral state bootstrapping.

See `packages/server/STREAMS.md` for the architecture description.

## Phase 1: Server — Split StateStream into two output streams

### 1.1 Create the ephemeral DurableStreamServer

**File**: `packages/server/src/app.ts`

- Create a second in-memory `DurableStreamServer` for the ephemeral stream (line ~82, next to the existing `ds`).
- Mount it at `/{instanceId}/ephemeral/*` (lines ~115-126, add new route block).
- Pass both `ds` (instance) and the new `ephemeralDs` to `StateStream`.

### 1.2 Refactor StateStream to write to two streams

**File**: `packages/server/src/state-stream.ts`

The constructor currently takes one `DurableStreamServer`. Change it to take two: `instanceDs` and `ephemeralDs`.

Add two append helpers:
- `#appendInstanceEvent(event)` — writes to the instance stream.
- `#appendEphemeralEvent(event)` — writes to the ephemeral stream.

Replace the current `#appendEvent` calls according to the routing table:

| Method | Current behavior | New routing |
|---|---|---|
| `initialize()` — project emit (line 42) | `#appendEvent` | `#appendInstanceEvent` (type `project`) |
| `initialize()` — session emit (line 81) | `#appendEvent` via `#emitSession` | `#appendInstanceEvent` (type `session`, no status) |
| `initialize()` — message emit (line 95) | `#appendEvent` | `#appendInstanceEvent` (type `message`) |
| `initialize()` — change emit (line 389) | `#appendEvent` | `#appendInstanceEvent` (type `change`) |
| `initialize()` — worktreeStatus emit (line 427) | `#appendEvent` | `#appendEphemeralEvent` (type `worktreeStatus`) |
| `sessionCreated` (line 135) | `#emitSession` | `#appendInstanceEvent` (type `session`, no status) |
| `sessionUpdated` (line 139) | `#emitSession` | `#appendInstanceEvent` (type `session`, no status) |
| `sessionDeleted` (line 147) | `#appendEvent` | `#appendInstanceEvent` (type `session`, delete) |
| `sessionStatus` (line 154) | `#setSessionStatus` → `#emitSession` | `#appendEphemeralEvent` (new type `sessionStatus`) |
| `sessionIdle` (line 160) | `#setSessionStatus` | `#appendEphemeralEvent` (type `sessionStatus`) |
| `sessionIdle` → `#fullMessageSync` (line 162) | `#appendEvent` per message | `#appendInstanceEvent` (type `message`) |
| `sessionIdle` → `#refetchChanges` (line 163) | `#appendEvent` | `#appendInstanceEvent` (type `change`) |
| `sessionIdle` → worktree refresh (line 166) | `#emitWorktreeStatus` | `#appendEphemeralEvent` (type `worktreeStatus`) |
| `sessionDiff` (line 175) | `#appendEvent` | `#appendEphemeralEvent` (type `change`) — live diff during work, not finalized |
| `sessionError` (line 183) | `#setSessionStatus` | `#appendEphemeralEvent` (type `sessionStatus`) |
| `messageUpdated` (line 190) | `#emitMessage` | **Conditional**: if `finish` is set or `role === "user"`, write to instance stream. Otherwise write to ephemeral stream. |
| `messageRemoved` (line 246) | `#appendEvent` delete | `#appendInstanceEvent` (type `message`, delete) |
| `messagePartUpdated` (line 255) | `#emitMessage` | `#appendEphemeralEvent` (in-progress part update) |
| `messagePartDelta` (line 284) | `#emitMessage` | `#appendEphemeralEvent` (streaming delta) |
| `messagePartRemoved` (line 294) | `#emitMessage` | `#appendEphemeralEvent` (part removal) |
| `#emitWorktreeStatus` (line 427) | `#appendEvent` | `#appendEphemeralEvent` |
| `#emitUncommittedStatus` (line 500) | `#appendEvent` | `#appendEphemeralEvent` |

#### New `sessionStatus` event type

Currently session status is embedded in the `session` event. Split it out:

```ts
// Instance stream: session without status
{ type: "session", key: sessionId, value: { id, title, directory, ... }, headers: { operation: "insert" } }

// Ephemeral stream: status only
{ type: "sessionStatus", key: sessionId, value: { status: "busy", error?: "..." }, headers: { operation: "upsert" } }
```

#### `#emitSession` refactor

Remove the status/error merging from `#emitSession`. It should only emit the session metadata to the instance stream. `#setSessionStatus` becomes a standalone method that emits to the ephemeral stream.

#### `messageUpdated` refactor

The key logic change: when `messageUpdated` is called with `finish` set (or for user messages), emit the finalized message to the instance stream. When it's an in-progress assistant message, emit to the ephemeral stream.

The `#emitMessage` helper should take a target parameter or be split into two methods.

#### `sessionIdle` reconciliation

On `sessionIdle`, the full message sync writes finalized messages to the instance stream. This is the safety net — even if the individual `finish` event was missed, the reconciliation catches it.

### 1.3 Add snapshot endpoint

**File**: `packages/server/src/app.ts`

Add `GET /api/ephemeral-snapshot` route (after line ~593, in the `api` chain):

```ts
.get("/ephemeral-snapshot", (c) => {
  const snapshot = stateStream.getEphemeralSnapshot()
  return c.json(snapshot)
})
```

**File**: `packages/server/src/state-stream.ts`

Add a `getEphemeralSnapshot()` method that reads the current ephemeral stream length (the offset) and returns the materialized state from the in-memory maps:

```ts
getEphemeralSnapshot(): {
  offset: number
  sessionStatuses: Record<string, { status: SessionStatus; error?: string }>
  worktreeStatuses: Record<string, any>
} {
  const { messages } = this.#ephemeralDs.readStream("/")
  return {
    offset: messages.length,
    sessionStatuses: Object.fromEntries(this.#sessionStatuses),
    worktreeStatuses: Object.fromEntries(this.#lastWorktreeStatus),
  }
}
```

Since Bun is single-threaded, the offset and map reads are consistent — no events can be appended between them.

### 1.4 Update StateEvent type

**File**: `packages/server/src/state-stream.ts`

```ts
type InstanceEventType = "project" | "session" | "message" | "change"
type EphemeralEventType = "sessionStatus" | "message" | "worktreeStatus"

type StateEvent = {
  type: InstanceEventType | EphemeralEventType
  key: string
  value?: unknown
  headers: { operation: "insert" | "update" | "upsert" | "delete" }
}
```

(Or keep it as one union — the type system doesn't need to enforce which stream gets which event, the code does.)

## Phase 2: Client — Add ephemeral stream + snapshot

### 2.1 Add ephemeral stream schema

**File**: `packages/native/lib/stream-db.ts`

Add a third schema definition for the ephemeral stream:

```ts
type SessionStatusValue = {
  sessionId: string;
  status: 'idle' | 'busy' | 'error';
  error?: string;
};

const ephemeralStateDef = {
  sessionStatuses: {
    schema: passthrough<SessionStatusValue>(),
    type: 'sessionStatus' as const,
    primaryKey: 'sessionId' as const,
  },
  messages: {
    schema: passthrough<Message>(),
    type: 'message' as const,
    primaryKey: 'id' as const,
  },
  worktreeStatuses: {
    schema: passthrough<WorktreeStatusValue>(),
    type: 'worktreeStatus' as const,
    primaryKey: 'sessionId' as const,
  },
};

type EphemeralStateDef = typeof ephemeralStateDef;
type EphemeralStateDB = StreamDB<EphemeralStateDef>;
const ephemeralStateSchema = createStateSchema(ephemeralStateDef);
```

Export `SessionStatusValue`, `EphemeralStateDB`, and `ephemeralStateSchema`.

Update the instance stream's `stateDef` to **remove** `worktreeStatuses` (moved to ephemeral) and remove `status`/`error` from `SessionValue` (moved to `SessionStatusValue`).

### 2.2 Update BackendResources

**File**: `packages/native/lib/backend-streams.ts`

Add `ephemeralDb: EphemeralStateDB | null` to `BackendResources`.

### 2.3 Update useBackendManager

**File**: `packages/native/hooks/useBackendManager.ts`

Add a `createEphemeralStateDB` function (similar to `createStateDB`) that:
1. Fetches `GET /api/ephemeral-snapshot` from the backend.
2. Creates a `StreamDB` connected to `${url}/${instanceId}/ephemeral`, starting from the snapshot's `offset`.
3. Seeds the DB with the snapshot data (session statuses, worktree statuses).

Update `PerBackendState` to include `ephemeralDb`.

On instance ID change (server restart):
- Tear down old `ephemeralDb`.
- Fetch snapshot, create new `ephemeralDb`.
- Publish to `backendResourcesAtom`.

The snapshot fetch and stream subscribe must be sequenced: fetch snapshot first, get offset, then create the StreamDB starting from that offset.

**Note**: The `@durable-streams/client` / `createStreamDB` API needs to support starting from a specific offset. If it doesn't currently, this may require a change to the library or a workaround (e.g., using a query parameter on the stream URL like `?offset=42`). Investigate the durable-streams API to confirm.

### 2.4 Update merged-query.tsx

**File**: `packages/native/lib/merged-query.tsx`

Add `MergedEphemeralStateQuery` component and `useBackendEphemeralStateQuery` hook, following the same pattern as the existing state/app-state variants.

### 2.5 Update query consumers

The 16 query call sites across 7 files need to be updated based on which stream now holds their data:

#### Stays on instance stream (`useBackendStateQuery` / `MergedStateQuery`)

These query `projects`, `sessions`, `messages` (finalized), and `changes` — all in the instance stream. No change needed except that `SessionValue` no longer has `status`/`error` fields.

| File | Line | Collection | Change needed |
|---|---|---|---|
| `SessionContent.tsx` | 176 | `projects` | None |
| `SessionContent.tsx` | 493 | `sessions` | Merge status from ephemeral (see below) |
| `SessionContent.tsx` | 547 | `messages` | Merge in-progress messages from ephemeral (see below) |
| `SessionContent.tsx` | 574 | `changes` | None |
| `ModelSelectorSheet.tsx` | 55 | `messages` | None (only cares about finalized messages with modelID) |
| `DiffWebView.tsx` | 45 | `changes` | None |
| `SessionsSidebar.tsx` | 97 | `sessions` | Merge status from ephemeral |
| `SessionsSidebar.tsx` | 105 | `messages` | None (agent derivation, finalized messages) |
| `ProjectsSidebar.tsx` | 62 | `projects` | None |
| `SessionContent.tsx` | 727 | `projects` | None |
| `projects/[projectId]/index.tsx` | 24 | `sessions` | None (auto-navigation, doesn't use status) |
| `(drawer)/index.tsx` | 23 | `projects` | None |

#### Moves to ephemeral stream

| File | Line | Collection | New query target |
|---|---|---|---|
| `SessionContent.tsx` | 137 | `worktreeStatuses` | `useBackendEphemeralStateQuery` → `worktreeStatuses` |
| `SessionsSidebar.tsx` | 101 | `worktreeStatuses` | `MergedEphemeralStateQuery` → `worktreeStatuses` |

#### New: session status from ephemeral

Components that currently read `session.status` need to merge status from the ephemeral stream's `sessionStatuses` collection:

- **`SessionsSidebar.tsx`** — currently reads `session.status` to show busy indicators. Needs an additional ephemeral query for `sessionStatuses` and a merge step.
- **`SessionContent.tsx`** — reads `session.status` for the session header. Same treatment.

#### New: in-progress messages from ephemeral

**`SessionContent.tsx:547`** queries messages for a session. It currently gets both finalized and in-progress messages from the single stream. After the split:
- Finalized messages come from the instance stream.
- In-progress messages come from the ephemeral stream.
- The component needs to query both and merge: instance messages override ephemeral messages by ID. There won't be an instance message until it's finalized, so if one exists it's the authoritative version and the ephemeral entry is stale.

This can be done with a custom hook that runs both queries and merges:

```ts
function useSessionMessages(backendUrl, sessionId) {
  const finalized = useBackendStateQuery<Message>(backendUrl, 
    (db, q) => q.from({ messages: db.collections.messages }).where('@sessionId', '=', sessionId),
    [sessionId]
  );
  const inProgress = useBackendEphemeralStateQuery<Message>(backendUrl,
    (db, q) => q.from({ messages: db.collections.messages }).where('@sessionId', '=', sessionId),
    [sessionId]
  );
  // Merge: ephemeral overrides finalized by message ID
  // ...
}
```

Similarly, a `useSessionWithStatus` hook can merge a `SessionValue` with its `SessionStatusValue`.

### 2.6 Seeding ephemeral DB from snapshot

When the ephemeral DB is created, it starts empty. The snapshot data needs to be injected as initial state. Two approaches:

**Option A**: The `createStreamDB` API supports an `initialState` option. Seed session statuses and worktree statuses from the snapshot, then subscribe from the snapshot offset.

**Option B**: Convert the snapshot into synthetic stream events and prepend them. This is hacky and not recommended.

Investigate which approach the `@durable-streams/state` API supports. Option A is ideal. Option B is the fallback if the library doesn't support custom start offsets or initial state.

## Phase 3: Cleanup

### 3.1 Remove status from SessionValue

**File**: `packages/native/lib/stream-db.ts`

Remove `status` and `error` fields from `SessionValue`. These are now in `SessionStatusValue` on the ephemeral stream.

### 3.2 Remove worktreeStatuses from instance stream schema

**File**: `packages/native/lib/stream-db.ts`

Remove `worktreeStatuses` from `stateDef`. It now lives in `ephemeralStateDef`.

### 3.3 Update server initialization

**File**: `packages/server/src/state-stream.ts`

During `initialize()`:
- Projects, sessions (without status), finalized messages, and changes → instance stream.
- Session statuses (all start as "idle") and worktree statuses → ephemeral stream.

The current logic that merges status into session events (`#emitSession` lines 330-344) gets simplified: `#emitSession` just emits the session data to the instance stream, and status is emitted separately to the ephemeral stream.

### 3.4 Update diagnose-stream.ts

**File**: `packages/server/src/diagnose-stream.ts`

Update to account for the new stream split. Diagnostics should report on both the instance and ephemeral streams separately.

## Open Questions

1. **durable-streams start offset**: Does `@durable-streams/client` support subscribing from a specific offset? The snapshot + subscribe pattern requires this. Need to check the library API.

2. **durable-streams initial state**: Does `@durable-streams/state` / `createStreamDB` support seeding initial state? Needed for injecting the snapshot.

3. **Ephemeral stream `change` events**: During active work, `sessionDiff` sends live change events. These go to the ephemeral stream. But the instance stream only gets the finalized changes on `sessionIdle`. Should the ephemeral stream also have a `changes` collection, or is it fine for the changes tab to only show finalized data? Currently the diff viewer shows live updates during streaming, so the ephemeral stream probably needs `change` events too. This means `changes` exists in **both** streams — ephemeral for live updates, instance for the finalized version — and the client merges them the same way as messages.

4. **Race between snapshot and subscribe**: If events are appended between the snapshot fetch and the stream subscribe, they won't be in the snapshot but will be after the offset. Since the snapshot includes the offset at read time, and the client subscribes from that offset, this should be safe — the client will see those events as they arrive from the stream. No gap.
