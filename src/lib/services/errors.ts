import { isApiError } from "@/lib/api/client"

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
    const details = err.body?.details?.map((d) => `${d.path}: ${d.message}`).join("; ")
    const ref = err.requestId ? ` (Reference: ${err.requestId})` : ""
    return `${err.message}${details ? ` — ${details}` : ""}${ref}`
  }
  return "Something went wrong. Please try again."
}
