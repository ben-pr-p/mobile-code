import React, { useCallback, useRef, useEffect, useState } from 'react'
import { View, StyleSheet } from 'react-native'
import { WebView, type WebViewMessageEvent } from 'react-native-webview'
import { useAtomValue } from 'jotai'
import { eq } from '@tanstack/react-db'
import { useColorScheme } from 'nativewind'
import { debouncedServerUrlAtom } from '../state/settings'
import { apiClientAtom } from '../lib/api'
import { useStateQuery, type ChangeValue } from '../lib/stream-db'

interface DiffWebViewProps {
  sessionId: string
  /** File to display, or null to hide the diff content */
  activeFile: string | null
}

/**
 * A persistent WebView that loads the diff viewer shell once.
 * Diff data is fetched by the native wrapper and sent via postMessage.
 * Switch between files by changing `activeFile` — no additional network request needed.
 */
export function DiffWebView({ sessionId, activeFile }: DiffWebViewProps) {
  const serverUrl = useAtomValue(debouncedServerUrlAtom)
  const api = useAtomValue(apiClientAtom)
  const { colorScheme } = useColorScheme()
  const webViewRef = useRef<WebView>(null)
  const [isLoaded, setIsLoaded] = useState(false)
  const pendingFileRef = useRef<string | null>(null)
  const lastFetchedSessionRef = useRef<string | null>(null)

  // Static shell — no session param
  const uri = `${serverUrl.replace(/\/$/, '')}/diff`

  // Watch changes from the stream to know when to refetch diffs
  const { data: changeResults } = useStateQuery(
    (db, q) =>
      q
        .from({ changes: db.collections.changes })
        .where(({ changes }) => eq(changes.sessionId, sessionId)),
    [sessionId]
  )
  const changeValue = (changeResults as ChangeValue[] | undefined)?.[0]

  const sendMessage = useCallback((msg: Record<string, unknown>) => {
    const js = `window.postMessage(${JSON.stringify(JSON.stringify(msg))}); true;`
    webViewRef.current?.injectJavaScript(js)
  }, [])

  // Fetch full diff content and send to WebView whenever changes update
  useEffect(() => {
    if (!isLoaded || !sessionId || sessionId === 'new') return

    // Build a cache key from the files summary so any change triggers a refetch
    const filesKey = changeValue?.files
      ?.map((f) => `${f.path}:${f.status}:${f.added}:${f.removed}`)
      .join(',') ?? ''
    const cacheKey = `${sessionId}:${filesKey}`
    if (lastFetchedSessionRef.current === cacheKey) return
    lastFetchedSessionRef.current = cacheKey

    api.api.diffs.$get({ query: { session: sessionId } })
      .then(async (res) => {
        if (!res.ok) return
        const diffs = await res.json()
        sendMessage({ type: 'loadDiffs', diffs, colorScheme: colorScheme ?? 'dark' })
      })
      .catch((err) => {
        console.error('[DiffWebView] fetch diffs failed:', err)
      })
  }, [isLoaded, sessionId, changeValue, api, sendMessage, colorScheme])

  // Sync color scheme changes to the WebView
  useEffect(() => {
    if (!isLoaded) return
    sendMessage({ type: 'setColorScheme', colorScheme: colorScheme ?? 'dark' })
  }, [colorScheme, isLoaded, sendMessage])

  // When activeFile changes, tell the WebView to show it
  useEffect(() => {
    if (!isLoaded) {
      // WebView not ready yet — store for when it loads
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
        // If a file was requested before loading finished, show it now
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
        source={{ uri }}
        originWhitelist={['*']}
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
