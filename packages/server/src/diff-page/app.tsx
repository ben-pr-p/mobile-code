import React, { useState, useEffect } from "react"
import { createRoot } from "react-dom/client"
import { MultiFileDiff } from "@pierre/diffs/react"

declare global {
  interface Window {
    ReactNativeWebView?: {
      postMessage(data: string): void
    }
  }
}

function postToNative(data: Record<string, unknown>) {
  window.ReactNativeWebView?.postMessage(JSON.stringify(data))
}

type DiffData = {
  file: string
  before: string
  after: string
}

type ThemeType = "system" | "light" | "dark"

const THEME = { dark: "github-dark" as const, light: "github-light" as const }

/** CSS overrides to align diff viewer backgrounds with the app's stone palette */
const STONE_CSS = `
  :host {
    --diffs-light-bg: #FAFAF9 !important;
    --diffs-dark-bg: #0C0A09 !important;
    --diffs-font-family: 'JetBrains Mono', monospace;
  }
`

function App() {
  const [diffs, setDiffs] = useState<DiffData[]>([])
  const [activeFile, setActiveFile] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [themeType, setThemeType] = useState<ThemeType>("system")

  // Listen for messages from React Native
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      try {
        const msg = typeof event.data === "string" ? JSON.parse(event.data) : event.data
        if (msg.type === "loadDiffs") {
          setDiffs(msg.diffs)
          if (msg.colorScheme === "light" || msg.colorScheme === "dark") {
            setThemeType(msg.colorScheme)
          }
          setLoaded(true)
          postToNative({ type: "loaded", files: (msg.diffs as DiffData[]).map((d) => d.file) })
        } else if (msg.type === "showFile") {
          setActiveFile(msg.file)
        } else if (msg.type === "hide") {
          setActiveFile(null)
        } else if (msg.type === "setColorScheme") {
          if (msg.colorScheme === "light" || msg.colorScheme === "dark") {
            setThemeType(msg.colorScheme)
          }
        }
      } catch {
        // ignore parse errors
      }
    }
    window.addEventListener("message", handler)
    return () => window.removeEventListener("message", handler)
  }, [])

  // Post height changes back to native for auto-resizing
  useEffect(() => {
    const observer = new ResizeObserver(() => {
      postToNative({ type: "resize", height: document.body.scrollHeight })
    })
    observer.observe(document.body)
    return () => observer.disconnect()
  }, [])

  // Keep the body background in sync with the active color scheme
  useEffect(() => {
    if (themeType === "light") {
      document.body.style.background = "#FAFAF9"
    } else if (themeType === "dark") {
      document.body.style.background = "#0C0A09"
    } else {
      document.body.style.background = ""
    }
  }, [themeType])

  useEffect(() => {
    postToNative({ type: "ready" })
  }, [])

  if (!loaded) {
    return <div style={{ padding: 16, color: "#64748B", fontFamily: "monospace" }}>Waiting for diffs...</div>
  }

  if (!activeFile) {
    return null
  }

  const diff = diffs.find((d) => d.file === activeFile)
  if (!diff) {
    return <div style={{ padding: 16, color: "#EF4444", fontFamily: "monospace" }}>File not found: {activeFile}</div>
  }

  return (
    <MultiFileDiff
      key={activeFile}
      oldFile={{ name: diff.file, contents: diff.before }}
      newFile={{ name: diff.file, contents: diff.after }}
      options={{
        theme: THEME,
        themeType,
        diffStyle: "unified",
        disableFileHeader: true,
        unsafeCSS: STONE_CSS,
      }}
    />
  )
}

const root = createRoot(document.getElementById("root")!)
root.render(<App />)
