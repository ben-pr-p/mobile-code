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

const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".ico"]

function isImageFile(filename: string): boolean {
  const lower = filename.toLowerCase()
  return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

function getMimeType(filename: string): string {
  const lower = filename.toLowerCase()
  if (lower.endsWith(".png")) return "image/png"
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg"
  if (lower.endsWith(".gif")) return "image/gif"
  if (lower.endsWith(".webp")) return "image/webp"
  if (lower.endsWith(".svg")) return "image/svg+xml"
  if (lower.endsWith(".bmp")) return "image/bmp"
  if (lower.endsWith(".ico")) return "image/x-icon"
  return "image/png"
}

function ImageDiff({
  filename,
  before,
  after,
  themeType,
}: {
  filename: string
  before: string
  after: string
  themeType: ThemeType
}) {
  const isDark = themeType === "dark"
  const bgColor = isDark ? "#0C0A09" : "#FAFAF9"
  const textColor = isDark ? "#A8A29E" : "#78716C"
  const borderColor = isDark ? "#292524" : "#E7E5E4"
  const mimeType = getMimeType(filename)

  const beforeSrc = before ? `data:${mimeType};base64,${before}` : null
  const afterSrc = after ? `data:${mimeType};base64,${after}` : null

  const isAdded = !before && after
  const isDeleted = before && !after
  const isModified = before && after

  return (
    <div style={{ padding: 16, background: bgColor, minHeight: "100%" }}>
      <div
        style={{
          display: "flex",
          flexDirection: isModified ? "row" : "column",
          gap: 16,
          alignItems: "flex-start",
        }}
      >
        {beforeSrc && (
          <div style={{ flex: isModified ? 1 : undefined, minWidth: 0 }}>
            <div
              style={{
                fontSize: 12,
                fontFamily: "monospace",
                color: textColor,
                marginBottom: 8,
                padding: "4px 8px",
                background: isDark ? "#1C1917" : "#F5F5F4",
                borderRadius: 4,
                display: "inline-block",
              }}
            >
              {isDeleted ? "Deleted" : "Before"}
            </div>
            <div
              style={{
                border: `1px solid ${borderColor}`,
                borderRadius: 8,
                overflow: "hidden",
                background: isDark ? "#1C1917" : "#FFFFFF",
              }}
            >
              <img
                src={beforeSrc}
                alt="Before"
                style={{
                  maxWidth: "100%",
                  maxHeight: 400,
                  display: "block",
                  margin: "0 auto",
                }}
              />
            </div>
          </div>
        )}
        {afterSrc && (
          <div style={{ flex: isModified ? 1 : undefined, minWidth: 0 }}>
            <div
              style={{
                fontSize: 12,
                fontFamily: "monospace",
                color: textColor,
                marginBottom: 8,
                padding: "4px 8px",
                background: isDark ? "#1C1917" : "#F5F5F4",
                borderRadius: 4,
                display: "inline-block",
              }}
            >
              {isAdded ? "Added" : "After"}
            </div>
            <div
              style={{
                border: `1px solid ${borderColor}`,
                borderRadius: 8,
                overflow: "hidden",
                background: isDark ? "#1C1917" : "#FFFFFF",
              }}
            >
              <img
                src={afterSrc}
                alt="After"
                style={{
                  maxWidth: "100%",
                  maxHeight: 400,
                  display: "block",
                  margin: "0 auto",
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

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

  if (isImageFile(diff.file)) {
    return (
      <ImageDiff
        key={activeFile}
        filename={diff.file}
        before={diff.before}
        after={diff.after}
        themeType={themeType}
      />
    )
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
