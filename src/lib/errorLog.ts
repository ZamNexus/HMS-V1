// What may be written to the console or an error report: names, codes and ids only. Never the message text, the response body, the request
// URL or anything the user typed (an ApiError carries the whole backend response, which can hold patient data) (MD section 7).
import { isApiError } from "@/lib/api/client"

export interface LoggableError {
  name: string
  code: string | null
  status: number | null
  requestId: string | null
  digest: string | null
}

/** The one place a route error boundary writes to the console. */
export function logRouteError(area: string, err: unknown): void {
  console.error(`${area} caught an error`, loggableError(err))
}

export function loggableError(err: unknown): LoggableError {
  const digest = typeof (err as { digest?: unknown } | null)?.digest === "string" ? (err as { digest: string }).digest : null
  if (isApiError(err)) return { name: err.name, code: err.code, status: err.status, requestId: err.requestId, digest }
  return { name: err instanceof Error ? err.name : "Error", code: null, status: null, requestId: null, digest }
}
