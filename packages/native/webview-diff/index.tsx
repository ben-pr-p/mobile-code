import React, { useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { MultiFileDiff, PatchDiff } from '@pierre/diffs/react'

type ThemeType = 'system' | 'light' | 'dark'

type DiffPayload =
  | {
      type: 'files'
      oldFile: { name: string; contents: string }
      newFile: { name: string; contents: string }
      colorScheme?: 'light' | 'dark'
      diffStyle?: 'split' | 'unified'
    }
  | {
      type: 'patch'
      patch: string
      colorScheme?: 'light' | 'dark'
      diffStyle?: 'split' | 'unified'
    }

declare global {
  interface Window {
    ReactNativeWebView?: {
      postMessage(data: string): void
    }
  }
}

const THEME = { dark: 'github-dark' as const, light: 'github-light' as const }

/** CSS overrides to align diff viewer backgrounds with the app's stone palette */
const STONE_CSS = `
  :host {
    --diffs-light-bg: #FAFAF9 !important;
    --diffs-dark-bg: #0C0A09 !important;
    --diffs-font-family: 'JetBrains Mono', monospace;
  }
`

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico']

function isImageFile(filename: string): boolean {
  const lower = filename.toLowerCase()
  return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

function getMimeType(filename: string): string {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.gif')) return 'image/gif'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.svg')) return 'image/svg+xml'
  if (lower.endsWith('.bmp')) return 'image/bmp'
  if (lower.endsWith('.ico')) return 'image/x-icon'
  return 'image/png'
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
  const isDark = themeType === 'dark'
  const bgColor = isDark ? '#0C0A09' : '#FAFAF9'
  const textColor = isDark ? '#A8A29E' : '#78716C'
  const borderColor = isDark ? '#292524' : '#E7E5E4'
  const mimeType = getMimeType(filename)

  const beforeSrc = before ? `data:${mimeType};base64,${before}` : null
  const afterSrc = after ? `data:${mimeType};base64,${after}` : null

  const isAdded = !before && after
  const isDeleted = before && !after
  const isModified = before && after

  return (
    <div style={{ padding: 16, background: bgColor, minHeight: '100%' }}>
      <div
        style={{
          display: 'flex',
          flexDirection: isModified ? 'row' : 'column',
          gap: 16,
          alignItems: 'flex-start',
        }}
      >
        {beforeSrc && (
          <div style={{ flex: isModified ? 1 : undefined, minWidth: 0 }}>
            <div
              style={{
                fontSize: 12,
                fontFamily: 'monospace',
                color: textColor,
                marginBottom: 8,
                padding: '4px 8px',
                background: isDark ? '#1C1917' : '#F5F5F4',
                borderRadius: 4,
                display: 'inline-block',
              }}
            >
              {isDeleted ? 'Deleted' : 'Before'}
            </div>
            <div
              style={{
                border: `1px solid ${borderColor}`,
                borderRadius: 8,
                overflow: 'hidden',
                background: isDark ? '#1C1917' : '#FFFFFF',
              }}
            >
              <img
                src={beforeSrc}
                alt="Before"
                style={{
                  maxWidth: '100%',
                  maxHeight: 400,
                  display: 'block',
                  margin: '0 auto',
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
                fontFamily: 'monospace',
                color: textColor,
                marginBottom: 8,
                padding: '4px 8px',
                background: isDark ? '#1C1917' : '#F5F5F4',
                borderRadius: 4,
                display: 'inline-block',
              }}
            >
              {isAdded ? 'Added' : 'After'}
            </div>
            <div
              style={{
                border: `1px solid ${borderColor}`,
                borderRadius: 8,
                overflow: 'hidden',
                background: isDark ? '#1C1917' : '#FFFFFF',
              }}
            >
              <img
                src={afterSrc}
                alt="After"
                style={{
                  maxWidth: '100%',
                  maxHeight: 400,
                  display: 'block',
                  margin: '0 auto',
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
  const [payload, setPayload] = useState<DiffPayload | null>(null)
  const [themeType, setThemeType] = useState<ThemeType>('system')

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === 'setColorScheme') {
          if (data.colorScheme === 'light' || data.colorScheme === 'dark') {
            setThemeType(data.colorScheme)
          }
        } else {
          setPayload(data as DiffPayload)
          if (data.colorScheme === 'light' || data.colorScheme === 'dark') {
            setThemeType(data.colorScheme)
          }
        }
      } catch {
        // ignore non-JSON messages
      }
    }

    window.addEventListener('message', handler)
    document.addEventListener('message', handler as EventListener)

    // Signal to React Native that the WebView is ready
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }))
    }

    return () => {
      window.removeEventListener('message', handler)
      document.removeEventListener('message', handler as EventListener)
    }
  }, [])

  // Keep the body background in sync with the active color scheme
  useEffect(() => {
    if (themeType === 'light') {
      document.body.style.background = '#FAFAF9'
    } else if (themeType === 'dark') {
      document.body.style.background = '#0C0A09'
    } else {
      document.body.style.background = ''
    }
  }, [themeType])

  // Post height changes back to native for auto-resizing
  useEffect(() => {
    const observer = new ResizeObserver(() => {
      window.ReactNativeWebView?.postMessage(
        JSON.stringify({ type: 'resize', height: document.body.scrollHeight }),
      )
    })
    observer.observe(document.body)
    return () => observer.disconnect()
  }, [])

  if (!payload) {
    return <div style={{ padding: 16, color: '#888' }}>Waiting for diff data...</div>
  }

  const diffStyle = payload.diffStyle ?? 'unified'
  const options = {
    theme: THEME,
    themeType,
    diffStyle,
    unsafeCSS: STONE_CSS,
  } as const

  if (payload.type === 'patch') {
    return <PatchDiff patch={payload.patch} options={options} />
  }

  if (isImageFile(payload.oldFile.name)) {
    return (
      <ImageDiff
        filename={payload.oldFile.name}
        before={payload.oldFile.contents}
        after={payload.newFile.contents}
        themeType={themeType}
      />
    )
  }

  return (
    <MultiFileDiff
      oldFile={payload.oldFile}
      newFile={payload.newFile}
      options={options}
    />
  )
}

const root = createRoot(document.getElementById('root')!)
root.render(<App />)
