import React, { useCallback, useRef, useEffect, useState, useMemo } from 'react'
import { View, StyleSheet } from 'react-native'
import { WebView, type WebViewMessageEvent } from 'react-native-webview'
import { useAtomValue } from 'jotai'
import { eq } from '@tanstack/react-db'
import { useColorScheme } from 'nativewind'
import type { BackendUrl } from '../state/backends'
import { backendResourcesAtom } from '../lib/backend-streams'
import { useBackendStateQuery } from '../lib/merged-query'
import type { ChangeValue } from '../lib/stream-db'
import diffViewerHtml from '../assets/diff-viewer'

interface DiffWebViewProps {
  sessionId: string
  backendUrl: BackendUrl
  /** File to display, or null to hide the diff content */
  activeFile: string | null
}

/**
 * A persistent WebView that loads a locally bundled diff viewer.
 * Initial diff data is injected before the page loads for instant rendering.
 * Subsequent updates are sent via postMessage — no network requests or reloads.
 */
export function DiffWebView({ sessionId, backendUrl, activeFile }: DiffWebViewProps) {
  const resources = useAtomValue(backendResourcesAtom)
  const backendRes = resources[backendUrl]
  const api = backendRes?.api
  const { colorScheme } = useColorScheme()
  const webViewRef = useRef<WebView>(null)
  const [isLoaded, setIsLoaded] = useState(false)
  const pendingFileRef = useRef<string | null>(null)
  const lastFetchedSessionRef = useRef<string | null>(null)
  const [diffs, setDiffs] = useState<Array<{ file: string; before: string; after: string }> | null>(
    null
  )

  // Watch changes from the stream to know when to refetch diffs
  const { data: changeResults } = useBackendStateQuery<ChangeValue>(
    backendUrl,
    (db, q) =>
      q
        .from({ changes: db.collections.changes })
        .where(({ changes }) => eq(changes.sessionId, sessionId)),
    [sessionId]
  )
  const changeValue = changeResults?.[0]

  const sendMessage = useCallback((msg: Record<string, unknown>) => {
    const js = `window.postMessage(${JSON.stringify(JSON.stringify(msg))}); true;`
    webViewRef.current?.injectJavaScript(js)
  }, [])

  // Fetch full diff content whenever changes update
  useEffect(() => {
    if (!sessionId || sessionId === 'new' || !api) return

    // Build a cache key from the files summary so any change triggers a refetch
    const filesKey =
      changeValue?.files
        ?.map((f) => `${f.path}:${f.status}:${f.added}:${f.removed}`)
        .join(',') ?? ''
    const cacheKey = `${sessionId}:${filesKey}`
    if (lastFetchedSessionRef.current === cacheKey) return
    lastFetchedSessionRef.current = cacheKey

    api.api.diffs
      .$get({ query: { session: sessionId } })
      .then(async (res: Response) => {
        if (!res.ok) return
        const fetchedDiffs = await res.json()
        setDiffs(fetchedDiffs as Array<{ file: string; before: string; after: string }>)
      })
      .catch((err: unknown) => {
        console.error('[DiffWebView] fetch diffs failed:', err)
      })
  }, [sessionId, changeValue, api])

  // When diffs change and WebView is loaded, send them via postMessage
  useEffect(() => {
    if (isLoaded && diffs) {
      sendMessage({ type: 'loadDiffs', diffs, colorScheme: colorScheme ?? 'dark' })
    }
  }, [diffs, isLoaded, sendMessage, colorScheme])

  // Inject initial diffs before page load for instant rendering
  const injectedJs = useMemo(() => {
    if (!diffs) return undefined
    return `window.__INITIAL_DIFFS__ = ${JSON.stringify({
      diffs,
      colorScheme: colorScheme ?? 'dark',
    })}; true;`
  }, [diffs, colorScheme])

  // Sync color scheme changes to the WebView
  useEffect(() => {
    if (!isLoaded) return
    sendMessage({ type: 'setColorScheme', colorScheme: colorScheme ?? 'dark' })
  }, [colorScheme, isLoaded, sendMessage])

  // When activeFile changes, tell the WebView to show it
  useEffect(() => {
    if (!isLoaded) {
      pendingFileRef.current = activeFile
      return
    }
    if (activeFile) {
      sendMessage({ type: 'showFile', file: activeFile })
    } else {
      sendMessage({ type: 'hide' })
    }
  }, [activeFile, isLoaded, sendMessage])

  const onMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data)
      if (data.type === 'ready' || data.type === 'loaded') {
        setIsLoaded(true)
        if (pendingFileRef.current) {
          const js = `window.postMessage(${JSON.stringify(JSON.stringify({ type: 'showFile', file: pendingFileRef.current }))}); true;`
          webViewRef.current?.injectJavaScript(js)
          pendingFileRef.current = null
        }
      }
    } catch {
      // ignore
    }
  }, [])

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{ html: diffViewerHtml }}
        originWhitelist={['*']}
        injectedJavaScriptBeforeContentLoaded={injectedJs}
        onMessage={onMessage}
        javaScriptEnabled
        scrollEnabled
        style={styles.webview}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  webview: { flex: 1, backgroundColor: 'transparent' },
})
