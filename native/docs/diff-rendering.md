# Rendering Code Diffs with `@pierre/diffs` in a React Native WebView

## Overview

Render rich, syntax-highlighted code diffs inside a React Native app by running a client-side React bundle of `@pierre/diffs` inside a `WebView`. The native side passes diff data to the WebView via props/messages, and the WebView's React app renders the diff using Pierre's components.

## Architecture

```
┌──────────────────────────────┐
│  React Native                │
│                              │
│  ┌────────────────────────┐  │
│  │ <DiffWebView            │  │
│  │   oldFile={...}         │  │
│  │   newFile={...}         │  │
│  │   patch="..."           │  │
│  │   theme="pierre-dark"   │  │
│  │ />                      │  │
│  └────────┬───────────────┘  │
│           │ postMessage      │
│  ┌────────▼───────────────┐  │
│  │ <WebView                │  │
│  │   source={{ html }}     │  │
│  │   injectedJavaScript    │  │
│  │   onMessage={...}       │  │
│  │ />                      │  │
│  └────────────────────────┘  │
└──────────────────────────────┘
        ▲
        │ html string containing
        │ bundled React + @pierre/diffs
        ▼
┌──────────────────────────────┐
│  WebView (browser context)   │
│                              │
│  React app renders:          │
│  <MultiFileDiff /> or        │
│  <PatchDiff />               │
│  with Shiki syntax highlight │
└──────────────────────────────┘
```

## Dependencies

```bash
# In the native package
bun add react-native-webview @pierre/diffs
```

## Step 1: Build a Client-Side Bundle for the WebView

The WebView runs a separate browser JS context. Bundle a small React app that imports `@pierre/diffs/react` and listens for data from the native side.

### `webview-diff/index.tsx`

```tsx
import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { MultiFileDiff, PatchDiff } from "@pierre/diffs/react";

type DiffPayload =
  | {
      type: "files";
      oldFile: { name: string; contents: string };
      newFile: { name: string; contents: string };
      theme?: string;
      diffStyle?: "split" | "unified";
    }
  | {
      type: "patch";
      patch: string;
      theme?: string;
      diffStyle?: "split" | "unified";
    };

function App() {
  const [payload, setPayload] = useState<DiffPayload | null>(null);

  useEffect(() => {
    // Listen for data from React Native via postMessage
    const handler = (event: MessageEvent) => {
      try {
        const data: DiffPayload = JSON.parse(event.data);
        setPayload(data);
      } catch {
        // ignore non-JSON messages
      }
    };

    // React Native WebView posts messages as document message events
    window.addEventListener("message", handler);
    // iOS uses document-level event
    document.addEventListener("message", handler as EventListener);

    // Signal to React Native that the WebView is ready
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: "ready" }));
    }

    return () => {
      window.removeEventListener("message", handler);
      document.removeEventListener("message", handler as EventListener);
    };
  }, []);

  if (!payload) {
    return <div style={{ padding: 16, color: "#888" }}>Waiting for diff data...</div>;
  }

  const theme = payload.theme ?? "pierre-dark";
  const diffStyle = payload.diffStyle ?? "unified";

  if (payload.type === "patch") {
    return <PatchDiff patch={payload.patch} options={{ theme, diffStyle }} />;
  }

  return (
    <MultiFileDiff
      oldFile={payload.oldFile}
      newFile={payload.newFile}
      options={{ theme, diffStyle }}
    />
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
```

### `webview-diff/index.html`

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #1e1e1e; font-family: monospace; overflow-x: hidden; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="./index.tsx"></script>
</body>
</html>
```

### Build the bundle

Use Bun's bundler to produce a single self-contained JS file and inline it into the HTML:

```bash
bun build webview-diff/index.tsx \
  --outdir webview-diff/dist \
  --target browser \
  --minify
```

Then produce a final HTML string with the JS inlined (or use a build script):

```ts
// scripts/build-webview-html.ts
const js = await Bun.file("webview-diff/dist/index.js").text();
const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #1e1e1e; font-family: monospace; overflow-x: hidden; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script>${js}</script>
</body>
</html>`;

await Bun.write("webview-diff/dist/diff-viewer.html.ts", `export default ${JSON.stringify(html)};`);
```

This produces a TS module exporting the HTML string, which can be imported directly.

## Step 2: React Native Wrapper Component

### `components/DiffWebView.tsx`

```tsx
import React, { useRef, useCallback, useState } from "react";
import { View, StyleSheet } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import diffViewerHtml from "../webview-diff/dist/diff-viewer.html";

type FileContents = {
  name: string;
  contents: string;
};

type DiffWebViewProps =
  | {
      mode: "files";
      oldFile: FileContents;
      newFile: FileContents;
      theme?: string;
      diffStyle?: "split" | "unified";
      style?: object;
    }
  | {
      mode: "patch";
      patch: string;
      theme?: string;
      diffStyle?: "split" | "unified";
      style?: object;
    };

export function DiffWebView(props: DiffWebViewProps) {
  const webViewRef = useRef<WebView>(null);
  const [ready, setReady] = useState(false);

  const sendPayload = useCallback(() => {
    if (!webViewRef.current) return;

    const payload =
      props.mode === "patch"
        ? {
            type: "patch" as const,
            patch: props.patch,
            theme: props.theme,
            diffStyle: props.diffStyle,
          }
        : {
            type: "files" as const,
            oldFile: props.oldFile,
            newFile: props.newFile,
            theme: props.theme,
            diffStyle: props.diffStyle,
          };

    webViewRef.current.postMessage(JSON.stringify(payload));
  }, [props]);

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);
        if (data.type === "ready") {
          setReady(true);
          sendPayload();
        }
      } catch {
        // ignore
      }
    },
    [sendPayload]
  );

  // Re-send payload when props change and WebView is ready
  React.useEffect(() => {
    if (ready) sendPayload();
  }, [ready, sendPayload]);

  return (
    <View style={[styles.container, props.style]}>
      <WebView
        ref={webViewRef}
        source={{ html: diffViewerHtml }}
        originWhitelist={["*"]}
        onMessage={onMessage}
        javaScriptEnabled
        scrollEnabled
        style={styles.webview}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, minHeight: 200 },
  webview: { flex: 1, backgroundColor: "transparent" },
});
```

## Step 3: Usage

### Rendering a diff from two file versions

```tsx
<DiffWebView
  mode="files"
  oldFile={{
    name: "app.ts",
    contents: 'const greeting = "hello";\nconsole.log(greeting);',
  }}
  newFile={{
    name: "app.ts",
    contents: 'const greeting = "hello world";\nconsole.log(greeting);\nconsole.log("done");',
  }}
  theme="pierre-dark"
  diffStyle="unified"
/>
```

### Rendering from a unified diff / patch string

```tsx
<DiffWebView
  mode="patch"
  patch={`--- a/app.ts
+++ b/app.ts
@@ -1,2 +1,3 @@
-const greeting = "hello";
+const greeting = "hello world";
 console.log(greeting);
+console.log("done");`}
  theme="pierre-dark"
  diffStyle="unified"
/>
```

## `@pierre/diffs` API Reference

### React Components (from `@pierre/diffs/react`)

| Component | Purpose | Key Props |
|-----------|---------|-----------|
| `MultiFileDiff` | Compare two file versions | `oldFile`, `newFile`, `options` |
| `PatchDiff` | Render from unified diff string | `patch`, `options` |
| `FileDiff` | Render pre-parsed `FileDiffMetadata` | `fileDiffMetadata`, `options` |
| `File` | Display a single file (no diff) | `name`, `contents`, `options` |

### Data Types

```ts
// Represents a file
type FileContents = {
  name: string;       // filename, used for syntax detection
  contents: string;   // full file text
  cacheKey?: string;  // optional render cache key
};

// Parsed diff structure
type FileDiffMetadata = {
  // hunks, line counts, optional full contents for expand-unchanged
};
```

### Utility Functions (from `@pierre/diffs`)

| Function | Description |
|----------|-------------|
| `parseDiffFromFile(oldFile, newFile)` | Generate `FileDiffMetadata` from two `FileContents` |
| `parsePatchFiles(patch, cacheKeyPrefix?)` | Parse unified diff string into structured data |
| `trimPatchContext(patch, contextWindow)` | Reduce context lines in a patch |
| `preloadHighlighter(themes, langs)` | Pre-warm Shiki highlighter |
| `registerCustomTheme(themeJson)` | Register a custom VS Code-compatible theme |
| `registerCustomLanguage(loader, exts?)` | Register a custom language grammar |
| `setLanguageOverride(fileOrDiff, lang)` | Override syntax highlighting language |

### Shared Options

```ts
type DiffOptions = {
  theme?: string;                    // Shiki theme name (default: "pierre-dark")
  diffStyle?: "split" | "unified";   // side-by-side or stacked
  lineDiffType?: string;             // token-level or line-level highlighting
  indicators?: "classic" | "bars";   // +/- indicators or vertical bars
  overflow?: "scroll" | "wrap";      // line overflow behavior
  enableLineSelection?: boolean;     // allow clicking to select lines
};
```

### CSS Variables for Theming

Style the diff components through CSS variables on the host element:

```css
--diffs-bg              /* background color */
--diffs-fg              /* foreground color */
--diffs-bg-deletion     /* deletion line background */
--diffs-bg-addition     /* addition line background */
--diffs-font-size       /* code font size */
--diffs-line-height     /* code line height */
--diffs-gap-inline      /* horizontal spacing */
--diffs-gap-block       /* vertical spacing */
--diffs-tab-size        /* tab width */
```

## Key Considerations

### Bundle Size
`@pierre/diffs` bundles Shiki for syntax highlighting, which includes language grammars. Use `preloadHighlighter` with only the themes and languages you need to reduce the initial bundle size, or rely on lazy-loading (default behavior).

### Communication Protocol
The native-to-WebView communication uses `postMessage`/`onMessage`. The WebView signals readiness with `{ type: "ready" }`, then the native side sends the diff payload as a JSON string. For subsequent updates (e.g. new diff data from props changing), the native side re-sends the payload.

### Performance
- Use `cacheKey` on `FileContents` to enable render caching and avoid re-highlighting unchanged files.
- The `@pierre/diffs/worker` export provides a `WorkerPoolContextProvider` that offloads Shiki highlighting to Web Workers — useful if rendering many diffs or large files.
- Consider pre-parsing diffs on the native side (serializing `FileDiffMetadata`) and using the `FileDiff` component in the WebView to avoid parsing overhead in the browser.

### Auto-Resizing the WebView
To make the WebView height match its content, have the WebView app post its document height back:

```tsx
// Inside the WebView app, after render:
const observer = new ResizeObserver(() => {
  window.ReactNativeWebView?.postMessage(
    JSON.stringify({ type: "resize", height: document.body.scrollHeight })
  );
});
observer.observe(document.body);
```

Then handle it on the native side:

```tsx
const [height, setHeight] = useState(300);

const onMessage = (event: WebViewMessageEvent) => {
  const data = JSON.parse(event.nativeEvent.data);
  if (data.type === "resize") setHeight(data.height);
  if (data.type === "ready") sendPayload();
};

<WebView style={{ height }} ... />
```
