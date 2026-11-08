import { readFileSync } from "node:fs"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  ApiError, createApiClient, setAccessToken, setAuthRefreshHandler, setForbiddenHandler, setSessionOverHandler,
} from "@/lib/api/client"
import { createIdleWatcher } from "./idle"
import { SESSION_HINT_COOKIE, BACKEND_SESSION_COOKIE } from "./hint"
import { passwordErrorsFrom } from "./passwordErrors"
import { formatInstant, formatMoney, isValidTimezone, parseHospitalBranding, parseModules, parseSettings } from "./hospital"
import { parseRefresh, parseSessionUser, parseSignIn } from "./sessionUser"
import { readLastHospitalCode, rememberHospitalCode } from "./lastHospital"
import { resetSpecMismatchWarnings } from "@/lib/services/http/wire"

// How the API client and the session fit together (401 TOKEN_EXPIRED -> one shared refresh -> repeat once), and the readers/helpers around it.

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
const apiErr = (status: number, code: string) => json(status, { statusCode: status, code, message: `m ${code}`, requestId: "req-1", path: "/x", timestamp: "t" })
const ok = (body: unknown = { ok: true }) => json(200, body)

afterEach(() => {
  setAccessToken(null)
  setAuthRefreshHandler(null)
  setSessionOverHandler(null)
  setForbiddenHandler(null)
  vi.restoreAllMocks()
})

describe("401 TOKEN_EXPIRED: refresh, then repeat the call ONCE", () => {
  function setup(responses: Array<(req: { auth: string | null; method: string }) => Response>) {
    const calls: { method: string; auth: string | null }[] = []
    let i = 0
    const fetchMock = vi.fn<typeof fetch>(async (_url, init) => {
      const headers = new Headers(init?.headers)
      const rec = { method: String(init?.method), auth: headers.get("Authorization") }
      calls.push(rec)
      return responses[Math.min(i++, responses.length - 1)](rec)
    })
    return { client: createApiClient({ fetch: fetchMock, sleep: async () => {} }), calls }
  }

  it("a GET: refreshes, repeats with the NEW token, and returns the data", async () => {
    setAccessToken("old")
    let refreshes = 0
    setAuthRefreshHandler(async () => { refreshes++; setAccessToken("new") })
    const { client, calls } = setup([() => apiErr(401, "TOKEN_EXPIRED"), () => ok({ data: 1 })])
    await expect(client.get("/patients")).resolves.toEqual({ data: 1 })
    expect(refreshes).toBe(1)
    expect(calls.map((c) => c.auth)).toEqual(["Bearer old", "Bearer new"])
  })

  it("a write is repeated once too (the server rejected it BEFORE running it) and never a second time", async () => {
    setAccessToken("old")
    setAuthRefreshHandler(async () => { setAccessToken("new") })
    const { client, calls } = setup([() => apiErr(401, "TOKEN_EXPIRED"), () => apiErr(401, "TOKEN_EXPIRED")])
    await expect(client.post("/payments", { amount: "10.00" })).rejects.toMatchObject({ status: 401, code: "TOKEN_EXPIRED" })
    expect(calls).toHaveLength(2) // one try, one repeat after the refresh, no loop
  })

  it("two parallel calls with an expired token trigger exactly one refresh when the handler is single-flight", async () => {
    setAccessToken("old")
    let refreshes = 0
    let shared: Promise<void> | null = null
    setAuthRefreshHandler(() => (shared ??= (async () => { refreshes++; await Promise.resolve(); setAccessToken("new") })().finally(() => { shared = null })))
    const { client } = setup([(r) => (r.auth === "Bearer old" ? apiErr(401, "TOKEN_EXPIRED") : ok())])
    await Promise.all([client.get("/a"), client.get("/b"), client.get("/c")])
    expect(refreshes).toBe(1)
  })

  it("when the refresh fails (session over) the original 401 is reported and nothing is repeated", async () => {
    setAccessToken("old")
    setAuthRefreshHandler(async () => { throw new Error("session ended") })
    const { client, calls } = setup([() => apiErr(401, "TOKEN_EXPIRED"), () => ok()])
    await expect(client.get("/a")).rejects.toMatchObject({ code: "TOKEN_EXPIRED" })
    expect(calls).toHaveLength(1)
  })

  it("an unauthenticated call (sign-in, refresh) never triggers a refresh", async () => {
    const handler = vi.fn(async () => {})
    setAuthRefreshHandler(handler)
    const { client } = setup([() => apiErr(401, "TOKEN_EXPIRED")])
    await expect(client.post("/auth/refresh", undefined, { auth: false })).rejects.toBeInstanceOf(ApiError)
    expect(handler).not.toHaveBeenCalled()
  })

  it.each(["AUTHENTICATION_REQUIRED", "INVALID_TOKEN", "SESSION_ENDED", "SESSION_EXPIRED", "SESSION_REUSED", "SESSION_INVALID", "SESSION_MISSING"])("%s tells the app the session is over, once, and is not repeated", async (code) => {
    setAccessToken("t")
    const over = vi.fn()
    setSessionOverHandler(over)
    const { client, calls } = setup([() => apiErr(401, code)])
    await expect(client.get("/a")).rejects.toMatchObject({ code })
    expect(over).toHaveBeenCalledTimes(1)
    expect(over).toHaveBeenCalledWith(code, "t") // with the token the failed request used, so a late answer for another user can be ignored
    expect(calls).toHaveLength(1)
  })

  it("403 FORBIDDEN never signs the user out; it only lets the app re-read the permissions", async () => {
    setAccessToken("t")
    const over = vi.fn()
    const forbidden = vi.fn()
    setSessionOverHandler(over)
    setForbiddenHandler(forbidden)
    const { client } = setup([() => apiErr(403, "FORBIDDEN")])
    await expect(client.get("/users")).rejects.toMatchObject({ status: 403 })
    expect(over).not.toHaveBeenCalled()
    expect(forbidden).toHaveBeenCalledTimes(1)
  })
})

describe("the cookie names cannot collide", () => {
  it("the UI hint cookie is not the backend's refresh cookie, and the frontend never writes the backend's name", () => {
    expect(SESSION_HINT_COOKIE).not.toBe(BACKEND_SESSION_COOKIE)
    expect(BACKEND_SESSION_COOKIE).toBe("hms_session")
    const SRC = path.resolve(process.cwd(), "src")
    for (const f of ["proxy.ts", "lib/auth.tsx", "lib/session/session.ts"]) {
      const code = readFileSync(path.join(SRC, f), "utf8").replace(/\/\/.*$/gm, "")
      expect(code, f).not.toMatch(/["'`]hms_session["'`]/)
    }
  })
})

describe("readers", () => {
  const user = { id: "01U", username: "u", email: "u@x.pk", name: "N", role: "doctor", isPlatform: false, mustChangePassword: false, permissions: ["a.b", "a.b", "c.d"], hospital: { id: "01H", code: "H1", name: "Hosp", defaultCity: null, defaultCountry: "Pakistan" }, primaryLocationId: null }

  it("parseSessionUser keeps the permissions as sent (de-duplicated), tolerates the spec's array-typed email, and refuses a platform user without a hospital", () => {
    resetSpecMismatchWarnings()
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    expect(parseSessionUser(user).permissions).toEqual(["a.b", "c.d"])
    expect(parseSessionUser({ ...user, email: ["u@x.pk"] }).email).toBe("u@x.pk")
    expect(warn).toHaveBeenCalledTimes(1)
    expect(() => parseSessionUser({ ...user, hospital: null })).toThrow(TypeError)
    expect(() => parseSessionUser({ ...user, permissions: "all" })).toThrow(TypeError)
    expect(() => parseSessionUser({ ...user, mustChangePassword: "no" })).toThrow(TypeError)
    expect(() => parseSessionUser({ ...user, name: undefined })).toThrow(TypeError)
  })

  it("parseSignIn / parseRefresh need a Bearer token with a positive lifetime", () => {
    expect(parseSignIn({ accessToken: "t", tokenType: "Bearer", expiresIn: 900, user }).grant).toEqual({ accessToken: "t", expiresIn: 900 })
    expect(parseRefresh({ accessToken: "t", tokenType: "Bearer", expiresIn: 900, mustChangePassword: true })).toEqual({ accessToken: "t", expiresIn: 900, mustChangePassword: true })
    for (const bad of [{ accessToken: "", tokenType: "Bearer", expiresIn: 900 }, { accessToken: "t", tokenType: "Basic", expiresIn: 900 }, { accessToken: "t", tokenType: "Bearer", expiresIn: -1 }, { accessToken: "t", tokenType: "Bearer", expiresIn: "900" }]) {
      expect(() => parseSignIn({ ...bad, user })).toThrow(TypeError)
    }
    expect(() => parseRefresh({ accessToken: "t", tokenType: "Bearer", expiresIn: 900 })).toThrow(TypeError) // mustChangePassword is required
  })

  it("parseSettings reads currency, time zone and today; tolerates array-typed text fields; refuses a bad zone, date or currency", () => {
    resetSpecMismatchWarnings()
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const raw = { hospitalCode: "H1", nameEn: "Hosp", nameUr: null, address: ["Street 1"], phone: null, email: null, tagline: null, printHeader: null, defaultCity: null, defaultCountry: "Pakistan", timezone: "Asia/Karachi", currencyCode: "PKR", fiscalYearStart: "july", today: "2026-11-07", updatedAt: "2026-11-07T01:00:00.000Z" }
    expect(parseSettings(raw)).toMatchObject({ timezone: "Asia/Karachi", currencyCode: "PKR", today: "2026-11-07", address: "Street 1", updatedAt: "2026-11-07T01:00:00.000Z" })
    expect(() => parseSettings({ ...raw, timezone: "Mars/Olympus" })).toThrow(TypeError)
    expect(() => parseSettings({ ...raw, today: "07/11/2026" })).toThrow(TypeError)
    expect(() => parseSettings({ ...raw, currencyCode: "Rs." })).toThrow(TypeError)
  })

  it("parseModules gives the four switches; a module the server leaves out counts as OFF", () => {
    expect(parseModules({ data: [{ module: "pharmacy", enabled: true, enabledAt: null }, { module: "lab", enabled: false, enabledAt: null }] })).toEqual({ pharmacy: true, lab: false, imaging: false, ipd: false })
    expect(() => parseModules({ data: [{ module: "dental", enabled: true }] })).toThrow(TypeError)
    expect(() => parseModules({})).toThrow(TypeError)
  })

  it("parseHospitalBranding", () => {
    expect(parseHospitalBranding({ code: "citi", name: "Citi Clinic" })).toEqual({ code: "citi", name: "Citi Clinic" })
    expect(() => parseHospitalBranding({ code: 1 })).toThrow(TypeError)
  })
})

describe("hospital formatting (never the browser's currency, zone or clock)", () => {
  it("money stays a string end to end: large values and cents are exact", () => {
    expect(formatMoney("1250.50", "PKR")).toMatch(/1,250\.50/)
    expect(formatMoney("9007199254740993.10", "PKR")).toContain("9,007,199,254,740,993.10") // beyond double precision: a float would corrupt this
    expect(formatMoney("-5.00", "PKR")).toMatch(/5\.00/)
    expect(() => formatMoney("1e3", "PKR")).toThrow(TypeError)
    expect(() => formatMoney("12,50", "PKR")).toThrow(TypeError)
  })

  it("an instant is shown in the hospital's time zone", () => {
    const iso = "2026-11-06T22:30:00.000Z"
    expect(formatInstant(iso, "Asia/Karachi", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })).toBe("07/11/2026, 03:30")
    expect(formatInstant(iso, "UTC", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })).toBe("06/11/2026, 22:30")
    expect(() => formatInstant("nope", "UTC")).toThrow(TypeError)
    expect(isValidTimezone("Asia/Karachi")).toBe(true)
    expect(isValidTimezone("Not/AZone")).toBe(false)
  })
})

describe("password change errors", () => {
  const apiError = (status: number, code: string, details?: unknown) =>
    new ApiError({ status, code, message: `m ${code}`, requestId: "req-7", body: { statusCode: status, code, message: "x", requestId: "req-7", path: "/p", timestamp: "t", details: details as never } })

  it("lists every problem of a weak password under the new-password field", () => {
    const e = passwordErrorsFrom(apiError(422, "WEAK_PASSWORD", { problems: ["too short", "contains your username"] }))
    expect(e.problems).toEqual(["too short", "contains your username"])
    expect(e.next).toBeTruthy()
    expect(e.general).toBeUndefined()
  })
  it("INVALID_CURRENT_PASSWORD goes to the current-password field, PASSWORD_UNCHANGED to the new one", () => {
    expect(passwordErrorsFrom(apiError(422, "INVALID_CURRENT_PASSWORD")).current).toBe("m INVALID_CURRENT_PASSWORD")
    expect(passwordErrorsFrom(apiError(422, "PASSWORD_UNCHANGED")).next).toBe("m PASSWORD_UNCHANGED")
  })
  it("field validation errors land on their fields; anything else is a general message with the support reference", () => {
    const v = passwordErrorsFrom(apiError(400, "VALIDATION_FAILED", [{ path: "newPassword", message: "required" }]))
    expect(v.next).toBe("required")
    const g = passwordErrorsFrom(apiError(500, "INTERNAL_ERROR"))
    expect(g).toMatchObject({ general: "Could not change the password. Please try again.", requestId: "req-7" })
    expect(passwordErrorsFrom(new Error("x")).general).toMatch(/Something went wrong/)
  })
})

describe("idle watcher", () => {
  it("is idle only after the full timeout without activity, and activity restarts the clock", () => {
    let now = 0
    const w = createIdleWatcher({ timeoutMs: 15 * 60_000, now: () => now })
    now = 14 * 60_000
    expect(w.isIdle()).toBe(false)
    w.touch()
    now = 14 * 60_000 + 14 * 60_000
    expect(w.isIdle()).toBe(false)
    now += 60_000
    expect(w.isIdle()).toBe(true)
  })
})

describe("the remembered Hospital Code", () => {
  it("is stored and read back, trimmed; an empty code is ignored", () => {
    const store = new Map<string, string>()
    vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) })
    rememberHospitalCode("  citi ")
    expect(readLastHospitalCode()).toBe("citi")
    rememberHospitalCode("   ")
    expect(readLastHospitalCode()).toBe("citi")
    vi.unstubAllGlobals()
  })
  it("never throws when storage is blocked", () => {
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("blocked") }, setItem: () => { throw new Error("blocked") } })
    expect(readLastHospitalCode()).toBe("")
    expect(() => rememberHospitalCode("citi")).not.toThrow()
    vi.unstubAllGlobals()
  })
})
