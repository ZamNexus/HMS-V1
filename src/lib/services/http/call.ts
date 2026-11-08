import { api, isApiError, UNEXPECTED_RESPONSE } from "@/lib/api/client"
import { SavedButUnreadableError } from "../errors"
import { ENDPOINTS, resolveEndpoint, type CallOptions, type Endpoint, type EndpointKey } from "../endpoints"

/**
 * Performs the request configured for `key` through the shared Phase 1 API
 * client (bearer token, cookie credentials, ApiError handling all come from it).
 * Throws NotConnectedError — without any network call — while the endpoint is unset.
 */
export async function callEndpoint<T>(
  key: EndpointKey,
  opts: CallOptions = {},
  table: Record<EndpointKey, Endpoint | null> = ENDPOINTS
): Promise<T> {
  const { method, path } = resolveEndpoint(key, opts.params, table)
  const query = opts.query?.()
  const body = opts.body?.()
  const reqOpts = { query, signal: opts.signal }

  switch (method) {
    case "GET":
      return api.get<T>(path, reqOpts)
    case "DELETE":
      return api.delete<T>(path, reqOpts)
    case "POST":
      return api.post<T>(path, body, reqOpts)
    case "PUT":
      return api.put<T>(path, body, reqOpts)
    case "PATCH":
      return api.patch<T>(path, body, reqOpts)
  }
}

/**
 * A create (POST): request, then read the answer — and tell apart the two very different ways it can go wrong.
 *  - The request FAILED (network error, non-2xx answer, an unset endpoint, a body that could not be built): the original error propagates
 *    unchanged; nothing was created (or the outcome is a plain failure the user may retry).
 *  - The request SUCCEEDED (2xx) but the answer is empty / not JSON / not the documented shape: throws SavedButUnreadableError. The record
 *    exists; the caller must refresh instead of offering a retry. A create is never re-sent from here.
 */
export async function createAndParse<T>(key: EndpointKey, opts: CallOptions, parse: (raw: unknown) => T, what: string): Promise<T> {
  let raw: unknown
  try {
    raw = await callEndpoint<unknown>(key, opts)
  } catch (err) {
    // The shared client reports a 2xx whose body is not JSON as UNEXPECTED_RESPONSE with the 2xx status; a non-2xx never reaches here as 2xx.
    if (isApiError(err) && err.code === UNEXPECTED_RESPONSE && err.status >= 200 && err.status < 300) throw new SavedButUnreadableError(what, null, err)
    throw err
  }
  try {
    return parse(raw)
  } catch (err) {
    throw new SavedButUnreadableError(what, null, err)
  }
}
