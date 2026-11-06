"use client"
import * as React from "react"

interface ResourceState<T> {
  data: T | null
  error: unknown
  loading: boolean
}

/**
 * Loads async data with loading / error / reload handling. Previous data is
 * kept while a reload is in flight so tables don't flash empty on every search.
 * `load` must be stable (wrap it in useCallback); a new `load` triggers a reload.
 */
export function useResource<T>(load: (signal: AbortSignal) => Promise<T>) {
  const [state, setState] = React.useState<ResourceState<T>>({ data: null, error: null, loading: true })
  const [nonce, setNonce] = React.useState(0)

  React.useEffect(() => {
    const ctrl = new AbortController()
    let cancelled = false
    load(ctrl.signal)
      .then((data) => {
        if (!cancelled) setState({ data, error: null, loading: false })
      })
      .catch((error: unknown) => {
        if (!cancelled) setState((s) => ({ data: s.data, error, loading: false }))
      })
    return () => {
      cancelled = true
      ctrl.abort()
    }
  }, [load, nonce])

  const reload = React.useCallback(() => {
    setState((s) => ({ ...s, error: null, loading: true }))
    setNonce((n) => n + 1)
  }, [])

  return { ...state, reload }
}
