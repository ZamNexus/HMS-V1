"use client"
import * as React from "react"
import { usePathname, useSearchParams } from "next/navigation"

/**
 * List filters kept in the address bar (handoff 6: "Filters live in the URL"), so back/forward, refresh and shared links keep the page and
 * the filters. Handoff 7 forbids names, phone numbers and CNICs in the URL, so only the keys the screen lists in `allowed` are ever read or
 * written, and the search box is NOT one of them (the screen sends it as a fetch parameter only). Values are plain strings.
 * The screen using this must sit under a <Suspense> boundary (useSearchParams).
 */
export function useUrlFilters<K extends string>(allowed: readonly K[]) {
  const params = useSearchParams()
  const pathname = usePathname()
  // The query string this hook last wrote. Two changes made before React has re-rendered (a "From" date, then a "To" date) must build on each other, not on the stale rendered
  // params, or the first would be lost; it is dropped once the router shows the same string.
  const written = React.useRef<string | null>(null)
  const rendered = params.toString()
  React.useEffect(() => { if (written.current === rendered) written.current = null }, [rendered])
  const get = React.useCallback((key: K): string | undefined => (allowed.includes(key) ? (params.get(key) ?? undefined) : undefined), [allowed, params])
  /** Sets (a string) or removes (undefined or "") the given keys in one navigation that does not add a history entry per keystroke. */
  const set = React.useCallback(
    (patch: Partial<Record<K, string | undefined>>) => {
      const next = new URLSearchParams(written.current ?? params.toString())
      for (const [key, value] of Object.entries(patch) as [K, string | undefined][]) {
        if (!allowed.includes(key)) throw new Error(`"${key}" is not a filter this screen keeps in the address bar.`)
        if (value === undefined || value === "") next.delete(key)
        else next.set(key, value)
      }
      const qs = next.toString()
      written.current = qs
      // The native history API (Next.js integrates it with useSearchParams): the pages are rendered per request now (the CSP nonce), and router.replace would make a server round
      // trip for every filter change. No history entry is added, exactly as before.
      window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname)
    },
    [allowed, params, pathname]
  )
  return { get, set }
}

/** A positive whole page number from the address bar, else 1. */
export function pageFromUrl(raw: string | undefined): number {
  const n = Number(raw)
  return Number.isInteger(n) && n >= 1 ? n : 1
}
