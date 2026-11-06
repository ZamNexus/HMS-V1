import type { ErrorResponse } from "./types"

/** Backend route prefix for business endpoints. `/health` lives outside it. */
export const API_BASE_PATH = "/api/v1"

// Client-side error codes (never sent by the backend).
export const NETWORK_ERROR = "NETWORK_ERROR"
export const UNEXPECTED_RESPONSE = "UNEXPECTED_RESPONSE"

/**
 * Error thrown for every failed request. For backend errors it carries the
 * documented ErrorResponse fields (`code`, `requestId`, ...); for transport
 * failures `status` is 0 and `code` is NETWORK_ERROR.
 */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  /** Backend request id: body `requestId`, falling back to the X-Request-Id header. */
  readonly requestId: string | null
  readonly path: string | null
  readonly timestamp: string | null
  /** The parsed error body, when the backend sent one. */
  readonly body: ErrorResponse | null

  constructor(init: {
    status: number
    code: string
    message: string
    requestId?: string | null
    path?: string | null
    timestamp?: string | null
    body?: ErrorResponse | null
    cause?: unknown
  }) {
    super(init.message, init.cause === undefined ? undefined : { cause: init.cause })
    this.name = "ApiError"
    this.status = init.status
    this.code = init.code
    this.requestId = init.requestId ?? null
    this.path = init.path ?? null
    this.timestamp = init.timestamp ?? null
    this.body = init.body ?? null
  }
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError
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
}

export interface ApiClientConfig {
  /** Origin to prefix requests with. "" (default) = same-origin, via the Next proxy. */
  origin?: string
  /** Route prefix for business endpoints. Default API_BASE_PATH. */
  basePath?: string
  /** Injectable for tests; defaults to global fetch. */
  fetch?: typeof fetch
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
    })
  }
  return new ApiError({
    status: res.status,
    code: UNEXPECTED_RESPONSE,
    message: res.statusText || `Request failed with status ${res.status}.`,
    requestId: headerRequestId,
  })
}

export function createApiClient(config: ApiClientConfig = {}) {
  const origin = (config.origin ?? "").replace(/\/+$/, "")
  const defaultBase = config.basePath ?? API_BASE_PATH

  async function request<T>(method: Method, path: string, opts: RequestOptions = {}): Promise<T> {
    const headers = new Headers(opts.headers)
    headers.set("Accept", "application/json")
    if (opts.body !== undefined && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json")
    }
    if (opts.auth !== false && accessToken && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${accessToken}`)
    }

    const url = buildUrl(origin, opts.basePath ?? defaultBase, path, opts.query)
    let res: Response
    try {
      res = await (config.fetch ?? fetch)(url, {
        method,
        headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        // Sends/receives the httpOnly refresh-token cookie.
        credentials: "include",
        signal: opts.signal,
      })
    } catch (cause) {
      if (opts.signal?.aborted) throw cause // caller cancelled: let AbortError through
      throw new ApiError({
        status: 0,
        code: NETWORK_ERROR,
        message: "Could not reach the server. Check your connection and try again.",
        cause,
      })
    }

    if (!res.ok) throw await toApiError(res)
    return (await parseBody(res)) as T
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
