import { afterEach, describe, expect, it, vi } from "vitest"
import { ApiError, NETWORK_ERROR } from "@/lib/api/client"
import { clearDrafts, hasDrafts, saveDraft } from "./drafts"
import { createSessionManager, describeSignInFailure, type ChannelMessage, type EndReason, type SessionChannel, type SessionDeps } from "./session"

// The session rules (MD section 3), with a scripted API, a manual clock and a fake tab channel. No browser, no network.

const U = (n: string) => "01HZX" + n.padEnd(21, "0")
const userBody = (over: Record<string, unknown> = {}) => ({
  id: U("USER1"), username: "tester", email: null, name: "Test User", role: "doctor", isPlatform: false, mustChangePassword: false,
  permissions: ["patients.read", "encounters.read"], hospital: { id: U("HOSP1"), code: "H1", name: "Test Hospital", defaultCity: null, defaultCountry: "Pakistan" }, primaryLocationId: null, ...over,
})
const signInBody = (over: Record<string, unknown> = {}) => ({ accessToken: "tok-1", tokenType: "Bearer", expiresIn: 900, user: userBody(over) })
const refreshBody = (token = "tok-2", over: Record<string, unknown> = {}) => ({ accessToken: token, tokenType: "Bearer", expiresIn: 900, mustChangePassword: false, ...over })
const err = (status: number, code: string, extra: Partial<ConstructorParameters<typeof ApiError>[0]> = {}) => new ApiError({ status, code, message: `message ${code}`, requestId: "req-1", ...extra })

type Step = unknown | Error | (() => unknown | Promise<unknown>)
function harness(script: Record<string, Step[]> = {}, over: Partial<SessionDeps> = {}) {
  const calls: { method: string; path: string; body?: unknown }[] = []
  const queues = new Map(Object.entries(script).map(([k, v]) => [k, [...v]]))
  const handle = async (method: string, path: string, body?: unknown) => {
    calls.push({ method, path, body })
    const q = queues.get(`${method} ${path}`)
    if (!q || q.length === 0) throw new Error(`unscripted call ${method} ${path}`)
    const step = q.length > 1 ? q.shift()! : q[0]
    const value = typeof step === "function" ? await (step as () => unknown)() : step
    if (value instanceof Error) throw value
    return value
  }
  let now = 1_000_000
  const timers: { id: number; at: number; fn: () => void }[] = []
  let nextId = 1
  const token = { value: null as string | null }
  const scopes: unknown[] = []
  const posted: unknown[] = []
  let channelHandler: ((m: ChannelMessage) => void) | null = null
  const channel: SessionChannel = { post: (m) => { posted.push(m) }, listen: (h) => { channelHandler = h; return () => { channelHandler = null } }, close: () => {} }
  const hints: boolean[] = []
  const owed = { value: false }
  let aborts = 0
  const ended: EndReason[] = []
  const signedIn: string[] = []
  let cacheClears = 0
  const deps: SessionDeps = {
    api: { get: ((p: string) => handle("GET", p)) as never, post: ((p: string, b?: unknown) => handle("POST", p, b)) as never },
    setToken: (t) => { token.value = t },
    getToken: () => token.value,
    sleep: async () => {},
    abortInFlight: () => { aborts++ },
    logoutPending: { read: () => owed.value, write: (on) => { owed.value = on } },
    now: () => now,
    setTimer: (fn, ms) => { const id = nextId++; timers.push({ id, at: now + ms, fn }); return id },
    clearTimer: (h) => { const i = timers.findIndex((t) => t.id === h); if (i >= 0) timers.splice(i, 1) },
    channel,
    setHint: (on) => { hints.push(on) },
    setScope: (s) => { scopes.push(s) },
    clearCache: () => { cacheClears++ },
    onEnded: (r) => { ended.push(r) },
    onSignedIn: (id) => { signedIn.push(id) },
    ...over,
  }
  const m = createSessionManager(deps)
  const advance = async (ms: number) => {
    now += ms
    for (const t of [...timers].sort((a, b) => a.at - b.at)) if (t.at <= now) { timers.splice(timers.indexOf(t), 1); t.fn(); await Promise.resolve() }
  }
  return {
    m, calls, token, scopes, posted, hints, ended, signedIn, timers, advance, owed, aborts: () => aborts,
    fromOtherTab: (message: Parameters<NonNullable<typeof channelHandler>>[0] = { type: "signout", from: "another-tab" }) => channelHandler?.(message),
    cacheClears: () => cacheClears,
  }
}
const paths = (calls: { method: string; path: string }[]) => calls.map((c) => `${c.method} ${c.path}`)

afterEach(() => clearDrafts())

describe("boot (page load or reload)", () => {
  it("with a valid cookie: refresh once, then /auth/me, signed in with the user, scope and hint set", async () => {
    const h = harness({ "POST /auth/refresh": [refreshBody()], "GET /auth/me": [userBody()] })
    expect(h.m.getState().status).toBe("booting")
    await h.m.boot()
    expect(paths(h.calls)).toEqual(["POST /auth/refresh", "GET /auth/me"])
    expect(h.m.getState()).toMatchObject({ status: "signed-in", endedReason: null, bootError: null })
    expect(h.m.getState().user?.permissions).toEqual(["patients.read", "encounters.read"])
    expect(h.token.value).toBe("tok-2")
    expect(h.scopes.at(-1)).toEqual({ hospitalId: U("HOSP1"), userId: U("USER1") })
    expect(h.hints.at(-1)).toBe(true)
    expect(h.signedIn).toEqual([U("USER1")])
  })

  it("without a session (no cookie): signed out quietly, /auth/me is never called, nothing in memory", async () => {
    const h = harness({ "POST /auth/refresh": [err(401, "SESSION_MISSING")] })
    await h.m.boot()
    expect(paths(h.calls)).toEqual(["POST /auth/refresh"])
    expect(h.m.getState()).toMatchObject({ status: "signed-out", user: null, endedReason: null, bootError: null })
    expect(h.token.value).toBeNull()
  })

  it("a shift that ended (SESSION_EXPIRED) is reported so the sign-in page can say so", async () => {
    const h = harness({ "POST /auth/refresh": [err(401, "SESSION_EXPIRED")] })
    await h.m.boot()
    expect(h.m.getState()).toMatchObject({ status: "signed-out", endedReason: "shift-ended" })
  })

  it("an unreachable server is reported as such, not as 'not signed in'", async () => {
    const h = harness({ "POST /auth/refresh": [err(0, NETWORK_ERROR)] })
    await h.m.boot()
    expect(h.m.getState().status).toBe("signed-out")
    expect(h.m.getState().bootError).toMatch(/Could not reach the server/)
  })

  it("boot runs once even if started twice (React strict mode)", async () => {
    const h = harness({ "POST /auth/refresh": [refreshBody()], "GET /auth/me": [userBody()] })
    await Promise.all([h.m.boot(), h.m.boot()])
    expect(h.calls.filter((c) => c.path === "/auth/refresh")).toHaveLength(1)
  })
})

describe("one refresh at a time", () => {
  it("parallel callers share ONE POST /auth/refresh and all get the same token", async () => {
    let release: () => void = () => {}
    const h = harness({ "POST /auth/refresh": [() => new Promise((r) => { release = () => r(refreshBody("shared")) })] })
    const a = h.m.refreshAccessToken()
    const b = h.m.refreshAccessToken()
    const c = h.m.refreshAccessToken()
    release()
    expect(await Promise.all([a, b, c])).toEqual(["shared", "shared", "shared"])
    expect(h.calls).toHaveLength(1)
    expect(h.token.value).toBe("shared")
  })

  it("401 SESSION_ROTATED (another tab refreshed first) is retried once and then succeeds", async () => {
    const h = harness({ "POST /auth/refresh": [err(401, "SESSION_ROTATED"), refreshBody("after-rotation")] })
    expect(await h.m.refreshAccessToken()).toBe("after-rotation")
    expect(h.calls).toHaveLength(2)
  })

  it("SESSION_ROTATED twice ends the session instead of looping", async () => {
    const h = harness({ "POST /auth/refresh": [err(401, "SESSION_ROTATED")] })
    await expect(h.m.refreshAccessToken()).rejects.toMatchObject({ name: "SessionEndedError" })
    expect(h.calls).toHaveLength(2)
    expect(h.token.value).toBeNull()
  })

  it.each(["SESSION_EXPIRED", "SESSION_REUSED", "SESSION_INVALID", "SESSION_MISSING", "SESSION_ENDED", "INVALID_TOKEN", "AUTHENTICATION_REQUIRED"])("%s signs the user out", async (code) => {
    const h = harness({ "POST /auth/refresh": [refreshBody(), err(401, code)], "GET /auth/me": [userBody()] })
    await h.m.boot()
    h.calls.length = 0
    await expect(h.m.refreshAccessToken()).rejects.toMatchObject({ name: "SessionEndedError" })
    expect(h.m.getState()).toMatchObject({ status: "signed-out", user: null, endedReason: code === "SESSION_EXPIRED" ? "shift-ended" : "session-ended" })
    expect(h.token.value).toBeNull()
    expect(h.scopes.at(-1)).toBeNull()
    expect(h.hints.at(-1)).toBe(false)
  })

  it("a refresh that cannot reach the server keeps the session and tries again in 30 s", async () => {
    const h = harness({ "POST /auth/refresh": [refreshBody(), err(0, NETWORK_ERROR), refreshBody("recovered")], "GET /auth/me": [userBody()] })
    await h.m.boot()
    await expect(h.m.refreshAccessToken()).rejects.toMatchObject({ code: NETWORK_ERROR })
    expect(h.m.getState().status).toBe("signed-in")
    expect(h.token.value).toBe("tok-2")
    await h.advance(30_000)
    await vi.waitFor(() => expect(h.token.value).toBe("recovered"))
  })

  it("refreshes about 60 s before the token runs out", async () => {
    const h = harness({ "POST /auth/refresh": [refreshBody("a"), refreshBody("b")], "GET /auth/me": [userBody()] })
    await h.m.boot()
    expect(h.timers).toHaveLength(1)
    await h.advance(839_000) // 900 s - 60 s = 840 s: not yet
    expect(h.calls.filter((c) => c.path === "/auth/refresh")).toHaveLength(1)
    await h.advance(1_000)
    await vi.waitFor(() => expect(h.calls.filter((c) => c.path === "/auth/refresh")).toHaveLength(2))
    expect(h.token.value).toBe("b")
  })

  it("the mustChangePassword flag from a refresh updates the user", async () => {
    const h = harness({ "POST /auth/refresh": [refreshBody("a"), refreshBody("b", { mustChangePassword: true })], "GET /auth/me": [userBody()] })
    await h.m.boot()
    await h.m.refreshAccessToken()
    expect(h.m.getState().user?.mustChangePassword).toBe(true)
  })
})

describe("sign in", () => {
  const creds = { hospitalCode: " H1 ", identifier: " tester ", password: "pw" }

  it("stores the token in memory, reads the whole user, sets scope and hint, clears the previous user's cache first", async () => {
    const h = harness({ "POST /auth/login": [signInBody()] })
    const res = await h.m.signIn(creds)
    expect(res).toEqual({ ok: true, mustChangePassword: false })
    expect(h.calls[0].body).toEqual({ hospitalCode: "H1", identifier: "tester", password: "pw" })
    expect(h.token.value).toBe("tok-1")
    expect(h.m.getState()).toMatchObject({ status: "signed-in" })
    expect(h.m.getState().user).toMatchObject({ id: U("USER1"), name: "Test User", role: "doctor", hospitalCode: "H1" })
    expect(h.scopes.at(-1)).toEqual({ hospitalId: U("HOSP1"), userId: U("USER1") })
    expect(h.cacheClears()).toBeGreaterThanOrEqual(1)
    expect(h.timers).toHaveLength(1) // proactive refresh scheduled
  })

  it("routes by mustChangePassword", async () => {
    const h = harness({ "POST /auth/login": [signInBody({ mustChangePassword: true })] })
    expect(await h.m.signIn(creds)).toEqual({ ok: true, mustChangePassword: true })
    expect(h.m.getState().user?.mustChangePassword).toBe(true)
  })

  it.each([
    ["INVALID_CREDENTIALS", 401, null, /message INVALID_CREDENTIALS/],
    ["ACCOUNT_LOCKED", 423, 540, /locked/],
    ["TOO_MANY_REQUESTS", 429, 60, /Too many attempts/],
    ["ACCOUNT_DEACTIVATED", 403, null, /contact your administrator/i],
    ["HOSPITAL_INACTIVE", 403, null, /contact support/i],
  ])("%s", async (code, status, retry, text) => {
    const h = harness({ "POST /auth/login": [err(status, code, { retryAfterSeconds: retry })] })
    const res = await h.m.signIn(creds)
    expect(res).toMatchObject({ ok: false, code, retryAfterSeconds: retry, requestId: "req-1" })
    expect(res.ok ? "" : res.error).toMatch(text)
    expect(h.token.value).toBeNull()
    expect(h.m.getState().user).toBeNull()
  })

  it("branches on the CODE, never on the message text", () => {
    const wrongText = new ApiError({ status: 423, code: "ACCOUNT_LOCKED", message: "Everything is fine, welcome!", retryAfterSeconds: 30 })
    expect(describeSignInFailure(wrongText)).toMatchObject({ code: "ACCOUNT_LOCKED", error: expect.stringMatching(/locked/), retryAfterSeconds: 30 })
    const lookalike = new ApiError({ status: 401, code: "SOMETHING_ELSE", message: "Account locked" })
    expect(describeSignInFailure(lookalike).retryAfterSeconds).toBeNull()
  })

  it("a response that is not a full sign-in response is refused and sets no token", async () => {
    for (const bad of [{ accessToken: "x" }, { ...signInBody(), tokenType: "Basic" }, { ...signInBody(), expiresIn: 0 }, signInBody({ permissions: "all" }), signInBody({ hospital: null }), null]) {
      const h = harness({ "POST /auth/login": [bad] })
      const res = await h.m.signIn(creds)
      expect(res).toMatchObject({ ok: false, error: expect.stringMatching(/unexpected sign-in response/) })
      expect(h.token.value).toBeNull()
      expect(h.m.getState().status).toBe("booting")
    }
  })

  it("never keeps the password or token anywhere but the request and the memory token", async () => {
    const h = harness({ "POST /auth/login": [signInBody()] })
    await h.m.signIn(creds)
    expect(JSON.stringify(h.m.getState())).not.toMatch(/pw"|tok-1/)
  })
})

describe("sign out", () => {
  const signedIn = async (extra: Record<string, Step[]> = {}) => {
    const h = harness({ "POST /auth/login": [signInBody()], "POST /auth/logout": [undefined], "POST /auth/logout-all": [undefined], ...extra })
    await h.m.signIn({ hospitalCode: "H1", identifier: "tester", password: "pw" })
    h.calls.length = 0
    return h
  }

  it("calls POST /auth/logout, then clears token, cache, scope and hint, and tells the other tabs", async () => {
    const h = await signedIn()
    let tokenDuringCall: string | null = null
    h.calls.length = 0
    const original = h.token.value
    const p = h.m.signOut()
    tokenDuringCall = h.token.value // still held while the logout call is made, so it is authorised
    await p
    expect(tokenDuringCall).toBe(original)
    expect(paths(h.calls)).toEqual(["POST /auth/logout"])
    expect(h.token.value).toBeNull()
    expect(h.m.getState()).toMatchObject({ status: "signed-out", user: null, endedReason: "signed-out" })
    expect(h.scopes.at(-1)).toBeNull()
    expect(h.hints.at(-1)).toBe(false)
    expect(h.posted.at(-1)).toMatchObject({ type: "signout", reason: "signed-out" })
    expect(h.aborts()).toBeGreaterThanOrEqual(1) // requests still in flight are cancelled
    expect(h.timers).toHaveLength(0)
  })

  it("clears local state even if the call fails (offline), and does not throw", async () => {
    const h = await signedIn({ "POST /auth/logout": [err(0, NETWORK_ERROR)] })
    await expect(h.m.signOut()).resolves.toBeUndefined()
    expect(h.token.value).toBeNull()
    expect(h.m.getState().status).toBe("signed-out")
  })

  it("'sign out everywhere' uses POST /auth/logout-all", async () => {
    const h = await signedIn()
    await h.m.signOut({ all: true })
    expect(paths(h.calls)).toEqual(["POST /auth/logout-all"])
  })

  it("is idempotent: a second sign-out sends nothing", async () => {
    const h = await signedIn()
    await h.m.signOut()
    h.calls.length = 0
    await h.m.signOut()
    expect(h.calls).toHaveLength(0)
  })

  it("another tab signing out signs this tab out too, without calling the backend again", async () => {
    const h = await signedIn()
    const stop = h.m.install()
    h.fromOtherTab()
    expect(h.m.getState()).toMatchObject({ status: "signed-out", endedReason: "signed-out-elsewhere" })
    expect(h.calls).toHaveLength(0)
    expect(h.token.value).toBeNull()
    stop()
  })

  it("a server answer that ends the session clears local state with the right reason", async () => {
    const h = await signedIn()
    h.m.handlers.sessionOver("SESSION_EXPIRED")
    expect(h.m.getState()).toMatchObject({ status: "signed-out", endedReason: "shift-ended" })
    const h2 = await signedIn()
    h2.m.handlers.sessionOver("INVALID_TOKEN")
    expect(h2.m.getState().endedReason).toBe("session-ended")
  })
})

describe("unsaved form text across a session that ends", () => {
  it("is kept for the same user after an involuntary end, dropped after an explicit sign-out", async () => {
    const { onSessionEnded, onSignedIn } = await import("./drafts")
    saveDraft(U("USER1"), "patient-form", "Ayesha")
    onSessionEnded("shift-ended")
    onSessionEnded("idle")
    onSessionEnded("session-ended")
    expect(hasDrafts(U("USER1"))).toBe(true)
    onSignedIn(U("USER1"))
    expect(hasDrafts(U("USER1"))).toBe(true)
    onSessionEnded("signed-out")
    expect(hasDrafts(U("USER1"))).toBe(false)
  })

  it("is never shown to a different user", async () => {
    const { onSignedIn, takeDraft } = await import("./drafts")
    saveDraft(U("USER1"), "patient-form", "Ayesha")
    expect(takeDraft(U("USER2"), "patient-form")).toBeUndefined()
    onSignedIn(U("USER2"))
    expect(takeDraft(U("USER1"), "patient-form")).toBeUndefined()
  })

  it("the manager passes the end reason on (idle keeps, explicit sign-out drops)", async () => {
    const h = harness({ "POST /auth/login": [signInBody()], "POST /auth/logout": [undefined] })
    await h.m.signIn({ hospitalCode: "H1", identifier: "t", password: "p" })
    await h.m.signOut({ reason: "idle" })
    expect(h.ended).toEqual(["idle"])
  })
})

describe("the user is read again when permissions may have changed", () => {
  it("after a 403 FORBIDDEN, at most once a minute", async () => {
    const h = harness({ "POST /auth/refresh": [refreshBody()], "GET /auth/me": [userBody(), userBody({ permissions: ["patients.read"] })] })
    await h.m.boot()
    h.calls.length = 0
    h.m.handlers.onForbidden()
    await vi.waitFor(() => expect(h.m.getState().user?.permissions).toEqual(["patients.read"]))
    h.m.handlers.onForbidden()
    h.m.handlers.onForbidden()
    expect(h.calls.filter((c) => c.path === "/auth/me")).toHaveLength(1)
    await h.advance(61_000)
    h.m.handlers.onForbidden()
    await vi.waitFor(() => expect(h.calls.filter((c) => c.path === "/auth/me")).toHaveLength(2))
  })

  it("on window focus once /auth/me is 15 minutes old", async () => {
    const h = harness({ "POST /auth/refresh": [refreshBody(), refreshBody("c")], "GET /auth/me": [userBody(), userBody({ permissions: ["billing.read"] })] })
    await h.m.boot()
    h.calls.length = 0
    h.m.handlers.onFocus()
    expect(h.calls).toHaveLength(0)
    await h.advance(16 * 60_000)
    h.calls.length = 0
    h.m.handlers.onFocus()
    await vi.waitFor(() => expect(h.calls.some((c) => c.path === "/auth/me" || c.path === "/auth/refresh")).toBe(true))
  })
})

describe("temporary password", () => {
  it("PASSWORD_CHANGE_REQUIRED marks the user, change-password then reloads /auth/me and the same token carries on", async () => {
    const h = harness({
      "POST /auth/login": [signInBody()], "POST /auth/change-password": [undefined],
      "GET /auth/me": [userBody({ mustChangePassword: false })],
    })
    await h.m.signIn({ hospitalCode: "H1", identifier: "t", password: "p" })
    h.m.handlers.onPasswordChangeRequired()
    expect(h.m.getState().user?.mustChangePassword).toBe(true)
    const tokenBefore = h.token.value
    await h.m.changePassword("old", "a-new-strong-pass")
    expect(h.calls.find((c) => c.path === "/auth/change-password")?.body).toEqual({ currentPassword: "old", newPassword: "a-new-strong-pass" })
    expect(h.m.getState().user?.mustChangePassword).toBe(false)
    expect(h.token.value).toBe(tokenBefore) // no second sign-in
  })

  it("a failed change leaves everything as it was and passes the error to the form", async () => {
    const weak = err(422, "WEAK_PASSWORD")
    const h = harness({ "POST /auth/login": [signInBody({ mustChangePassword: true })], "POST /auth/change-password": [weak] })
    await h.m.signIn({ hospitalCode: "H1", identifier: "t", password: "p" })
    await expect(h.m.changePassword("a", "b")).rejects.toBe(weak)
    expect(h.m.getState().user?.mustChangePassword).toBe(true)
  })
})

describe("review follow-ups: who is signed in when a late answer lands", () => {
  const signedInHarness = async (extra: Record<string, Step[]> = {}) => {
    const h = harness({ "POST /auth/login": [signInBody()], "POST /auth/logout": [undefined], ...extra })
    await h.m.signIn({ hospitalCode: "H1", identifier: "t", password: "p" })
    h.calls.length = 0
    return h
  }

  it("a refresh that finishes after sign-out sets no timer and cannot end a later session", async () => {
    let release: () => void = () => {}
    const h = await signedInHarness({ "POST /auth/refresh": [() => new Promise((r) => { release = () => r(refreshBody("late")) })] })
    const pending = h.m.refreshAccessToken()
    await h.m.signOut({ reason: "idle" })
    release()
    await pending
    expect(h.timers).toHaveLength(0) // nothing is left that could fire later and overwrite "idle" with "session-ended"
    expect(h.m.getState()).toMatchObject({ status: "signed-out", endedReason: "idle" })
  })

  it("a /auth/me for the previous user that lands after the next user signed in is dropped", async () => {
    let releaseMe: () => void = () => {}
    const h = harness({
      "POST /auth/login": [signInBody(), signInBody({ id: U("USER2"), name: "Second User" })],
      "GET /auth/me": [() => new Promise((r) => { releaseMe = () => r(userBody({ name: "FIRST USER (late)" })) })],
      "POST /auth/logout": [undefined],
    })
    await h.m.signIn({ hospitalCode: "H1", identifier: "a", password: "p" })
    const reload = h.m.reloadUser()
    await h.m.signOut()
    await h.m.signIn({ hospitalCode: "H1", identifier: "b", password: "p" })
    releaseMe()
    await reload
    expect(h.m.getState().user?.name).toBe("Second User")
    expect(h.scopes.at(-1)).toEqual({ hospitalId: U("HOSP1"), userId: U("USER2") })
  })

  it("a 401 session-over for a request the PREVIOUS user made does not sign the next user out", async () => {
    const h = await signedInHarness()
    h.m.handlers.sessionOver("SESSION_ENDED", "some-old-token")
    expect(h.m.getState().status).toBe("signed-in")
    h.m.handlers.sessionOver("SESSION_ENDED", h.token.value)
    expect(h.m.getState().status).toBe("signed-out")
  })

  it("a late 403 for another user's request does not reload this user", async () => {
    const h = await signedInHarness({ "GET /auth/me": [userBody()] })
    h.m.handlers.onForbidden("some-old-token")
    expect(h.calls.filter((c) => c.path === "/auth/me")).toHaveLength(0)
  })

  it("a refresh that fails with 401 for a user who is already gone does not sign the new user out", async () => {
    let fail: () => void = () => {}
    const h = harness({
      "POST /auth/login": [signInBody(), signInBody({ id: U("USER2") })],
      "POST /auth/logout": [undefined],
      "POST /auth/refresh": [() => new Promise((_r, rej) => { fail = () => rej(err(401, "SESSION_MISSING")) })],
    })
    await h.m.signIn({ hospitalCode: "H1", identifier: "a", password: "p" })
    const stale = h.m.refreshAccessToken().catch(() => {})
    await h.m.signOut()
    await h.m.signIn({ hospitalCode: "H1", identifier: "b", password: "p" })
    fail()
    await stale
    expect(h.m.getState()).toMatchObject({ status: "signed-in" })
    expect(h.m.getState().user?.id).toBe(U("USER2"))
  })

  it("only one sign-in runs at a time: a second submit joins the first", async () => {
    let release: () => void = () => {}
    const h = harness({ "POST /auth/login": [() => new Promise((r) => { release = () => r(signInBody()) })] })
    const a = h.m.signIn({ hospitalCode: "H1", identifier: "t", password: "p" })
    const b = h.m.signIn({ hospitalCode: "H1", identifier: "t", password: "p" })
    release()
    expect(await a).toEqual(await b)
    expect(h.calls.filter((c) => c.path === "/auth/login")).toHaveLength(1)
  })

  it("a sign-in whose 200 cannot be read ends the server session instead of leaving it alive behind a 'failed' form", async () => {
    const h = harness({ "POST /auth/login": [{ accessToken: "orphan-token", tokenType: "Bearer", expiresIn: 900, user: { id: "x" } }], "POST /auth/logout": [undefined] })
    const res = await h.m.signIn({ hospitalCode: "H1", identifier: "t", password: "p" })
    expect(res.ok).toBe(false)
    expect(h.calls.map((c) => c.path)).toEqual(["/auth/login", "/auth/logout"])
    expect(h.token.value).toBeNull()
  })
})

describe("review follow-ups: boot failures leave no live session behind", () => {
  it("/auth/me failing after a good refresh stops the refresh timer, drops the token and says why", async () => {
    const h = harness({ "POST /auth/refresh": [refreshBody()], "GET /auth/me": [err(500, "INTERNAL_ERROR")] })
    await h.m.boot()
    expect(h.m.getState()).toMatchObject({ status: "signed-out", user: null })
    expect(h.m.getState().bootError).toMatch(/Could not start your session/)
    expect(h.timers).toHaveLength(0)
    expect(h.token.value).toBeNull()
  })

  it("an unreadable /auth/me (a user without a hospital) also ends the server session", async () => {
    const h = harness({ "POST /auth/refresh": [refreshBody()], "GET /auth/me": [userBody({ hospital: null })], "POST /auth/logout": [undefined] })
    await h.m.boot()
    expect(h.calls.map((c) => c.path)).toEqual(["/auth/refresh", "/auth/me", "/auth/logout"])
    expect(h.m.getState().bootError).toBeTruthy()
  })

  it.each([[429, "TOO_MANY_REQUESTS"], [503, "UNEXPECTED_RESPONSE"], [0, NETWORK_ERROR]])("a refresh answered %i at boot keeps no session but explains it", async (status, code) => {
    const h = harness({ "POST /auth/refresh": [err(status, code)] })
    await h.m.boot()
    expect(h.m.getState().status).toBe("signed-out")
    expect(h.m.getState().bootError).toBeTruthy()
  })
})

describe("review follow-ups: refresh failures that are not about the session", () => {
  it.each([[429, "TOO_MANY_REQUESTS"], [500, "INTERNAL_ERROR"], [503, "UNEXPECTED_RESPONSE"], [0, "REQUEST_TIMEOUT"]])("%i keeps the session and tries again later", async (status, code) => {
    const h = harness({ "POST /auth/refresh": [refreshBody(), err(status, code)], "GET /auth/me": [userBody()] })
    await h.m.boot()
    await expect(h.m.refreshAccessToken()).rejects.toMatchObject({ code })
    expect(h.m.getState().status).toBe("signed-in")
    expect(h.timers).toHaveLength(1)
  })

  it("a 400 is not a verdict on the session either (it is reported, nobody is signed out)", async () => {
    const h = harness({ "POST /auth/refresh": [refreshBody(), err(400, "VALIDATION_FAILED")], "GET /auth/me": [userBody()] })
    await h.m.boot()
    await expect(h.m.refreshAccessToken()).rejects.toMatchObject({ code: "VALIDATION_FAILED" })
    expect(h.m.getState().status).toBe("signed-in")
  })
})

describe("review follow-ups: a logout the server never heard", () => {
  it("a logout that fails is remembered (so the next page load can finish it)", async () => {
    const h = harness({ "POST /auth/login": [signInBody()], "POST /auth/logout": [err(0, NETWORK_ERROR)] })
    await h.m.signIn({ hospitalCode: "H1", identifier: "t", password: "p" })
    await h.m.signOut()
    expect(h.owed.value).toBe(true)
    expect(h.m.getState().status).toBe("signed-out")
  })

  it("a new sign-in forgets a logout that was still owed (otherwise the next page load would sign the new session out)", async () => {
    const h = harness({ "POST /auth/login": [signInBody()] })
    h.owed.value = true
    await h.m.signIn({ hospitalCode: "H1", identifier: "tester", password: "pw" })
    expect(h.m.getState().status).toBe("signed-in")
    expect(h.owed.value).toBe(false)
  })

  it("a sign-in that happens while the logout call is still in flight keeps its token and is not marked as owing a logout", async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((r) => { release = r })
    const h = harness({ "POST /auth/refresh": [refreshBody()], "GET /auth/me": [userBody()], "POST /auth/logout": [async () => { await gate; return {} }], "POST /auth/login": [signInBody({ id: U("USER2") })] })
    await h.m.boot()
    const out = h.m.signOut()
    await Promise.resolve()
    await h.m.signIn({ hospitalCode: "H1", identifier: "second", password: "pw" })
    expect(h.token.value).toBe("tok-1")
    release()
    await out
    expect(h.token.value).toBe("tok-1") // the second user's token was not wiped by the first user's logout finishing
    expect(h.owed.value).toBe(false)
    expect(h.m.getState().status).toBe("signed-in")
  })

  it("boot with a logout owed delivers it and stays signed out", async () => {
    const h = harness({ "POST /auth/refresh": [refreshBody("for-logout")], "POST /auth/logout": [undefined] })
    h.owed.value = true
    await h.m.boot()
    expect(h.calls.map((c) => c.path)).toEqual(["/auth/refresh", "/auth/logout"])
    expect(h.m.getState()).toMatchObject({ status: "signed-out", user: null, endedReason: null })
    expect(h.owed.value).toBe(false)
    expect(h.token.value).toBeNull()
    expect(h.timers).toHaveLength(0)
  })

  it("when there is no server session left, the owed logout is dropped", async () => {
    const h = harness({ "POST /auth/refresh": [err(401, "SESSION_MISSING")] })
    h.owed.value = true
    await h.m.boot()
    expect(h.owed.value).toBe(false)
    expect(h.m.getState().status).toBe("signed-out")
  })

  it("when the connection is still down it stays owed, and coming back online delivers it", async () => {
    const h = harness({ "POST /auth/refresh": [err(0, NETWORK_ERROR), refreshBody("x")], "POST /auth/logout": [undefined] })
    h.owed.value = true
    await h.m.boot()
    expect(h.owed.value).toBe(true)
    h.m.handlers.onOnline()
    await vi.waitFor(() => expect(h.owed.value).toBe(false))
  })
})

describe("review follow-ups: several tabs", () => {
  it("another tab's idle or shift end keeps this user's unsaved text; its explicit sign-out drops it", async () => {
    for (const [reason, expected] of [["idle", "idle"], ["shift-ended", "shift-ended"], ["signed-out", "signed-out-elsewhere"], [undefined, "signed-out-elsewhere"]] as const) {
      const h = harness({ "POST /auth/login": [signInBody()] })
      await h.m.signIn({ hospitalCode: "H1", identifier: "t", password: "p" })
      h.m.install()
      h.fromOtherTab({ type: "signout", from: "other", reason })
      expect(h.m.getState().endedReason).toBe(expected)
      expect(h.ended.at(-1)).toBe(expected)
    }
  })

  it("a sign-in as a DIFFERENT user in another tab signs this tab out; the same user changes nothing", async () => {
    const h = harness({ "POST /auth/login": [signInBody()] })
    await h.m.signIn({ hospitalCode: "H1", identifier: "t", password: "p" })
    h.m.install()
    h.fromOtherTab({ type: "signin", from: "other", userId: U("USER1") })
    expect(h.m.getState().status).toBe("signed-in")
    h.fromOtherTab({ type: "signin", from: "other", userId: U("SOMEONE_ELSE") })
    expect(h.m.getState()).toMatchObject({ status: "signed-out", endedReason: "signed-out-elsewhere" })
  })

  it("a tab ignores its own messages and passes other tabs' activity on to the idle watcher", async () => {
    const h = harness({ "POST /auth/login": [signInBody()] })
    await h.m.signIn({ hospitalCode: "H1", identifier: "t", password: "p" })
    h.m.install()
    const seen = vi.fn()
    h.m.onPeerActivity(seen)
    h.fromOtherTab({ type: "activity", from: "other" })
    expect(seen).toHaveBeenCalledTimes(1)
    const own = h.posted.find((p) => (p as { type: string }).type === "signin") as { from: string }
    h.fromOtherTab({ type: "signout", from: own.from, reason: "idle" })
    expect(h.m.getState().status).toBe("signed-in")
  })

  it("this tab announces its own activity to the others, at most every 30 s", async () => {
    const h = harness({ "POST /auth/login": [signInBody()] })
    await h.m.signIn({ hospitalCode: "H1", identifier: "t", password: "p" })
    h.posted.length = 0
    h.m.announceActivity()
    h.m.announceActivity()
    expect(h.posted).toHaveLength(1)
    await h.advance(31_000)
    h.m.announceActivity()
    expect(h.posted).toHaveLength(2)
  })
})

describe("review follow-ups: temporary password", () => {
  it("a failed /auth/me after the 204 does not leave the user stuck on the change screen", async () => {
    const h = harness({ "POST /auth/login": [signInBody({ mustChangePassword: true })], "POST /auth/change-password": [undefined], "GET /auth/me": [err(500, "INTERNAL_ERROR")] })
    await h.m.signIn({ hospitalCode: "H1", identifier: "t", password: "p" })
    await h.m.changePassword("old", "a-new-strong-pass")
    expect(h.m.getState().user?.mustChangePassword).toBe(false)
  })
})

describe("review follow-ups: SESSION_ROTATED waits a moment for the other tab's cookie", () => {
  it("sleeps before the single retry", async () => {
    const slept: number[] = []
    const h = harness({ "POST /auth/refresh": [err(401, "SESSION_ROTATED"), refreshBody("ok")] }, { sleep: async (ms) => { slept.push(ms) } })
    expect(await h.m.refreshAccessToken()).toBe("ok")
    expect(slept).toEqual([300])
  })
})
