import { afterEach, describe, expect, it, vi } from "vitest"
import config from "../../next.config"

// Guards the production validation in next.config.ts (the CI placeholder must
// satisfy it, and a missing/invalid value must still fail the build).

type Rewrite = { source: string; destination: string }
const rewrites = async () => (await config.rewrites!()) as Rewrite[]

afterEach(() => vi.unstubAllEnvs())

describe("BACKEND_URL validation (next.config.ts)", () => {
  it("accepts the non-secret CI placeholder and proxies /api/* and /health to it", async () => {
    vi.stubEnv("BACKEND_URL", "https://hms-backend.invalid")
    expect(await rewrites()).toEqual([
      { source: "/api/:path*", destination: "https://hms-backend.invalid/api/:path*" },
      { source: "/health", destination: "https://hms-backend.invalid/health" },
    ])
  })

  it("normalises to the origin (drops path and trailing slash)", async () => {
    vi.stubEnv("BACKEND_URL", "http://localhost:3000/some/path/")
    expect((await rewrites())[0].destination).toBe("http://localhost:3000/api/:path*")
  })

  it("still fails when BACKEND_URL is missing or blank", async () => {
    vi.stubEnv("BACKEND_URL", "")
    await expect(rewrites()).rejects.toThrow(/BACKEND_URL is not set/)
    vi.stubEnv("BACKEND_URL", "   ")
    await expect(rewrites()).rejects.toThrow(/BACKEND_URL is not set/)
  })

  it("still fails for a non-URL or non-http(s) value", async () => {
    vi.stubEnv("BACKEND_URL", "not a url")
    await expect(rewrites()).rejects.toThrow(/not a valid absolute URL/)
    vi.stubEnv("BACKEND_URL", "ftp://example.test")
    await expect(rewrites()).rejects.toThrow(/must be http\(s\)/)
  })

  it("keeps the backend origin out of the client bundle (no NEXT_PUBLIC_ exposure, no env passthrough)", () => {
    expect(config.env ?? {}).not.toHaveProperty("BACKEND_URL")
    expect(JSON.stringify(config.env ?? {})).not.toMatch(/NEXT_PUBLIC_.*BACKEND/)
  })
})
