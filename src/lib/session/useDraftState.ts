"use client"
import * as React from "react"

import { useAuth } from "@/lib/auth"
import { forgetDraft, markDraftGone, markDraftLive, peekDraft, releaseDraftOnUnmount, saveDraft } from "./drafts"

/**
 * `useState` for a long free-text field whose text must survive a session that ends mid-edit (handoff 3 step 7 and 9: shift end, idle sign-out).
 * The text is held IN MEMORY only (see ./drafts.ts), for the same user only, and is restored the next time the same form opens after signing in.
 * A form that closes any other way (saved, cancelled, navigated away) leaves nothing behind.
 *
 * `key` names the form and field, never a patient (for example "imaging-test-template:new"). Returns the value, a setter, and whether the
 * initial value was restored from an earlier session.
 */
export function useDraftState(key: string, initial: string): [string, (next: string) => void, boolean] {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const [seed] = React.useState(() => {
    const kept = userId ? peekDraft(userId, key) : undefined
    return kept !== undefined && kept !== initial ? { value: kept, restored: true } : { value: initial, restored: false }
  })
  const [value, setValue] = React.useState(seed.value)
  const mounted = React.useRef(false)
  const latest = React.useRef(value)

  React.useEffect(() => {
    mounted.current = true
    if (userId) markDraftLive(userId, key)
    // a remount (development double-mount) re-saves what is on screen; a restored value stays kept until the form closes
    if (userId && latest.current !== initial) saveDraft(userId, key, latest.current)
    return () => {
      mounted.current = false
      if (!userId) return
      markDraftGone(userId, key)
      // Deferred one microtask: the session manager marks an involuntary end right after it notifies React, so this check runs after the flag is
      // set; and a development double-mount sets `mounted` again before it runs.
      queueMicrotask(() => { if (!mounted.current) releaseDraftOnUnmount(userId, key) })
    }
  }, [userId, key, initial])

  const set = React.useCallback((next: string) => {
    latest.current = next
    setValue(next)
    if (!userId) return
    if (next === initial) forgetDraft(userId, key) // back to what is saved: nothing to keep
    else saveDraft(userId, key, next)
  }, [userId, key, initial])

  return [value, set, seed.restored]
}
