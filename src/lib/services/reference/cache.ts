// Tiny shared loader for reference data (no state library needed).
//
//  - Concurrent callers of the same key share ONE in-flight request (a page with several doctor
//    lookups makes a single list call).
//  - A settled result is reused for `ttlMs`; 0 means "always reload once settled" (mock mode: the demo
//    data is mutated directly by unmigrated screens, so a cache could show stale rows).
//  - Failures are never cached, so "Try again" really retries.
//  - Mutations invalidate by key prefix (see invalidatingService in ../index.ts).
// The loader takes no AbortSignal because the request is shared between consumers.

interface Entry {
  promise: Promise<unknown>
  settledAt: number | null
}

const entries = new Map<string, Entry>()

export function loadShared<T>(key: string, loader: () => Promise<T>, ttlMs: number, now: () => number = Date.now): Promise<T> {
  const hit = entries.get(key)
  if (hit && (hit.settledAt === null || now() - hit.settledAt < ttlMs)) return hit.promise as Promise<T>

  const entry: Entry = { promise: loader(), settledAt: null }
  entries.set(key, entry)
  entry.promise.then(
    () => { entry.settledAt = now() },
    () => { if (entries.get(key) === entry) entries.delete(key) }
  )
  return entry.promise as Promise<T>
}

/** Drops cached/in-flight results whose key starts with `prefix` (all keys if omitted). */
export function invalidateShared(prefix = ""): void {
  for (const key of [...entries.keys()]) if (key.startsWith(prefix)) entries.delete(key)
}
