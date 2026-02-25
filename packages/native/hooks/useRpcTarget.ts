import { useState, useEffect, useRef } from 'react'

interface RpcTargetLike<T> {
  getState(): Promise<T>
}

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

    return () => {
      cancelled = true
    }
  }, deps)

  return { data, isLoading, stub: stubRef.current }
}
