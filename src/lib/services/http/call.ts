import { api } from "@/lib/api/client"
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
