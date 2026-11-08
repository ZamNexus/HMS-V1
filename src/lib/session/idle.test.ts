import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { watchIdle } from "./idle"

// watchIdle against a fake window/document and a fake clock: 15 minutes of quiet signs out, any activity restarts the clock, a sleeping laptop is
// caught as soon as the tab is visible again, and stopping the watcher removes every listener.

type Handler = (e?: unknown) => void
let windowHandlers: Map<string, Set<Handler>>
let documentHandlers: Map<string, Set<Handler>>
const add = (m: Map<string, Set<Handler>>) => (type: string, h: Handler) => { (m.get(type) ?? m.set(type, new Set()).get(type)!).add(h) }
const remove = (m: Map<string, Set<Handler>>) => (type: string, h: Handler) => { m.get(type)?.delete(h) }
const fire = (m: Map<string, Set<Handler>>, type: string) => { for (const h of [...(m.get(type) ?? [])]) h() }
const listenerCount = (m: Map<string, Set<Handler>>) => [...m.values()].reduce((n, s) => n + s.size, 0)

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-11-07T10:00:00Z"))
  windowHandlers = new Map()
  documentHandlers = new Map()
  vi.stubGlobal("window", { addEventListener: add(windowHandlers), removeEventListener: remove(windowHandlers) })
  vi.stubGlobal("document", { visibilityState: "visible", addEventListener: add(documentHandlers), removeEventListener: remove(documentHandlers) })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("watchIdle", () => {
  it("fires once after 15 minutes without activity", () => {
    const onIdle = vi.fn()
    watchIdle(15 * 60_000, onIdle)
    vi.advanceTimersByTime(14 * 60_000)
    expect(onIdle).not.toHaveBeenCalled()
    vi.advanceTimersByTime(2 * 60_000)
    expect(onIdle).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(30 * 60_000)
    expect(onIdle).toHaveBeenCalledTimes(1)
  })

  it.each(["pointerdown", "keydown", "touchstart", "scroll", "wheel"])("%s counts as activity and restarts the clock", (type) => {
    const onIdle = vi.fn()
    watchIdle(15 * 60_000, onIdle)
    vi.advanceTimersByTime(14 * 60_000)
    fire(windowHandlers, type)
    vi.advanceTimersByTime(14 * 60_000)
    expect(onIdle).not.toHaveBeenCalled()
    vi.advanceTimersByTime(2 * 60_000)
    expect(onIdle).toHaveBeenCalledTimes(1)
  })

  it("a laptop that slept is caught the moment the tab is visible again", () => {
    const onIdle = vi.fn()
    watchIdle(15 * 60_000, onIdle)
    vi.setSystemTime(new Date("2026-11-07T12:00:00Z")) // two hours pass without a single timer tick
    fire(documentHandlers, "visibilitychange")
    expect(onIdle).toHaveBeenCalledTimes(1)
  })

  it("stopping removes every listener and the timer", () => {
    const onIdle = vi.fn()
    const stop = watchIdle(15 * 60_000, onIdle)
    expect(listenerCount(windowHandlers) + listenerCount(documentHandlers)).toBeGreaterThan(0)
    stop()
    expect(listenerCount(windowHandlers) + listenerCount(documentHandlers)).toBe(0)
    vi.advanceTimersByTime(60 * 60_000)
    expect(onIdle).not.toHaveBeenCalled()
  })
})
