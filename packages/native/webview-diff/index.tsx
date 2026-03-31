import React, { useState, useEffect, useCallback, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { MultiFileDiff } from '@pierre/diffs/react'
import type { SelectedLineRange } from '@pierre/diffs'

declare global {
  interface Window {
    ReactNativeWebView?: {
      postMessage(data: string): void
    }
    __INITIAL_DIFFS__?: {
      diffs: DiffData[]
      colorScheme?: 'light' | 'dark'
      codeFontSize?: number
    }
  }
}

type DiffData = {
  file: string
  before: string
  after: string
}

type ThemeType = 'system' | 'light' | 'dark'

const THEME = { dark: 'github-dark' as const, light: 'github-light' as const }

/** CSS overrides to align diff viewer backgrounds with the app's stone palette */
function buildStoneCSS(codeFontSize: number): string {
  return `
  :host {
    --diffs-light-bg: #FAFAF9 !important;
    --diffs-dark-bg: #0C0A09 !important;
    --diffs-font-family: 'JetBrains Mono', monospace;
    --diffs-font-size: ${codeFontSize}px !important;
    font-size: ${codeFontSize}px !important;
  }
  /* Widen line number gutter for touch-friendly tap targets.
     touch-action: none prevents the browser from starting a scroll/pan
     gesture when the touch begins on a line number, so taps and drags
     on the gutter always trigger line selection instead of scrolling. */
  [data-column-number] {
    min-width: 44px !important;
    padding-left: 8px !important;
    padding-right: 8px !important;
    touch-action: none;
  }
  /* Apply font size to all code content */
  [data-line] {
    font-size: ${codeFontSize}px !important;
  }
`
}

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

function postToNative(data: Record<string, unknown>) {
  window.ReactNativeWebView?.postMessage(JSON.stringify(data))
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

/**
 * Custom touch-based line selection for mobile/iPad.
 *
 * The @pierre/diffs library's built-in enableLineSelection uses pointer events
 * with document-level pointermove listeners, which don't work reliably on iOS
 * WebKit during touch drags. Instead, we disable the library's selection and
 * implement our own using touch events at the document level (where iOS WebKit
 * reliably delivers them). We probe into shadow DOMs via elementFromPoint to
 * find line numbers. We still use the library's `selectedLines` controlled
 * prop to render the highlight — we just drive it ourselves.
 *
 * Gesture: tap a line number to select one line, drag across line numbers to
 * select a range. Tap a selected single line to deselect.
 */

// Module-level touch selection state, shared across all FileDiffPanel instances.
// Only one selection can be active at a time.
// _selectionCallbacks maps each panel's wrapper element to its callback so the
// touch handler can resolve the correct callback for the panel that is actually
// visible (display !== 'none'), rather than whichever effect ran last.
const _selectionCallbacks = new Map<HTMLElement, (range: SelectedLineRange | null) => void>()
let _selectionRef: SelectedLineRange | null = null
let _anchor: { lineNumber: number; side: 'additions' | 'deletions' } | null = null
let _isDragging = false
let _activeShadow: ShadowRoot | null = null
let _activeCallback: ((range: SelectedLineRange | null) => void) | null = null

function _getLineInfoAtPoint(shadow: ShadowRoot, x: number, y: number) {
  const el = shadow.elementFromPoint(x, y) as HTMLElement | null
  if (!el) return null

  // Walk up to find the [data-line] row
  let lineEl: HTMLElement | null = null
  let current: HTMLElement | null = el
  while (current && current !== (shadow as any).host) {
    if (current.hasAttribute('data-line')) {
      lineEl = current
      break
    }
    current = current.parentElement
  }
  if (!lineEl) return null

  const lineNumber = parseInt(lineEl.dataset.line ?? '', 10)
  if (isNaN(lineNumber)) return null

  let side: 'additions' | 'deletions' = 'additions'
  if (lineEl.dataset.lineType === 'change-deletion') side = 'deletions'

  return { lineNumber, side }
}

function _isNumberColumnAtPoint(shadow: ShadowRoot, x: number, y: number): boolean {
  const el = shadow.elementFromPoint(x, y) as HTMLElement | null
  if (!el) return false

  let cur: HTMLElement | null = el
  while (cur && cur !== (shadow as any).host) {
    if (cur.hasAttribute('data-column-number')) return true
    if (cur.hasAttribute('data-line')) break
    cur = cur.parentElement
  }
  return false
}

function _findShadowRootAtPoint(x: number, y: number): ShadowRoot | null {
  // document.elementFromPoint returns the host element of the shadow DOM
  let el = document.elementFromPoint(x, y) as HTMLElement | null
  while (el) {
    if (el.shadowRoot) return el.shadowRoot
    el = el.parentElement
  }
  return null
}

/** Find the selection callback for the panel that contains the touch point. */
function _getCallbackAtPoint(x: number, y: number): ((range: SelectedLineRange | null) => void) | null {
  const el = document.elementFromPoint(x, y) as HTMLElement | null
  if (!el) return null
  for (const [wrapper, cb] of _selectionCallbacks) {
    if (wrapper.contains(el)) return cb
  }
  return null
}

// Install document-level touch handlers once
let _touchHandlersInstalled = false
function _installTouchHandlers() {
  if (_touchHandlersInstalled) return
  _touchHandlersInstalled = true

  document.addEventListener('touchstart', (e: TouchEvent) => {
    const touch = e.touches[0]
    if (!touch) return

    const shadow = _findShadowRootAtPoint(touch.clientX, touch.clientY)
    if (!shadow) return

    if (!_isNumberColumnAtPoint(shadow, touch.clientX, touch.clientY)) return

    const info = _getLineInfoAtPoint(shadow, touch.clientX, touch.clientY)
    const cb = _getCallbackAtPoint(touch.clientX, touch.clientY)
    if (!info || !cb) return

    // Prevent scrolling when touching line numbers
    e.preventDefault()

    // Tap on already-selected single line → deselect
    if (_selectionRef && _selectionRef.start === info.lineNumber && _selectionRef.end === info.lineNumber) {
      _selectionRef = null
      _activeCallback = null
      cb(null)
      return
    }

    _anchor = info
    _isDragging = true
    _activeShadow = shadow
    _activeCallback = cb
    const range: SelectedLineRange = {
      start: info.lineNumber,
      end: info.lineNumber,
      side: info.side,
    }
    _selectionRef = range
    cb(range)
  }, { passive: false })

  document.addEventListener('touchmove', (e: TouchEvent) => {
    if (!_isDragging || !_anchor || !_activeShadow || !_activeCallback) return
    const touch = e.touches[0]
    if (!touch) return

    e.preventDefault()

    const info = _getLineInfoAtPoint(_activeShadow, touch.clientX, touch.clientY)
    if (!info) return

    const range: SelectedLineRange = {
      start: _anchor.lineNumber,
      end: info.lineNumber,
      side: _anchor.side,
      endSide: info.side !== _anchor.side ? info.side : undefined,
    }
    _selectionRef = range
    _activeCallback(range)
  }, { passive: false })

  document.addEventListener('touchend', () => {
    _anchor = null
    _isDragging = false
    _activeShadow = null
    _activeCallback = null
  })
}

function useTouchLineSelection(
  onSelectionChange: (range: SelectedLineRange | null) => void,
) {
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    _selectionCallbacks.set(el, onSelectionChange)
    _installTouchHandlers()
    return () => {
      _selectionCallbacks.delete(el)
    }
  }, [onSelectionChange])

  return wrapperRef
}

/** Renders a single diff. Mounted once and kept alive — visibility controlled by parent. */
function FileDiffPanel({
  diff,
  themeType,
  selectedLines,
  onLineSelected,
  codeFontSize,
}: {
  diff: DiffData
  themeType: ThemeType
  selectedLines: SelectedLineRange | null
  onLineSelected: (range: SelectedLineRange | null) => void
  codeFontSize: number
}) {
  const wrapperRef = useTouchLineSelection(onLineSelected)

  if (isImageFile(diff.file)) {
    return <ImageDiff filename={diff.file} before={diff.before} after={diff.after} themeType={themeType} />
  }

  return (
    <div ref={wrapperRef}>
      <MultiFileDiff
        oldFile={{ name: diff.file, contents: diff.before }}
        newFile={{ name: diff.file, contents: diff.after }}
        selectedLines={selectedLines}
        options={{
          theme: THEME,
          themeType,
          diffStyle: 'unified',
          disableFileHeader: true,
          unsafeCSS: buildStoneCSS(codeFontSize),
          // Don't use the library's line selection — it doesn't work on iOS touch.
          // We drive selection via our own touch handlers and the controlled
          // selectedLines prop.
        }}
      />
    </div>
  )
}

function App() {
  const [diffs, setDiffs] = useState<DiffData[]>([])
  const [activeFile, setActiveFile] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [themeType, setThemeType] = useState<ThemeType>('system')
  const [codeFontSize, setCodeFontSize] = useState(13)
  // Per-file controlled selection state
  const [selections, setSelections] = useState<Record<string, SelectedLineRange | null>>({})

  const handleLineSelected = useCallback((file: string, range: SelectedLineRange | null) => {
    setSelections((prev) => ({ ...prev, [file]: range }))
    postToNative({ type: 'lineSelection', file, range })
  }, [])

  // On mount, check for pre-injected data from injectedJavaScriptBeforeContentLoaded
  useEffect(() => {
    const initialData = window.__INITIAL_DIFFS__
    if (initialData) {
      setDiffs(initialData.diffs)
      setThemeType(initialData.colorScheme ?? 'dark')
      if (initialData.codeFontSize) setCodeFontSize(initialData.codeFontSize)
      setLoaded(true)
      postToNative({ type: 'loaded', files: initialData.diffs.map((d) => d.file) })
    }
  }, [])

  // Listen for messages from React Native
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      try {
        const msg = typeof event.data === 'string' ? JSON.parse(event.data) : event.data

        if (msg.type === 'loadDiffs') {
          setDiffs(msg.diffs)
          if (msg.colorScheme === 'light' || msg.colorScheme === 'dark') {
            setThemeType(msg.colorScheme)
          }
          if (typeof msg.codeFontSize === 'number') {
            setCodeFontSize(msg.codeFontSize)
          }
          setLoaded(true)
          postToNative({ type: 'loaded', files: (msg.diffs as DiffData[]).map((d) => d.file) })
        } else if (msg.type === 'setCodeFontSize') {
          if (typeof msg.codeFontSize === 'number') {
            setCodeFontSize(msg.codeFontSize)
          }
        } else if (msg.type === 'showFile') {
          setActiveFile(msg.file)
          // Clear all selections when switching files so stale highlights
          // don't persist if the user navigates back.
          setSelections({})
          _selectionRef = null
        } else if (msg.type === 'hide') {
          setActiveFile(null)
        } else if (msg.type === 'setColorScheme') {
          if (msg.colorScheme === 'light' || msg.colorScheme === 'dark') {
            setThemeType(msg.colorScheme)
          }
        } else if (msg.type === 'clearSelection') {
          // Clear selection for a specific file, or all files
          if (msg.file) {
            setSelections((prev) => ({ ...prev, [msg.file]: null }))
          } else {
            setSelections({})
          }
        }
      } catch {
        // ignore parse errors
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [])

  // Post height changes back to native for auto-resizing
  useEffect(() => {
    const observer = new ResizeObserver(() => {
      postToNative({ type: 'resize', height: document.body.scrollHeight })
    })
    observer.observe(document.body)
    return () => observer.disconnect()
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

  // Signal readiness to React Native (for cases without pre-injected data)
  useEffect(() => {
    postToNative({ type: 'ready' })
  }, [])

  if (!loaded) {
    return <div style={{ padding: 16, color: '#64748B', fontFamily: 'monospace' }}>Waiting for diffs...</div>
  }

  // Render ALL diffs at once. Each one is wrapped in a div that is either
  // display:block (active) or display:none (hidden). This avoids the ~300ms
  // React teardown/rebuild cycle when switching between files — toggling
  // CSS display is nearly instant.
  return (
    <>
      {diffs.map((diff) => (
        <div
          key={diff.file}
          style={{ display: activeFile === diff.file ? 'block' : 'none' }}
        >
          <FileDiffPanel
            diff={diff}
            themeType={themeType}
            selectedLines={selections[diff.file] ?? null}
            onLineSelected={(range) => handleLineSelected(diff.file, range)}
            codeFontSize={codeFontSize}
          />
        </div>
      ))}
    </>
  )
}

const root = createRoot(document.getElementById('root')!)
root.render(<App />)
