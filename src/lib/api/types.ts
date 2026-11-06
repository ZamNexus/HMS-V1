// Wire-level conventions shared by every HMS API module.
//
// Shapes below are limited to what the dev backend was observed returning in
// Phase 1 (GET /health and its JSON error responses). Module-specific
// request/response types are added per module from the API Reference.

/** ULID identifier (26-char Crockford base32). */
export type Ulid = string
/** Money is always a decimal string on the wire (never a JS number). */
export type MoneyString = string
/** UTC instant, ISO 8601, e.g. "2026-11-04T06:08:32.055Z". */
export type IsoDateTime = string
/** Calendar date, "YYYY-MM-DD". */
export type IsoDate = string

/** JSON error body returned by the backend for every non-2xx response. */
export interface ErrorResponse {
  statusCode: number
  /** Machine-readable code, e.g. "AUTHENTICATION_REQUIRED", "NOT_FOUND". */
  code: string
  message: string
  /** Null for some errors (e.g. unmatched routes). */
  requestId: string | null
  path: string
  timestamp: IsoDateTime
  /** Present on VALIDATION_FAILED: one entry per invalid field. */
  details?: { path: string; message: string }[]
  /** Any additional fields the backend sends. */
  [extra: string]: unknown
}

/** POST /api/v1/auth/login request body. */
export interface LoginRequest {
  hospitalCode: string
  identifier: string
  password: string
}

/**
 * POST /api/v1/auth/login response. Only `accessToken` is documented; the
 * refresh token arrives as an httpOnly cookie. Any other fields (user, role,
 * ...) are intentionally left untyped until the response structure is confirmed.
 */
export interface LoginResponse {
  accessToken: string
  [extra: string]: unknown
}

/** GET /health */
export interface HealthResponse {
  status: string
  environment: string
  database: string
  latencyMs: number
  uptimeSeconds: number
  timestamp: IsoDateTime
}
