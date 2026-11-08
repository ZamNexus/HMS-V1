import { describe, expect, it, vi } from "vitest"
import { ApiError, NETWORK_ERROR, OFFLINE, REQUEST_TIMEOUT, createApiClient } from "./client"

// Review follow-ups for F2: failures while the BODY is read, aborts during the back-off, offline for every write method, 5xx exhaustion,
// the 429 wait enforced locally, and what an ApiError exposes to a framework logger.

const ok = () => new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json" } })
async function rejection(p: Promise<unknown>): Promise<ApiError & { name: string }> {
  try {
    await p
  } catch (e) {
    return e as ApiError & { name: string }
  }
  throw new Error("expected the request to reject")
}
/** A 200 whose body stream fails after the headers (the connection drops mid-answer). */
const brokenBody = () => {
  const stream = new ReadableStream({ start(c) { c.error(new TypeError("terminated")) } })
  return new Response(stream, { status: 200, headers: { "content-type": "application/json" } })
}
/** A 200 whose body never finishes until the request is aborted. */
const hangingBody = (signal?: AbortSignal | null) => {
  const stream = new ReadableStream({
    start(c) { signal?.addEventListener("abort", () => c.error(new DOMException("aborted", "AbortError"))) },
  })
  return new Response(stream, { status: 200, headers: { "content-type": "application/json" } })
}

describe("failures while the answer body is being read", () => {
  it("a write whose body breaks mid-answer is reported as NETWORK_ERROR (status 0) and is not re-sent", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => brokenBody())
    const client = createApiClient({ fetch: fetchMock, sleep: async () => {} })
    const err = await rejection(client.post("/payments", {}))
    expect(err).toBeInstanceOf(ApiError)
    expect(err.code).toBe(NETWORK_ERROR)
    expect(err.status).toBe(0)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("a GET whose body breaks is retried like any network failure", async () => {
    const fetchMock = vi.fn<typeof fetch>()
    fetchMock.mockImplementationOnce(async () => brokenBody()).mockImplementationOnce(async () => ok())
    const client = createApiClient({ fetch: fetchMock, sleep: async () => {} })
    await expect(client.get("/x")).resolves.toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("the time limit firing while the body is still arriving is REQUEST_TIMEOUT, not a raw AbortError", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (_url, init) => hangingBody(init?.signal))
    const client = createApiClient({ fetch: fetchMock, sleep: async () => {}, timeoutMs: 20 })
    const err = await rejection(client.post("/payments", {}))
    expect(err).toBeInstanceOf(ApiError)
    expect(err.code).toBe(REQUEST_TIMEOUT)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("an error answer whose body breaks keeps NETWORK_ERROR rather than throwing a raw TypeError", async () => {
    const broken = () => new Response(new ReadableStream({ start(c) { c.error(new TypeError("terminated")) } }), { status: 500, headers: { "content-type": "application/json" } })
    const client = createApiClient({ fetch: vi.fn<typeof fetch>(async () => broken()), sleep: async () => {} })
    const err = await rejection(client.patch("/patients/1", {}))
    expect(err).toBeInstanceOf(ApiError)
  })
})

describe("back-off and exhaustion", () => {
  it("a caller who aborts during the back-off gets an AbortError at once, and no further request is sent", async () => {
    const controller = new AbortController()
    const fetchMock = vi.fn<typeof fetch>(async () => { throw new TypeError("fetch failed") })
    const client = createApiClient({ fetch: fetchMock, sleep: () => new Promise<void>(() => {}) /* never wakes up */ })
    const p = client.get("/x", { signal: controller.signal })
    await new Promise((r) => setTimeout(r, 10))
    controller.abort()
    const err = await rejection(p)
    expect(err.name).toBe("AbortError")
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("a GET that keeps failing with 500 is tried exactly three times (the first try and two retries)", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ statusCode: 500, code: "INTERNAL_ERROR", message: "x", requestId: "r", path: "/x", timestamp: "t" }), { status: 500, headers: { "content-type": "application/json" } }))
    const sleeps: number[] = []
    const client = createApiClient({ fetch: fetchMock, sleep: async (ms) => { sleeps.push(ms) } })
    const err = await rejection(client.get("/x"))
    expect(err.status).toBe(500)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(sleeps).toEqual([1000, 3000])
  })
})

describe("offline", () => {
  it.each(["post", "put", "patch", "delete"] as const)("%s is refused before it is sent", async (method) => {
    const fetchMock = vi.fn<typeof fetch>(async () => ok())
    const client = createApiClient({ fetch: fetchMock, isOnline: () => false })
    const err = await rejection(method === "delete" ? client.delete("/x") : client[method]("/x", {}))
    expect(err.code).toBe(OFFLINE)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe("the 429 wait is enforced locally", () => {
  it("after a 429 nothing is sent (reads, polling and writes) until the wait is over", async () => {
    let clock = 1_000_000
    const tooMany = () => new Response(JSON.stringify({ statusCode: 429, code: "TOO_MANY_REQUESTS", message: "slow down", requestId: "r", path: "/x", timestamp: "t" }), { status: 429, headers: { "content-type": "application/json", "retry-after": "30" } })
    const fetchMock = vi.fn<typeof fetch>()
    fetchMock.mockImplementationOnce(async () => tooMany()).mockImplementation(async () => ok())
    const client = createApiClient({ fetch: fetchMock, sleep: async () => {}, now: () => clock })
    expect((await rejection(client.get("/x"))).status).toBe(429)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    clock += 10_000
    const refused = await rejection(client.get("/x"))
    expect(refused.status).toBe(429)
    expect(refused.retryAfterSeconds).toBe(20)
    expect((await rejection(client.post("/payments", {}))).code).toBe("TOO_MANY_REQUESTS")
    expect(fetchMock).toHaveBeenCalledTimes(1) // none of those left the browser

    clock += 20_001
    await expect(client.get("/x")).resolves.toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe("what an ApiError exposes", () => {
  it("the backend path (it can carry a search term) and the response body are not enumerable, so a framework logger does not print them", () => {
    const err = new ApiError({
      status: 409, code: "POSSIBLE_DUPLICATE", message: "m", requestId: "req-1", path: "/api/v1/patients?search=Ayesha%20Khan",
      body: { statusCode: 409, code: "POSSIBLE_DUPLICATE", message: "Ayesha Khan", requestId: "req-1", path: "/p", timestamp: "t", details: { matches: [{ name: "Ayesha Khan" }] } },
    })
    expect(Object.keys(err)).not.toContain("body")
    expect(Object.keys(err)).not.toContain("path")
    expect(JSON.stringify(err)).not.toMatch(/Ayesha|search=/)
    // still readable for the code that needs it
    expect(err.path).toContain("search=")
    expect(err.body?.code).toBe("POSSIBLE_DUPLICATE")
  })
})
