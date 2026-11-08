// Idle sign-out (MD section 7: an idle lock on shared terminals). The backend has no endpoint that checks a password without a new sign-in, so the
// "lock" is a sign-out after 15 minutes without a click, key, touch or scroll; unsaved form text stays in memory (see drafts.ts).
export function createIdleWatcher(options: { timeoutMs: number; now: () => number }) {
  let lastActivity = options.now()
  return {
    /** Record activity (a click, key press, touch or scroll). */
    touch() {
      lastActivity = options.now()
    },
    /** True when nothing happened for at least `timeoutMs`. */
    isIdle() {
      return options.now() - lastActivity >= options.timeoutMs
    },
    idleForMs() {
      return options.now() - lastActivity
    },
  }
}

const ACTIVITY_EVENTS = ["pointerdown", "keydown", "touchstart", "scroll", "wheel"] as const

/**
 * Watches the page for activity and calls `onIdle` once after `timeoutMs` of quiet. Returns a function that stops watching. Checking runs on a
 * 30 s tick (and when the tab becomes visible again), so a laptop that slept is caught as soon as it wakes.
 */
export function watchIdle(timeoutMs: number, onIdle: () => void, hooks: { onActivity?: () => void } = {}): (() => void) & { touch: () => void } {
  const watcher = createIdleWatcher({ timeoutMs, now: Date.now })
  let fired = false
  const check = () => {
    if (!fired && watcher.isIdle()) {
      fired = true
      onIdle()
    }
  }
  const touch = () => {
    watcher.touch()
    hooks.onActivity?.() // the other tabs are told (throttled by the caller), so a quiet background tab does not sign out a busy one
  }
  for (const e of ACTIVITY_EVENTS) window.addEventListener(e, touch, { passive: true })
  const tick = setInterval(check, 30_000)
  const onVisible = () => { if (document.visibilityState === "visible") check() }
  document.addEventListener("visibilitychange", onVisible)
  const stop = () => {
    for (const e of ACTIVITY_EVENTS) window.removeEventListener(e, touch)
    clearInterval(tick)
    document.removeEventListener("visibilitychange", onVisible)
  }
  // activity reported by ANOTHER tab counts here too (without announcing it again)
  return Object.assign(stop, { touch: () => watcher.touch() })
}
