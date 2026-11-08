"use client"
import * as React from "react"
import { useQuery, type QueryKey } from "@tanstack/react-query"

/**
 * The shape the screens already use ({ data, error, loading, reload }, data null until loaded) on top of React Query, so a screen can move
 * from useResource without changing how it renders. `loading` is true while any request for the query is in flight (first load, reload or
 * background refresh); the previous data stays in `data` meanwhile.
 */
export function useQueryResource<T>(options: {
  queryKey: QueryKey
  queryFn: (ctx: { signal: AbortSignal }) => Promise<T>
  staleTime?: number
  enabled?: boolean
  refetchInterval?: number
  refetchOnWindowFocus?: boolean
}) {
  const q = useQuery<T>({ ...options })
  const { refetch } = q
  // stable identity: consumers memoise on `reload`
  const reload = React.useCallback(() => {
    void refetch()
  }, [refetch])
  return { data: (q.data ?? null) as T | null, error: q.error as unknown, loading: q.isFetching, reload }
}
