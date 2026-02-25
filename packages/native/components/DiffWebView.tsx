import React, { useCallback, useRef, useEffect, useState } from 'react'
import { View, StyleSheet } from 'react-native'
import { WebView, type WebViewMessageEvent } from 'react-native-webview'
import { useAtomValue } from 'jotai'
import { debouncedServerUrlAtom } from '../state/settings'

interface DiffWebViewProps {
  sessionId: string
  /** File to display, or null to hide the diff content */
  activeFile: string | null
}

/**
 * A persistent WebView that loads all diffs for a session upfront.
 * Switch between files by changing `activeFile` — no network request needed.
 * Mount this once and keep it alive; use activeFile={null} to hide content.
 */
export function DiffWebView({ sessionId, activeFile }: DiffWebViewProps) {
  const serverUrl = useAtomValue(debouncedServerUrlAtom)
  const webViewRef = useRef<WebView>(null)
  const [isLoaded, setIsLoaded] = useState(false)
  const pendingFileRef = useRef<string | null>(null)

  const uri = `${serverUrl.replace(/\/$/, '')}/diff?session=${encodeURIComponent(sessionId)}`

  const sendMessage = useCallback((msg: Record<string, unknown>) => {
    const js = `window.postMessage(${JSON.stringify(JSON.stringify(msg))}); true;`
    webViewRef.current?.injectJavaScript(js)
  }, [])

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
      if (data.type === 'loaded') {
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
