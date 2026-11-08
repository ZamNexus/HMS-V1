import { fieldErrorsOf, isApiError } from "@/lib/api/client"

/**
 * Thrown by the HTTP adapters for anything the backend contract has not yet
 * defined (an endpoint left unset in ./endpoints.ts, a mapper in
 * ./http/mappers.ts that is still pending, or an operation the documentation
 * doesn't cover). Never thrown for an HTTP status.
 */
export class NotConnectedError extends Error {
  readonly what: string

  constructor(what: string) {
    super(`Backend not connected yet: ${what} — awaiting the backend contract.`)
    this.name = "NotConnectedError"
    this.what = what
  }
}

export function isNotConnectedError(err: unknown): err is NotConnectedError {
  return err instanceof NotConnectedError
}

/**
 * One user-facing sentence for any failure: the backend's own message, its
 * per-field validation details, and the request id support can search for.
 * Never includes tokens, request bodies or stack traces.
 */
export function errorSummary(err: unknown): string {
  if (isNotConnectedError(err)) return err.message
  if (isApiError(err)) {
    const details = fieldErrorsOf(err).map((d) => `${d.path}: ${d.message}`).join("; ")
    const ref = err.requestId ? ` (Reference: ${err.requestId})` : ""
    return `${err.message}${details ? ` — ${details}` : ""}${ref}`
  }
  return "Something went wrong. Please try again."
}

/**
 * A create (POST) that the server ACCEPTED — a 2xx answer — but whose answer the frontend could not read (an empty or non-JSON body, or a
 * shape that does not match docs/openapi.json). The record almost certainly exists, so the UI must NOT show a failure that invites a retry
 * (a retry would create a duplicate) and must never re-send the create: it says "Saved" and refetches the list instead.
 * A network error or a non-2xx answer is a different thing (see `classifyCreateError`).
 */
export class SavedButUnreadableError extends Error {
  /** Shown to the user instead of the default neutral message, when something more specific is known. */
  readonly userMessage: string | null

  constructor(what: string, userMessage: string | null = null, cause?: unknown) {
    super(`The request succeeded but its response could not be read: ${what}.`, cause === undefined ? undefined : { cause })
    this.name = "SavedButUnreadableError"
    this.userMessage = userMessage
  }
}

export function isSavedButUnreadableError(err: unknown): err is SavedButUnreadableError {
  return err instanceof SavedButUnreadableError
}
