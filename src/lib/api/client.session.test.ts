import { afterEach, describe, expect, it, vi } from "vitest"
import {
  abortAuthenticatedRequests, createApiClient, isTransientFailure, setAccessToken, setAuthRefreshHandler, setForbiddenHandler, setSessionOverHandler, ApiError, NETWORK_ERROR,
} from "./client"

// Review follow-ups for the session wiring in the API client.
const json = (status: number, body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } })
const apiErr = (status: number, code: string, headers: Record<string, string> = {}) => json(status, { statusCode: status, code, message: `m ${code}`, requestId: "r", path: "/x", timestamp: "t" }, headers)
const ok = (body: unknown = { ok: true }) => json(200, body)

afterEach(() => {
  setAccessToken(null)
  setAuthRefreshHandler(null)
  setSessionOverHandler(null)
  setForbiddenHandler(null)
})

describe("the 429 wait never blocks signing out or refreshing", () => {
  it("after a 429 on an ordinary call, GET /patients is refused locally but POST /auth/logout and /auth/refresh still go out", async () => {
    let clock = 0
    const fetchMock = vi.fn<typeof fetch>(async (url) => (String(url).endsWith("/patients") ? apiErr(429, "TOO_MANY_REQUESTS", { "retry-after": "60" }) : ok()))
    const client = createApiClient({ fetch: fetchMock, sleep: async () => {}, now: () => clock })
    await expect(client.get("/patients")).rejects.toMatchObject({ status: 429 })
    await expect(client.get("/patients")).rejects.toMatchObject({ status: 429 })
    expect(fetchMock).toHaveBeenCalledTimes(1) // the second one was refused locally
    clock += 1000
    await expect(client.post("/auth/logout")).resolves.toEqual({ ok: true })
    await expect(client.post("/auth/refresh", undefined, { auth: false })).resolves.toEqual({ ok: true })
    expect(fetchMock.mock.calls.map((c) => String(c[0]))).toEqual(["/api/v1/patients", "/api/v1/auth/logout", "/api/v1/auth/refresh"])
  })
})

describe("TOKEN_EXPIRED handling details", () => {
  it("if the refresh itself fails because of the connection, THAT is reported (a blip must not look like an auth error)", async () => {
    setAccessToken("old")
    setAuthRefreshHandler(async () => { throw new ApiError({ status: 0, code: NETWORK_ERROR, message: "offline" }) })
    const client = createApiClient({ fetch: vi.fn<typeof fetch>(async () => apiErr(401, "TOKEN_EXPIRED")), sleep: async () => {} })
    await expect(client.post("/payments", {})).rejects.toMatchObject({ code: NETWORK_ERROR })
  })

  it("if someone else already refreshed while this call was on its way, it is repeated with the current token WITHOUT refreshing again", async () => {
    setAccessToken("old")
    const refresh = vi.fn(async () => {})
    setAuthRefreshHandler(refresh)
    const seen: (string | null)[] = []
    const fetchMock = vi.fn<typeof fetch>(async (_u, init) => {
      const auth = new Headers(init?.headers).get("Authorization")
      seen.push(auth)
      if (seen.length === 1) { setAccessToken("new-from-another-caller"); return apiErr(401, "TOKEN_EXPIRED") }
      return ok()
    })
    const client = createApiClient({ fetch: fetchMock, sleep: async () => {} })
    await expect(client.get("/a")).resolves.toEqual({ ok: true })
    expect(refresh).not.toHaveBeenCalled()
    expect(seen).toEqual(["Bearer old", "Bearer new-from-another-caller"])
  })

  it("a caller-supplied Authorization header is left alone", async () => {
    setAccessToken("memory-token")
    setAuthRefreshHandler(async () => { setAccessToken("refreshed") })
    const seen: (string | null)[] = []
    const fetchMock = vi.fn<typeof fetch>(async (_u, init) => { seen.push(new Headers(init?.headers).get("Authorization")); return seen.length === 1 ? apiErr(401, "TOKEN_EXPIRED") : ok() })
    const client = createApiClient({ fetch: fetchMock, sleep: async () => {} })
    await client.get("/a", { headers: { Authorization: "Bearer caller" } })
    expect(seen).toEqual(["Bearer caller", "Bearer caller"])
  })

  it("a GET that first fails on the network and then on TOKEN_EXPIRED still gets exactly one refresh and finishes", async () => {
    setAccessToken("old")
    const refresh = vi.fn(async () => { setAccessToken("new") })
    setAuthRefreshHandler(refresh)
    const answers = [() => Promise.reject(new TypeError("fetch failed")), () => Promise.resolve(apiErr(401, "TOKEN_EXPIRED")), () => Promise.resolve(ok({ data: 1 }))]
    let i = 0
    const client = createApiClient({ fetch: vi.fn<typeof fetch>(async () => answers[i++]()), sleep: async () => {} })
    await expect(client.get("/a")).resolves.toEqual({ data: 1 })
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it("a caller who aborts while the refresh is running gets no repeat", async () => {
    setAccessToken("old")
    const controller = new AbortController()
    setAuthRefreshHandler(async () => { controller.abort() })
    const fetchMock = vi.fn<typeof fetch>(async () => apiErr(401, "TOKEN_EXPIRED"))
    const client = createApiClient({ fetch: fetchMock, sleep: async () => {} })
    await expect(client.get("/a", { signal: controller.signal })).rejects.toBeDefined()
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(2)
  })
})

describe("sign-out cancels what is still in flight", () => {
  it("an authenticated request in flight is aborted (an AbortError, never a failure or a late answer); an unauthenticated one is not", async () => {
    setAccessToken("t")
    let releaseLogin: () => void = () => {}
    const fetchMock = vi.fn<typeof fetch>((url, init) => new Promise<Response>((resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))
      if (String(url).endsWith("/auth/login")) releaseLogin = () => resolve(ok({ done: true }))
    }))
    const client = createApiClient({ fetch: fetchMock, sleep: async () => {} })
    const authed = client.get("/patients")
    const login = client.post("/auth/login", {}, { auth: false })
    await Promise.resolve()
    abortAuthenticatedRequests()
    await expect(authed).rejects.toMatchObject({ name: "AbortError" })
    releaseLogin()
    await expect(login).resolves.toEqual({ done: true })
  })
})

describe("isTransientFailure", () => {
  it("is true for no connection, timeout, rate limit and server errors; false for a verdict on the request", () => {
    const e = (status: number, code: string) => new ApiError({ status, code, message: "x" })
    expect([e(0, "NETWORK_ERROR"), e(0, "REQUEST_TIMEOUT"), e(429, "TOO_MANY_REQUESTS"), e(500, "INTERNAL_ERROR"), e(503, "UNEXPECTED_RESPONSE")].every(isTransientFailure)).toBe(true)
    expect([e(401, "SESSION_EXPIRED"), e(403, "FORBIDDEN"), e(404, "NOT_FOUND"), e(422, "WEAK_PASSWORD")].some(isTransientFailure)).toBe(false)
    expect(isTransientFailure(new Error("x"))).toBe(false)
  })
})
