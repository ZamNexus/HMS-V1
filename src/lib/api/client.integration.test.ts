import { afterEach, describe, expect, it } from "vitest"
import { ApiError, createApiClient, setAccessToken } from "./client"
import type { HealthResponse } from "./types"

// Live integration tests. They hit a RUNNING Next dev server (and, through its
// `/api/*` + `/health` rewrites, the real dev backend). No mocks.
//
//   npm run dev                                   # in one terminal
//   HMS_PROXY_URL=http://localhost:3005 npx vitest run client.integration
//
// Skipped when HMS_PROXY_URL is unset so `npm test` stays offline-safe.
const origin = process.env.HMS_PROXY_URL
const live = describe.skipIf(!origin)

// Resolves with the rejection reason or fails the test if the call succeeded.
async function rejection(p: Promise<unknown>): Promise<ApiError> {
  try {
    await p
  } catch (e) {
    return e as ApiError
  }
  throw new Error("expected the request to reject")
}

live("live API via the Next proxy", () => {
  const client = createApiClient({ origin })
  afterEach(() => setAccessToken(null))

  it("GET /health through the proxy", async () => {
    const health = await client.get<HealthResponse>("/health", { basePath: "" })
    expect(health.status).toBe("ok")
    expect(health.database).toBe("up")
    expect(typeof health.latencyMs).toBe("number")
  })

  it("surfaces a real 404 ErrorResponse (code + path)", async () => {
    const err = await rejection(client.get("/__does-not-exist__"))
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(404)
    expect(err.code).toBe("NOT_FOUND")
    expect(err.path).toBe("/api/v1/__does-not-exist__")
  })

  it("surfaces a real 401 for a protected route without a token, with requestId", async () => {
    const err = await rejection(client.get("/patients"))
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(401)
    expect(err.code).toBe("AUTHENTICATION_REQUIRED")
    expect(err.requestId).toBeTruthy()
  })

  it("delivers the Bearer token to the backend (invalid token is rejected as such)", async () => {
    setAccessToken("not-a-real-token")
    const err = await rejection(client.get("/patients"))
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(401)
    expect(err.code).toBe("INVALID_TOKEN") // differs from AUTHENTICATION_REQUIRED => header arrived
  })
})
