// Wire-level conventions shared by every HMS API module.
//
// Shapes below are limited to what the dev backend was observed returning in
// Phase 1 (GET /health and its JSON error responses). Module-specific
// request/response types are added per module from the API Reference.

import type { Schemas } from "./contract"

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
  /**
   * On VALIDATION_FAILED: a list with one { path, message } per invalid field. On most other codes an object (for example
   * { matches }, { retryAfterSeconds }, { problems }). Use fieldErrorsOf() instead of assuming a list.
   */
  details?: { path: string; message: string }[] | Record<string, unknown>
  /** Any additional fields the backend sends. */
  [extra: string]: unknown
}

/** POST /api/v1/auth/login request body. */
export type LoginRequest = Schemas["SignInDto"]

/**
 * POST /api/v1/auth/login response (SignInResponseDto_Output): accessToken, tokenType, expiresIn and the signed-in user with role,
 * mustChangePassword and permissions. The refresh token arrives as an httpOnly cookie. Sign-in chunk A1 reads the rest of it.
 */
export type LoginResponse = Schemas["SignInResponseDto_Output"]

/** GET /health */
export interface HealthResponse {
  status: string
  environment: string
  database: string
  latencyMs: number
  uptimeSeconds: number
  timestamp: IsoDateTime
}
