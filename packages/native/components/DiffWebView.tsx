import React, { useCallback, useRef, useEffect, useState, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { useAtom, useAtomValue } from 'jotai';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { useColorScheme } from 'nativewind';
import { getApi } from '../lib/api';
import { collections } from '../lib/collections';
import type { ChangeValue } from '../lib/stream-db';
import { lineSelectionAtom } from '../state/line-selection';
import { codeFontSizeAtom } from '../state/settings';
import diffViewerHtml from '../assets/diff-viewer';

interface DiffWebViewProps {
  sessionId: string;
  backendUrl: string;
  /** File to display, or null to hide the diff content */
  activeFile: string | null;
}

/**
 * A persistent WebView that loads a locally bundled diff viewer.
 * Initial diff data is injected before the page loads for instant rendering.
 * Subsequent updates are sent via postMessage — no network requests or reloads.
 */
export function DiffWebView({ sessionId, backendUrl, activeFile }: DiffWebViewProps) {
  const api = getApi(backendUrl);
  const { colorScheme } = useColorScheme();
  const webViewRef = useRef<WebView>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const pendingFileRef = useRef<string | null>(null);
  const lastFetchedSessionRef = useRef<string | null>(null);
  const [diffs, setDiffs] = useState<Array<{ file: string; before: string; after: string }> | null>(
    null
  );

  // Line selection — write to atom when WebView reports selection, clear WebView when atom goes null
  const [lineSelection, setLineSelection] = useAtom(lineSelectionAtom);
  const prevLineSelectionRef = useRef(lineSelection);
  const codeFontStep = useAtomValue(codeFontSizeAtom);

  // Watch changes from the ephemeral stream to know when to refetch diffs
  const { data: changeResults } = useLiveQuery(
    (q) =>
      q
        .from({ changes: collections.changes })
        .where(({ changes }) => eq(changes.sessionId, sessionId)),
    [sessionId]
  );
  const changeValue = (changeResults as ChangeValue[] | null)?.[0];

  const sendMessage = useCallback((msg: Record<string, unknown>) => {
    const js = `window.postMessage(${JSON.stringify(JSON.stringify(msg))}); true;`;
    webViewRef.current?.injectJavaScript(js);
  }, []);

  // Fetch full diff content whenever changes update
  useEffect(() => {
    if (!sessionId || sessionId === 'new' || !api) return;

    // Build a cache key from the files summary so any change triggers a refetch
    const filesKey =
      changeValue?.files?.map((f) => `${f.path}:${f.status}:${f.added}:${f.removed}`).join(',') ??
      '';
    const cacheKey = `${sessionId}:${filesKey}`;
    if (lastFetchedSessionRef.current === cacheKey) return;
    lastFetchedSessionRef.current = cacheKey;

    api.diffs
      .list({ session: sessionId })
      .then((fetchedDiffs) => {
        setDiffs(fetchedDiffs as Array<{ file: string; before: string; after: string }>);
      })
      .catch((err: unknown) => {
        console.error('[DiffWebView] fetch diffs failed:', err);
      });
  }, [sessionId, changeValue, api]);

  // When diffs change and WebView is loaded, send them via postMessage
  useEffect(() => {
    if (isLoaded && diffs) {
      sendMessage({ type: 'loadDiffs', diffs, colorScheme: colorScheme ?? 'dark', codeFontSize: Math.max(6, 13 + codeFontStep * 2) });
    }
  }, [diffs, isLoaded, sendMessage, colorScheme, codeFontStep]);

  // Inject initial diffs and JS error forwarding before page load.
  // Error handlers forward uncaught errors/rejections from the WebView
  // to React Native via postMessage so they appear in the Metro console.
  const injectedJs = useMemo(() => {
    const errorHandlers = `
      window.onerror = function(msg, url, line, col, err) {
        window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'jsError', message: String(msg), url: url, line: line, col: col,
          stack: err ? err.stack : null
        }));
      };
      window.addEventListener('unhandledrejection', function(e) {
        window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'jsError', message: String(e.reason), stack: e.reason && e.reason.stack ? e.reason.stack : null
        }));
      });
    `;
    if (!diffs) return `${errorHandlers} true;`;
    return `${errorHandlers} window.__INITIAL_DIFFS__ = ${JSON.stringify({
      diffs,
      colorScheme: colorScheme ?? 'dark',
      codeFontSize: Math.max(6, 13 + codeFontStep * 2),
    })}; true;`;
  }, [diffs, colorScheme, codeFontStep]);

  // When the atom is externally cleared (e.g. after send or user taps X), tell the WebView
  useEffect(() => {
    const prev = prevLineSelectionRef.current;
    prevLineSelectionRef.current = lineSelection;
    // Only send clearSelection when transitioning from non-null to null
    if (prev !== null && lineSelection === null && isLoaded) {
      sendMessage({ type: 'clearSelection' });
    }
  }, [lineSelection, isLoaded, sendMessage]);

  // Sync color scheme changes to the WebView
  useEffect(() => {
    if (!isLoaded) return;
    sendMessage({ type: 'setColorScheme', colorScheme: colorScheme ?? 'dark' });
  }, [colorScheme, isLoaded, sendMessage]);

  // Sync code font size changes to the WebView
  useEffect(() => {
    if (!isLoaded) return;
    sendMessage({ type: 'setCodeFontSize', codeFontSize: Math.max(6, 13 + codeFontStep * 2) });
  }, [codeFontStep, isLoaded, sendMessage]);

  // When activeFile changes, tell the WebView to show it
  useEffect(() => {
    if (!isLoaded) {
      pendingFileRef.current = activeFile;
      return;
    }
    if (activeFile) {
      sendMessage({ type: 'showFile', file: activeFile });
    } else {
      sendMessage({ type: 'hide' });
    }
  }, [activeFile, isLoaded, sendMessage]);

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);
        if (data.type === 'ready' || data.type === 'loaded') {
          setIsLoaded(true);
          if (pendingFileRef.current) {
            const js = `window.postMessage(${JSON.stringify(JSON.stringify({ type: 'showFile', file: pendingFileRef.current }))}); true;`;
            webViewRef.current?.injectJavaScript(js);
            pendingFileRef.current = null;
          }
        } else if (data.type === 'jsError') {
          console.error(
            `[WebView JS Error] ${data.message}`,
            data.stack ? `\n${data.stack}` : '',
            data.url ? `(${data.url}:${data.line}:${data.col})` : ''
          );
        } else if (data.type === 'lineSelection') {
          if (data.range) {
            setLineSelection({
              file: data.file,
              startLine: data.range.start,
              endLine: data.range.end,
              side: data.range.side ?? data.range.endSide,
            });
          } else {
            setLineSelection(null);
          }
        }
      } catch {
        // ignore
      }
    },
    [setLineSelection]
  );

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
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  webview: { flex: 1, backgroundColor: 'transparent' },
});
