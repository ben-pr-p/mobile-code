import { useState, useEffect, useRef } from 'react'

interface RpcTargetLike<T> {
  getState(): Promise<T>
}

// Poll interval for checking server state updates (ms)
const POLL_INTERVAL = 500

export function useRpcTarget<T>(
  getTarget: () => RpcTargetLike<T>,
  deps: unknown[] = [],
): { data: T | null; isLoading: boolean; stub: RpcTargetLike<T> | null } {
  const [data, setData] = useState<T | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const stubRef = useRef<RpcTargetLike<T> | null>(null)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)

    const target = getTarget()
    stubRef.current = target

    // Initial fetch
    target.getState().then((state) => {
      if (!cancelled) {
        setData(state)
        setIsLoading(false)
      }
    }).catch((err) => {
      console.error('[useRpcTarget] getState failed:', err)
      if (!cancelled) {
        setIsLoading(false)
      }
    })

    // Poll for updates — capnweb disposes callback params after the call
    // returns, so push-based callbacks don't work. The server maintains
    // event-driven state internally; we poll getState() to pick it up.
    const interval = setInterval(() => {
      if (cancelled) return
      target.getState().then((state) => {
        if (!cancelled) setData(state)
      }).catch(() => {})
    }, POLL_INTERVAL)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, deps)

  return { data, isLoading, stub: stubRef.current }
}
