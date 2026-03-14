# Agent & Command Selector

## Overview

Hook up the bottom-left button in the voice input area (currently a hardcoded "Build" label) to an agent and command selector sheet — mirroring how the bottom-right button opens the model selector. The selector lets users pick an agent or queue a command before sending their next message.

### Behavior Summary

1. The bottom-left button displays the **current agent name** (e.g. "Build").
2. Tapping it opens a bottom sheet with two sections: **Commands** (above) and **Agents** (below), each with a section subheader.
3. **Selecting an agent** switches the active agent for the session. The button label updates to reflect the new agent. Subsequent messages are sent with that agent.
4. **Selecting a command** stages it for the next message. A dismissible badge appears to the left of the text input showing the queued command name. The next voice or text message is sent as that command's execution (with the user's message as the command arguments). After sending, the badge clears and the selector returns to normal agent display.
5. The badge has an "x" to cancel the queued command without sending.

---

## Data Flow

### Current (Model Selector) — Pattern to Replicate

```
Server: GET /api/models → client.provider.list()
Native: useModels() hook → fetches on connect, stores in Jotai atoms
Native: ModelSelectorSheet → bottom sheet with sections + search
Native: SessionView → modelOverride state, passes effective model to sendPrompt
Server: sendPrompt() → client.session.promptAsync({ body: { model } })
```

### New (Agent & Command Selector)

```
Server: GET /api/agents   → client.app.agents()
Server: GET /api/commands → client.command.list()
Native: useAgents() hook  → fetches on connect, stores in Jotai atoms
Native: useCommands() hook → fetches on connect, stores in Jotai atoms
Native: AgentCommandSheet → bottom sheet with Commands + Agents sections
Native: SessionView → agentOverride state + pendingCommand state
Server: sendPrompt() → client.session.promptAsync({ body: { agent } })
Server: POST /api/sessions/:id/command → client.session.command({ body: { command, arguments } })
```

---

## Implementation Plan

### 1. Server: Add agent and command endpoints

**File: `packages/server/src/app.ts`**

Add two new GET endpoints to the `api` Hono chain, following the pattern of `GET /models` (line 360):

```typescript
// List available agents
.get("/agents", async (c) => {
  const res = await client.app.agents()
  if (res.error) return c.json({ error: "Failed to list agents" }, 500)
  return c.json(res.data)
})

// List available commands
.get("/commands", async (c) => {
  const res = await client.command.list()
  if (res.error) return c.json({ error: "Failed to list commands" }, 500)
  return c.json(res.data)
})
```

### 2. Server: Add command execution endpoint

**File: `packages/server/src/app.ts`**

Add a POST endpoint for executing commands. Unlike `sendPrompt`, commands use `client.session.command()` which is a separate SDK method:

```typescript
.post(
  "/sessions/:sessionId/command",
  zValidator("json", z.object({
    command: z.string(),
    arguments: z.string(),
    agent: z.string().optional(),
    model: z.object({
      providerID: z.string(),
      modelID: z.string(),
    }).optional(),
  })),
  async (c) => {
    const sessionId = c.req.param("sessionId")
    const { command, arguments: args, agent, model } = c.req.valid("json")
    const sessionRes = await client.session.get({ path: { id: sessionId } })
    const directory = (sessionRes.data as any)?.directory as string | undefined
    const res = await client.session.command({
      path: { id: sessionId },
      body: { command, arguments: args, ...(agent ? { agent } : {}), ...(model ? { model: `${model.providerID}/${model.modelID}` } : {}) },
      query: { directory },
    })
    if (res.error) return c.json({ error: "Command failed" }, 500)
    return c.json({ success: true })
  },
)
```

### 3. Server: Pass agent through sendPrompt

**File: `packages/server/src/prompt.ts`**

Add `agent?: string` parameter to `sendPrompt()` and include it in the `promptAsync` body. The SDK already accepts `agent?: string` in the body — the server just doesn't forward it yet.

```typescript
export async function sendPrompt(
  client: OpencodeClient,
  sessionId: string,
  parts: PromptPartInput[],
  directory?: string,
  model?: { providerID: string; modelID: string },
  agent?: string,  // NEW
): Promise<void> {
  // ... existing logic ...
  const res = await client.session.promptAsync({
    path: { id: sessionId },
    body: {
      parts: textParts,
      tools: { question: false },
      ...(model ? { model } : {}),
      ...(agent ? { agent } : {}),  // NEW
    },
    query: { directory },
  })
}
```

**File: `packages/server/src/app.ts`**

Update `PromptPartsSchema` to accept `agent`:

```typescript
const PromptPartsSchema = z.object({
  parts: z.array(/* ... existing ... */),
  model: z.object({ providerID: z.string(), modelID: z.string() }).optional(),
  agent: z.string().optional(),  // NEW
})
```

Update the prompt route handler (line 128) to pass `agent` through:

```typescript
const { parts, model, agent } = c.req.valid("json")
await sendPrompt(client, sessionId, parts, directory, model, agent)
```

And similarly for the create-session route (line 152).

### 4. Native: Agent and command state atoms

**File: `packages/native/state/settings.ts`** (add to existing file)

Define types and atoms for agents and commands, mirroring the model pattern:

```typescript
/** Agent from the OpenCode server. */
export type AgentInfo = {
  name: string
  description?: string
  mode: "subagent" | "primary" | "all"
  color?: string
}

/** Command from the OpenCode server. */
export type CommandInfo = {
  name: string
  description?: string
  agent?: string
  template: string
}

/** A pending command queued for the next message. */
export type PendingCommand = {
  name: string
  description?: string
}

export const agentCatalogAtom = atom<AgentInfo[] | null>(null)
export const commandCatalogAtom = atom<CommandInfo[] | null>(null)
```

### 5. Native: useAgents and useCommands hooks

**File: `packages/native/hooks/useAgents.ts`** (new file)

Pattern matches `useModels.ts`. Fetches from `GET /api/agents` when the connection status transitions to `'connected'`. Exposes:

- `agents: AgentInfo[] | null` — full list
- `primaryAgents` — filtered to `mode === 'primary'` (for the selector)
- `refetchAgents()`

**File: `packages/native/hooks/useCommands.ts`** (new file)

Same pattern. Fetches from `GET /api/commands`. Exposes:

- `commands: CommandInfo[] | null`
- `refetchCommands()`

### 6. Native: AgentCommandSheet component

**File: `packages/native/components/AgentCommandSheet.tsx`** (new file)

A bottom sheet matching `ModelSelectorSheet`'s visual style and animation pattern (Modal + Animated slide-up + backdrop). Layout:

```
┌─────────────────────────────────┐
│          ── handle ──           │
│  Select Agent or Command        │
│                                 │
│  COMMANDS                       │  ← SectionLabel
│  ┌─────────────────────────┐    │
│  │ test                    │    │  ← CommandRow
│  │ Run tests with coverage │    │    (name + description)
│  ├─────────────────────────┤    │
│  │ review                  │    │
│  │ Review code changes     │    │
│  └─────────────────────────┘    │
│                                 │
│  ─────────── divider ────────── │
│                                 │
│  AGENTS                         │  ← SectionLabel
│  ┌─────────────────────────┐    │
│  │ Build              ✓    │    │  ← AgentRow (check = current)
│  │ Default build agent     │    │
│  ├─────────────────────────┤    │
│  │ Plan                    │    │
│  │ Planning without changes│    │
│  └─────────────────────────┘    │
│                                 │
│  ┌─ 🔍 Search... ──────────┐   │  ← pinned search bar
│  └──────────────────────────┘   │
└─────────────────────────────────┘
```

Props:

```typescript
interface AgentCommandSheetProps {
  visible: boolean
  onClose: () => void
  agents: AgentInfo[] | null
  commands: CommandInfo[] | null
  currentAgent: string  // e.g. "build"
  onSelectAgent: (agentName: string) => void
  onSelectCommand: (command: PendingCommand) => void
}
```

Key behaviors:
- **Commands section** renders above Agents section.
- Both sections use the same `SectionLabel` sub-component pattern from `ModelSelectorSheet`.
- Selecting a command calls `onSelectCommand` and closes the sheet.
- Selecting an agent calls `onSelectAgent` and closes the sheet. The currently active agent shows a check mark.
- Search bar at the bottom filters both commands and agents.
- Only show agents with `mode === 'primary'` in the Agents section (subagents are invoked by the model, not by the user from this selector).

### 7. Native: Command badge in VoiceInputArea

**File: `packages/native/components/VoiceInputArea.tsx`**

Add props for the pending command and agent:

```typescript
interface VoiceInputAreaProps {
  // ... existing props ...
  agentName: string           // NEW — replaces hardcoded "Build"
  onAgentPress?: () => void   // NEW — opens the sheet
  pendingCommand?: PendingCommand | null  // NEW
  onClearCommand?: () => void // NEW — dismiss the badge
}
```

Update the bottom-left button (lines 107-114):
- Display `agentName` instead of hardcoded "Build"
- Wire `onPress={onAgentPress}`

Add the command badge inside the text input container (line 61), before the `TextInput`. When `pendingCommand` is set, render a pill badge:

```tsx
{pendingCommand && (
  <View className="flex-row items-center bg-amber-500/15 rounded-md px-2 py-1 gap-1 self-end mb-0.5">
    <Text
      className="text-[10px] font-semibold text-amber-600 dark:text-amber-400"
      style={{ fontFamily: 'JetBrains Mono' }}
    >
      /{pendingCommand.name}
    </Text>
    <Pressable onPress={onClearCommand} hitSlop={8}>
      <Text className="text-[10px] text-amber-600 dark:text-amber-400">✕</Text>
    </Pressable>
  </View>
)}
```

This renders as a small amber pill like `/ test ✕` to the left of the text input, visually indicating the command is queued.

### 8. Native: Wire into SessionView

**File: `packages/native/components/SessionContent.tsx`**

Add state and handlers in `SessionView`:

```typescript
// Agent & command state
const [agentOverride, setAgentOverride] = useState<string | null>(null)
const [pendingCommand, setPendingCommand] = useState<PendingCommand | null>(null)
const [agentCommandSheetVisible, setAgentCommandSheetVisible] = useState(false)

const { agents } = useAgents()
const { commands } = useCommands()

// Effective agent: user override > session default > "build"
const effectiveAgent = agentOverride ?? 'build'

// Agent display name (capitalize first letter)
const agentDisplayName = useMemo(() => {
  const agent = agents?.find(a => a.name === effectiveAgent)
  return agent?.name ?? effectiveAgent
}, [agents, effectiveAgent])
```

Update `handleSend` to handle pending commands:

```typescript
const handleSend = useCallback(async (text: string) => {
  setIsSending(true)
  try {
    if (pendingCommand) {
      // Execute as a command — text becomes the arguments
      await onExecuteCommand(pendingCommand.name, text, effectiveModel)
      setPendingCommand(null)
    } else {
      await onSendText(text, effectiveModel, effectiveAgent)
    }
  } finally {
    setIsSending(false)
  }
}, [onSendText, onExecuteCommand, effectiveModel, effectiveAgent, pendingCommand])
```

Similarly update `handleSendAudio` — if a command is pending, transcription happens first (server-side) then the transcribed text is used as command arguments.

**Note on voice + command:** When a command is pending and the user sends audio, the server needs to transcribe first, then execute the command with the transcription as arguments. This requires a new server endpoint or a two-step flow. Simplest approach: add a `/sessions/:id/command-with-audio` endpoint that transcribes then executes, or have the client transcribe first. For v1, we can disable voice input while a command is pending (show a hint to type instead), and add voice support in a follow-up.

Pass new props through to `VoiceInputArea`:

```typescript
<VoiceInputArea
  // ... existing props ...
  agentName={agentDisplayName}
  onAgentPress={() => setAgentCommandSheetVisible(true)}
  pendingCommand={pendingCommand}
  onClearCommand={() => setPendingCommand(null)}
/>
```

Render the `AgentCommandSheet` as a sibling, same as `ModelSelectorSheet`:

```typescript
<AgentCommandSheet
  visible={agentCommandSheetVisible}
  onClose={() => setAgentCommandSheetVisible(false)}
  agents={agents}
  commands={commands}
  currentAgent={effectiveAgent}
  onSelectAgent={(name) => setAgentOverride(name)}
  onSelectCommand={(cmd) => setPendingCommand(cmd)}
/>
```

### 9. Native: Update SessionViewProps and callbacks

**File: `packages/native/components/SessionContent.tsx`**

Update `SessionViewProps` to add:

```typescript
onSendText: (text: string, model: ModelSelection | null, agent?: string) => Promise<void>
onExecuteCommand: (command: string, args: string, model: ModelSelection | null) => Promise<void>
```

In `ExistingSessionDataLoader`, update `handleSendText` to pass agent:

```typescript
const handleSendText = useCallback(
  async (text: string, model: ModelSelection | null, agent?: string) => {
    await api.api.sessions[':sessionId'].prompt.$post({
      param: { sessionId },
      json: {
        parts: [{ type: 'text', text }],
        ...(model ? { model } : {}),
        ...(agent ? { agent } : {}),
      },
    })
  },
  [api, sessionId]
)
```

Add `handleExecuteCommand`:

```typescript
const handleExecuteCommand = useCallback(
  async (command: string, args: string, model: ModelSelection | null) => {
    await api.api.sessions[':sessionId'].command.$post({
      param: { sessionId },
      json: {
        command,
        arguments: args,
        ...(model ? { model } : {}),
      },
    })
  },
  [api, sessionId]
)
```

Similarly for `NewSessionContent` — commands on a new session would need to create the session first, then execute the command. For v1, we can disable the command selector when on the new-session view (no session exists yet to execute a command against).

### 10. Prop threading through SessionScreen and SplitLayout

The new props (`agentName`, `onAgentPress`, `pendingCommand`, `onClearCommand`) need to be threaded through `SessionScreen` and `SplitLayout` down to `VoiceInputArea`, same as `modelName` and `onModelPress` are today.

**Files to update:**
- `packages/native/components/SessionScreen.tsx` — add props, pass to `VoiceInputArea`
- `packages/native/components/SplitLayout.tsx` — add props, pass to `VoiceInputArea`

---

## Edge Cases & Decisions

| Case | Decision |
|------|----------|
| Voice message with pending command | v1: Disable mic button while command is pending. Show hint "Type command arguments". Follow-up: server-side transcribe-then-command endpoint. |
| Command on new session | v1: Hide commands in the selector when on the new-session view (no session to target). |
| Agent persistence | Agent override is per-session-view instance (same as model override). Not persisted globally or to the server. |
| Command with no arguments | If the user taps send with empty text while a command is pending, send `arguments: ""`. The command template may not need arguments. |
| Subagents in selector | Only show `mode: 'primary'` agents. Subagents are invoked by the model via the Task tool, not selected by the user here. |
| Agent from command config | When a command specifies `agent`, use it. The command's configured agent takes precedence — don't also send the user's agent override for command execution. |

---

## File Change Summary

| File | Change |
|------|--------|
| `packages/server/src/app.ts` | Add `GET /agents`, `GET /commands`, `POST /sessions/:id/command` endpoints. Add `agent` to `PromptPartsSchema`. Pass agent through prompt routes. |
| `packages/server/src/prompt.ts` | Add `agent?: string` param, include in `promptAsync` body. |
| `packages/native/state/settings.ts` | Add `AgentInfo`, `CommandInfo`, `PendingCommand` types and Jotai atoms. |
| `packages/native/hooks/useAgents.ts` | New file. Fetch and cache agents from server. |
| `packages/native/hooks/useCommands.ts` | New file. Fetch and cache commands from server. |
| `packages/native/components/AgentCommandSheet.tsx` | New file. Bottom sheet with Commands + Agents sections. |
| `packages/native/components/VoiceInputArea.tsx` | Add `agentName`, `onAgentPress`, `pendingCommand`, `onClearCommand` props. Replace hardcoded "Build". Add command badge. |
| `packages/native/components/SessionContent.tsx` | Add agent/command state, wire hooks, update send handlers, render sheet. |
| `packages/native/components/SessionScreen.tsx` | Thread new props to `VoiceInputArea`. |
| `packages/native/components/SplitLayout.tsx` | Thread new props to `VoiceInputArea`. |
