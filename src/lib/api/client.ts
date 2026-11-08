import type { ErrorResponse } from "./types"

/** Backend route prefix for business endpoints. `/health` lives outside it. */
export const API_BASE_PATH = "/api/v1"

// Client-side error codes (never sent by the backend).
export const NETWORK_ERROR = "NETWORK_ERROR"
export const UNEXPECTED_RESPONSE = "UNEXPECTED_RESPONSE"
/** The request was aborted after the time limit. The server may or may not have acted on it. */
export const REQUEST_TIMEOUT = "REQUEST_TIMEOUT"
/** A write was refused before sending because the browser is offline. Nothing was sent. */
export const OFFLINE = "OFFLINE"
/** The backend's code for "change the temporary password first" (MD section 3): every call except /auth/me, change-password and logout. */
export const PASSWORD_CHANGE_REQUIRED = "PASSWORD_CHANGE_REQUIRED"

/** The access token (15 min) ran out: refresh once, then repeat the call once (MD section 3). */
export const TOKEN_EXPIRED = "TOKEN_EXPIRED"
/** 401 codes that mean the session is over: clear state and go to sign-in (MD section 3). TOKEN_EXPIRED and SESSION_ROTATED are handled by refreshing. */
export const SESSION_OVER_CODES: ReadonlySet<string> = new Set([
  "AUTHENTICATION_REQUIRED", "INVALID_TOKEN", "SESSION_ENDED", "SESSION_EXPIRED", "SESSION_REUSED", "SESSION_INVALID", "SESSION_MISSING",
])

/** MD section 7: abort any request at 30 s with a "taking too long" message and a retry button. */
export const REQUEST_TIMEOUT_MS = 30_000
/** MD section 7: a GET that fails on the network or with 5xx is retried twice, after 1 s and after 3 s. Never a write, never a 4xx. */
export const GET_RETRY_DELAYS_MS: readonly number[] = [1000, 3000]
/** Handoff 4 and 7: a write answered 409 TRANSACTION_CONFLICT was rolled back, so it is safe to repeat ONCE automatically. */
export const TRANSACTION_CONFLICT = "TRANSACTION_CONFLICT"
/** A short pause before that single repeat, so the colliding transaction can finish. */
export const TRANSACTION_CONFLICT_RETRY_DELAY_MS = 250

/** MD section 7: on 429 wait Retry-After, or 60 s without the header, then let the USER retry (nothing is re-sent automatically). */
export const DEFAULT_RETRY_AFTER_SECONDS = 60

/**
 * Error thrown for every failed request. For backend errors it carries the
 * documented ErrorResponse fields (`code`, `requestId`, ...); for transport
 * failures `status` is 0 and `code` is NETWORK_ERROR, REQUEST_TIMEOUT or OFFLINE.
 */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  /** Backend request id: body `requestId`, falling back to the X-Request-Id header. */
  readonly requestId: string | null
  /** Not enumerable: an ApiError that reaches a framework error logger must not print the backend path (it can carry a search term) or the body. */
  declare readonly path: string | null
  readonly timestamp: string | null
  /** The parsed error body, when the backend sent one. Not enumerable, see `path`. */
  declare readonly body: ErrorResponse | null
  /** Seconds the USER should wait before trying again: set for 429 and for a lockout, otherwise null. */
  readonly retryAfterSeconds: number | null

  constructor(init: {
    status: number
    code: string
    message: string
    requestId?: string | null
    path?: string | null
    timestamp?: string | null
    body?: ErrorResponse | null
    retryAfterSeconds?: number | null
    cause?: unknown
  }) {
    super(init.message, init.cause === undefined ? undefined : { cause: init.cause })
    this.name = "ApiError"
    this.status = init.status
    this.code = init.code
    this.requestId = init.requestId ?? null
    this.timestamp = init.timestamp ?? null
    Object.defineProperties(this, {
      path: { value: init.path ?? null, enumerable: false, writable: false },
      body: { value: init.body ?? null, enumerable: false, writable: false },
    })
    this.retryAfterSeconds = init.retryAfterSeconds ?? null
  }
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError
}

/**
 * Per-field problems of a 400 VALIDATION_FAILED: `details` is a list of { path, message }. For every other code `details` is an object
 * (for example { matches }, { retryAfterSeconds }, { problems }) or absent, and this returns [] instead of crashing.
 */
export function fieldErrorsOf(err: unknown): { path: string; message: string }[] {
  const details: unknown = err instanceof ApiError ? err.body?.details : undefined
  if (!Array.isArray(details)) return []
  return details.filter((d): d is { path: string; message: string } => !!d && typeof d.path === "string" && typeof d.message === "string")
}

type QueryValue = string | number | boolean | null | undefined
export type QueryParams = Record<string, QueryValue | QueryValue[]>

export interface RequestOptions {
  query?: QueryParams
  /** JSON-serialisable request body. */
  body?: unknown
  headers?: HeadersInit
  signal?: AbortSignal
  /** Set false to omit the Authorization header (e.g. login). Default true. */
  auth?: boolean
  /** Override the route prefix; "" for root-level endpoints such as /health. */
  basePath?: string
  /** Override the time limit for this request (default REQUEST_TIMEOUT_MS). */
  timeoutMs?: number
}

export interface ApiClientConfig {
  /** Origin to prefix requests with. "" (default) = same-origin, via the Next proxy. */
  origin?: string
  /** Route prefix for business endpoints. Default API_BASE_PATH. */
  basePath?: string
  /** Injectable for tests; defaults to global fetch. */
  fetch?: typeof fetch
  /** Injectable for tests: how GET retries wait. Defaults to setTimeout. */
  sleep?: (ms: number) => Promise<void>
  /** Injectable for tests: the clock used for the 429 wait. */
  now?: () => number
  /** Injectable for tests: true when the browser is online. Defaults to navigator.onLine (true when unknown). */
  isOnline?: () => boolean
  /** Default time limit for a request. */
  timeoutMs?: number
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE"

// The access token lives in memory only: it is never written to localStorage
// or a readable cookie. The refresh token is an httpOnly cookie managed by the
// backend and is sent via `credentials: "include"`; this module never reads it.
let accessToken: string | null = null

export function setAccessToken(token: string | null): void {
  accessToken = token
}

export function getAccessToken(): string | null {
  return accessToken
}

// The sign-in code (src/lib/session) registers these two. The client itself knows nothing about how a session is refreshed or what "signed out" does.
//  - refresh handler: gets a new access token (one shared in-flight refresh) and stores it with setAccessToken; it throws when the session is over.
//  - session-over handler: told once per 401 whose code ends the session.
let authRefreshHandler: (() => Promise<void>) | null = null
let sessionOverHandler: ((code: string, sentToken: string | null) => void) | null = null
let forbiddenHandler: ((sentToken: string | null) => void) | null = null

export function setAuthRefreshHandler(handler: (() => Promise<void>) | null): void {
  authRefreshHandler = handler
}
export function setSessionOverHandler(handler: ((code: string, sentToken: string | null) => void) | null): void {
  sessionOverHandler = handler
}
/** Told after a 403 FORBIDDEN (the role may not do this; never a reason to sign out). The sign-in code re-reads /auth/me, since an admin may have changed the permissions. */
export function setForbiddenHandler(handler: ((sentToken: string | null) => void) | null): void {
  forbiddenHandler = handler
}

// Requests made with the access token. Signing out (or the session ending) aborts them all, so an answer meant for the previous user can never
// reach the screen of the next one.
const inFlight = new Set<AbortController>()
let requestGeneration = 0
export function abortAuthenticatedRequests(): void {
  requestGeneration++
  for (const c of [...inFlight]) c.abort()
}

/** True for a failure that says nothing about the request itself (no connection, a timeout, a rate limit, a server error). */
export function isTransientFailure(err: unknown): boolean {
  return err instanceof ApiError && (err.code === NETWORK_ERROR || err.code === REQUEST_TIMEOUT || err.status === 429 || err.status >= 500)
}

// One place to react to "change the temporary password first" (set by the sign-in code, chunk A4). Called once per such response.
let passwordChangeRequiredHandler: (() => void) | null = null

export function setPasswordChangeRequiredHandler(handler: (() => void) | null): void {
  passwordChangeRequiredHandler = handler
}

function buildUrl(origin: string, basePath: string, path: string, query?: QueryParams): string {
  const p = path.startsWith("/") ? path : `/${path}`
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query ?? {})) {
    for (const v of Array.isArray(value) ? value : [value]) {
      if (v !== undefined && v !== null) params.append(key, String(v))
    }
  }
  const qs = params.toString()
  return `${origin}${basePath}${p}${qs ? `?${qs}` : ""}`
}

function isErrorResponse(value: unknown): value is ErrorResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as ErrorResponse).code === "string" &&
    typeof (value as ErrorResponse).message === "string"
  )
}

async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text()
  if (!text) return undefined
  const type = res.headers.get("content-type") ?? ""
  if (!type.includes("json")) {
    throw new ApiError({
      status: res.status,
      code: UNEXPECTED_RESPONSE,
      message: `Expected JSON but received "${type || "no content-type"}".`,
      requestId: res.headers.get("x-request-id"),
    })
  }
  try {
    return JSON.parse(text)
  } catch (cause) {
    throw new ApiError({
      status: res.status,
      code: UNEXPECTED_RESPONSE,
      message: "Response body was not valid JSON.",
      requestId: res.headers.get("x-request-id"),
      cause,
    })
  }
}

/** Retry-After as whole seconds, from the header (seconds form only) or from details.retryAfterSeconds. Null when neither is usable. */
function retryAfterOf(res: Response, body: ErrorResponse | null): number | null {
  const header = res.headers.get("retry-after")
  if (header && /^\d+$/.test(header.trim())) return Number(header.trim())
  const d = body?.details
  if (d && !Array.isArray(d) && typeof d === "object") {
    const v = (d as { retryAfterSeconds?: unknown }).retryAfterSeconds
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) return Math.ceil(v)
  }
  return null
}

async function toApiError(res: Response): Promise<ApiError> {
  const headerRequestId = res.headers.get("x-request-id")
  let parsed: unknown
  try {
    parsed = await parseBody(res)
  } catch (err) {
    // Non-JSON error page (e.g. a gateway 502/503): keep the HTTP status.
    if (err instanceof ApiError) {
      return new ApiError({
        status: res.status,
        code: err.code,
        message: res.statusText || err.message,
        requestId: headerRequestId,
        retryAfterSeconds: res.status === 429 ? retryAfterOf(res, null) ?? DEFAULT_RETRY_AFTER_SECONDS : null,
      })
    }
    throw err
  }
  if (isErrorResponse(parsed)) {
    return new ApiError({
      status: res.status,
      code: parsed.code,
      message: parsed.message,
      requestId: parsed.requestId ?? headerRequestId,
      path: typeof parsed.path === "string" ? parsed.path : null,
      timestamp: typeof parsed.timestamp === "string" ? parsed.timestamp : null,
      body: parsed,
      retryAfterSeconds: retryAfterOf(res, parsed) ?? (res.status === 429 ? DEFAULT_RETRY_AFTER_SECONDS : null),
    })
  }
  return new ApiError({
    status: res.status,
    code: UNEXPECTED_RESPONSE,
    message: res.statusText || `Request failed with status ${res.status}.`,
    requestId: headerRequestId,
    retryAfterSeconds: res.status === 429 ? retryAfterOf(res, null) ?? DEFAULT_RETRY_AFTER_SECONDS : null,
  })
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** Waits `ms`, but returns early when the caller's signal aborts (a cancelled GET must not sit out the back-off). */
async function sleepUnlessAborted(sleep: (ms: number) => Promise<void>, ms: number, signal?: AbortSignal): Promise<void> {
  if (!signal) return sleep(ms)
  if (signal.aborted) return
  await new Promise<void>((resolve) => {
    const done = () => {
      signal.removeEventListener("abort", done)
      resolve()
    }
    signal.addEventListener("abort", done, { once: true })
    void sleep(ms).then(done, done)
  })
}
const defaultIsOnline = () => (typeof navigator === "undefined" || typeof navigator.onLine !== "boolean" ? true : navigator.onLine)

export function createApiClient(config: ApiClientConfig = {}) {
  const origin = (config.origin ?? "").replace(/\/+$/, "")
  const defaultBase = config.basePath ?? API_BASE_PATH
  const sleep = config.sleep ?? defaultSleep
  const isOnline = config.isOnline ?? defaultIsOnline
  const now = config.now ?? Date.now
  // After a 429 nothing is sent until the wait is over (the limit is per client IP, so it applies to every route): polling screens and
  // repeated clicks would otherwise keep hitting the limit.
  let rateLimitedUntil = 0

  /** One attempt: one fetch, aborted at the time limit. Never retries by itself. */
  async function attempt<T>(method: Method, url: string, headers: Headers, opts: RequestOptions): Promise<T> {
    const limit = opts.timeoutMs ?? config.timeoutMs ?? REQUEST_TIMEOUT_MS
    const controller = new AbortController()
    const authenticated = opts.auth !== false
    const generation = requestGeneration
    if (authenticated) inFlight.add(controller)
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, limit)
    const onCallerAbort = () => controller.abort()
    if (opts.signal) {
      if (opts.signal.aborted) controller.abort()
      else opts.signal.addEventListener("abort", onCallerAbort, { once: true })
    }
    try {
      // The fetch AND the reading of the body are one unit: a connection that drops, or the time limit that fires, while the body is still
      // arriving is the same "the answer never fully arrived" as a failed fetch (for a write: it may or may not have been saved).
      const res = await (config.fetch ?? fetch)(url, {
        method,
        headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        // Sends/receives the httpOnly refresh-token cookie.
        credentials: "include",
        signal: controller.signal,
      })
      if (!res.ok) {
        const err = await toApiError(res)
        if (err.status === 403 && err.code === PASSWORD_CHANGE_REQUIRED) passwordChangeRequiredHandler?.()
        throw err
      }
      return (await parseBody(res)) as T
    } catch (cause) {
      // the session ended while this request was in flight: report a cancellation, never a failure or a late answer
      if (authenticated && generation !== requestGeneration) throw new DOMException("The request was cancelled because the session ended.", "AbortError")
      if (cause instanceof ApiError) throw cause
      if (timedOut) {
        throw new ApiError({ status: 0, code: REQUEST_TIMEOUT, message: "The server is taking too long to answer. Please try again.", cause })
      }
      if (opts.signal?.aborted) throw cause // caller cancelled: let AbortError through
      throw new ApiError({
        status: 0,
        code: NETWORK_ERROR,
        message: "Could not reach the server. Check your connection and try again.",
        cause,
      })
    } finally {
      clearTimeout(timer)
      inFlight.delete(controller)
      opts.signal?.removeEventListener("abort", onCallerAbort)
    }
  }

  async function request<T>(method: Method, path: string, opts: RequestOptions = {}): Promise<T> {
    // Writes need a connection. Refuse BEFORE sending, so "nothing was saved" is certain.
    if (method !== "GET" && !isOnline()) {
      throw new ApiError({ status: 0, code: OFFLINE, message: "You are offline. Changes cannot be saved until the connection is back." })
    }
    // Signing out and refreshing must never be blocked by a rate-limit wait: a blocked logout would leave the server session alive.
    const sessionEndpoint = /^\/auth\/(logout|refresh)/.test(path)
    const waitMs = sessionEndpoint ? 0 : rateLimitedUntil - now()
    if (waitMs > 0) {
      const seconds = Math.ceil(waitMs / 1000)
      throw new ApiError({ status: 429, code: "TOO_MANY_REQUESTS", message: `Too many requests. Please wait ${seconds} seconds and try again.`, retryAfterSeconds: seconds })
    }
    const headers = new Headers(opts.headers)
    headers.set("Accept", "application/json")
    if (opts.body !== undefined && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json")
    }
    if (opts.auth !== false && accessToken && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${accessToken}`)
    }

    const url = buildUrl(origin, opts.basePath ?? defaultBase, path, opts.query)
    // A GET that fails on the network or with a 5xx is re-sent twice (1 s, 3 s). A write is NEVER re-sent after a network failure, a timeout or a
    // 5xx: this backend has no idempotency, so a second POST would create a second record / payment. The two documented exceptions are the single
    // repeat after a refresh (below) and ONE repeat after 409 TRANSACTION_CONFLICT, which the backend defines as "the write was rolled back".
    const delays = method === "GET" ? GET_RETRY_DELAYS_MS : []
    let refreshedOnce = false
    let conflictRepeated = false
    const sentTokenOf = () => headers.get("Authorization")?.replace(/^Bearer /, "") ?? null
    const callerSetAuthorization = new Headers(opts.headers).has("Authorization")
    for (let n = 0; ; n++) {
      try {
        return await attempt<T>(method, url, headers, opts)
      } catch (err) {
        if (err instanceof ApiError && err.status === 429) rateLimitedUntil = now() + (err.retryAfterSeconds ?? DEFAULT_RETRY_AFTER_SECONDS) * 1000
        // 401 on an authenticated call. The server rejected it BEFORE running it (authentication comes first), so repeating it once after a
        // refresh cannot do a write twice; that is the one automatic repeat a write ever gets.
        if (err instanceof ApiError && err.status === 403 && err.code === "FORBIDDEN") forbiddenHandler?.(sentTokenOf())
        if (err instanceof ApiError && err.status === 401 && opts.auth !== false) {
          if (err.code === TOKEN_EXPIRED && authRefreshHandler && !refreshedOnce && !opts.signal?.aborted) {
            const sent = sentTokenOf()
            // someone else already refreshed while this call was on its way: repeat with the current token instead of refreshing again
            if (!(sent && accessToken && sent !== accessToken)) {
              try {
                await authRefreshHandler()
              } catch (refreshErr) {
                // a refresh that could not be done because of the connection is reported as that (not as an auth error); otherwise the
                // session is over, the refresh handler has already told the app, and the original 401 stands
                throw isTransientFailure(refreshErr) ? refreshErr : err
              }
            }
            refreshedOnce = true
            if (accessToken && !callerSetAuthorization) headers.set("Authorization", `Bearer ${accessToken}`)
            n--
            continue
          }
          if (SESSION_OVER_CODES.has(err.code)) sessionOverHandler?.(err.code, sentTokenOf())
        }
        if (err instanceof ApiError && method !== "GET" && err.status === 409 && err.code === TRANSACTION_CONFLICT && !conflictRepeated && !opts.signal?.aborted) {
          conflictRepeated = true
          await sleepUnlessAborted(sleep, TRANSACTION_CONFLICT_RETRY_DELAY_MS, opts.signal)
          if (opts.signal?.aborted) throw new DOMException("The operation was aborted.", "AbortError")
          continue
        }
        const retryable = err instanceof ApiError && n < delays.length && (err.code === NETWORK_ERROR || err.status >= 500)
        if (!retryable || opts.signal?.aborted) throw err
        await sleepUnlessAborted(sleep, delays[n], opts.signal)
        // cancelled while waiting: report the cancellation, not the old failure
        if (opts.signal?.aborted) throw new DOMException("The operation was aborted.", "AbortError")
      }
    }
  }

  return {
    get: <T>(path: string, opts?: Omit<RequestOptions, "body">) => request<T>("GET", path, opts),
    post: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, "body">) =>
      request<T>("POST", path, { ...opts, body }),
    put: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, "body">) =>
      request<T>("PUT", path, { ...opts, body }),
    patch: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, "body">) =>
      request<T>("PATCH", path, { ...opts, body }),
    delete: <T>(path: string, opts?: Omit<RequestOptions, "body">) => request<T>("DELETE", path, opts),
  }
}

export type ApiClient = ReturnType<typeof createApiClient>

/** Default client: same-origin requests through the Next.js `/api/*` proxy. */
export const api = createApiClient()
