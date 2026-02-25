# Mobile Agents — Task Status

> Voice-first React Native client for [OpenCode](https://github.com/sst/opencode) AI coding agent.
> Last updated: 2026-02-25

---

## Architecture Overview

```
React Native (Expo 54) ──WebSocket (Cap'n Web RPC)──▶ Hono Server (Bun) ──SDK──▶ OpenCode Server
```

- **Monorepo**: `packages/native` (iOS app) + `packages/server` (API bridge)
- **State**: Jotai atoms (local) + RPC targets (server-synced)
- **Voice**: Audio recorded on device → sent to server → server transcribes via Gemini 3 Flash (with session context) → forwards text to OpenCode
- **No auth**: Connects to trusted local/network OpenCode server

---

## Feature Status Summary

| Area | Status | Notes |
|------|--------|-------|
| Chat UI (messages, tool calls) | ✅ Done | All message types render correctly |
| Session/project browsing | ✅ Done | Sidebars, search, filtering all work |
| RPC client ↔ server bridge | ✅ Done | Cap'n Web over WebSocket, promise pipelining |
| Diff viewing | ✅ Mostly done | WebView-based with @pierre/diffs |
| Settings screen UI | ✅ Mostly done | Missing recording timeout UI |
| iPad split-pane layout | 🟡 Partial | Shell exists, tool detail panels are placeholders |
| Server event streaming | 🟡 Partial | Infrastructure exists, critical async bug |
| Voice recording | ❌ Not started | Core feature, all handlers stubbed |
| Audio transcription | ❌ Not started | Server-side with Gemini + session context |
| Offline message queuing | ❌ Not started | Queuing designed, not implemented |
| System audio integration | ❌ Not started | Pause podcasts/music for hands-free mode |
| Session creation from app | ❌ Not started | Server RPC exists, no client UI wired |
| Session abort | ❌ Not started | Server RPC exists, no client UI wired |

---

## Detailed Status by Area

### 1. Chat & Message Display

#### ✅ IMPLEMENTED
- `UserMessageBubble` — renders user text messages, right-aligned, with queued status indicator
- `AssistantMessageBubble` — renders agent replies with markdown via StreamdownRN
- `ToolCallBlock` — expandable tool call cards (Shell, Explore Agent) with tap-to-expand
- `ToolOutputBlock` — monospace tool output inside expanded blocks
- `AgentStatusIndicator` — status labels (Thinking, Analyzing, Done) with color and ellipsis
- `ChatThread` — renders all message types, flattens nested structures, scrollable
- Voice message indicator (mic icon + "queued · will send when online" for offline)

#### ❌ NOT IMPLEMENTED
- **Streaming message display** — messages appear only after completion, no live token-by-token rendering
- **Message send action** — no way to actually send a text message from the input field (handler is `() => {}`)
- **Message retry on failure** — no retry UI or logic for failed sends

---

### 2. Voice Input (Core Feature)

Three modes designed in requirements. **None are implemented.**

#### Mode A: Hold to Record
- ❌ Press & hold gesture detection on mic button
- ❌ Recording timer display
- ❌ Red waveform animation during recording
- ❌ Release-to-send behavior
- ❌ Cancel by sliding away from mic
- ❌ expo-av audio recording integration
- ❌ Microphone permission request flow

#### Mode B: Hands-Free
- ❌ Quick-tap to enter recording mode
- ❌ Tap-again to send
- ❌ Navigate while recording (recording persists across screens)
- ❌ Visual recording indicator in header/nav
- ❌ Live transcript label (iPad)

#### Mode C: Hands-Free Auto-Record Loop
- ❌ Send message → wait for agent → configurable delay → beep → auto-record → send → repeat
- ❌ Configurable delay setting before auto-record starts (in Settings)
- ❌ Beep/notification sound before auto-recording
- ❌ Auto-record loop state management
- ❌ Exit auto-record mode gesture/button

#### System Audio Integration (replaces Spotify feature)
- ❌ Detect if system audio is playing (podcast, music, etc.)
- ❌ Pause system audio when entering hands-free recording
- ❌ Resume system audio when recording stops / auto-record loop exits
- ❌ Graceful hooks into iOS audio session management
- 🗑️ `MusicPlayerBar` component — **remove** (placeholder, not a real feature)
- 🗑️ `useMusicPlayer` hook — **remove** (fixture data only)
- 🗑️ `state/music.ts` — **remove** (unused atoms)
- 🗑️ `__fixtures__/music.ts` — **remove**

#### Audio → Server Pipeline
- ❌ Encode recorded audio in appropriate format for upload
- ❌ Send audio data via `sessionHandle.prompt([{ type: 'audio', audioData }])`
- ❌ Show transcription-in-progress state in UI
- ❌ Display transcribed text after server response

---

### 3. Server-Side Audio Transcription

#### ❌ NOT IMPLEMENTED
- ❌ Receive audio data from RPC `prompt()` call
- ❌ Gather session context (recent messages, active files, tool calls) for transcription accuracy
- ❌ Call Gemini 3 Flash with audio + context prompt for transcription
- ❌ Return transcribed text as part of the message flow
- ❌ Forward transcribed text to OpenCode as user message
- **Current state**: `rpc.ts:342-345` converts audio parts to placeholder string `"[audio transcription pending]"`

---

### 4. Offline Message Queuing

#### ✅ IMPLEMENTED (UI only)
- User message bubble shows "queued · will send when online" with clock icon
- Amber styling for queued messages

#### ❌ NOT IMPLEMENTED
- ❌ Connection status monitoring (NetInfo or WebSocket health)
  - **Current state**: `useSettings.ts:19` has TODO, hardcoded to "connected" with 42ms latency
- ❌ Offline detection and "Offline" banner display
- ❌ Message queue storage (persist queued messages across app restarts)
- ❌ Queue counter in footer ("N messages queued — will send when connected")
- ❌ Automatic flush of queued messages on reconnection (in order)
- ❌ Per-message sync status tracking (`pending` → `sending` → `synced` / `failed`)
- ❌ Mic icon turns orange when offline
- ❌ Voice recordings queued with waveform icon: "queued · will transcribe when online"
- ❌ Continue browsing sessions and files while offline (cached data)

---

### 5. Settings

#### ✅ IMPLEMENTED
- Server URL input with connection status badge (badge uses fixture data)
- Hands-free auto-record toggle with behavior description
- Notification sound dropdown (chime, ding, pulse, silent)
- About section (app version, default model display)

#### ❌ NOT IMPLEMENTED
- ❌ Recording timeout dropdown — atom exists in state but UI is missing from SettingsScreen
- ❌ Auto-record delay setting (configurable delay before beep + auto-record in Mode C)
- ❌ Settings persistence across app restarts
  - **Current state**: `state/settings.ts:4-10` has `atomWithStorage` code commented out; plain atoms used instead
  - Need: AsyncStorage integration for all settings atoms
- ❌ Real connection status monitoring (replace fixture with actual WebSocket/server health check)
- ❌ Server URL validation and connection test on change

---

### 6. Diff Viewing (Changes Tab)

#### ✅ IMPLEMENTED
- `ChangesView` — file list with expansion/collapse, file count badge
- `DiffWebView` — WebView loads diffs from server, preloaded, always-mounted
- Server endpoints: `GET /api/diff` (single file) and `GET /api/diffs` (all files)
- `diff-page/app.tsx` — React app inside WebView using @pierre/diffs MultiFileDiff
- File switching via postMessage communication
- Auto-resize WebView to content height
- Dark theme ("pierre-dark")

#### 🟡 PARTIALLY IMPLEMENTED
- Neighbor file navigation (prev/next) — UI exists in ChangesView but navigation between files in WebView needs verification
- `useDiffs` hook has graceful degradation if server doesn't support `diff()` RPC method

#### ❌ NOT IMPLEMENTED
- ❌ Error handling if diff server endpoint fails or is unreachable
- ❌ Loading state while diffs are being fetched in WebView
- ❌ Offline cached diffs (view diffs when disconnected)

---

### 7. Session & Project Management

#### ✅ IMPLEMENTED
- `ProjectsSidebar` — project list with search (auto-shows when 8+ projects), loading/error/empty states
- `SessionsSidebar` — session list with search, status dots, timestamps, "EARLIER" grouping
- `ProjectCard` — avatar, name, path, timestamp, new session button
- `useProjects` hook — fetches via RPC
- `useSidebarSessions` hook — fetches, filters by search, groups by recency
- `useSession` hook — fetches session info, calculates active status
- Routing: `app/projects/[worktree]/sessions/[sessionId]/index.tsx`

#### ❌ NOT IMPLEMENTED
- ❌ **Create new session from app** — server `Api.createSession()` exists in RPC, no client UI or action wired
- ❌ **Abort running session** — server `SessionHandle.abort()` exists, no client button/UI
  - Need: stop button in chat UI when session status is "running"
- ❌ New session button handler in ProjectCard (`onNewSession={() => {}}`)
- ❌ Overflow menu handler in ProjectCard (`onOverflowSession={() => {}}`)
- ❌ Add project button handler in ProjectsSidebar (`onAddProject={() => {}}`)
- ❌ Help button handler in SessionsSidebar (`onHelpPress={() => {}}`)
- ❌ Error retry in ProjectsSidebar (retry button handler is `() => {}`)

#### 🗑️ NOT NEEDED (per user)
- ~~Session revert~~ — never implementing
- ~~Session share~~ — never implementing

---

### 8. Server Event Streaming & Push Updates

#### 🟡 PARTIALLY IMPLEMENTED — HAS CRITICAL BUG

**Infrastructure exists but doesn't work due to async bug:**

- `opencode.ts` `spawnListener()` — subscribes to OpenCode server-sent events
- **BUG at `opencode.ts:99-110`**: `forwardEvents()` is an async function that is called but **not awaited**, so the event processing loop never actually runs
- Result: WebSocket push updates are completely broken; clients only get data from direct RPC calls (polling)

**Event wiring status:**
- ✅ `MessageList` — has listener registration, will push updates when events work
- ❌ `SessionList` — TODO comment, `onStateChanged` never receives events
- ❌ `ProjectList` — TODO comment, `onStateChanged` never receives events
- ❌ `ChangeList` — TODO comment, `onStateChanged` never receives events

**Silent error swallowing:**
- `rpc.ts:90` — empty catch block in MessageList
- `rpc.ts:304` — empty catch block in SessionHandle `#refreshAndPush()`

---

### 9. iPad Split-Pane Layout

#### ✅ IMPLEMENTED
- `useLayout` hook — detects iPad + landscape orientation
- `SplitLayout` component — two-panel layout with global header
- `SessionContent` — selects PhoneLayout vs SplitLayout based on device
- Left panel content type system (`LeftPanelContent` discriminated union in `state/ui.ts`)
- Tab bar in subheader (Session | Changes)

#### ❌ NOT IMPLEMENTED
- ❌ **Tool detail panel** — when user taps a tool call in chat, left panel should show details
  - Current: `SplitLayout.tsx:162-164` renders placeholder text `"Tool detail for message: {messageId}"`
  - Need: `ShellDetail` component (show full shell command + output)
  - Need: `AgentDetail` component (show agent reasoning + actions)
- ❌ Left panel showing changes/diff view (needs to wire ChangesView into left panel)
- ❌ Left panel showing settings (Settings currently shows as modal)
- ❌ Proper tool call tap → left panel navigation

---

### 10. Routing

#### 🟡 PARTIALLY IMPLEMENTED
- File-based routes exist: `app/_layout.tsx`, `app/index.tsx`, `app/projects/[worktree]/`, `app/projects/[worktree]/sessions/[sessionId]/`
- **Issue**: All routes re-export the monolithic `App.tsx` — defeats purpose of Expo Router
- Settings is a toggle inside App.tsx, not a separate route

#### ❌ NOT IMPLEMENTED (per architecture doc)
- ❌ Proper route-level screen components (settings as its own route)
- ❌ Deep linking support (open specific session from notification/URL)
- ❌ Route-based code splitting

---

### 11. Code Quality & DX Issues

#### Debug/WIP Code to Clean Up
- `App.tsx:25` — `console.log(params)` debug statement
- `useRpcTarget.ts:28` — `console.error` for failed RPC calls (should surface to UI)
- `ProjectCard.tsx:46` — `(project.time as any).updated` type cast

#### Empty/Stubbed Handlers (all `() => {}`)
- `App.tsx:187-191` — multiple button handlers
- `VoiceInputArea.tsx:77-81` — mic, attach, stop handlers
- `ProjectsSidebar.tsx:107` — error retry handler

#### Missing Error Handling
- ❌ No React error boundaries anywhere in the app
- ❌ `DiffWebView` has no error handling for failed loads
- ❌ RPC errors logged to console but not displayed to user

---

## Server Test Coverage

| Test File | Tests | Status | Notes |
|-----------|-------|--------|-------|
| `capnweb.test.ts` | 13 | ✅ Working | Full RPC target hierarchy, HTTP + WebSocket |
| `opencode.spec.ts` | 3 | ✅ Working | Zod schema validation against live data |
| `index.test.ts` | 8 | 🟡 Partial | `beforeAll`/`afterAll` commented out; requires manual server setup |

**Not tested:**
- Audio transcription pipeline
- Event streaming / push updates
- Session create/abort flows
- Error scenarios and edge cases

---

## Priority Order for Implementation

Based on user input, here's the suggested implementation order:

### P0 — Core (must work)
1. **Voice recording** (Mode A: hold-to-record first, then Mode B + C)
2. **Message sending** (wire text input + voice input to `sessionHandle.prompt()`)
3. **Server audio transcription** (Gemini 3 Flash with session context)
4. **Fix event streaming bug** (`opencode.ts` async issue)
5. **Session abort** (stop button when agent is running)
6. **Offline message queuing** (queue, persist, flush on reconnect)
7. **Connection monitoring** (detect online/offline, show banner)

### P1 — Important
8. **Settings persistence** (AsyncStorage)
9. **System audio integration** (pause podcasts/music for hands-free)
10. **Auto-record loop** (Mode C with configurable delay)
11. **Session creation from app**
12. **Wire all stubbed button handlers**
13. **iPad tool detail panels** (ShellDetail, AgentDetail)

### P2 — Polish
14. **Recording timeout setting** (UI + enforcement)
15. **Error boundaries and user-facing error states**
16. **Remove music player code** (MusicPlayerBar, useMusicPlayer, state/music, fixtures)
17. **Clean up routing** (proper Expo Router usage)
18. **Deep linking support**
19. **Clean up debug code** (console.logs, type casts)

---

## File Reference

### Native App Key Files
| File | Purpose | Status |
|------|---------|--------|
| `App.tsx` | Root shell, sidebar animations | 🟡 Many stubbed handlers |
| `components/VoiceInputArea.tsx` | Mic button, text input | 🟡 UI done, all handlers stubbed |
| `components/ChatThread.tsx` | Message list | ✅ Done |
| `components/SessionContent.tsx` | Layout selector | ✅ Done |
| `components/SessionScreen.tsx` | Phone layout | ✅ Done |
| `components/SplitLayout.tsx` | iPad layout | 🟡 Tool detail placeholder |
| `components/ChangesView.tsx` | Diff file list | ✅ Done |
| `components/DiffWebView.tsx` | WebView diff viewer | ✅ Done |
| `components/SettingsScreen.tsx` | Settings UI | 🟡 Missing recording timeout |
| `components/SessionsSidebar.tsx` | Session list | ✅ Done |
| `components/ProjectsSidebar.tsx` | Project list | ✅ Done (retry stubbed) |
| `components/MusicPlayerBar.tsx` | Music player | 🗑️ Remove |
| `hooks/useSession.ts` | Session data | ✅ Done |
| `hooks/useSessionMessages.ts` | Message data | ✅ Done |
| `hooks/useChanges.ts` | File changes | ✅ Done |
| `hooks/useProjects.ts` | Project list | ✅ Done |
| `hooks/useSettings.ts` | Settings + connection | 🟡 Connection is fixture |
| `hooks/useMusicPlayer.ts` | Music player | 🗑️ Remove |
| `hooks/useLayout.ts` | iPad detection | ✅ Done |
| `hooks/useRpcTarget.ts` | Generic RPC hook | ✅ Done |
| `state/settings.ts` | Settings atoms | 🟡 No persistence |
| `state/ui.ts` | UI state atoms | ✅ Done |
| `state/music.ts` | Music atoms | 🗑️ Remove |

### Server Key Files
| File | Purpose | Status |
|------|---------|--------|
| `src/index.ts` | Server entry, routes | ✅ Done |
| `src/rpc.ts` | RPC targets | 🟡 Event wiring incomplete, audio stub |
| `src/types.ts` | Zod schemas | ✅ Done |
| `src/opencode.ts` | OpenCode SDK wrapper | 🔴 Async bug in event streaming |
| `src/diff-page/app.tsx` | Diff viewer React app | ✅ Done |
