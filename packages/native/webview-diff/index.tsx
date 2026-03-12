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
