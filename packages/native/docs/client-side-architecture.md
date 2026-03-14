# Client-Side Architecture

## Overview

The native client uses three complementary state management strategies:

| Strategy | What it manages | Why |
|----------|----------------|-----|
| **Expo Router (URL)** | Current project, current session | Deep-linkable, shareable, browser-like navigation |
| **TanStack DB** | Sessions, session messages, projects, offline message queue | Synced with server, reactive queries, optimistic updates |
| **Jotai atoms** | Voice state, connectivity, settings, UI chrome | Fast ephemeral/local state, no server sync needed |

Settings are persisted to **AsyncStorage** via Jotai's persistence middleware so they survive app kills without needing server sync.

---

## Expo Router — URL State

### Route Structure

```
app/
├── (app)/
│   ├── _layout.tsx              # Auth guard, providers, adaptive layout shell
│   ├── projects/
│   │   └── [projectId]/
│   │       ├── _layout.tsx      # Project-scoped layout (header with project name)
│   │       ├── index.tsx         # Redirect to most recent session
│   │       └── sessions/
│   │           └── [sessionId].tsx   # Main session screen
│   └── settings.tsx             # Settings screen
```

### What lives in the URL

- **`projectId`** — which project is selected
- **`sessionId`** — which session is active

On iPad, the currently expanded tool call is also in the URL (`?toolCallId=...`) so it's deep-linkable and drives the left panel content. Everything else (which sidebar is open, which tab is active) is UI state managed by Jotai, not the URL. This keeps URLs clean and avoids unnecessary navigation events for transient interactions.

### Adaptive Layout

The `_layout.tsx` at the `(app)` level detects iPad landscape via `useWindowDimensions` and renders either:

- **iPhone / iPad portrait**: Stack navigator with gesture-driven sidebar drawers
- **iPad landscape**: Persistent split-pane layout (left panel + right panel) with sidebar drawers for Sessions (left overlay) and Projects (right overlay)

Sessions and Projects are sidebar overlays on both form factors — they slide over the content. On iPad landscape the left panel shows contextual content (changes, tool detail, settings) while the right panel always shows the active chat. The route structure is the same — only the layout shell changes.

---

## TanStack DB — Server-Synced State

TanStack DB manages all data that comes from or syncs with the opencode server.

### Collections

```typescript
// db/collections.ts

interface Project {
  id: string
  name: string
  path: string           // e.g. ~/projects/opencode-rn
  sessionCount: number
  activeSessionCount: number
}

interface Session {
  id: string
  projectId: string
  name: string           // derived from first message or branch context
  branchName: string | null
  status: 'active' | 'idle'
  createdAt: number
  updatedAt: number
}

type ToolCallStatus = 'pending' | 'running' | 'completed' | 'error'

interface ToolMeta {
  status: ToolCallStatus
  input?: Record<string, unknown>
  output?: string
  title?: string
  error?: string
  metadata?: Record<string, unknown>
  time?: { start: number; end?: number; compacted?: number }
}

interface Message {
  id: string
  sessionId: string
  role: 'user' | 'assistant'
  type: 'text' | 'voice' | 'tool_call' | 'status'
  content: string
  // Voice-specific
  audioUri: string | null       // local file URI for queued voice recordings
  transcription: string | null
  // Tool-specific
  toolName: string | null       // 'bash', 'edit', 'read', 'task', etc.
  toolMeta: ToolMeta | null
  // Sync state
  syncStatus: 'synced' | 'pending' | 'sending' | 'failed'
  createdAt: number
}
```

### Sync Status on Messages

Rather than a separate offline queue, each `Message` carries its own `syncStatus`:

| `syncStatus` | Meaning |
|--------------|---------|
| `synced` | Delivered to and acknowledged by server |
| `pending` | Created locally, waiting to send (offline or not yet attempted) |
| `sending` | Currently being transmitted |
| `failed` | Send attempted but failed (will retry) |

The UI renders queued indicators (`queued · will send when online`) by filtering on `syncStatus !== 'synced'`. A background sync service watches connectivity (via Jotai atom) and flushes `pending`/`failed` messages in order when the connection is restored.

### Live Queries

TanStack DB uses a builder-pattern API with `useLiveQuery`. Queries update incrementally (sub-millisecond) rather than re-running on every change.

```typescript
import { useLiveQuery } from '@tanstack/react-db'
import { eq, and, or } from '@tanstack/react-db'

// hooks/useSessionMessages.ts
function useSessionMessages(sessionId: string) {
  return useLiveQuery((q) =>
    q
      .from({ message: messageCollection })
      .where(({ message }) => eq(message.sessionId, sessionId))
      .orderBy(({ message }) => asc(message.createdAt))
  )
}

// hooks/useProjectSessions.ts
function useProjectSessions(projectId: string) {
  return useLiveQuery((q) =>
    q
      .from({ session: sessionCollection })
      .where(({ session }) => eq(session.projectId, projectId))
      .orderBy(({ session }) => desc(session.updatedAt))
  )
}

// hooks/usePendingMessages.ts
function usePendingMessages() {
  return useLiveQuery((q) =>
    q
      .from({ message: messageCollection })
      .where(({ message }) =>
        or(
          eq(message.syncStatus, 'pending'),
          eq(message.syncStatus, 'sending'),
          eq(message.syncStatus, 'failed'),
        )
      )
      .orderBy(({ message }) => asc(message.createdAt))
  )
}
```

### Mutations

TanStack DB provides optimistic mutations that apply instantly to the local store and sync to the server in the background. Use `createOptimisticAction` for operations that need both local optimism and server persistence. Use `collection.update(id, draftFn)` for simple field changes. Use `createTransaction` to group multiple collection operations atomically.

```typescript
// actions/sendMessage.ts
import { createOptimisticAction } from '@tanstack/db'

const sendMessage = createOptimisticAction<{
  sessionId: string
  content: string
  type: 'text' | 'voice'
  audioUri?: string
}>({
  onMutate: ({ sessionId, content, type, audioUri }) => {
    // Applies immediately to local state (optimistic)
    messageCollection.insert({
      id: generateId(),
      sessionId,
      role: 'user',
      type,
      content,
      audioUri: audioUri ?? null,
      transcription: type === 'voice' ? content : null,
      toolName: null,
      toolMeta: null,
      syncStatus: 'pending',
      createdAt: Date.now(),
    })
  },
  mutationFn: async ({ sessionId, content, type, audioUri }) => {
    // Persists to server
    await api.sendMessage(sessionId, { content, type, audioUri })
    // Refetch so server-confirmed data replaces optimistic state
    await messageCollection.utils.refetch()
  },
})

// Usage in a hook:
// sendMessage({ sessionId, content: text, type: 'voice' })
```

For simpler updates (e.g. marking a message as synced), use the draft pattern directly:

```typescript
messageCollection.update(messageId, (draft) => {
  draft.syncStatus = 'synced'
})
```

For grouped operations that must succeed or fail together, use transactions:

```typescript
import { createTransaction } from '@tanstack/db'

const deleteSession = createTransaction({
  mutationFn: async ({ transaction }) => {
    await api.deleteSession(transaction.mutations)
  },
})

deleteSession.mutate(() => {
  sessionCollection.delete(sessionId)
  // Also delete all messages in that session
  for (const msg of sessionMessages) {
    messageCollection.delete(msg.id)
  }
})
```

---

## Jotai — Local/Ephemeral State

### Voice Recording State

Voice is the most complex piece of local state. It uses a flat set of atoms rather than a state machine, since the transitions are driven by gesture handlers and timers that already encode the sequencing.

```typescript
// state/voice.ts

type VoiceMode = 'idle' | 'pressing' | 'recording' | 'transcribing' | 'sending'
type RecordingTrigger = 'hold' | 'hands-free' | 'auto-record'

const voiceModeAtom = atom<VoiceMode>('idle')
const recordingTriggerAtom = atom<RecordingTrigger | null>(null)
const recordingDurationAtom = atom<number>(0)         // seconds
const waveformDataAtom = atom<number[]>([])            // amplitude samples
const liveTranscriptAtom = atom<string>('')            // rolling transcript (iPad hands-free)
const transcriptionResultAtom = atom<string | null>(null)
```

Derived atoms combine these for UI consumption:

```typescript
const isRecordingAtom = atom((get) => {
  const mode = get(voiceModeAtom)
  return mode === 'pressing' || mode === 'recording'
})

const micHintAtom = atom((get) => {
  const mode = get(voiceModeAtom)
  const trigger = get(recordingTriggerAtom)
  switch (mode) {
    case 'idle': return 'hold to record · tap for hands-free'
    case 'recording':
      return trigger === 'hold' ? 'release to send' : 'tap to send'
    case 'transcribing': return 'transcribing...'
    default: return ''
  }
})
```

### Connectivity

```typescript
// state/connectivity.ts

type ConnectionStatus = 'connected' | 'disconnected' | 'reconnecting'

const connectionStatusAtom = atom<ConnectionStatus>('connected')
const serverLatencyAtom = atom<number | null>(null)  // ms, null if disconnected

const isOfflineAtom = atom((get) => get(connectionStatusAtom) !== 'connected')
```

A `useConnectionMonitor` hook (in `hooks/useConnectionMonitor.ts`) subscribes to `NetInfo` events and the server WebSocket health, updating these atoms. It also triggers the message sync flush when transitioning from disconnected to connected.

### Settings (AsyncStorage-persisted)

```typescript
// state/settings.ts
import { atomWithStorage } from 'jotai/utils'
import { asyncStorageAdapter } from '../lib/jotai-async-storage'

const serverUrlAtom = atomWithStorage('settings:serverUrl', 'https://api.opencode.dev', asyncStorageAdapter)
const handsFreeAutoRecordAtom = atomWithStorage('settings:handsFreeAutoRecord', true, asyncStorageAdapter)
const notificationSoundAtom = atomWithStorage('settings:notificationSound', 'chime', asyncStorageAdapter)
const recordingTimeoutAtom = atomWithStorage('settings:recordingTimeout', 60, asyncStorageAdapter)
```

These atoms hydrate from AsyncStorage on app start and write back on every change. No server sync needed.

### UI Chrome

```typescript
// state/ui.ts

// iPhone sidebars
const leftSidebarOpenAtom = atom(false)   // sessions sidebar
const rightSidebarOpenAtom = atom(false)  // projects sidebar

// iPad left panel (persistent content area — not sidebars)
type LeftPanelContent = 'changes' | 'tool-detail' | 'settings'
const leftPanelContentAtom = atom<LeftPanelContent>('changes')
// selectedToolCallId lives in the URL as a query param (?toolCallId=xxx)
// so tool detail views are deep-linkable. Read via useLocalSearchParams().

// Sidebar overlays (same on iPhone and iPad — slide-in drawers)
// Sessions sidebar overlays from the left, Projects sidebar overlays from the right.

// Shared
const activeTabAtom = atom<'session' | 'changes'>('session')
const sessionSearchQueryAtom = atom('')
const projectSearchQueryAtom = atom('')
```

---

## Component Hierarchy

### Providers (top-level)

```
<JotaiProvider>
  <TanStackDBProvider>
    <ExpoRouterRoot />
  </TanStackDBProvider>
</JotaiProvider>
```

Providers are thin wrappers. No business logic lives here.

### Screen Components

Screen components are route-level files. They compose layout and connect data to presentation:

```
(app)/_layout.tsx
├── AdaptiveShell              # iPhone vs iPad layout detection
│   ├── PhoneLayout            # Stack + drawer gestures
│   └── TabletLayout           # Persistent split pane

projects/[projectId]/sessions/[sessionId].tsx
├── SessionScreen              # Route component — reads params, passes data down
│   ├── SessionHeader
│   ├── TabBar                 # Session | Changes
│   ├── ChatThread             # Scrollable message list
│   │   ├── UserMessageBubble
│   │   ├── VoiceMessageBubble
│   │   ├── AssistantMessageBubble
│   │   ├── ToolCallBlock      # Collapsible, tappable (opens detail on iPad)
│   │   ├── AgentStatusIndicator
│   │   └── QueuedMessageBubble
│   ├── VoiceInputArea
│   │   ├── TextInput
│   │   ├── MicButton          # Gesture handler (hold/tap logic)
│   │   ├── WaveformDisplay
│   │   ├── RecordingTimer
│   │   ├── LiveTranscript     # iPad hands-free only
│   │   └── ModelSelector
│   └── OfflineBanner

settings.tsx
├── SettingsScreen
│   ├── ServerSection
│   │   ├── ServerUrlInput
│   │   └── ConnectionStatusBadge
│   ├── VoiceModeSection
│   │   ├── AutoRecordToggle
│   │   ├── NotificationSoundPicker
│   │   └── RecordingTimeoutPicker
│   └── AboutSection
```

### Sidebar / Panel Components

```
SessionsSidebar (iPhone drawer / iPad left panel)
├── SidebarHeader
├── SessionSearchInput
├── SessionList
│   ├── SessionRow             # Status dot, name, project, timestamp, overflow menu
│   └── SectionDivider         # "EARLIER"
└── BottomBar                  # Settings, mic, help icons

ProjectsSidebar (iPhone drawer / iPad left panel)
├── SidebarHeader
├── ProjectSearchInput         # Only shown when 8+ projects
├── ProjectList
│   ├── ProjectCard            # Avatar, name, path, session count, new session button
│   └── ProjectOverflowMenu

ChangesPanel (iPad left panel / iPhone Changes tab)
├── ChangesHeader              # "N files changed"
└── DiffList
    └── FileDiff               # Filename, path, syntax-highlighted additions/deletions

ToolDetailPanel (iPad left panel only)
├── ShellDetail                # Command, output, exit code, duration, directory
└── AgentDetail                # Task, status, duration, files explored, finding
```

---

## Separation of Concerns

### Layer Boundaries

```
┌─────────────────────────────────────────────┐
│  Screen Components (routes)                  │
│  Wire up data → presentation. No logic.      │
├─────────────────────────────────────────────┤
│  Presentational Components                   │
│  Pure UI. Props in, rendered output out.      │
│  No hooks that touch atoms or DB directly.   │
├─────────────────────────────────────────────┤
│  Hooks                                       │
│  useSessionMessages, useVoiceRecorder,       │
│  useConnectionMonitor, useSendMessage, etc.  │
│  Bridge between state and components.        │
├─────────────────────────────────────────────┤
│  State (atoms + TanStack DB collections)     │
│  Jotai atoms: voice, connectivity, settings, │
│  UI chrome. TanStack DB: sessions,            │
│  messages, projects.                         │
├─────────────────────────────────────────────┤
│  Services                                    │
│  SyncService, VoiceRecordingService,         │
│  TranscriptionService                        │
│  Pure logic, no React dependency.            │
└─────────────────────────────────────────────┘
```

### Rules

1. **Presentational components receive data via props only.** They never call `useAtom`, `useQuery`, or any hook that reads global state. This makes them trivially testable — pass props, assert rendered output.

2. **Screen components are thin glue.** They read route params, call hooks, and pass results to presentational components. A screen component's body should be essentially a single JSX return with hook calls above it.

3. **Hooks encapsulate one concern.** `useVoiceRecorder` handles mic permissions, audio recording, and atom updates. `useSessionMessages` handles the TanStack DB query. They don't render anything.

4. **Services are plain TypeScript modules with no React imports.** `SyncService` manages the message flush queue. `VoiceRecordingService` wraps expo-av. `TranscriptionService` handles speech-to-text. They expose imperative APIs that hooks call.

5. **Atoms are grouped by domain** in `state/*.ts` files. Cross-domain derived atoms (e.g. "should auto-record?" depends on voice state + settings + connectivity) live in `state/derived.ts`.

---

## Testing Strategy

| Layer | Test type | What to test |
|-------|-----------|-------------|
| **Presentational components** | Unit (React Native Testing Library) | Renders correctly for all prop variants. No mocking needed. |
| **Hooks** | Unit (`renderHook` from RNTL) | State transitions, derived values. Mock atoms/DB with Jotai Provider + test store. |
| **Services** | Unit (plain bun test) | Pure logic — input/output. Mock native modules (expo-av, NetInfo) at the service boundary. |
| **Screen components** | Integration | Mount with all providers, assert that data flows from hooks to child components. Minimal — most logic is tested at lower layers. |
| **Sync behavior** | Integration | Create messages with `syncStatus: 'pending'`, simulate connectivity change, assert they transition to `synced`. |

### Testability Guidelines

- Never import atoms directly in presentational components — this makes them impossible to test without a Jotai Provider.
- Services should accept dependencies via constructor/function params, not import singletons. e.g. `createSyncService({ db, connectionStatus$ })` rather than importing globals.
- Use `createStore()` from Jotai in tests to get an isolated atom store per test case.

---

## Data Flow Examples

### Sending a voice message (online)

```
MicButton (gesture: release after hold)
  → useVoiceRecorder.stop()
    → VoiceRecordingService.stop() → audioUri
    → TranscriptionService.transcribe(audioUri) → text
    → set(voiceModeAtom, 'sending')
  → sendMessage({ sessionId, content: text, type: 'voice' })
    → onMutate: messageCollection.insert(...) (optimistic, appears in ChatThread immediately)
    → mutationFn: POST to server, then refetch to confirm
  → set(voiceModeAtom, 'idle')
```

### Sending a voice message (offline)

```
MicButton (gesture: release after hold)
  → useVoiceRecorder.stop()
    → VoiceRecordingService.stop() → audioUri
    → set(voiceModeAtom, 'sending')
  → sendMessage({ sessionId, content: '', type: 'voice', audioUri })
    → onMutate: messageCollection.insert(...) (appears as QueuedMessageBubble in ChatThread)
    → mutationFn: fails (offline) → optimistic state persists with syncStatus 'pending'
  → set(voiceModeAtom, 'idle')

... later, connection restored:

useConnectionMonitor detects reconnect
  → set(connectionStatusAtom, 'connected')
  → SyncService.flush()
    → query messages where syncStatus = 'pending', ordered by createdAt
    → for each: transcribe if needed, then POST
    → on success: update syncStatus → 'synced'
```

### Tapping a tool call on iPad

```
ToolCallBlock (onPress)
  → router.setParams({ toolCallId: toolCall.id })
  → set(leftPanelContentAtom, 'tool-detail')

ToolDetailPanel reads toolCallId from useLocalSearchParams()
  → useLiveQuery((q) => q.from({ message: messageCollection }).where(...eq(message.id, toolCallId)))
  → renders ShellDetail or AgentDetail based on toolName
```
