import { describe, expect, it, vi } from "vitest"
import { describeShape, logLoginResponseShape } from "./devInspect"

const SECRETS = ["eyJhbGciOi.SECRET.TOKEN", "Dr Jane Secret", "user-123", "hunter2", "admin"]

const sample = {
  accessToken: SECRETS[0],
  expiresIn: 900,
  user: { id: SECRETS[2], fullName: SECRETS[1], active: true, deletedAt: null, roles: [SECRETS[4]], perms: [{ code: "x", scope: SECRETS[3] }], none: [] },
}

describe("describeShape", () => {
  it("returns keys, nesting and type names only", () => {
    expect(describeShape(sample)).toEqual({
      accessToken: "string",
      expiresIn: "number",
      user: {
        id: "string",
        fullName: "string",
        active: "boolean",
        deletedAt: "null",
        roles: ["array(1)", "string"],
        perms: ["array(1)", { code: "string", scope: "string" }],
        none: "array(0)",
      },
    })
  })

  it("never contains any value from the input", () => {
    const out = JSON.stringify(describeShape(sample))
    for (const secret of SECRETS) expect(out).not.toContain(secret)
    expect(out).not.toContain("900")
  })

  it("caps nesting depth", () => {
    let deep: unknown = "leaf-value"
    for (let i = 0; i < 20; i++) deep = { a: deep }
    expect(JSON.stringify(describeShape(deep))).not.toContain("leaf-value")
  })
})

describe("logLoginResponseShape", () => {
  it("logs only the structure", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {})
    logLoginResponseShape(sample)
    const logged = spy.mock.calls.flat().join("\n")
    spy.mockRestore()
    expect(logged).toContain("accessToken")
    for (const secret of SECRETS) expect(logged).not.toContain(secret)
  })

  it("refuses to log at all when NODE_ENV is production", () => {
    vi.stubEnv("NODE_ENV", "production")
    const spy = vi.spyOn(console, "info").mockImplementation(() => {})
    logLoginResponseShape(sample)
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
    vi.unstubAllEnvs()
  })
})
