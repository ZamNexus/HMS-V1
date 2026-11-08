// The session scope every query key starts with: [hospitalId, userId, ...] (MD section 6). It is INJECTED, not read from the auth code, so
// this module does not depend on how sign-in works: chunk A2 calls setQueryScope after GET /auth/me, chunk A3 calls setQueryScope(null) on
// sign-out. A change of scope (another user, another hospital, or sign-out) clears the whole cache, so one user can never see another's data.
import { clearQueryCache } from "./client"

export interface QueryScope {
  hospitalId: string
  userId: string
}

/** Before sign-in nothing user-specific is cached; this placeholder never matches a real hospital or user id (both are 26-character ULIDs). */
export const NO_SCOPE: QueryScope = { hospitalId: "none", userId: "none" }

let current: QueryScope = NO_SCOPE
const listeners = new Set<() => void>()

/** For useSyncExternalStore: a mounted screen re-renders (and so builds new keys) when the signed-in user changes. */
export function subscribeQueryScope(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getQueryScope(): QueryScope {
  return current
}

/** Returns true when the scope really changed (and the cache was cleared). */
export function setQueryScope(next: QueryScope | null): boolean {
  const scope = next ?? NO_SCOPE
  if (scope.hospitalId === current.hospitalId && scope.userId === current.userId) return false
  current = scope
  clearQueryCache()
  for (const l of listeners) l()
  return true
}

export type QueryKeyPart = string | number | boolean | null | undefined | readonly unknown[] | Record<string, unknown>

/**
 * A query key: [hospitalId, userId, family, ...rest]. `family` names the kind of data ("patient", "organisations", ...) and is what
 * mutations invalidate by (see invalidateFamily).
 */
export function scopedKey(family: string, ...rest: QueryKeyPart[]): readonly unknown[] {
  return [current.hospitalId, current.userId, family, ...rest]
}

/** Where the family sits inside a scoped key. */
export const FAMILY_INDEX = 2
