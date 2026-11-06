import { afterEach, describe, expect, it, vi } from "vitest"
import { ApiError, NETWORK_ERROR, UNEXPECTED_RESPONSE, createApiClient, setAccessToken } from "./client"

// Unit tests: these verify how requests are CONSTRUCTED and how responses are
// mapped. They say nothing about the backend; see client.integration.test.ts.

function json(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json; charset=utf-8" },
    ...init,
  })
}

// Resolves with the rejection reason (typed loosely) or fails the test if the call succeeded.
async function rejection(p: Promise<unknown>): Promise<ApiError> {
  try {
    await p
  } catch (e) {
    return e as ApiError
  }
  throw new Error("expected the request to reject")
}

function setup(res: Response | (() => Promise<Response>)) {
  const fetchMock = vi.fn<typeof fetch>(async () => (typeof res === "function" ? res() : res))
  const client = createApiClient({ fetch: fetchMock })
  const lastCall = () => {
    const [url, init = {}] = fetchMock.mock.calls.at(-1)!
    return { url, init, headers: new Headers(init.headers) }
  }
  return { client, fetchMock, lastCall }
}

afterEach(() => setAccessToken(null))

describe("request construction", () => {
  it("prefixes /api/v1, sends credentials: include and JSON Accept", async () => {
    const { client, lastCall } = setup(json({ ok: true }))
    await client.get("/patients")
    const { url, init, headers } = lastCall()
    expect(url).toBe("/api/v1/patients")
    expect(init.method).toBe("GET")
    expect(init.credentials).toBe("include")
    expect(headers.get("Accept")).toBe("application/json")
    expect(init.body).toBeUndefined()
    expect(headers.has("Content-Type")).toBe(false)
  })

  it("serialises query params, skipping null/undefined and repeating arrays", async () => {
    const { client, lastCall } = setup(json({}))
    await client.get("/x", { query: { page: 2, q: "a b", skip: undefined, none: null, tag: ["a", "b"], on: false } })
    expect(lastCall().url).toBe("/api/v1/x?page=2&q=a+b&tag=a&tag=b&on=false")
  })

  it.each(["post", "put", "patch"] as const)("%s sends a JSON body with Content-Type", async (m) => {
    const { client, lastCall } = setup(json({ id: "1" }))
    await client[m]("/things", { amount: "10.50" })
    const { init, headers } = lastCall()
    expect(init.method).toBe(m.toUpperCase())
    expect(init.body).toBe('{"amount":"10.50"}')
    expect(headers.get("Content-Type")).toBe("application/json")
  })

  it("delete uses DELETE and handles 204 No Content", async () => {
    const { client, lastCall } = setup(new Response(null, { status: 204 }))
    await expect(client.delete("/things/1")).resolves.toBeUndefined()
    expect(lastCall().init.method).toBe("DELETE")
  })

  it("basePath '' reaches root-level endpoints like /health", async () => {
    const { client, lastCall } = setup(json({ status: "ok" }))
    await client.get("/health", { basePath: "" })
    expect(lastCall().url).toBe("/health")
  })

  it("origin config prefixes absolute URLs", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => json({}))
    const client = createApiClient({ origin: "http://localhost:3005/", fetch: fetchMock })
    await client.get("/health", { basePath: "" })
    expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:3005/health")
  })
})

describe("bearer token", () => {
  it("attaches Authorization when a token is set", async () => {
    setAccessToken("tok_123")
    const { client, lastCall } = setup(json({}))
    await client.get("/patients")
    expect(lastCall().headers.get("Authorization")).toBe("Bearer tok_123")
  })

  it("omits Authorization with no token or with auth: false", async () => {
    const a = setup(json({}))
    await a.client.get("/patients")
    expect(a.lastCall().headers.has("Authorization")).toBe(false)

    setAccessToken("tok_123")
    const b = setup(json({}))
    await b.client.post("/login", {}, { auth: false })
    expect(b.lastCall().headers.has("Authorization")).toBe(false)
  })

  it("does not override an explicit Authorization header", async () => {
    setAccessToken("tok_123")
    const { client, lastCall } = setup(json({}))
    await client.get("/x", { headers: { Authorization: "Bearer other" } })
    expect(lastCall().headers.get("Authorization")).toBe("Bearer other")
  })
})

describe("error handling", () => {
  const errorBody = {
    statusCode: 401,
    code: "AUTHENTICATION_REQUIRED",
    message: "Sign in to continue.",
    requestId: "req-1",
    path: "/api/v1/patients",
    timestamp: "2026-11-04T06:08:55.651Z",
  }

  it("maps an ErrorResponse to ApiError preserving code and requestId", async () => {
    const { client } = setup(json(errorBody, { status: 401 }))
    const err = await rejection(client.get("/patients"))
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({
      status: 401,
      code: "AUTHENTICATION_REQUIRED",
      message: "Sign in to continue.",
      requestId: "req-1",
      path: "/api/v1/patients",
    })
    expect(err.body).toEqual(errorBody)
  })

  it("falls back to the X-Request-Id header when the body requestId is null", async () => {
    const { client } = setup(
      json({ ...errorBody, code: "NOT_FOUND", requestId: null }, { status: 404, headers: { "content-type": "application/json", "x-request-id": "hdr-9" } })
    )
    const err = await rejection(client.get("/nope"))
    expect(err.code).toBe("NOT_FOUND")
    expect(err.requestId).toBe("hdr-9")
  })

  it("keeps the HTTP status for non-JSON error pages", async () => {
    const { client } = setup(new Response("<html>Bad gateway</html>", { status: 502, statusText: "Bad Gateway", headers: { "content-type": "text/html" } }))
    const err = await rejection(client.get("/x"))
    expect(err).toMatchObject({ status: 502, code: UNEXPECTED_RESPONSE, message: "Bad Gateway" })
  })

  it("flags a 2xx response that is not JSON", async () => {
    const { client } = setup(new Response("hello", { status: 200, headers: { "content-type": "text/plain" } }))
    await expect(client.get("/x")).rejects.toMatchObject({ code: UNEXPECTED_RESPONSE })
  })

  it("wraps transport failures as NETWORK_ERROR with status 0", async () => {
    const { client } = setup(async () => {
      throw new TypeError("fetch failed")
    })
    const err = await rejection(client.get("/x"))
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ status: 0, code: NETWORK_ERROR })
    expect(err.cause).toBeInstanceOf(TypeError)
  })

  it("lets caller aborts through untouched", async () => {
    const ctrl = new AbortController()
    ctrl.abort()
    const { client } = setup(async () => {
      throw new DOMException("aborted", "AbortError")
    })
    const err = await rejection(client.get("/x", { signal: ctrl.signal }))
    expect(err).not.toBeInstanceOf(ApiError)
    expect(err.name).toBe("AbortError")
  })
})

describe("no sensitive logging", () => {
  it("never writes the token or response bodies to the console, on success or failure", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}))
    setAccessToken("secret-token-123")
    const ok = setup(json({ ok: true }))
    await ok.client.get("/x")
    const bad = setup(json({ statusCode: 401, code: "AUTHENTICATION_REQUIRED", message: "secret-body", requestId: "r", path: "/x", timestamp: "t" }, { status: 401 }))
    await rejection(bad.client.get("/x"))
    const logged = spies.flatMap((s) => s.mock.calls).flat().join(" ")
    spies.forEach((s) => s.mockRestore())
    expect(logged).not.toMatch(/secret-token-123|secret-body/)
  })
})
