// The session: sign-in, boot refresh, shared refresh, sign-out. No React in here, so every rule is unit-tested without a browser (MD section 3).
//   - The access token (15 min) lives in memory only (src/lib/api/client.ts). The refresh credential is an httpOnly cookie that only the browser can send.
//   - ONE refresh at a time: every caller that needs a token waits on the same promise (two parallel refreshes rotate the cookie twice and the
//     second one fails).
//   - Sign-out calls the backend, clears the token, the query cache and the scope, aborts requests still in flight, and tells the other tabs.
//   - An EPOCH counts every change of who is signed in. Anything that was started under an older epoch (a refresh, a /auth/me, a 401 for a request
//     the previous user made) is discarded when it lands, so one user's late answer can never act on the next user's session.
import {
  NETWORK_ERROR, REQUEST_TIMEOUT, abortAuthenticatedRequests, api as defaultApi, getAccessToken, isApiError, isTransientFailure, setAccessToken, type ApiClient,
} from "@/lib/api/client"
import { clearQueryCache } from "@/lib/query/client"
import { setQueryScope, type QueryScope } from "@/lib/query/scope"
import { onSessionEnded, onSignedIn } from "./drafts"
import { writeSessionHint } from "./hint"
import { readLogoutPending, writeLogoutPending } from "./logoutPending"
import { parseRefresh, parseSessionUser, parseSignIn, type SessionUser } from "./sessionUser"

/** Why the user is signed out. The sign-in page shows a short note for each (except "signed-out", which needs none). */
export type EndReason = "signed-out" | "shift-ended" | "session-ended" | "idle" | "signed-out-elsewhere"

export interface SessionState {
  /** "booting": the boot refresh is running; show a neutral splash, never the sign-in form. */
  status: "booting" | "signed-out" | "signed-in"
  user: SessionUser | null
  endedReason: EndReason | null
  /** Set when the boot could not finish for a reason other than "no session" (offline, server error): not the same as "not signed in". */
  bootError: string | null
}

export interface SignInInput {
  hospitalCode: string
  identifier: string
  password: string
}

export type SignInResult =
  | { ok: true; mustChangePassword: boolean }
  | { ok: false; error: string; code: string | null; retryAfterSeconds: number | null; requestId: string | null }

export const PROACTIVE_REFRESH_MARGIN_S = 60
/** After this much quiet the session is closed (MD section 7: idle lock on shared terminals; the backend has no password-check, so it signs out). */
export const IDLE_TIMEOUT_MS = 15 * 60_000
/** /auth/me is read again on window focus once it is this old (an admin may have changed the permissions). */
export const USER_REFRESH_MS = 15 * 60_000
/** A 403 FORBIDDEN re-read of /auth/me happens at most this often. */
const FORBIDDEN_RELOAD_MIN_GAP_MS = 60_000
const RETRY_AFTER_TRANSIENT_FAILURE_MS = 30_000
/** Another tab may have refreshed a moment ago; give its Set-Cookie time to land before asking again. */
const ROTATED_RETRY_DELAY_MS = 300
/** Activity is announced to the other tabs at most this often. */
const ACTIVITY_ANNOUNCE_GAP_MS = 30_000

const CHANNEL_NAME = "hms-session"
export type ChannelMessage =
  | { type: "signout"; from: string; reason?: EndReason }
  | { type: "signin"; from: string; userId: string }
  | { type: "activity"; from: string }

export interface SessionChannel {
  post(message: ChannelMessage): void
  listen(handler: (message: ChannelMessage) => void): () => void
  close(): void
}

/** Real BroadcastChannel when the browser has one, otherwise nothing (a single tab still works). Never created on the server. */
export function createBroadcastChannel(): SessionChannel | null {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return null
  const channel = new BroadcastChannel(CHANNEL_NAME)
  return {
    post: (m) => channel.postMessage(m),
    listen(handler) {
      const on = (e: MessageEvent) => {
        const d = e.data as ChannelMessage | null
        if (d && (d.type === "signout" || d.type === "signin" || d.type === "activity") && typeof d.from === "string") handler(d)
      }
      channel.addEventListener("message", on)
      return () => channel.removeEventListener("message", on)
    },
    close: () => channel.close(),
  }
}

export interface SessionDeps {
  api: Pick<ApiClient, "get" | "post">
  setToken: (token: string | null) => void
  getToken: () => string | null
  now: () => number
  sleep: (ms: number) => Promise<void>
  setTimer: (fn: () => void, ms: number) => unknown
  clearTimer: (handle: unknown) => void
  channel: SessionChannel | null
  /** The "UI hint" cookie the Next proxy reads to send visibly signed-out visitors to /login. It is not authentication. */
  setHint: (on: boolean) => void
  setScope: (scope: QueryScope | null) => void
  clearCache: () => void
  /** Cancel every request still in flight with the access token (sign-out, session over). */
  abortInFlight: () => void
  /** The session ended (any reason): lets unsaved form text be kept or dropped (drafts.ts). */
  onEnded: (reason: EndReason) => void
  /** A user is signed in: drafts of a different user are dropped. */
  onSignedIn: (userId: string) => void
  /** Whether a POST /auth/logout is still owed to the server (it could not be delivered earlier). */
  logoutPending: { read: () => boolean; write: (on: boolean) => void }
}

export function defaultDeps(): SessionDeps {
  return {
    api: defaultApi,
    setToken: setAccessToken,
    getToken: getAccessToken,
    now: Date.now,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    channel: createBroadcastChannel(),
    setHint: writeSessionHint,
    setScope: setQueryScope,
    clearCache: clearQueryCache,
    abortInFlight: abortAuthenticatedRequests,
    onEnded: onSessionEnded,
    onSignedIn,
    logoutPending: { read: readLogoutPending, write: writeLogoutPending },
  }
}

const SIGN_IN_FALLBACK: Extract<SignInResult, { ok: false }> = { ok: false, error: "Could not sign in. Please try again.", code: null, retryAfterSeconds: null, requestId: null }

/**
 * Branch on `code`, never on the message text (MD section 3). Our own wording is used for the codes the handoff lists; the backend's message is
 * shown only where it is meant for the user (wrong credentials, a validation problem) or where the client wrote it (no connection, timeout).
 */
export function describeSignInFailure(err: unknown): Extract<SignInResult, { ok: false }> {
  if (err instanceof TypeError) {
    return { ok: false, error: "The server sent an unexpected sign-in response. Please contact support.", code: null, retryAfterSeconds: null, requestId: null }
  }
  if (!isApiError(err)) return { ...SIGN_IN_FALLBACK, error: "Something went wrong while signing in. Please try again." }
  const base = { code: err.code, retryAfterSeconds: err.retryAfterSeconds, requestId: err.requestId }
  switch (err.code) {
    case "ACCOUNT_LOCKED":
      return { ok: false, error: "This account is locked after too many failed attempts.", ...base }
    case "ACCOUNT_DEACTIVATED":
      return { ok: false, error: "This account has been deactivated. Contact your administrator.", ...base }
    case "HOSPITAL_INACTIVE":
      return { ok: false, error: "This hospital is not active. Contact support.", ...base }
    case "TOO_MANY_REQUESTS":
      return { ok: false, error: "Too many attempts from this device. Please wait before trying again.", ...base }
    case "INVALID_CREDENTIALS": // "deliberately doesn't say which field was wrong"
    case "VALIDATION_FAILED":
      return { ok: false, error: err.message, ...base }
    default:
      // no connection / timeout / offline: the client's own wording; anything else (5xx, an unexpected body) gets a neutral sentence + the reference
      return { ok: false, error: err.status === 0 ? err.message : "Could not sign in. Please try again.", ...base }
  }
}

export class SessionEndedError extends Error {
  constructor(readonly reason: EndReason, readonly code: string | null) {
    super("The session has ended.")
    this.name = "SessionEndedError"
  }
}

/** Thrown inside the manager when an answer arrives for a user who is no longer the signed-in one. Never reaches a screen. */
class StaleSessionError extends Error {
  constructor() {
    super("stale")
    this.name = "StaleSessionError"
  }
}

const INITIAL: SessionState = { status: "booting", user: null, endedReason: null, bootError: null }

export function createSessionManager(deps: SessionDeps) {
  const tabId = Math.random().toString(36).slice(2)
  let state: SessionState = INITIAL
  const listeners = new Set<() => void>()
  const activityListeners = new Set<() => void>()
  let refreshing: Promise<string> | null = null
  let signingIn: Promise<SignInResult> | null = null
  let proactiveTimer: unknown = null
  let tokenExpiresAt = 0
  let userLoadedAt = 0
  let lastForbiddenReload = 0
  let lastActivityAnnounce = 0
  let bootPromise: Promise<void> | null = null
  let stopChannel: (() => void) | null = null
  /** Counts every change of who is signed in (sign-in, sign-out, session over). Work started under an older epoch is discarded. */
  let epoch = 0

  const set = (next: Partial<SessionState>) => {
    state = { ...state, ...next }
    for (const l of listeners) l()
  }

  function setUser(user: SessionUser | null) {
    deps.setScope(user ? { hospitalId: user.hospital.id, userId: user.id } : null)
    userLoadedAt = user ? deps.now() : 0
    set({ user })
  }

  function stopTimers() {
    if (proactiveTimer !== null) deps.clearTimer(proactiveTimer)
    proactiveTimer = null
    tokenExpiresAt = 0
  }

  function scheduleProactiveRefresh(expiresInSeconds: number) {
    stopTimers()
    tokenExpiresAt = deps.now() + expiresInSeconds * 1000
    // about 60 s before the token runs out; never sooner than 5 s (a very short test token must not loop)
    const delayMs = Math.max(5, expiresInSeconds - PROACTIVE_REFRESH_MARGIN_S) * 1000
    proactiveTimer = deps.setTimer(() => {
      proactiveTimer = null
      void refreshAccessToken().catch(() => {})
    }, delayMs)
  }

  /** Local sign-out only: no backend call. */
  function clearLocal(reason: EndReason) {
    epoch++
    stopTimers()
    deps.abortInFlight()
    deps.setToken(null)
    deps.setHint(false)
    deps.clearCache()
    setUser(null)
    set({ status: "signed-out", endedReason: reason, bootError: null })
    deps.onEnded(reason)
  }

  /**
   * ONE refresh in flight, shared by every caller. 401 SESSION_ROTATED (another tab refreshed first) is retried once, after a short pause so the
   * other tab's cookie has landed; any other 401 means the session is over. A failure that is not an answer from the server (offline, timeout,
   * 5xx, 429) keeps the session and retries in 30 s. A refresh that finishes AFTER the session ended or changed hands is dropped.
   */
  function refreshAccessToken(): Promise<string> {
    const startedIn = epoch
    refreshing ??= (async () => {
      for (let attempt = 0; ; attempt++) {
        try {
          const grant = parseRefresh(await deps.api.post<unknown>("/auth/refresh", undefined, { auth: false }))
          deps.setToken(grant.accessToken) // always: a sign-out in progress may need it to deliver its logout call
          if (startedIn === epoch && state.status !== "signed-out") {
            scheduleProactiveRefresh(grant.expiresIn)
            if (state.user && state.user.mustChangePassword !== grant.mustChangePassword) setUser({ ...state.user, mustChangePassword: grant.mustChangePassword })
          }
          return grant.accessToken
        } catch (err) {
          if (isApiError(err) && err.status === 401 && err.code === "SESSION_ROTATED" && attempt === 0) {
            await deps.sleep(ROTATED_RETRY_DELAY_MS)
            continue
          }
          if (startedIn !== epoch) throw err // someone else signed in or out meanwhile: this failure is not about the current session
          if (isTransientFailure(err)) {
            if (state.status === "signed-in") {
              // the token is about to run out and the server could not be reached: try again soon, replacing the usual (later) schedule
              if (proactiveTimer !== null) deps.clearTimer(proactiveTimer)
              proactiveTimer = deps.setTimer(() => {
                proactiveTimer = null
                void refreshAccessToken().catch(() => {})
              }, RETRY_AFTER_TRANSIENT_FAILURE_MS)
            }
            throw err
          }
          if (isApiError(err) && err.status === 401) {
            const reason: EndReason = err.code === "SESSION_EXPIRED" ? "shift-ended" : "session-ended"
            clearLocal(reason)
            throw new SessionEndedError(reason, err.code)
          }
          throw err
        }
      }
    })().finally(() => {
      refreshing = null
    })
    return refreshing
  }

  async function loadUser(): Promise<SessionUser> {
    const startedIn = epoch
    const user = parseSessionUser(await deps.api.get<unknown>("/auth/me"), "auth/me")
    // a late answer for the previous user must not become the current user
    if (startedIn !== epoch) throw new StaleSessionError()
    setUser(user)
    return user
  }

  /** Returns whether the server confirmed the sign-out. */
  async function backendSignOut(path: "/auth/logout" | "/auth/logout-all"): Promise<boolean> {
    try {
      // a short limit: signing out must work offline too (the local state is cleared whatever happens)
      await deps.api.post<unknown>(path, undefined, { timeoutMs: 5000 })
      return true
    } catch {
      // offline, already expired, server error: the local sign-out still happens, and the owed logout is remembered by the caller
      return false
    }
  }

  /** Delivers an owed POST /auth/logout (the page was left offline, or the call failed). */
  async function finishOwedLogout(): Promise<void> {
    try {
      await refreshAccessToken() // the cookie is the only credential left; this gives a token the logout call can carry
    } catch (err) {
      // no session left on the server: nothing to end. Anything transient: stays owed.
      if (err instanceof SessionEndedError || (isApiError(err) && err.status === 401)) deps.logoutPending.write(false)
      return
    }
    const delivered = await backendSignOut("/auth/logout")
    stopTimers()
    deps.setToken(null)
    deps.logoutPending.write(!delivered)
  }

  /** Page load or reload: the token in memory is gone but the cookie is not. Refresh once, then read the user. */
  function boot(): Promise<void> {
    bootPromise ??= (async () => {
      const startedIn = epoch
      try {
        if (deps.logoutPending.read()) {
          // the user signed out earlier but the server never heard: finish that first, do not sign them back in
          await finishOwedLogout()
          set({ status: "signed-out", endedReason: null, bootError: null })
          return
        }
        await refreshAccessToken()
        const user = await loadUser()
        deps.onSignedIn(user.id)
        deps.setHint(true)
        set({ status: "signed-in", endedReason: null, bootError: null })
      } catch (err) {
        if (err instanceof SessionEndedError) {
          // refreshAccessToken already cleared everything; a missing cookie (never signed in) is the normal case and says nothing
          set({ status: "signed-out", endedReason: err.reason === "shift-ended" ? "shift-ended" : null })
          return
        }
        if (err instanceof StaleSessionError || startedIn !== epoch) return
        // The refresh worked (or the server could not be asked) but the user could not be read. There must not be a live session hidden behind
        // the sign-in form: stop refreshing and drop the token. If the answer was unreadable (not an outage) end the server session too.
        stopTimers()
        if (!isApiError(err)) await backendSignOut("/auth/logout")
        deps.setToken(null)
        deps.setHint(false)
        set({
          status: "signed-out",
          user: null,
          bootError: isApiError(err) && err.status === 401
            ? null
            : isApiError(err) && (err.code === NETWORK_ERROR || err.code === REQUEST_TIMEOUT)
              ? "Could not reach the server. Check the connection and reload."
              : "Could not start your session. Reload the page, or contact support if it keeps happening.",
        })
      }
    })()
    return bootPromise
  }

  function signIn(input: SignInInput): Promise<SignInResult> {
    // one sign-in at a time: a second submit (Enter pressed again) joins the first
    signingIn ??= (async (): Promise<SignInResult> => {
      let raw: unknown
      try {
        raw = await deps.api.post<unknown>("/auth/login", { hospitalCode: input.hospitalCode.trim(), identifier: input.identifier.trim(), password: input.password }, { auth: false })
        const { grant, user } = parseSignIn(raw)
        // a second sign-in in the same page load must never see the previous user's cached data
        epoch++
        deps.abortInFlight()
        deps.clearCache()
        deps.setToken(grant.accessToken)
        // a logout still owed from an earlier session belonged to the cookie this sign-in just replaced; left set, the next page load would sign THIS session out
        deps.logoutPending.write(false)
        scheduleProactiveRefresh(grant.expiresIn)
        setUser(user)
        deps.onSignedIn(user.id)
        deps.setHint(true)
        set({ status: "signed-in", endedReason: null, bootError: null })
        deps.channel?.post({ type: "signin", from: tabId, userId: user.id })
        return { ok: true, mustChangePassword: user.mustChangePassword }
      } catch (err) {
        // The server accepted the sign-in but the answer could not be read: a session exists behind a form that says "failed". End it.
        if (err instanceof TypeError && raw && typeof raw === "object" && typeof (raw as { accessToken?: unknown }).accessToken === "string") {
          deps.setToken((raw as { accessToken: string }).accessToken)
          await backendSignOut("/auth/logout")
          deps.setToken(null)
        }
        return describeSignInFailure(err)
      }
    })().finally(() => {
      signingIn = null
    })
    return signingIn
  }

  async function signOut(options: { all?: boolean; reason?: EndReason } = {}): Promise<void> {
    if (state.status === "signed-out") return
    const reason = options.reason ?? "signed-out"
    epoch++
    const myEpoch = epoch
    // the screen leaves at once; the token stays in memory just long enough for the logout call to be authorised
    deps.setHint(false)
    deps.clearCache()
    deps.abortInFlight()
    setUser(null)
    set({ status: "signed-out", endedReason: reason, bootError: null })
    stopTimers()
    deps.onEnded(reason)
    deps.channel?.post({ type: "signout", from: tabId, reason })
    const delivered = await backendSignOut(options.all ? "/auth/logout-all" : "/auth/logout")
    // someone signed in while the logout call was in flight (it can take seconds): their token and timers are theirs, and the cookie this logout was for is gone
    if (epoch !== myEpoch) return
    stopTimers() // a refresh that ran for the logout call must not leave a timer behind
    deps.setToken(null)
    deps.logoutPending.write(!delivered)
  }

  /** The server said the session is over (a 401 with a session-over code): clear local state only. Ignored when it was meant for someone else. */
  function sessionOver(code: string, sentToken: string | null = null) {
    if (state.status === "signed-out") return
    if (sentToken !== null && sentToken !== deps.getToken()) return // a late answer for the previous user
    clearLocal(code === "SESSION_EXPIRED" ? "shift-ended" : "session-ended")
  }

  function onChannelMessage(m: ChannelMessage) {
    if (m.from === tabId) return
    if (m.type === "signout") {
      if (state.status === "signed-out") return
      // an involuntary end in the other tab (idle, shift end) keeps this user's unsaved text; an explicit sign-out does not
      const keep = m.reason === "idle" || m.reason === "shift-ended" || m.reason === "session-ended"
      clearLocal(keep ? (m.reason as EndReason) : "signed-out-elsewhere")
    } else if (m.type === "signin") {
      // another user signed in on this browser: this tab's session cookie now belongs to them
      if (state.user && state.user.id !== m.userId) clearLocal("signed-out-elsewhere")
    } else if (m.type === "activity") {
      for (const l of activityListeners) l()
    }
  }

  function install(): () => void {
    stopChannel = deps.channel?.listen(onChannelMessage) ?? null
    return () => {
      stopChannel?.()
      stopChannel = null
    }
  }

  /** The idle watcher calls this on activity; the other tabs are told (at most every 30 s) so a quiet background tab cannot sign out a busy one. */
  function announceActivity() {
    const t = deps.now()
    if (t - lastActivityAnnounce < ACTIVITY_ANNOUNCE_GAP_MS) return
    lastActivityAnnounce = t
    deps.channel?.post({ type: "activity", from: tabId })
  }
  function onPeerActivity(listener: () => void): () => void {
    activityListeners.add(listener)
    return () => activityListeners.delete(listener)
  }

  /** GET /auth/me again (after a password change, a 403, or a long time on the same screen). Failures other than a dead session are ignored. */
  async function reloadUser(): Promise<void> {
    try {
      await loadUser()
    } catch {
      // stale answer, offline, server error: the current user stays as it is; a dead session is handled by the 401 path
    }
  }

  /** A 403 FORBIDDEN may mean an admin changed the permissions: read them again, at most once a minute. Ignored when it was meant for someone else. */
  function onForbidden(sentToken: string | null = null) {
    if (state.status !== "signed-in") return
    if (sentToken !== null && sentToken !== deps.getToken()) return
    const t = deps.now()
    if (t - lastForbiddenReload < FORBIDDEN_RELOAD_MIN_GAP_MS) return
    lastForbiddenReload = t
    void reloadUser()
  }

  /** The window came back into focus: refresh a token that is about to expire and re-read /auth/me when it is old. */
  function onFocus() {
    if (state.status !== "signed-in") return
    const t = deps.now()
    if (tokenExpiresAt > 0 && tokenExpiresAt - t < PROACTIVE_REFRESH_MARGIN_S * 1000) void refreshAccessToken().catch(() => {})
    else if (userLoadedAt > 0 && t - userLoadedAt > USER_REFRESH_MS) void reloadUser()
  }

  /** The browser came back online: deliver a logout that could not be sent before. */
  function onOnline() {
    if (state.status === "signed-out" && deps.logoutPending.read()) void finishOwedLogout()
  }

  function onPasswordChangeRequired() {
    if (state.user && !state.user.mustChangePassword) setUser({ ...state.user, mustChangePassword: true })
  }

  /**
   * POST /auth/change-password. The same access token keeps working after the 204; the other sessions of the user are ended by the server.
   * After the 204 the password is known to be changed, so the user is released at once; /auth/me is read again in the background.
   */
  async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const startedIn = epoch
    await deps.api.post<unknown>("/auth/change-password", { currentPassword, newPassword })
    if (startedIn === epoch && state.user && state.user.mustChangePassword) setUser({ ...state.user, mustChangePassword: false })
    void reloadUser()
  }

  return {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    boot,
    signIn,
    signOut,
    refreshAccessToken,
    reloadUser,
    changePassword,
    install,
    announceActivity,
    onPeerActivity,
    handlers: { sessionOver, onForbidden, onFocus, onOnline, onPasswordChangeRequired },
  }
}

export type SessionManager = ReturnType<typeof createSessionManager>
