"use client"
import * as React from "react"
import { getQueryScope, scopedKey, subscribeQueryScope, type QueryKeyPart, type QueryScope } from "./scope"

/** The current session scope; the component re-renders when the signed-in user changes. */
export function useQueryScope(): QueryScope {
  return React.useSyncExternalStore(subscribeQueryScope, getQueryScope, getQueryScope)
}

/**
 * A query key [hospitalId, userId, family, ...rest] that follows the signed-in user: a mounted screen never keeps a key from the previous user
 * (scopedKey() alone reads a module variable at render time and would not re-render on a change).
 */
export function useScopedKey(family: string, ...rest: QueryKeyPart[]): readonly unknown[] {
  useQueryScope()
  return scopedKey(family, ...rest)
}
