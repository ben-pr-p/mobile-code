---
name: scaffold-screen
description: Scaffold a new screen or component with pixel-perfect design, dummy data, and clean architecture. Use when building new screens, components, or UI features for the native app.
argument-hint: [screen-or-component-name]
---

# Scaffold Screen / Component

Build `$ARGUMENTS` for the native app using an autonomous design loop that converges on pixel-perfect output with clean, testable architecture.

## Phase 1: Gather Context

1. **Read the architecture doc** at `packages/native/docs/client-side-architecture.md`. Understand the state management strategy (Expo Router for navigation, TanStack DB for server data, Jotai for local state) and the layer boundaries (screen > presentational > hooks > state > services).

2. **Read the requirements** at `packages/native/docs/requirements.md`. Find the section describing `$ARGUMENTS` and understand every detail — layout, states, interactions, offline behavior.

3. **Get design screenshots from Pencil**. Use the frame IDs listed in `packages/native/AGENTS.md` under "Key frames":
   - Open the relevant `.pen` file: `get_editor_state()` or `open_document(filePath)`
   - Get screenshots of all relevant frames: `get_screenshot(filePath, nodeId)`
   - For `$ARGUMENTS`, get BOTH iPhone and iPad variants
   - Get screenshots of all states (idle, recording, offline, etc.) if the component has multiple states
   - Study spacing, font sizes, colors, alignment, and hierarchy carefully

4. **Check existing code** for patterns. Read any already-implemented screens or components to match conventions:
   - `Glob("packages/native/app/**/*.tsx")` for existing routes
   - `Glob("packages/native/components/**/*.tsx")` for existing components
   - `Glob("packages/native/hooks/**/*.ts")` for existing hooks
   - `Glob("packages/native/state/**/*.ts")` for existing atoms

## Phase 2: Plan the Component Tree

Before writing code, plan the file structure following the architecture doc's separation of concerns:

**Screen component** (route file in `app/`):
- Reads route params via Expo Router
- Calls hooks for data
- Passes props to presentational components
- No styling logic, no direct atom/DB access in JSX

**Presentational components** (in `components/`):
- Pure props in, rendered output out
- No `useAtom`, no `useLiveQuery`, no global state access
- Testable by passing props alone
- Use NativeWind (Tailwind) classes for styling

**Hooks** (in `hooks/`):
- One concern per hook
- Bridge between state layer and components
- `useLiveQuery` for TanStack DB reads
- `useAtomValue`/`useSetAtom` for Jotai reads/writes

**Dummy data** (in `__fixtures__/` or co-located):
- Create realistic fixture data matching TanStack DB collection schemas
- Export typed constants that screens/components use until real data is wired up
- Make it trivial to swap: the hook returns the same shape whether from fixtures or real queries

## Phase 3: Implement with Dummy Data

Write the code following these rules:

1. **Start with the hook** that will provide data. Have it return fixture data with the exact shape of the real TanStack DB query result:
   ```typescript
   // hooks/useSessionMessages.ts
   import { FIXTURE_MESSAGES } from '../__fixtures__/messages'

   // TODO: Replace with real TanStack DB query
   // return useLiveQuery((q) =>
   //   q.from({ message: messageCollection })
   //    .where(({ message }) => eq(message.sessionId, sessionId))
   // )
   export function useSessionMessages(sessionId: string) {
     return { data: FIXTURE_MESSAGES.filter(m => m.sessionId === sessionId) }
   }
   ```

2. **Build presentational components** that consume the hook's return type via props. Match the Pencil designs exactly — spacing, colors, typography, layout.

3. **Wire it up in the screen component** — call the hook, spread into presentational components.

4. **For Jotai state**, create the real atoms from the start (they're local-only, no server dependency). Wire them into hooks that presentational components consume via props.

## Phase 4: Visual Verification Loop

Run an iterative loop comparing your implementation against the Pencil designs:

1. **Take a simulator screenshot** using Maestro:
   ```
   maestro test .maestro/screenshot.yaml
   ```
   Then read `.maestro/screenshots/latest.png`

2. **Compare side-by-side** with the Pencil design screenshot from Phase 1.

3. **Identify discrepancies**: spacing, font size/weight, colors, alignment, border radius, icon sizing, padding, margins, opacity. Be precise — "the gap between the status dot and session name should be 8px not 12px".

4. **Fix and re-screenshot**. Repeat until the implementation matches the design.

5. **Check both form factors**: If the component appears on both iPhone and iPad, verify both layouts. Use `useWindowDimensions` to test the adaptive layout shell.

Target: 2-3 iterations should be enough. If you're past 4 iterations, step back and re-examine the design screenshot more carefully.

## Phase 5: Document Swap Points

Before finishing, add clear `// TODO` comments at every point where dummy data will be replaced with real data:

```typescript
// TODO: Replace fixture with TanStack DB live query
// return useLiveQuery((q) => q.from({ session: sessionCollection }).where(...))
```

Ensure the hook's return type signature won't change when swapping — this is the contract between the data layer and the UI layer.

## Checklist

- [ ] All presentational components receive data via props only (no direct atom/DB access)
- [ ] Screen component is thin glue (hooks + JSX, no logic)
- [ ] Dummy data matches the TanStack DB collection schemas from the architecture doc
- [ ] Hooks have TODO comments showing the real query that will replace fixtures
- [ ] NativeWind/Tailwind used for all styling (no inline `style` objects unless animated)
- [ ] Pixel-compared against Pencil screenshots for both iPhone and iPad (if applicable)
- [ ] Component handles all states shown in the designs (loading, empty, error, offline if relevant)
- [ ] Maestro screenshot taken and visually verified
