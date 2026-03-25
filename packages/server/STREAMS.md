# Stream Architecture

The server exposes three durable streams to clients, plus a snapshot endpoint for bootstrapping ephemeral state. Each stream has a distinct lifetime, purpose, and catch-up semantic.

## 1. App Stream (`/app/`)

**Storage**: File-backed (survives server restarts).
**Catch-up**: Replay from offset 0. Every event matters.

Stores data that doesn't fit in the OpenCode API — metadata that is specific to Flock and has no upstream home.

| Type | Key | When written |
|---|---|---|
| `sessionMeta` | session ID | On archive / unarchive |
| `sessionWorktree` | session ID | On worktree creation for a session |

## 2. Instance Stream (`/{instanceId}/`)

**Storage**: In-memory. Resets on server restart.
**Catch-up**: Replay from offset 0 (or last known offset). Every event is a distinct, meaningful state change worth replaying.

The authoritative record of what happened during this server instance's lifetime. Contains finalized, settled state. A client connecting late catches up on everything here — no redundant re-emissions of the same data.

| Type | Key | When written |
|---|---|---|
| `project` | project ID | Once per project on init / discovery |
| `session` | session ID | On create, title/summary/share update, delete. **Excludes** live status — that's ephemeral. |
| `message` | message ID | When finalized: user messages immediately, assistant messages on `finish` signal. Also on `messageRemoved`. Reconciliation pass on `sessionIdle` to catch anything missed. |
| `change` | session ID | On `sessionIdle` (refetched from OpenCode API). The finalized file diff summary. |

## 3. Ephemeral Stream (`/{instanceId}/ephemeral/`)

**Storage**: In-memory. Resets on server restart.
**Catch-up**: **Do not replay history.** Use the snapshot endpoint to bootstrap current state, then subscribe from the returned offset. Only the latest value per key matters — intermediate events are noise.

Real-time UI state that is only useful if you're watching right now. During active streaming, this is the hot path — message deltas land here many times per second.

| Type | Key | When written |
|---|---|---|
| `sessionStatus` | session ID | On every status change (idle / busy / error) |
| `message` | message ID | On every text delta, part update, part removal during streaming. The in-progress assistant message. |
| `worktreeStatus` | session ID | On every worktree status check (merge state, uncommitted changes) |

## 4. Snapshot Endpoint (`GET /api/ephemeral-snapshot`)

Returns the current materialized state of the ephemeral stream so a client can bootstrap without replaying history.

```json
{
  "offset": 42,
  "sessionStatuses": {
    "<sessionId>": { "status": "busy" }
  },
  "worktreeStatuses": {
    "<sessionId>": { "sessionId": "...", "isWorktreeSession": true, "branch": "...", ... }
  }
}
```

- `offset` — the ephemeral stream position at snapshot time. The client subscribes starting from this offset.
- `sessionStatuses` — latest status per session. Merged onto `session` records from the instance stream by the client.
- `worktreeStatuses` — latest worktree state per session.
- Messages are **not** included. If a message is finalized, it's in the instance stream. If it's still in-progress, the client will receive an ephemeral update within milliseconds of subscribing.

### Client Connection Flow

1. **App stream**: Connect at `/app/` from last known offset (or 0). Catch up on archive flags, worktree mappings.
2. **Instance stream**: Connect at `/{instanceId}/` from offset 0 (new instance) or last known offset. Catch up on all projects, sessions, finalized messages, file changes.
3. **Snapshot**: Fetch `GET /api/ephemeral-snapshot`. Seed local ephemeral state.
4. **Ephemeral stream**: Connect at `/{instanceId}/ephemeral/` starting from the offset returned by the snapshot. Receive live updates going forward.
