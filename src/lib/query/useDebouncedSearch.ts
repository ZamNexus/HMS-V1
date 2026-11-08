"use client"
import * as React from "react"
import { createDebouncer, normalizeSearch } from "./search"

/**
 * `input` is what the box shows; `term` is what to send (debounced 300 ms, at least 2 characters, trimmed), or undefined for "no search".
 * Pair it with a query whose key contains `term`: React Query aborts the previous request when the key changes (forward the queryFn signal).
 */
export function useDebouncedSearch(initial = "") {
  const [input, setInput] = React.useState(initial)
  const [term, setTerm] = React.useState<string | undefined>(normalizeSearch(initial))
  const debouncer = React.useMemo(() => createDebouncer<string>((v) => setTerm(normalizeSearch(v))), [])
  React.useEffect(() => () => debouncer.cancel(), [debouncer])
  const onChange = React.useCallback(
    (value: string) => {
      setInput(value)
      // clearing the box (or dropping below 2 characters) takes effect at once; typing waits for the pause
      if (normalizeSearch(value) === undefined) {
        debouncer.cancel()
        setTerm(undefined)
      } else debouncer.push(value)
    },
    [debouncer]
  )
  return { input, term, onChange }
}
