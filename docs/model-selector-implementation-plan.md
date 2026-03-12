# Model Selector Implementation Plan (Issue #10)

## Context

The opencode SDK treats model selection as a **per-message** concept, not per-session. The `Session` type has no model field. Instead:

- `session.promptAsync()` accepts an optional `model: { providerID, modelID }` in the body
- `UserMessage` carries `model: { providerID, modelID }`
- `AssistantMessage` carries flat `modelID` and `providerID` fields

The raw SSE `message.updated` events from opencode already carry model info, but our server's `StateStream.messageUpdated()` and `mapMessage()` currently **strip it out** before emitting to the durable stream. The native client never sees it.

## Plan

### 1. Server: Carry model info on messages through the pipeline

- Add `modelID` and `providerID` fields to the `Message` interface in `types.ts`
- Update `mapMessage()` in `opencode.ts` to extract model info, handling the asymmetry:
  - User messages: nested `info.model.providerID` / `info.model.modelID`
  - Assistant messages: flat `info.modelID` / `info.providerID`
- Update `StateStream.messageUpdated()` in `state-stream.ts` to preserve these fields on both create and update paths

This is the critical piece. Once model info flows through the durable stream, the native client reactively picks up model changes from any client (CLI, web, etc.) because it's already subscribed to message updates via TanStack DB.

### 2. Server: Add provider/model listing endpoint

- Add `GET /api/models` that calls `client.provider.list()`
- Return connected providers, their models (name, capabilities, cost, status), and current defaults
- The client needs this catalog to populate the picker and to map raw `modelID` values to human-readable display names

### 3. Server: Accept and forward model in prompt requests

- Extend `PromptPartsSchema` to accept optional `model: { providerID: string, modelID: string }`
- Pass it through `sendPrompt()` to `client.session.promptAsync()` body
- Same change for the create-session-and-prompt endpoint (`POST /api/projects/:projectId/sessions`)
- If no model is provided, opencode uses its configured default (preserves current behavior)

### 4. Native: Derive session model from messages (reactive)

- Since messages now carry model info, derive the "current session model" from the most recent user message's `modelID`/`providerID`
- This is a reactive query on the TanStack DB messages collection
- Cross-client sync works automatically: if another client sends a prompt with a different model, the `message.updated` SSE event carries the new model, flows through the durable stream, updates TanStack DB, and the UI re-renders

### 5. Native: State management for user's preferred model

- Add a Jotai atom for `selectedModel: { providerID, modelID } | null` persisted via AsyncStorage
- This represents the user's preference for the next prompt they send
- When the user opens a session, initialize from the session's latest message model (step 4)
- Add an atom for the fetched provider/model catalog (from step 2), used to map IDs to display names

### 6. Native: Model picker bottom sheet

- Create a `ModelSelectorSheet` component (bottom sheet)
- Sections grouped by connected provider, listing their available models
- Shows current selection with a checkmark
- Tapping a model updates the `selectedModel` atom and dismisses the sheet
- Wire `onPress` handlers on the provider and model `Pressable` elements in `VoiceInputArea.tsx`

### 7. Native: Display real model/provider names

- Replace all hardcoded `modelName="Sonnet"` / `providerName="Build"` in `SessionScreen.tsx`, `SplitLayout.tsx`, `SessionContent.tsx`, and `EmptySession.tsx`
- For active sessions: look up `modelID`/`providerID` from the latest message (step 4) against the catalog (step 2) to get display names
- For new/empty sessions: use the user's preferred model or the server default from the catalog

### 8. Native: Send model with prompts

- When sending a prompt, include the `selectedModel` in the API call body
- If the user hasn't explicitly chosen a model (atom is null), omit it so the server uses opencode's default

### 9. Settings screen

- Make the "Default model" row in `SettingsScreen.tsx` tappable, opening the same model picker from step 6

## Cross-client model change flow

1. Another client sends a prompt with `model: { providerID: "anthropic", modelID: "claude-sonnet-4-20250514" }`
2. Opencode emits `message.updated` SSE event with that model info
3. Our server's `handleOpencodeEvent` → `StateStream.messageUpdated()` preserves `modelID`/`providerID`
4. Durable stream pushes the updated message to connected native clients
5. TanStack DB updates the messages collection
6. The derived "current session model" reactively updates
7. The UI shows the new model name — no special handling needed
