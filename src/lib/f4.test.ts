import * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { ConflictBanner } from "@/components/shared/ConflictBanner"
import { ErrorState } from "@/components/shared/ErrorState"
import { RouteError } from "@/components/shared/RouteError"
import { ApiError, NETWORK_ERROR, OFFLINE, REQUEST_TIMEOUT } from "@/lib/api/client"
import { fetchAllPages, CSV_MAX_PAGES, toCSV } from "@/lib/csv"
import { describeFailure } from "@/lib/errorState"
import { logRouteError, loggableError } from "@/lib/errorLog"
import { applyFieldErrors, fieldErrorMap, isConflictChanged, isValidationFailed } from "@/lib/forms/fieldErrors"
import { NotConnectedError } from "@/lib/services/errors"
import { createSingleFlight } from "@/lib/singleFlight"

const api = (status: number, code: string, extra: Partial<ConstructorParameters<typeof ApiError>[0]> = {}) =>
  new ApiError({ status, code, message: `message for ${code}`, requestId: "req-42", ...extra })

describe("describeFailure (branches on code and status, never on the message)", () => {
  it.each([
    [api(0, OFFLINE), "offline", true],
    [api(0, NETWORK_ERROR), "network", true],
    [api(0, REQUEST_TIMEOUT), "timeout", true],
    [api(404, "NOT_FOUND"), "not-found", false],
    [api(400, "NOT_FOUND"), "other", true], // a message saying "not found" or any other text changes nothing: the code and status decide
    [api(401, "AUTHENTICATION_REQUIRED"), "session", false],
    [api(401, "SESSION_EXPIRED"), "session", false],
    [api(403, "FORBIDDEN"), "forbidden", false],
    [api(429, "TOO_MANY_REQUESTS", { retryAfterSeconds: 17 }), "rate-limited", true],
    [api(423, "ACCOUNT_LOCKED"), "rate-limited", true],
    [api(500, "INTERNAL_ERROR"), "server", true],
    [api(502, "UNEXPECTED_RESPONSE"), "server", true],
    [new Error("boom"), "other", true],
  ])("%#", (err, kind, canRetry) => {
    const v = describeFailure(err)
    expect(v.kind).toBe(kind)
    expect(v.canRetry).toBe(canRetry)
  })

  it("carries the request id and the wait time, and marks an unconnected endpoint as such", () => {
    expect(describeFailure(api(429, "TOO_MANY_REQUESTS", { retryAfterSeconds: 17 }))).toMatchObject({ requestId: "req-42", retryAfterSeconds: 17 })
    expect(describeFailure(new NotConnectedError("patients.list"))).toMatchObject({ kind: "not-connected", canRetry: false })
  })
})

describe("error components", () => {
  it("ErrorState shows the title, the support reference and a retry only when it can help, and never the response body", () => {
    const secret = "Ayesha Khan 0300-1234567"
    const err = api(500, "INTERNAL_ERROR", { message: secret, body: { statusCode: 500, code: "INTERNAL_ERROR", message: secret, requestId: "req-42", path: "/x", timestamp: "t", details: { patient: secret } } })
    const html = renderToStaticMarkup(React.createElement(ErrorState, { error: err, onRetry: () => {} }))
    expect(html).toContain('role="alert"')
    expect(html).toContain("req-42")
    expect(html).toContain("Try again")
    expect(html).not.toContain("Ayesha")
    expect(renderToStaticMarkup(React.createElement(ErrorState, { error: api(404, "NOT_FOUND"), onRetry: () => {} }))).not.toContain("Try again")
    expect(renderToStaticMarkup(React.createElement(ErrorState, { error: api(429, "TOO_MANY_REQUESTS", { retryAfterSeconds: 17 }) }))).toContain("17 seconds")
  })

  it("RouteError shows a support reference (request id, else the Next digest) and a reset button", () => {
    const html = renderToStaticMarkup(React.createElement(RouteError, { error: api(500, "INTERNAL_ERROR"), reset: () => {}, area: "patients" }))
    expect(html).toContain("req-42")
    expect(html).toContain("Try Again")
    const digestOnly = Object.assign(new Error("render failed"), { digest: "dg-7" })
    const html2 = renderToStaticMarkup(React.createElement(RouteError, { error: digestOnly, reset: () => {}, area: "patients" }))
    expect(html2).toContain("dg-7")
    expect(html2).not.toContain("render failed")
  })

  it("ConflictBanner says nothing was saved and offers the latest version", () => {
    const html = renderToStaticMarkup(React.createElement(ConflictBanner, { what: "patient", onReload: () => {}, requestId: "req-9" }))
    expect(html).toContain("Someone else changed this patient")
    expect(html).toContain("have not been saved")
    expect(html).toContain("Load latest")
    expect(html).toContain("req-9")
  })
})

describe("what may be logged", () => {
  it("the route error boundaries log through logRouteError, which prints no message, body or stack", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    try {
      logRouteError("patients", api(500, "INTERNAL_ERROR", { message: "Ayesha Khan 0300-1234567", path: "/api/v1/patients?search=0300" }))
      logRouteError("patients", Object.assign(new TypeError("Ayesha Khan"), { digest: "d9" }))
      const printed = JSON.stringify(spy.mock.calls)
      expect(spy).toHaveBeenCalledTimes(2)
      expect(printed).toContain("req-42")
      expect(printed).toContain("d9")
      expect(printed).not.toMatch(/Ayesha|0300|search/)
    } finally {
      spy.mockRestore()
    }
  })

  it("only names, codes and ids: never the message, the body or the URL", () => {
    const err = api(409, "POSSIBLE_DUPLICATE", { path: "/api/v1/patients?search=0300", body: { statusCode: 409, code: "POSSIBLE_DUPLICATE", message: "Ayesha Khan", requestId: "req-42", path: "/p", timestamp: "t", details: { matches: [{ name: "Ayesha Khan" }] } } })
    const logged = JSON.stringify(loggableError(err))
    expect(logged).toContain("POSSIBLE_DUPLICATE")
    expect(logged).toContain("req-42")
    expect(logged).not.toMatch(/Ayesha|0300|search/)
    expect(loggableError(Object.assign(new TypeError("secret text"), { digest: "d1" }))).toEqual({ name: "TypeError", code: null, status: null, requestId: null, digest: "d1" })
  })
})

describe("field errors from VALIDATION_FAILED", () => {
  const validation = api(400, "VALIDATION_FAILED", { body: { statusCode: 400, code: "VALIDATION_FAILED", message: "bad", requestId: "r", path: "/p", timestamp: "t", details: [{ path: "phone", message: "too short" }, { path: "coverages.0.panelId", message: "invalid" }, { path: "phone", message: "second message ignored" }] } })

  it("maps path to message, first message wins", () => {
    expect(isValidationFailed(validation)).toBe(true)
    expect(fieldErrorMap(validation)).toEqual({ phone: "too short", "coverages.0.panelId": "invalid" })
    expect(fieldErrorMap(api(409, "POSSIBLE_DUPLICATE", { body: { statusCode: 409, code: "x", message: "m", requestId: null, path: "p", timestamp: "t", details: { matches: [] } } }))).toEqual({})
  })

  it("places messages on known fields (with aliases) and returns the rest instead of hiding them", () => {
    const setError = vi.fn()
    const { unplaced } = applyFieldErrors(validation, setError, (n) => n === "phone" || n === "panel", { "coverages.0.panelId": "panel" })
    expect(setError).toHaveBeenCalledWith("phone", { type: "server", message: "too short" })
    expect(setError).toHaveBeenCalledWith("panel", { type: "server", message: "invalid" })
    expect(unplaced).toEqual([])
    const second = applyFieldErrors(validation, vi.fn(), (n) => n === "phone")
    expect(second.unplaced).toEqual([{ path: "coverages.0.panelId", message: "invalid" }])
  })

  it("recognises every *_CHANGED conflict and nothing else", () => {
    for (const code of ["PATIENT_CHANGED", "ENCOUNTER_CHANGED", "SETTINGS_CHANGED", "APPOINTMENT_CHANGED", "EXPENSE_CHANGED"]) expect(isConflictChanged(api(409, code))).toBe(true)
    expect(isConflictChanged(api(409, "SLOT_TAKEN"))).toBe(false)
    expect(isConflictChanged(api(400, "PATIENT_CHANGED"))).toBe(false)
    expect(isConflictChanged(new Error("PATIENT_CHANGED"))).toBe(false)
  })
})

describe("double submit", () => {
  it("a second call while the first is running is ignored (double click, Enter pressed again)", async () => {
    const run = createSingleFlight()
    let release: () => void = () => {}
    const action = vi.fn(() => new Promise<string>((resolve) => { release = () => resolve("saved") }))
    const first = run(action)
    const second = run(action)
    const third = run(action)
    expect(await second).toBeUndefined()
    expect(await third).toBeUndefined()
    release()
    expect(await first).toBe("saved")
    expect(action).toHaveBeenCalledTimes(1)
    // free again afterwards
    expect(await run(async () => "again")).toBe("again")
  })

  it("holdOnSuccess keeps the form locked after a success (a navigation or refetch follows), but a failure always releases", async () => {
    const run = createSingleFlight()
    expect(await run(async () => "created", { holdOnSuccess: true })).toBe("created")
    expect(await run(async () => "second click")).toBeUndefined()
    const other = createSingleFlight()
    await expect(other(async () => { throw new Error("x") }, { holdOnSuccess: true })).rejects.toThrow("x")
    expect(await other(async () => "retry after failure")).toBe("retry after failure")
  })

  it("is released when the action throws", async () => {
    const run = createSingleFlight()
    await expect(run(async () => { throw new Error("x") })).rejects.toThrow("x")
    expect(await run(async () => "ok")).toBe("ok")
  })
})

describe("CSV export", () => {
  it("fetches every page up to the cap and says when it stopped short", async () => {
    const pages = vi.fn(async (p: number) => ({ items: [`row${p}`], totalPages: 3 }))
    const all = await fetchAllPages(pages)
    expect(all).toMatchObject({ rows: ["row1", "row2", "row3"], complete: true, pagesFetched: 3 })
    const capped = await fetchAllPages(async (p) => ({ items: [p], totalPages: 500 }), 4)
    expect(capped).toMatchObject({ complete: false, pagesFetched: 4 })
    expect(capped.rows).toEqual([1, 2, 3, 4])
    expect(CSV_MAX_PAGES).toBe(50)
  })

  it("neutralises a patient name that starts like a formula", () => {
    expect(toCSV(["Name"], [["=cmd|' /C calc'!A0"]])).toBe("Name\n'=cmd|' /C calc'!A0")
  })
})
