// Search boxes (MD section 6): wait 300 ms after the last keystroke, start at 2 characters, cancel the previous request. The term goes to the
// API as the "search" parameter of a fetch and NEVER into the address bar (MD section 7).
export const SEARCH_DEBOUNCE_MS = 300
export const SEARCH_MIN_CHARS = 2
/** Pickers use the same list endpoint with a small page. */
export const PICKER_PER_PAGE = 6
/** The contract allows a search of 1..100 characters. */
export const SEARCH_MAX_CHARS = 100

/** The term to send, or undefined when nothing should be searched yet (fewer than 2 characters). */
export function normalizeSearch(raw: string): string | undefined {
  const term = raw.trim().slice(0, SEARCH_MAX_CHARS)
  return term.length >= SEARCH_MIN_CHARS ? term : undefined
}

/** A debouncer with an injectable clock (for tests). `push` replaces any pending value; `cancel` drops it. */
export function createDebouncer<T>(
  emit: (value: T) => void,
  ms = SEARCH_DEBOUNCE_MS,
  // Arrow wrappers, not bare `setTimeout`/`clearTimeout`: they are called as methods of this object, and in a browser a native timer called with
  // `this` = a plain object throws "Illegal invocation" (the injected test clocks are plain functions, so unit tests never saw it).
  timers: { set: typeof setTimeout; clear: typeof clearTimeout } = {
    set: ((fn: () => void, delay?: number) => setTimeout(fn, delay)) as typeof setTimeout,
    clear: ((h?: ReturnType<typeof setTimeout>) => clearTimeout(h)) as typeof clearTimeout,
  }
) {
  let handle: ReturnType<typeof setTimeout> | null = null
  return {
    push(value: T) {
      if (handle !== null) timers.clear(handle)
      handle = timers.set(() => {
        handle = null
        emit(value)
      }, ms)
    },
    cancel() {
      if (handle !== null) timers.clear(handle)
      handle = null
    },
  }
}
