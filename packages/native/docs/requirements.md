# opencode-rn — Product Requirements

A React Native mobile client for [opencode](https://github.com/sst/opencode), the AI coding agent. The app provides a voice-first interface for interacting with the opencode agent while coding, designed for use away from the keyboard (e.g. walking, commuting, with headphones).

---

## Screens

### 1. Left Sidebar — Sessions

A slide-in panel from the left edge. Lists all past and active sessions.

**Header**
- Hamburger menu icon (left) — opens this sidebar
- Title: "Sessions"
- `+` button (right) — creates a new session

**Search**
- Text input: placeholder "search sessions"

**Sessions List**
- Each row shows:
  - Status dot (green = active, grey = idle)
  - Session name (derived from first message or git branch context)
  - Project name + relative timestamp (e.g. `opencode-rn · 2m ago`)
  - `···` overflow menu on the active/hovered row
- Section divider: "EARLIER" groups older sessions

**Bottom Bar**
- Settings icon (left)
- Mic button (center, teal, prominent)
- Help/info icon (right)

---

### 2. Main Session

The primary screen. Shows the active session's chat and voice input.

**Header**
- Hamburger icon (left) — opens Sessions sidebar
- Session/project indicator: green dot + project name (e.g. `opencode-rn`)
- Folder/project icon (right) — opens Projects sidebar

**Session Info Bar**
- Branch name + relative time (e.g. `Pull from main · 2m ago`)

**Tabs**
- `Session` | `Changes`
- `Session` tab: shows the AI conversation thread
- `Changes` tab: shows a diff view of files changed in the current session

**Chat Area**
- Tool calls shown as collapsible blocks (e.g. `> Shell`, `> Explore Agent`)
- Tool output shown inline (truncated with expand)
- Agent status shown inline: `Thinking ···`, `Analyzing test files ···`, `Done`
- User voice messages appear as chat bubbles with a mic icon
- Agent replies appear as chat bubbles

**Voice Input Area** (bottom)
- Text input: placeholder "Ask anything..."
- `+` attachment button
- Stop/interrupt button (square icon)
- Mic button (teal, centered, large)
- Model selector (bottom-left, e.g. `Bun↓`)
- Model name (bottom-right, e.g. `Sonnet↓`)
- Hint label below mic (changes per mode): e.g. `hold to record · tap for hands-free`

---

### 3. Right Sidebar — Projects

A slide-in panel from the right edge. Lists all projects.

**Header**
- `×` close button (left)
- Title: "Projects"
- `+` new project button (right)

**Projects List**
- Each project card shows:
  - Colored avatar with initial letter
  - Project name
  - Filesystem path (e.g. `~/projects/opencode-rn`)
  - Session count + active badge (e.g. `3 sessions · 1 active`)
  - `+ New session` button (shown on the active/selected project)
  - `···` overflow menu

**Right Sidebar — Projects (Many)**
- When there are many projects (8+), a search bar appears at the top: placeholder "search projects"
- List scrolls; projects not visible are clipped

**Spotify / Music Player** (bottom of sidebar)
- Album art thumbnail
- Track name + artist
- Playback controls: previous, play/pause, next
- Progress bar with timestamps
- Heart/like button

---

### 4. Settings Screen

Accessed via the gear icon in the Sessions sidebar bottom bar.

**Header**
- Back arrow (left)
- Title: "Settings"

**SERVER section**
- `Server URL` — text input showing the current API endpoint (e.g. `https://api.opencode.dev`)
- Connection status indicator: `● Connected · 42ms latency`

**VOICE MODE section**
- `Hands-free auto-record` — toggle switch (default: ON)
  - Description: "Auto-record when agent finishes"
  - When enabled, shows behavior summary:
    - Pauses music when agent finishes responding
    - Plays a beep to notify you
    - Automatically starts recording your response
- `Notification sound` — dropdown selector (default: `Chime (default)`)
- `Recording timeout` — dropdown selector (default: `60 seconds`)

**ABOUT section**
- Version (e.g. `6.4.2-beta`)
- Default model (e.g. `claude-opus-4-6`)

---

## Voice Input Modes

There are three voice input modes, each triggered differently via the central mic button.

---

### Mode A: Hold to Record

Press and hold the mic button to record. Release to send.

| Step | State | Description |
|------|-------|-------------|
| 1 | **IDLE** | Default state. Mic button is teal. Hint: `hold to record · tap for hands-free` |
| 2 | **PRESSING** | Finger down. Button scales up with a glow effect. |
| 3 | **RECORDING** | Held >300ms. Timer (e.g. `0:03`) appears above button. Red animated waveform shown. Hint: `release to send` |
| 4 | **RELEASE → SEND** | Finger up. Transcription appears in text input (e.g. `add a dark mode toggle to settings`). Status: `✓ transcribed — sending...`. Message is sent automatically. |
| 5 | **OFFLINE QUEUED** | No connection. Orange "Offline" banner at top. Voice message shown as queued bubble: `queued · will transcribe when online`. Text messages shown as: `queued · will send when online`. Footer: `2 messages queued — will send when connected` |

---

### Mode B: Hands-Free

A quick tap (<300ms) enters hands-free recording mode. The user can navigate freely while recording, then tap again to send.

| Step | State | Description |
|------|-------|-------------|
| 1 | **TAP** | Quick tap. Hint: `quick tap → hands-free mode` |
| 2 | **RECORDING** | Red banner at top: `● Recording · 0:05` with `navigate freely` label. Waveform shown above mic. Hint: `Listening · 0:05` |
| 3 | **NAVIGATING** | User can scroll the session, switch to the Changes tab, view diffs — all while still recording. Banner remains visible. |
| 4 | **TAP → SEND** | Tap mic to stop and send. Changes tab shows diff view. Mic becomes a send arrow. Hint: `tap to send` |
| 5 | **OFFLINE QUEUED** | Same queued behavior as Hold flow. Orange mic icon. Footer: `2 messages queued — will send when connected` |

---

### Mode C: Hands-Free Auto-Record

Enabled via Settings toggle. Creates a fully automated voice loop: send a message → agent works → beep → auto-record → send → repeat. Designed for heads-down / headphone use.

| Step | State | Description |
|------|-------|-------------|
| 1 | **MESSAGE SENT** | User spoke (via hold or hands-free). Agent starts working. Footer banner: `Hands-free mode — listening when agent finishes` |
| 2 | **AGENT WORKING + MUSIC** | Music begins playing in the bottom bar (e.g. `Neon Lights — Daft Punk`). Footer: `Waiting for agent to finish...` Agent tool calls stream in chat. |
| 3 | **DONE → BEEP** | Agent finishes. `Done` badge shown. Music pauses. System plays beep sound. Banner: `Agent finished · beep! Auto-recording in 1s...` Footer: `Starting recording...` |
| 4 | **AUTO-RECORDING** | Mic activates automatically. Timer + waveform shown (e.g. `0:04`). Hint: `auto-recording — tap to send` |
| 5 | **SENT → LOOP** | User's next instruction transcribed and sent. Music resumes. Agent begins working again. Loop repeats. Footer: `Waiting for agent to finish... · cycle continues automatically` |

---

## Chat Message Types

| Type | Appearance |
|------|-----------|
| User text message | Right-aligned bubble |
| User voice message | Bubble with mic icon, shows transcription |
| Agent reply | Left-aligned bubble |
| Tool call block | Collapsible row with `>` prefix and tool name (e.g. `> Shell`, `> Explore Agent`) |
| Tool output | Indented text inside expanded block |
| Agent status | Inline colored label: `Thinking ···`, `Analyzing test files ···`, `Done` (green) |
| Queued message (offline) | Bubble with clock icon + `queued · will send when online` |
| Queued voice (offline) | Bubble with waveform icon + `queued · will transcribe when online` |

---

## Offline Behavior

- When network is unavailable:
  - Orange "Offline" banner appears below the header: `Offline — Messages will send when connected`
  - Voice recordings are queued with a waveform icon: `queued · will transcribe when online`
  - Text messages are queued: `queued · will send when online`
  - Dismiss (`×`) button on each queued message
  - Footer shows queue count: `N messages queued — will send when connected`
  - Mic icon turns orange
- When reconnected, all queued messages are sent in order and transcriptions are resolved

---

## Changes Tab (Diff View)

Shown when the user taps the `Changes` tab in the Main Session screen.

- Header shows number of changed files (e.g. `2 files changed`)
- Each changed file shows:
  - Filename and path
  - Green `+` lines for additions
  - Red `-` lines (implied) for deletions
- Diff is syntax-aware (code formatting preserved)

---

## Navigation

- **Swipe left** from the left edge → opens Sessions sidebar
- **Swipe right** from the right edge → opens Projects sidebar
- Back arrow in Settings → returns to previous screen
- `×` in Projects sidebar → closes sidebar

---

## Design Tokens

| Token | Usage |
|-------|-------|
| `$bg-primary` | Screen backgrounds, input area |
| `$text-primary` | Primary labels |
| `$text-tertiary` | Subtitles, timestamps, hints |
| `$accent` | Teal — mic button, active states, arrows |
| `$divider` | Separator lines |
| `#EF4444` | Red — recording state, waveform |
| `#4ADE80` | Green — send/success state |
| `#F59E0B` | Amber/orange — offline state |

---

---

## iPad Layout (Landscape)

On iPad Mini (and larger iPads) in landscape orientation, the app switches to a persistent split-pane layout. Sessions and Projects remain slide-in sidebar overlays (like iPhone), while the left panel shows contextual content (changes, tool details, settings).

### Overall Layout

```
┌─────────────────────┬──────────────────────────┐
│   Left Panel        │   Right Panel (Chat)      │
│   (contextual)      │                           │
│                     │   Session / Changes tabs  │
│                     │   Chat thread             │
│                     │                           │
│                     │   Voice Input Area        │
└─────────────────────┴──────────────────────────┘
```

- **Left panel**: ~50% width. Shows contextual content: diff view, tool detail, or Settings.
- **Right panel**: ~50% width. Always shows the active chat session (Session tab + Changes tab) and the voice input area.
- **Global header**: Spans full width. Left: hamburger menu icon + project name (`opencode-rn`). Right: notification bell icon + settings gear icon.
- **Subheader bar**: Below header, shows branch + timestamp (e.g. `Pull from main · 2m ago`) and a close/collapse button (`×`) for the left panel.

### Sidebar Overlays (iPad)

Sessions and Projects appear as slide-in sidebar overlays on iPad, just like on iPhone. They float over the split-pane layout.

| Sidebar | Trigger | Position |
|---------|---------|----------|
| **Sessions** | Tap hamburger menu | Overlays left panel from the left edge |
| **Projects** | Tap projects icon | Overlays from the right edge |

#### Sessions Sidebar (overlay)
- Search bar: `search · projects` placeholder
- Session rows identical to iPhone sidebar: status dot, name, project path, timestamp, `···` menu
- `+` new session button at bottom
- `×` close button to dismiss

#### Projects Sidebar (overlay)
- Same project list as iPhone Projects sidebar
- Spotify player at bottom
- `×` close button to dismiss

### Left Panel States

| Left Panel Content | Trigger |
|--------------------|---------|
| **Changes (diff view)** | Default / after sending a message |
| **Shell tool detail** | Tap a Shell tool call in chat |
| **Agent tool detail** | Tap an Explore Agent tool call in chat |
| **Settings** | Tap gear icon |

#### Changes / Diff View (left panel)
- Header: `N files changed`
- File diffs listed with filename, path, and syntax-highlighted `+`/`-` lines
- This is the default left panel state when a session is active

#### Shell Tool Detail (left panel)
- Header: tool name (e.g. `Shell`)
- `COMMAND` section: shows the executed command (e.g. `git pull origin main`)
- `OUTPUT` section: shows stdout/stderr
- `EXIT CODE`, `DURATION`, `DIRECTORY` table row at the bottom

#### Agent Tool Detail (left panel)
- Header: tool name (e.g. `Explore Agent`)
- `TASK` section: shows the agent's task description
- `STATUS` + `DURATION`: e.g. `● Running · 4.2s`
- `FILES EXPLORED`: list of file paths the agent has read
- `FINDING`: summary paragraph of what the agent discovered

#### Settings (left panel)
- Same content as iPhone Settings screen
- Right panel remains live with active chat

### Right Panel

Always visible. Identical in structure to the iPhone Main Session screen:
- Session Info bar (branch + time)
- `Session` | `Changes` tabs
- Chat area (tool calls, agent status, message bubbles)
- Voice input area (text field, `+`, stop button, mic button, model selectors)

On iPad, the `Changes` tab in the right panel navigates the **left panel** to the diff view — the right panel stays on the chat thread.

---

## iPad Voice Flows

The voice input mechanics are identical to iPhone, but the waveform and recording controls appear **centered at the bottom of the right panel** (not full-width). The left panel remains visible and interactive throughout all voice states.

### Hold Flow (iPad)

| Step | State | Visual difference from iPhone |
|------|-------|-------------------------------|
| 1 | **IDLE** | Mic centered bottom-right. Hint: `hold to record · tap for hands-free` |
| 2 | **PRESSING** | Mic scales up with glow. Left panel unchanged. |
| 3 | **RECORDING** | Timer `0:03` + red waveform above mic, bottom-center of right panel. Hint: `release to send` |
| 4 | **RELEASE → SEND** | Transcription appears in text input. Status: `✓ transcribed — sending...` |
| 5 | **OFFLINE QUEUED** | Orange "Offline" banner spans right panel header only. Queued bubbles in chat. Footer in right panel: `2 messages queued — will send when connected` |

### Hands-Free Flow (iPad)

| Step | State | Visual difference from iPhone |
|------|-------|-------------------------------|
| 1 | **TAP** | Hint: `quick tap → hands-free mode` |
| 2 | **RECORDING** | Waveform above mic, bottom-center of right panel. Hint: `Listening · 0:05 · tap to pause · tap again to send` |
| 3 | **LIVE TRANSCRIPT** | `LIVE TRANSCRIPT` label appears above waveform in right panel with rolling transcription text (e.g. `Can you refactor the authentication module to use the most token-based...`). Left panel content remains fully visible. Hint: `listening · 0:12 · tap to send · tap mic to change tracks on left` |
| 4 | **TAP → SEND** | Transcribed text fills input field. Mic becomes teal send arrow. Hint: `tap to send` |
| 5 | **OFFLINE QUEUED** | Same as Hold offline state. Left panel shows diff view. |

> **iPad-specific:** In hands-free step 3, the hint reads `tap mic to — changes visible on left`, acknowledging that the diff/changes panel is always visible on the left without needing to switch tabs.

### Auto-Record Flow (iPad)

| Step | State | Visual difference from iPhone |
|------|-------|-------------------------------|
| 1 | **MESSAGE SENT** | Footer banner in right panel: `Hands-free mode — listening when agent finishes` |
| 2 | **AGENT WORKING + MUSIC** | Music bar spans full width of right panel bottom. Agent tool calls stream in chat. Footer: `Waiting for agent to finish...` |
| 3 | **DONE → BEEP** | Agent reply visible in right chat. Banner: `Agent finished — ready to listen`. Music pauses (shown as paused in bar). Footer: `Start Listening...` |
| 4 | **AUTO-RECORDING** | Timer `0:04` + waveform above mic in right panel. Hint: `auto-recording — tap to send` |
| 5 | **SENT → LOOP** | New user message + agent reply visible in chat. Music resumes. Footer: `Waiting for agent to finish... · cycle continues automatically` |

---

## Technical Notes

- Agent: opencode (SST) — communicates via `Server URL` configured in Settings
- Default model: `claude-opus-4-6` (configurable)
- Voice transcription happens client-side or deferred when offline
- Music playback is Spotify-integrated (shown in Projects sidebar)
- Recording timeout is configurable (default 60 seconds)
- App version shown in Settings (`6.4.2-beta` in designs)
