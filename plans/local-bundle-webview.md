# Local Bundle WebView Implementation Plan

## Overview

Replace the current server-loaded WebView with a locally bundled HTML file. This enables:
- Instant initial load (no network request)
- Offline support
- Smooth file navigation (postMessage, no reload)
- Preserved web app state for future interactivity

## Current Architecture

```
packages/native/components/DiffWebView.tsx
  └── source={{ uri: `${serverUrl}/diff` }}  ← Network request
  └── onMessage: waits for "ready", then fetches diffs, then postMessage

packages/server/src/diff-page/
  └── index.html + app.tsx  ← Served at /diff endpoint

packages/native/webview-diff/
  └── index.tsx  ← Alternative local build (not currently used)
  └── build script: scripts/build-webview-html.ts
```

## Target Architecture

```
packages/native/
  └── assets/diff-viewer.html  ← Bundled HTML (built, committed)
  └── components/DiffWebView.tsx
        └── source={require('../assets/diff-viewer.html')}
        └── injectedJavaScriptBeforeContentLoaded: initial diff data
        └── postMessage: file switches, color scheme changes

packages/native/webview-diff/
  └── index.tsx  ← Web app (modified to read initial data)
  └── build script → outputs to assets/diff-viewer.html
```

---

## Implementation Steps

### 1. Update Build Script

**File:** `packages/native/scripts/build-webview-html.ts`

Changes:
- Output to `assets/diff-viewer.html` instead of `webview-diff/dist/diff-viewer.ts`
- Ensure the HTML is a complete, self-contained file
- Add build command to `package.json` scripts

```json
// packages/native/package.json
{
  "scripts": {
    "build:webview": "bun scripts/build-webview-html.ts"
  }
}
```

### 2. Create Assets Directory

```sh
mkdir -p packages/native/assets
```

The built `diff-viewer.html` will be committed to git for reliability.

### 3. Modify Web App to Read Initial Data

**File:** `packages/native/webview-diff/index.tsx`

Changes:
- Check for `window.__INITIAL_DIFFS__` on mount
- If present, use it immediately (no waiting for postMessage)
- Keep postMessage handler for subsequent file switches

```tsx
// On mount, check for pre-injected data
useEffect(() => {
  const initialData = (window as any).__INITIAL_DIFFS__
  if (initialData) {
    setDiffs(initialData.diffs)
    setThemeType(initialData.colorScheme ?? 'dark')
    setLoaded(true)
  }
}, [])
```

### 4. Update DiffWebView Component

**File:** `packages/native/components/DiffWebView.tsx`

Changes:
- Load from local bundle instead of server URL
- Inject initial diff data via `injectedJavaScriptBeforeContentLoaded`
- Remove "ready" message wait for initial load
- Keep postMessage for file switches and updates

```tsx
<WebView
  source={require('../assets/diff-viewer.html')}
  injectedJavaScriptBeforeContentLoaded={`
    window.__INITIAL_DIFFS__ = ${JSON.stringify({
      diffs: currentDiffs,
      colorScheme: colorScheme
    })};
  `}
  onMessage={onMessage}
  // ... rest of props
/>
```

### 5. Handle Diff Updates

When diffs change (new session data from server):
- Send via postMessage instead of reloading WebView
- Web app updates state without losing scroll position, etc.

```tsx
// In DiffWebView, when diffs change:
useEffect(() => {
  if (isLoaded && diffs) {
    sendMessage({ type: 'loadDiffs', diffs, colorScheme })
  }
}, [diffs, isLoaded])
```

### 6. Update Build Script Output

**File:** `packages/native/scripts/build-webview-html.ts`

```ts
// Output directly to assets folder
await Bun.write(
  'assets/diff-viewer.html',
  html
)
```

### 7. Add Prebuild Hook (Optional)

**File:** `packages/native/package.json`

```json
{
  "scripts": {
    "prebuild": "bun run build:webview"
  }
}
```

This ensures the HTML is rebuilt before app builds.

### 8. Remove Server Dependency for Diff Page

**File:** `packages/server/src/index.ts`

The `/diff` endpoint can be:
- Kept for development/testing purposes, OR
- Removed entirely since it's no longer needed

Recommendation: Keep it for now, mark as deprecated.

---

## File Changes Summary

| File | Action |
|------|--------|
| `packages/native/scripts/build-webview-html.ts` | Modify: output to `assets/` |
| `packages/native/webview-diff/index.tsx` | Modify: read `window.__INITIAL_DIFFS__` |
| `packages/native/components/DiffWebView.tsx` | Modify: local bundle + initial data injection |
| `packages/native/package.json` | Modify: add build script |
| `packages/native/assets/diff-viewer.html` | Create: built HTML (committed) |
| `packages/server/src/diff-page/*` | Optional: deprecate or remove |

---

## Testing Checklist

- [ ] WebView loads instantly on first open
- [ ] Diff content displays immediately (no "Waiting for diffs..." state)
- [ ] File navigation works via postMessage
- [ ] Color scheme changes propagate correctly
- [ ] Works offline (airplane mode)
- [ ] App state persists when switching between files (no reload)
- [ ] Build script produces valid HTML

---

## Rollback Plan

If issues arise:
1. Revert `DiffWebView.tsx` to use `source={{ uri: serverUrl + '/diff' }}`
2. Server endpoint remains functional as fallback

---

## Future Enhancements

Once local bundle is working:
- Add bidirectional messaging for interactive features (click handlers, etc.)
- Add scroll position preservation across file switches
- Add keyboard shortcuts via WebView
- Consider WebView pooling if multiple instances needed
