/**
 * Build the WebView diff viewer bundle.
 *
 * Produces a TypeScript module that exports the self-contained HTML string
 * used by DiffWebView. Run with: bun scripts/build-webview-html.ts
 */

const result = await Bun.build({
  entrypoints: ['webview-diff/index.tsx'],
  outdir: 'webview-diff/dist',
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

const rawJs = await Bun.file('webview-diff/dist/index.js').text()

// Escape </script> inside the JS so it doesn't break the enclosing <script> tag
const js = rawJs.replaceAll('</script>', '<\\/script>')

const html = `<!DOCTYPE html>
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
  <script>${js}<\/script>
</body>
</html>`

await Bun.write(
  'webview-diff/dist/diff-viewer.ts',
  `// Auto-generated — do not edit. Run: bun scripts/build-webview-html.ts\nexport default ${JSON.stringify(html)};\n`,
)

console.log('Built webview-diff/dist/diff-viewer.ts')
