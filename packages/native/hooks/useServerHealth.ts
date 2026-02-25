import { useEffect, useRef } from 'react'
import { useSetAtom } from 'jotai'
import { connectionInfoAtom } from '../state/settings'

const POLL_INTERVAL = 10_000

export function useServerHealth(serverUrl: string) {
  const setInfo = useSetAtom(connectionInfoAtom)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    let cancelled = false

    async function ping() {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      const url = serverUrl.replace(/\/$/, '') + '/health'
      const start = Date.now()

      try {
        const res = await fetch(url, { signal: controller.signal })
        if (cancelled) return

        if (!res.ok) {
          setInfo({ status: 'error', latencyMs: null, error: `HTTP ${res.status}` })
          return
        }

        const latency = Date.now() - start
        setInfo({ status: 'connected', latencyMs: latency, error: null })
      } catch (err: any) {
        if (cancelled) return
        if (err.name === 'AbortError') return
        const message = err.message || 'Connection failed'
        setInfo({ status: 'error', latencyMs: null, error: message })
      }
    }

    ping()
    const interval = setInterval(ping, POLL_INTERVAL)

    return () => {
      cancelled = true
      clearInterval(interval)
      abortRef.current?.abort()
    }
  }, [serverUrl, setInfo])
}
