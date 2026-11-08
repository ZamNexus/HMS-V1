// Unsaved form text kept IN MEMORY ONLY across a session that ends under the user's hands (12 h shift end, idle sign-out, a session ended by
// the server), so it can be restored after signing in again (MD section 3 and 7). Rules:
//  - memory only: a page reload loses it, and it is never written to localStorage, sessionStorage, a cookie or a URL (it may hold patient data);
//  - restored ONLY for the same user: signing in as someone else on the shared terminal drops it;
//  - an explicit sign-out clears it (the user chose to leave).
import type { EndReason } from "./session"

interface Store {
  userId: string
  items: Map<string, string>
}
let store: Store | null = null
/** True from an involuntary end of the session (shift end, idle, server-ended) until the next sign-in: a form that unmounts then KEEPS its text. */
let endedInvoluntarily = false

/** Remember a field/form value for this user. Call it as the user types (debounced) in forms that may be long. */
export function saveDraft(userId: string, key: string, value: string): void {
  if (!store || store.userId !== userId) store = { userId, items: new Map() }
  if (value === "") store.items.delete(key)
  else store.items.set(key, value)
}

// A draft is only worth restoring when it comes from a PAST session. While a form that owns the key is still on screen, the draft is that form's own live
// text: a new instance created in the same moment (the same form remounting with a new key after a reload) must start from the server's data, not from it.
const live = new Map<string, number>()
const liveKey = (userId: string, key: string) => `${userId}\u0000${key}`
/** A form that keeps a draft under `key` is mounted (call from an effect). */
export function markDraftLive(userId: string, key: string): void {
  live.set(liveKey(userId, key), (live.get(liveKey(userId, key)) ?? 0) + 1)
}
/** ...and is gone again (call from the effect's cleanup). */
export function markDraftGone(userId: string, key: string): void {
  const k = liveKey(userId, key)
  const n = (live.get(k) ?? 0) - 1
  if (n <= 0) live.delete(k)
  else live.set(k, n)
}

/**
 * The remembered value WITHOUT consuming it (a form reads it while it mounts, and React may mount twice in development). Undefined for another user, and
 * undefined while a form that owns the key is still on screen (see above).
 */
export function peekDraft(userId: string, key: string): string | undefined {
  if (!store || store.userId !== userId) return undefined
  if ((live.get(liveKey(userId, key)) ?? 0) > 0) return undefined
  return store.items.get(key)
}

/** The remembered value, once. Returns undefined for another user or when nothing was kept. */
export function takeDraft(userId: string, key: string): string | undefined {
  if (!store || store.userId !== userId) return undefined
  const value = store.items.get(key)
  store.items.delete(key)
  return value
}

export function hasDrafts(userId: string): boolean {
  return !!store && store.userId === userId && store.items.size > 0
}

export function clearDrafts(): void {
  store = null
  endedInvoluntarily = false
  live.clear()
}

/** Drop one form's text (saved, cancelled, or left behind by ordinary navigation). */
export function forgetDraft(userId: string, key: string): void {
  saveDraft(userId, key, "")
}

/**
 * Called when a form that kept a draft unmounts. The text is only meant to survive a session that ended under the user's hands; a form that
 * closed any other way (saved, cancelled, navigated away from) must not leave stale text behind to reappear in a fresh form.
 */
export function releaseDraftOnUnmount(userId: string, key: string): void {
  if (!endedInvoluntarily) forgetDraft(userId, key)
}

/** Called when the session ends: an explicit sign-out (or another tab's) drops the drafts, an involuntary end keeps them for the same user. */
export function onSessionEnded(reason: EndReason): void {
  if (reason === "signed-out" || reason === "signed-out-elsewhere") clearDrafts()
  else endedInvoluntarily = true
}

/** Called after a successful sign-in: drafts of a different user are dropped before anything can read them. */
export function onSignedIn(userId: string): void {
  if (store && store.userId !== userId) clearDrafts()
  endedInvoluntarily = false
}
