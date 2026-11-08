// How a failed READ is shown (MD section 4): branch on the error `code` and status, never on the message text; always show the requestId so
// a user can quote it to support. For failed CREATES see services/createOutcome.ts (they must never invite a blind retry).
import { NETWORK_ERROR, OFFLINE, REQUEST_TIMEOUT, isApiError } from "@/lib/api/client"
import { isNotConnectedError } from "@/lib/services/errors"

export type ErrorKind = "not-found" | "forbidden" | "session" | "offline" | "network" | "timeout" | "rate-limited" | "server" | "not-connected" | "other"

export interface ErrorView {
  kind: ErrorKind
  title: string
  message: string
  requestId: string | null
  /** Seconds before the user should try again (429 / lockout), else null. */
  retryAfterSeconds: number | null
  /** True when "Try again" makes sense (a read that failed for a reason that can pass). */
  canRetry: boolean
}

const SESSION_OVER = new Set(["AUTHENTICATION_REQUIRED", "INVALID_TOKEN", "TOKEN_EXPIRED", "SESSION_ENDED", "SESSION_EXPIRED", "SESSION_REUSED", "SESSION_INVALID", "SESSION_MISSING"])

export function describeFailure(err: unknown): ErrorView {
  if (isNotConnectedError(err)) {
    return { kind: "not-connected", title: "Not connected", message: err.message, requestId: null, retryAfterSeconds: null, canRetry: false }
  }
  if (!isApiError(err)) {
    return { kind: "other", title: "Something went wrong", message: "Something went wrong. Please try again.", requestId: null, retryAfterSeconds: null, canRetry: true }
  }
  const base = { requestId: err.requestId, retryAfterSeconds: err.retryAfterSeconds }
  if (err.code === OFFLINE) return { ...base, kind: "offline", title: "You are offline", message: "Reconnect to continue.", canRetry: true }
  if (err.code === NETWORK_ERROR) return { ...base, kind: "network", title: "Can't reach the server", message: "Check the connection and try again.", canRetry: true }
  if (err.code === REQUEST_TIMEOUT) return { ...base, kind: "timeout", title: "The server is taking too long", message: "Please try again.", canRetry: true }
  if (err.status === 404) return { ...base, kind: "not-found", title: "Not found", message: "This record does not exist, or you cannot see it.", canRetry: false }
  if (err.status === 401 || SESSION_OVER.has(err.code)) return { ...base, kind: "session", title: "Please sign in again", message: "Your session has ended.", canRetry: false }
  if (err.status === 403) return { ...base, kind: "forbidden", title: "Not allowed", message: err.message, canRetry: false }
  if (err.status === 429 || err.code === "ACCOUNT_LOCKED") return { ...base, kind: "rate-limited", title: "Too many requests", message: err.message, canRetry: true }
  if (err.status >= 500) return { ...base, kind: "server", title: "Something went wrong on the server", message: "Please try again. If it keeps happening, give support the reference below.", canRetry: true }
  return { ...base, kind: "other", title: "Could not load", message: err.message, canRetry: true }
}
