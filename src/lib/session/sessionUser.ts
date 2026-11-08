// The signed-in user, read from POST /auth/login (SignInResponseDto_Output.user) and GET /auth/me (AuthUserDto_Output).
// Both carry the same user object. Strict readers (src/lib/services/http/wire.ts): a response that does not match docs/openapi.json fails
// loudly with a TypeError naming the field, never with a half-built user. Permissions are kept exactly as sent (a newer backend may add
// names; the JSON's enum is out of date: it has no accounts.* or audit.read although the handoff names them).
import { asObj, optStr, reqBool, reqInt, reqStr, type Obj } from "@/lib/services/http/wire"

export interface SessionHospital {
  id: string
  code: string
  name: string
  defaultCity: string | null
  defaultCountry: string
}

export interface SessionUser {
  id: string
  username: string
  email: string | null
  name: string
  /** For DISPLAY only ("Doctor"). Never used to decide what the user may see or do: that is `permissions`. */
  role: string
  isPlatform: boolean
  /** True while a temporary password must be changed: only /auth/me, change-password and logout work. */
  mustChangePassword: boolean
  permissions: readonly string[]
  hospital: SessionHospital
  /** Shortcut for hospital.code. */
  hospitalCode: string
}

export interface TokenGrant {
  accessToken: string
  expiresIn: number
}

export function parseSessionUser(raw: unknown, what = "auth user"): SessionUser {
  const o = asObj(raw, what)
  if (!Array.isArray(o.permissions) || !o.permissions.every((p) => typeof p === "string")) {
    throw new TypeError(`Unexpected response: ${what}.permissions is not a list of strings.`)
  }
  // a platform user (no hospital) cannot use the hospital screens: refuse it instead of showing an empty app
  if (o.hospital === null || o.hospital === undefined) throw new TypeError(`Unexpected response: ${what}.hospital is missing.`)
  const h = asObj(o.hospital, `${what}.hospital`)
  const hospital: SessionHospital = {
    id: reqStr(h, "id", `${what}.hospital`),
    code: reqStr(h, "code", `${what}.hospital`),
    name: reqStr(h, "name", `${what}.hospital`),
    defaultCity: typeof h.defaultCity === "string" ? h.defaultCity : null,
    defaultCountry: reqStr(h, "defaultCountry", `${what}.hospital`),
  }
  return {
    id: reqStr(o, "id", what),
    username: reqStr(o, "username", what),
    // the JSON types email as "array of string" (spec bug, docs/SPEC_BUGS_FOR_BACKEND.md): tolerated, one warning
    email: optStr(o, "email", what, "AuthUserDto_Output") ?? null,
    name: reqStr(o, "name", what),
    role: reqStr(o, "role", what),
    isPlatform: reqBool(o, "isPlatform", what),
    mustChangePassword: reqBool(o, "mustChangePassword", what),
    permissions: [...new Set(o.permissions as string[])],
    hospital,
    hospitalCode: hospital.code,
  }
}

function parseGrant(o: Obj, what: string): TokenGrant {
  const accessToken = reqStr(o, "accessToken", what)
  if (!accessToken) throw new TypeError(`Unexpected response: ${what}.accessToken is empty.`)
  if (o.tokenType !== "Bearer") throw new TypeError(`Unexpected response: ${what}.tokenType is not "Bearer".`)
  const expiresIn = reqInt(o, "expiresIn", what)
  if (expiresIn <= 0) throw new TypeError(`Unexpected response: ${what}.expiresIn is not positive.`)
  return { accessToken, expiresIn }
}

/** POST /auth/login -> the token grant and the user. */
export function parseSignIn(raw: unknown): { grant: TokenGrant; user: SessionUser } {
  const o = asObj(raw, "sign-in response")
  return { grant: parseGrant(o, "sign-in response"), user: parseSessionUser(o.user, "sign-in response.user") }
}

/** POST /auth/refresh -> a new token (and the current mustChangePassword flag). */
export function parseRefresh(raw: unknown): TokenGrant & { mustChangePassword: boolean } {
  const o = asObj(raw, "refresh response")
  return { ...parseGrant(o, "refresh response"), mustChangePassword: reqBool(o, "mustChangePassword", "refresh response") }
}
