import { afterEach, describe, expect, it, vi } from "vitest"
import { classifyCreateError } from "@/lib/services/createOutcome"
import { errorSummary } from "@/lib/services/errors"
import {
  ApiError,
  DEFAULT_RETRY_AFTER_SECONDS,
  NETWORK_ERROR,
  OFFLINE,
  PASSWORD_CHANGE_REQUIRED,
  REQUEST_TIMEOUT,
  createApiClient,
  fieldErrorsOf,
  setAccessToken,
  setPasswordChangeRequiredHandler,
} from "./client"

// MD sections 3, 4 and 7: retries, time limit, offline, 429, error details. No real network: fetch and the clock are injected.

const body = (code: string, status: number, details?: unknown, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify({ statusCode: status, code, message: `msg ${code}`, details, requestId: "req-1", path: "/x", timestamp: "2026-01-01T00:00:00.000Z" }), {
    status,
    headers: { "content-type": "application/json", ...extra },
  })
const ok = () => new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json" } })
const networkFailure = () => Promise.reject(new TypeError("fetch failed"))

function make(responses: Array<() => Promise<Response>>, extra: { isOnline?: () => boolean; timeoutMs?: number } = {}) {
  let i = 0
  const fetchMock = vi.fn<typeof fetch>(async () => {
    const next = responses[Math.min(i, responses.length - 1)]
    i++
    return next()
  })
  const sleeps: number[] = []
  const client = createApiClient({ fetch: fetchMock, sleep: async (ms) => { sleeps.push(ms) }, ...extra })
  return { client, fetchMock, sleeps }
}
async function rejection(p: Promise<unknown>): Promise<ApiError> {
  try {
    await p
  } catch (e) {
    return e as ApiError
  }
  throw new Error("expected the request to reject")
}

afterEach(() => {
  setAccessToken(null)
  setPasswordChangeRequiredHandler(null)
})

describe("GET retries (MD section 7)", () => {
  it("retries a network failure twice, after 1 s and 3 s, then succeeds", async () => {
    const { client, fetchMock, sleeps } = make([networkFailure, networkFailure, async () => ok()])
    await expect(client.get("/patients")).resolves.toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(sleeps).toEqual([1000, 3000])
  })

  it("gives up after the second retry and reports NETWORK_ERROR", async () => {
    const { client, fetchMock } = make([networkFailure])
    const err = await rejection(client.get("/patients"))
    expect(err.code).toBe(NETWORK_ERROR)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it("retries a 500 and a gateway 502 page", async () => {
    const a = make([async () => body("INTERNAL_ERROR", 500), async () => ok()])
    await a.client.get("/x")
    expect(a.fetchMock).toHaveBeenCalledTimes(2)
    const b = make([async () => new Response("<html>bad gateway</html>", { status: 502, headers: { "content-type": "text/html" } }), async () => ok()])
    await b.client.get("/x")
    expect(b.fetchMock).toHaveBeenCalledTimes(2)
  })

  it.each([400, 401, 403, 404, 409, 422, 429])("never retries a GET that answered %i", async (status) => {
    const { client, fetchMock } = make([async () => body("SOMETHING", status)])
    const err = await rejection(client.get("/x"))
    expect(err.status).toBe(status)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe("writes are sent exactly once (the backend has no idempotency)", () => {
  const writes = [
    ["post", (c: ReturnType<typeof createApiClient>) => c.post("/payments", { amount: "10.00" })],
    ["put", (c: ReturnType<typeof createApiClient>) => c.put("/encounters/1/clinical-record", {})],
    ["patch", (c: ReturnType<typeof createApiClient>) => c.patch("/patients/1", {})],
    ["delete", (c: ReturnType<typeof createApiClient>) => c.delete("/things/1")],
  ] as const

  it.each(writes)("%s is not re-sent after a network failure", async (_name, call) => {
    const { client, fetchMock, sleeps } = make([networkFailure, async () => ok()])
    const err = await rejection(call(client))
    expect(err.code).toBe(NETWORK_ERROR)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(sleeps).toEqual([])
  })

  it.each(writes)("%s is not re-sent after a 500", async (_name, call) => {
    const { client, fetchMock } = make([async () => body("INTERNAL_ERROR", 500), async () => ok()])
    await rejection(call(client))
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  // Handoff 4 and 7: "409 TRANSACTION_CONFLICT: safe to retry once automatically" (the write was rolled back).
  it.each(writes)("%s is re-sent exactly ONCE after 409 TRANSACTION_CONFLICT, after a short pause, and succeeds if the repeat does", async (_name, call) => {
    const { client, fetchMock, sleeps } = make([async () => body("TRANSACTION_CONFLICT", 409), async () => ok()])
    await expect(call(client)).resolves.toBeDefined()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(sleeps).toEqual([250])
  })

  it.each(writes)("%s is NOT re-sent a second time when the repeat also hits 409 TRANSACTION_CONFLICT", async (_name, call) => {
    const { client, fetchMock } = make([async () => body("TRANSACTION_CONFLICT", 409), async () => body("TRANSACTION_CONFLICT", 409), async () => ok()])
    const err = await rejection(call(client))
    expect(err.code).toBe("TRANSACTION_CONFLICT")
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it.each(writes)("%s is not re-sent after any OTHER 409 (*_CHANGED, *_TAKEN, POSSIBLE_DUPLICATE are for the user to resolve)", async (_name, call) => {
    for (const code of ["PATIENT_CHANGED", "SERVICE_NAME_TAKEN", "POSSIBLE_DUPLICATE", "SETTINGS_CHANGED"]) {
      const { client, fetchMock } = make([async () => body(code, 409), async () => ok()])
      const err = await rejection(call(client))
      expect(err.code).toBe(code)
      expect(fetchMock).toHaveBeenCalledTimes(1)
    }
  })

  it("a GET is never treated as a transaction conflict (a 4xx GET is not retried)", async () => {
    const { client, fetchMock } = make([async () => body("TRANSACTION_CONFLICT", 409), async () => ok()])
    await rejection(client.get("/x"))
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe("429 and lockout", () => {
  it("is never re-sent; the wait comes from Retry-After", async () => {
    const { client, fetchMock } = make([async () => body("TOO_MANY_REQUESTS", 429, undefined, { "retry-after": "17" }), async () => ok()])
    const err = await rejection(client.get("/x"))
    expect(err.retryAfterSeconds).toBe(17)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("waits 60 s when there is no Retry-After", async () => {
    const { client } = make([async () => body("TOO_MANY_REQUESTS", 429)])
    expect((await rejection(client.post("/x", {}))).retryAfterSeconds).toBe(DEFAULT_RETRY_AFTER_SECONDS)
  })

  it("reads details.retryAfterSeconds for a lockout (423) and leaves other errors null", async () => {
    const locked = make([async () => body("ACCOUNT_LOCKED", 423, { retryAfterSeconds: 540 })])
    expect((await rejection(locked.client.post("/auth/login", {}, { auth: false }))).retryAfterSeconds).toBe(540)
    const notFound = make([async () => body("NOT_FOUND", 404)])
    expect((await rejection(notFound.client.get("/x"))).retryAfterSeconds).toBeNull()
  })
})

describe("time limit (30 s)", () => {
  it("aborts a request that never answers and reports REQUEST_TIMEOUT without retrying", async () => {
    const hang = (_url: unknown, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))))
    const fetchMock = vi.fn<typeof fetch>(hang as typeof fetch)
    const client = createApiClient({ fetch: fetchMock, sleep: async () => {}, timeoutMs: 20 })
    const err = await rejection(client.get("/slow"))
    expect(err.code).toBe(REQUEST_TIMEOUT)
    expect(err.status).toBe(0)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const post = await rejection(client.post("/slow", {}))
    expect(post.code).toBe(REQUEST_TIMEOUT)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("lets a caller's own abort through as an AbortError, not retried", async () => {
    const controller = new AbortController()
    const fetchMock = vi.fn<typeof fetch>(((_u: unknown, init?: RequestInit) =>
      new Promise<Response>((_r, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))))) as typeof fetch)
    const client = createApiClient({ fetch: fetchMock, sleep: async () => {} })
    const p = client.get("/x", { signal: controller.signal })
    controller.abort()
    await expect(p).rejects.toMatchObject({ name: "AbortError" })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe("offline", () => {
  it("refuses a write BEFORE sending it, but still tries a read", async () => {
    const { client, fetchMock } = make([async () => ok()], { isOnline: () => false })
    const err = await rejection(client.post("/patients", {}))
    expect(err.code).toBe(OFFLINE)
    expect(fetchMock).not.toHaveBeenCalled()
    await client.get("/patients")
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("tells the user nothing was sent (a create is safe to try again), unlike a timeout or dropped connection", () => {
    expect(classifyCreateError(new ApiError({ status: 0, code: OFFLINE, message: "x" }))).toMatchObject({ kind: "failed", heading: "You are offline", message: expect.stringContaining("Nothing was sent") })
    expect(classifyCreateError(new ApiError({ status: 0, code: REQUEST_TIMEOUT, message: "x" }))).toMatchObject({ message: expect.stringContaining("may or may not have been saved") })
    expect(classifyCreateError(new ApiError({ status: 0, code: NETWORK_ERROR, message: "x" }))).toMatchObject({ message: expect.stringContaining("may or may not have been saved") })
  })
})

describe("PASSWORD_CHANGE_REQUIRED", () => {
  it("calls the registered handler once per such response, and not for other 403s", async () => {
    const handler = vi.fn()
    setPasswordChangeRequiredHandler(handler)
    const a = make([async () => body(PASSWORD_CHANGE_REQUIRED, 403)])
    await rejection(a.client.get("/patients"))
    expect(handler).toHaveBeenCalledTimes(1)
    const b = make([async () => body("FORBIDDEN", 403)])
    await rejection(b.client.get("/patients"))
    expect(handler).toHaveBeenCalledTimes(1)
  })
})

describe("error details are a list for VALIDATION_FAILED and an object otherwise", () => {
  it("fieldErrorsOf reads the list and returns [] for objects, strings and missing details", async () => {
    const validation = await rejection(make([async () => body("VALIDATION_FAILED", 400, [{ path: "phone", message: "too short" }, { nope: 1 }])]).client.post("/x", {}))
    expect(fieldErrorsOf(validation)).toEqual([{ path: "phone", message: "too short" }])
    const dup = await rejection(make([async () => body("POSSIBLE_DUPLICATE", 409, { matches: [{ id: "a" }] })]).client.post("/x", {}))
    expect(fieldErrorsOf(dup)).toEqual([])
    expect(fieldErrorsOf(new Error("x"))).toEqual([])
    expect(fieldErrorsOf(undefined)).toEqual([])
  })

  it("errorSummary no longer crashes on an object details (it used to throw a TypeError on 409 / 429 / 423)", async () => {
    for (const [code, status, details] of [["POSSIBLE_DUPLICATE", 409, { matches: [] }], ["TOO_MANY_REQUESTS", 429, { retryAfterSeconds: 5 }], ["WEAK_PASSWORD", 422, { problems: ["too short"] }]] as const) {
      const err = await rejection(make([async () => body(code, status, details)]).client.post("/x", {}))
      expect(() => errorSummary(err)).not.toThrow()
      expect(errorSummary(err)).toContain(`msg ${code}`)
      expect(errorSummary(err)).toContain("(Reference: req-1)")
    }
    const validation = await rejection(make([async () => body("VALIDATION_FAILED", 400, [{ path: "name", message: "required" }])]).client.post("/x", {}))
    expect(errorSummary(validation)).toContain("name: required")
  })

  it("keeps the request id from the X-Request-Id header when a gateway answers with HTML", async () => {
    const html = async () => new Response("<html>502</html>", { status: 502, statusText: "Bad Gateway", headers: { "content-type": "text/html", "x-request-id": "gw-9" } })
    const err = await rejection(make([html, html, html]).client.get("/x"))
    expect(err.status).toBe(502)
    expect(err.requestId).toBe("gw-9")
  })
})
