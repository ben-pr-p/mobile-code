# Tool Call Rendering — Current State & Implementation Plan

## Overview

Tool calls flow from the OpenCode SDK through our server (which maps them to simplified `MessagePart` objects) and into the native client, where `flattenServerMessage()` converts them into `UIMessage` entries of type `tool_call`. The `ChatThread` renders each one via `ToolCallBlock`.

### Current rendering

`ToolCallBlock` (`packages/native/components/ToolCallBlock.tsx`) shows:
- A colored indicator (amber square for most tools, `>` prefix for Shell)
- The tool name label
- A pressable card with the description (which is `state.title || toolName`)

**What's missing:**
- Tool status (pending/running/completed/error) is not visually differentiated
- Tool input is never shown (file paths, commands, search queries, etc.)
- Tool output is never surfaced (it's available in `toolMeta` but ignored)
- `onToolCallPress` is a no-op on iPhone; on iPad it opens a placeholder stub
- No expand/collapse interaction exists

### Data available on each tool call

Every `UIMessage` with `type: 'tool_call'` carries:

| Field | Source | Description |
|---|---|---|
| `content` | `state.title \|\| toolName` | Human-readable title |
| `toolName` | `part.tool` | Raw tool name string |
| `toolMeta` | `part.state` (cast) | Full state: `{ status, input, output, title }` |
| `toolMeta.status` | `state.status` | `"pending"` / `"running"` / `"completed"` / `"error"` |
| `toolMeta.input` | `state.input` | Tool-specific arguments (see per-tool sections below) |
| `toolMeta.output` | `state.output` | Result string (only on completed) |

---

## Tool Calls by Type

Tool call frequency from real usage data (sorted by frequency):

| Tool | Count | Description |
|---|---|---|
| `read` | 3758 | Read file contents |
| `bash` | 2151 | Execute shell command |
| `edit` | 1047 | Edit file (find & replace) |
| `grep` | 850 | Search file contents by regex |
| `glob` | 787 | Find files by pattern |
| `todowrite` | 478 | Create/update task list |
| `write` | 150 | Write entire file |
| `task` | 142 | Launch sub-agent |
| `webfetch` | 122 | Fetch URL content |
| `apply_patch` | 109 | Apply a multi-file patch |
| `websearch` | 87 | Search the web |
| `codesearch` | 28 | Search code examples |
| `question` | 22 | Ask user a question |
| `skill` | 10 | Load a skill plugin |
| `list` | 4 | List directory contents |

---

### `read` — Read File

**Input:** `{ filePath: string, offset?: number, limit?: number }`
**Title:** The file path (e.g. `src/components/MilkdownEditor.tsx`)
**Output:** File contents with line numbers (e.g. `00001| import { useEffect...`)

**Key info for user:** File path being read.
**Collapsed view:** `[icon] Read` · `src/components/Foo.tsx`
**Expanded view:** Scrollable output showing file contents. Consider syntax highlighting.

---

### `bash` — Shell Command

**Input:** `{ command: string, description?: string }`
**Title:** The `description` field (e.g. `Check field_names table structure`)
**Output:** Command stdout/stderr

**Key info for user:** The command being run and its output.
**Collapsed view:** `> Shell` · description or truncated command
**Expanded view:** Full command in a code block, then output below. Highlight exit code or errors. This is the highest-value tool to expand since commands can produce significant output.

---

### `edit` — Edit File (Find & Replace)

**Input:** `{ filePath: string, oldString: string, newString: string, replaceAll?: boolean }`
**Title:** File path (e.g. `src/index.ts`)
**Output:** Diagnostics or empty string on success

**Key info for user:** Which file was edited and what changed.
**Collapsed view:** `[icon] Edit` · file path
**Expanded view:** Inline diff view showing `oldString` → `newString`. If output contains diagnostics/errors, show those prominently.

---

### `grep` — Search File Contents

**Input:** `{ pattern: string, path?: string, include?: string }`
**Title:** The search pattern (e.g. `UTCUpdated`)
**Output:** Matching file paths with line numbers, or `No files found`

**Key info for user:** What was searched for and the results.
**Collapsed view:** `[icon] Grep` · pattern (+ `in *.tsx` if `include` specified)
**Expanded view:** List of matching files with line numbers. Tappable file paths would be ideal but not required.

---

### `glob` — Find Files by Pattern

**Input:** `{ pattern: string, path?: string }`
**Title:** Empty string or the pattern
**Output:** List of matching file paths

**Key info for user:** The glob pattern and matching files.
**Collapsed view:** `[icon] Glob` · pattern (e.g. `src/components/ui/*.tsx`)
**Expanded view:** List of matching file paths.

---

### `todowrite` — Create/Update Task List

**Input:** `{ todos: Array<{ content, status, priority }> }`
**Title:** Count summary (e.g. `7 todos`)
**Output:** JSON array of the todos

**Key info for user:** The todo items and their statuses.
**Collapsed view:** `[icon] Todos` · `7 items` (with count of completed/pending)
**Expanded view:** Rendered list of todos with status indicators (checkmarks for completed, dots for pending, spinner for in_progress). Color-code by priority.

---

### `write` — Write Entire File

**Input:** `{ filePath: string, content: string }`
**Title:** File path (e.g. `src/components/SettingsModal.tsx`)
**Output:** Diagnostics or confirmation

**Key info for user:** Which file was created/overwritten.
**Collapsed view:** `[icon] Write` · file path
**Expanded view:** File content preview (first ~30 lines). If output has diagnostics, show those.

---

### `task` — Launch Sub-Agent

**Input:** `{ description: string, prompt: string, subagent_type: string }`
**Title:** The description (e.g. `Explore Claude SDK usage`)
**Output:** Sub-agent's response (can be very long — markdown formatted)

**Key info for user:** What the sub-agent was asked to do and its result.
**Collapsed view:** `[icon] Task` · description · `(explore)` agent type badge
**Expanded view:** The sub-agent's full markdown response, rendered with markdown formatting. These outputs tend to be long and detailed — a scrollable container is important.

---

### `webfetch` — Fetch URL

**Input:** `{ url: string, format?: "markdown" | "text" | "html" }`
**Title:** URL and content type (e.g. `https://opencode.ai/docs (text/html)`)
**Output:** Fetched page content (markdown)

**Key info for user:** The URL being fetched.
**Collapsed view:** `[icon] WebFetch` · domain name (e.g. `opencode.ai/docs`)
**Expanded view:** Rendered markdown content from the page.

---

### `apply_patch` — Apply Multi-File Patch

**Input:** `{ patchText: string }`
**Title:** Summary of affected files (e.g. `Success. Updated the following files:\nM src/index.ts`)
**Output:** Same as title — list of modified files

**Key info for user:** Which files were modified.
**Collapsed view:** `[icon] Patch` · file count (e.g. `1 file updated`)
**Expanded view:** List of affected files with their status (M/A/D). Optionally show the raw patch diff.

---

### `websearch` — Web Search

**Input:** `{ query: string, numResults?: number }`
**Title:** `Web search: <query>`
**Output:** Search results with titles, URLs, and snippets

**Key info for user:** The search query and top results.
**Collapsed view:** `[icon] Search` · query text
**Expanded view:** List of search results with clickable titles/URLs and text snippets.

---

### `codesearch` — Code Search (Exa API)

**Input:** `{ query: string, tokensNum?: number }`
**Title:** Usually empty (often errors)
**Output:** Code examples and documentation snippets

**Key info for user:** The query and resulting code examples.
**Collapsed view:** `[icon] CodeSearch` · query
**Expanded view:** Code examples with syntax highlighting.

---

### `question` — Ask User a Question

**Input:** `{ questions: string }` (JSON-encoded array of question objects)
**Title:** `Asked N question(s)`
**Output:** User's answers

**Key info for user:** The questions asked and answers given.
**Collapsed view:** `[icon] Question` · `Asked 1 question`
**Expanded view:** The question text and the user's response.

---

### `skill` — Load Skill Plugin

**Input:** `{ name: string }`
**Title:** `Loaded skill: <name>` (e.g. `Loaded skill: obsidian-markdown`)
**Output:** Skill content/instructions

**Key info for user:** Which skill was loaded.
**Collapsed view:** `[icon] Skill` · skill name
**Expanded view:** Typically not useful to expand — skill content is internal instructions. Could show a brief summary.

---

### `list` — List Directory

**Input:** `{ path: string }`
**Title:** The path (e.g. `app/database/types`)
**Output:** Directory tree listing

**Key info for user:** The directory path and its contents.
**Collapsed view:** `[icon] List` · directory path
**Expanded view:** Tree-style directory listing.

---

## Tool State Lifecycle

Each tool call transitions through states:

```
pending → running → completed
                  → error
```

| Status | Visual Treatment |
|---|---|
| `pending` | Dimmed / muted. Pulsing dot or no indicator. |
| `running` | Animated spinner or pulsing amber indicator. |
| `completed` | Green checkmark or solid indicator. |
| `error` | Red indicator. Show `state.error` message. |

The `status` field is available in `toolMeta.status` on every tool call UIMessage.

---

## UI Implementation Suggestions

### Collapsed state (default)

All tool calls should render as a single compact row:

```
[status dot] [icon] ToolName · description/title
                                              [chevron ▸]
```

- **Status dot:** Color-coded circle — gray (pending), pulsing amber (running), green (completed), red (error)
- **Icon:** Small icon per tool category (terminal for bash, file for read/edit/write, search for grep/glob, globe for web, etc.)
- **Tool name:** Bold label
- **Description:** Truncated title text in muted color
- **Chevron:** Indicates expandability

Height: ~36-40pt. Fits inline in the chat flow without breaking reading rhythm.

### Expanded state (on press)

On iPhone, expand inline (push content below down with animation). On iPad, optionally show in the left detail panel instead.

The expanded view should show:
1. **Input summary** — the key info for the tool type (command, file path, search query, etc.), formatted as a code block or key-value pairs
2. **Output** — the tool's result, in a scrollable container with a max height (~300pt), using monospace font. Syntax-highlight where appropriate.
3. **Timing** — duration if available (from `state.time.start` / `state.time.end`)
4. **Error** — if status is `error`, show `state.error` prominently in red

### Component structure

```
ToolCallBlock (existing, needs refactoring)
├── ToolCallCollapsed    — single-line summary row
├── ToolCallExpanded     — input + output detail view
│   ├── ToolCallInput    — formatted input per tool type
│   └── ToolCallOutput   — scrollable output container
```

Use `Animated` height transition (Reanimated's `useAnimatedStyle` + `withTiming`) for smooth expand/collapse.

### iPad behavior

On iPad (`SplitLayout`), pressing a tool call currently sets `leftPanel` to `{ type: 'tool-detail', messageId }` which shows a placeholder. This should render the full expanded view in the left panel instead of inline expansion. The `messageId` is already being passed — the left panel just needs the actual component.

### Priority order for implementation

1. **bash** — highest value, users want to see commands and their output
2. **edit / write / apply_patch** — file modification tools, users want to verify changes
3. **read** — very frequent, but output is usually not interesting to the user
4. **grep / glob** — search results are useful context
5. **task** — sub-agent results can be very informative
6. **todowrite** — visual todo list would be a nice touch
7. **websearch / webfetch** — web results
8. **question / skill / codesearch / list** — lower frequency, lower priority
