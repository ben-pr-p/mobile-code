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

### 1. Update Build Script to Use Bun Standalone HTML

**File:** `packages/native/scripts/build-webview-html.ts`

Bun has a built-in feature for bundling an entire frontend into a single self-contained `.html` file with `--compile --target=browser`. All JavaScript, CSS, and assets are inlined directly into the HTML — no external dependencies.

**Docs:** https://bun.com/docs/bundler/standalone-html

Replace the current manual build with Bun's standalone HTML builder:

```ts
const result = await Bun.build({
  entrypoints: ['webview-diff/index.html'],  // HTML entrypoint (new file, see step 2)
  compile: true,
  target: 'browser',
  minify: true,
})

if (!result.success) {
  console.error('Build failed:')
  for (const log of result.logs) {
    console.error(log)
  }
  process.exit(1)
}

const html = await result.outputs[0].text()
await Bun.write('assets/diff-viewer.html', html)
console.log('Built assets/diff-viewer.html')
```

**What Bun handles automatically:**
- `<script src="./app.tsx">` → inlined as `<script type="module">...bundled code...</script>`
- `<link rel="stylesheet" href="./styles.css">` → inlined as `<style>...bundled CSS...</style>`
- CSS `url("./font.woff2")` → inlined as `url(data:font/woff2;base64,...)`
- Any relative asset → base64-encoded `data:` URI

This replaces the current approach of manually running `Bun.build()` on the JS entrypoint and then string-templating the HTML wrapper around it.

Also add the build command to `package.json`:

```json
// packages/native/package.json
{
  "scripts": {
    "build:webview": "bun scripts/build-webview-html.ts"
  }
}
```

### 2. Create HTML Entrypoint for the Web App

**File:** `packages/native/webview-diff/index.html` (new)

Currently `index.tsx` is the entrypoint and the HTML is templated in the build script. With Bun's HTML bundler, the HTML file itself is the entrypoint:

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #FAFAF9; font-family: monospace; overflow-x: hidden; }
    @media (prefers-color-scheme: dark) { body { background: #0C0A09; } }
  </style>
</head>
<body>
  <div id="root"></div>
  <script src="./index.tsx" type="module"></script>
</body>
</html>
```

Bun will discover `./index.tsx` from the `<script>` tag and bundle it (plus all its dependencies) inline.

### 3. Create Assets Directory

```sh
mkdir -p packages/native/assets
```

The built `diff-viewer.html` will be committed to git for reliability.

### 4. Modify Web App to Read Initial Data

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

### 5. Update DiffWebView Component

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

### 6. Handle Diff Updates

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
| `packages/native/scripts/build-webview-html.ts` | Modify: use Bun standalone HTML (`compile: true, target: 'browser'`) |
| `packages/native/webview-diff/index.html` | Create: HTML entrypoint for Bun bundler |
| `packages/native/webview-diff/index.tsx` | Modify: read `window.__INITIAL_DIFFS__` |
| `packages/native/components/DiffWebView.tsx` | Modify: local bundle + initial data injection |
| `packages/native/package.json` | Modify: add build script |
| `packages/native/assets/diff-viewer.html` | Create: built HTML (committed) |
| `packages/native/webview-diff/dist/` | Remove: no longer needed |
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

## Bun Standalone HTML Reference

Docs: https://bun.com/docs/bundler/standalone-html

### CLI Usage

```sh
bun build --compile --target=browser ./index.html --outdir=dist
bun build --compile --target=browser --minify ./index.html --outdir=dist
```

### API Usage

```ts
const result = await Bun.build({
  entrypoints: ['./index.html'],
  compile: true,
  target: 'browser',
  outdir: './dist',  // optional — omit to get output as BuildArtifact
  minify: true,
})

// When outdir is omitted:
const html = await result.outputs[0].text()
await Bun.write('output.html', html)
```

### What Gets Inlined

| Source | Output |
|--------|--------|
| `<script src="./app.tsx">` | `<script type="module">...bundled code...</script>` |
| `<link rel="stylesheet" href="./styles.css">` | `<style>...bundled CSS...</style>` |
| `<img src="./logo.png">` | `<img src="data:image/png;base64,...">` |
| CSS `url("./bg.png")` | CSS `url(data:image/png;base64,...)` |
| CSS `@import "./reset.css"` | Flattened into the `<style>` tag |
| JS `import "./styles.css"` | Merged into the `<style>` tag |

### Limitations

- Code splitting (`--splitting`) not supported with `--compile --target=browser`
- Large assets increase file size (base64 = 33% overhead vs raw binary)
- External URLs left as-is (only relative paths inlined)

---

## Future Enhancements

Once local bundle is working:
- Add bidirectional messaging for interactive features (click handlers, etc.)
- Add scroll position preservation across file switches
- Add keyboard shortcuts via WebView
- Consider WebView pooling if multiple instances needed
