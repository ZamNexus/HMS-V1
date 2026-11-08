import { QueryObserver } from "@tanstack/react-query"
import { afterEach, describe, expect, it, vi } from "vitest"
import { CACHE_CLASSES, FETCH_FRESH } from "./cacheClasses"
import { clearQueryCache, createQueryClient, getQueryClient } from "./client"
import { invalidateFamily } from "./invalidate"
import { NO_SCOPE, getQueryScope, scopedKey, setQueryScope } from "./scope"
import { SEARCH_DEBOUNCE_MS, createDebouncer, normalizeSearch } from "./search"

// F3: keys, cache classes, clearing on sign-out / user change, invalidation by family, search rules. React Query's own client runs in plain Node,
// so the rules are tested without a browser; the hooks that use them are covered by the browser suites.

afterEach(() => {
  setQueryScope(null)
  clearQueryCache()
})

const A = { hospitalId: "01HOSPITALAAAAAAAAAAAAAAAA", userId: "01USERAAAAAAAAAAAAAAAAAAAA" }
const B = { hospitalId: "01HOSPITALAAAAAAAAAAAAAAAA", userId: "01USERBBBBBBBBBBBBBBBBBBBB" }

describe("query keys", () => {
  it("start with [hospitalId, userId, family]", () => {
    setQueryScope(A)
    expect(scopedKey("patient", "01ID")).toEqual([A.hospitalId, A.userId, "patient", "01ID"])
    expect(scopedKey("organisations")).toEqual([A.hospitalId, A.userId, "organisations"])
  })

  it("before sign-in use a placeholder scope that cannot match a real ULID", () => {
    expect(getQueryScope()).toEqual(NO_SCOPE)
    expect(NO_SCOPE.userId).not.toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
  })

  it("two users never share a key for the same data", () => {
    setQueryScope(A)
    const a = scopedKey("patient", "01ID")
    setQueryScope(B)
    const b = scopedKey("patient", "01ID")
    expect(a).not.toEqual(b)
  })
})

describe("clearing the cache", () => {
  it("clears everything when the user changes or signs out, and keeps it when the scope is unchanged", async () => {
    // getQueryClient() returns a per-call client when there is no window (Node), so pretend to be a browser
    Object.defineProperty(globalThis, "window", { value: {}, configurable: true })
    try {
      const client = getQueryClient()
      setQueryScope(A)
      await client.fetchQuery({ queryKey: scopedKey("patient", "1"), queryFn: async () => ({ name: "PHI" }) })
      expect(client.getQueryCache().getAll()).toHaveLength(1)
      expect(setQueryScope(A)).toBe(false)
      expect(client.getQueryCache().getAll()).toHaveLength(1)
      expect(setQueryScope(B)).toBe(true)
      expect(client.getQueryCache().getAll()).toHaveLength(0)
      await client.fetchQuery({ queryKey: scopedKey("patient", "1"), queryFn: async () => ({ name: "PHI" }) })
      expect(setQueryScope(null)).toBe(true)
      expect(client.getQueryCache().getAll()).toHaveLength(0)
    } finally {
      delete (globalThis as { window?: unknown }).window
    }
  })
})

describe("invalidation by family", () => {
  it("refetches only the queries of the invalidated family", async () => {
    Object.defineProperty(globalThis, "window", { value: {}, configurable: true })
    try {
      const client = getQueryClient()
      setQueryScope(A)
      const patient = vi.fn(async () => "p")
      const panels = vi.fn(async () => "o")
      const opts = (family: string, fn: () => Promise<string>, id?: string) => ({ queryKey: scopedKey(family, id), queryFn: fn, staleTime: CACHE_CLASSES.reference.staleTime })
      await client.fetchQuery(opts("patient", patient, "1"))
      await client.fetchQuery(opts("patient", patient, "batch,2"))
      await client.fetchQuery(opts("organisations", panels))
      // fresh within 10 minutes: no new calls
      await client.fetchQuery(opts("patient", patient, "1"))
      expect(patient).toHaveBeenCalledTimes(2)
      await invalidateFamily("patient")
      await client.fetchQuery(opts("patient", patient, "1"))
      await client.fetchQuery(opts("patient", patient, "batch,2"))
      await client.fetchQuery(opts("organisations", panels))
      expect(patient).toHaveBeenCalledTimes(4)
      expect(panels).toHaveBeenCalledTimes(1)
    } finally {
      delete (globalThis as { window?: unknown }).window
    }
  })
})

describe("cache classes (MD section 6)", () => {
  it("match the documented table", () => {
    expect(CACHE_CLASSES.session.staleTime).toBe(Infinity)
    expect(CACHE_CLASSES.reference.staleTime).toBe(10 * 60_000)
    expect(CACHE_CLASSES.worklist).toMatchObject({ staleTime: 15_000, refetchInterval: 30_000, refetchOnWindowFocus: true })
    expect(CACHE_CLASSES.dashboard).toMatchObject({ staleTime: 60_000, refetchInterval: 60_000 })
    expect(CACHE_CLASSES.record.staleTime).toBe(0)
    expect(CACHE_CLASSES.register.staleTime).toBe(0)
    expect(FETCH_FRESH).toEqual({ staleTime: 0, gcTime: 0 })
  })
})

describe("client defaults", () => {
  it("never retries (the API client retries GETs; writes are never re-sent), never persists", async () => {
    const qc = createQueryClient()
    expect(qc.getDefaultOptions().queries?.retry).toBe(false)
    expect(qc.getDefaultOptions().mutations?.retry).toBe(false)
    // an observer (what a hook is) uses the client's default retry; the library's own default (3 retries, seconds apart) would call this 4 times
    const fail = vi.fn(async () => { throw new Error("boom") })
    const observer = new QueryObserver(qc, { queryKey: ["x"], queryFn: fail })
    await observer.refetch()
    expect(fail).toHaveBeenCalledTimes(1)
    expect(observer.getCurrentResult().isError).toBe(true)
  })

  it("a server render never shares a client between requests", () => {
    expect(typeof window).toBe("undefined")
    expect(getQueryClient()).not.toBe(getQueryClient())
  })
})

describe("search rules", () => {
  it("sends a term only from 2 characters, trimmed and at most 100", () => {
    expect(normalizeSearch("")).toBeUndefined()
    expect(normalizeSearch(" a ")).toBeUndefined()
    expect(normalizeSearch(" al ")).toBe("al")
    expect(normalizeSearch("x".repeat(150))).toHaveLength(100)
  })

  it("waits 300 ms after the last keystroke and only the last value is sent", () => {
    vi.useFakeTimers()
    try {
      const seen: string[] = []
      const d = createDebouncer<string>((v) => seen.push(v))
      d.push("al")
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 1)
      d.push("ali")
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 1)
      expect(seen).toEqual([])
      vi.advanceTimersByTime(1)
      expect(seen).toEqual(["ali"])
      d.push("zz")
      d.cancel()
      vi.advanceTimersByTime(1000)
      expect(seen).toEqual(["ali"])
    } finally {
      vi.useRealTimers()
    }
  })

  it("works with the REAL global timers, which in a browser throw 'Illegal invocation' when called with another object as `this`", () => {
    vi.useFakeTimers()
    const fakeSet = globalThis.setTimeout, fakeClear = globalThis.clearTimeout
    const strict = (name: string, inner: (...a: never[]) => unknown) =>
      function (this: unknown, ...args: never[]) {
        if (this !== undefined && this !== globalThis) throw new TypeError(`Illegal invocation (${name})`)
        return inner(...args)
      }
    vi.stubGlobal("setTimeout", strict("setTimeout", fakeSet as never))
    vi.stubGlobal("clearTimeout", strict("clearTimeout", fakeClear as never))
    try {
      const seen: string[] = []
      const d = createDebouncer<string>((v) => seen.push(v)) // default timers
      d.push("al")
      d.push("ali") // clears the pending one
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS)
      expect(seen).toEqual(["ali"])
      d.push("zz")
      d.cancel()
      vi.advanceTimersByTime(1000)
      expect(seen).toEqual(["ali"])
    } finally {
      vi.unstubAllGlobals()
      vi.useRealTimers()
    }
  })

  it("a changed key aborts the previous request (the signal React Query hands to the queryFn)", async () => {
    const qc = createQueryClient()
    let firstSignal: AbortSignal | undefined
    const slow = (ctx: { signal: AbortSignal }) => new Promise<string>((resolve) => { firstSignal = ctx.signal; ctx.signal.addEventListener("abort", () => resolve("aborted")) })
    const unsub = qc.getQueryCache().subscribe(() => {})
    const p = qc.fetchQuery({ queryKey: ["s", "al"], queryFn: slow })
    await Promise.resolve()
    await qc.cancelQueries({ queryKey: ["s", "al"] })
    await p.catch(() => undefined)
    expect(firstSignal?.aborted).toBe(true)
    unsub()
  })
})
