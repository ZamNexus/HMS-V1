"use client"
import * as React from "react"
import { api, isApiError, setAccessToken } from "@/lib/api/client"
import type { LoginRequest, LoginResponse } from "@/lib/api/types"
import { ROLE_LABELS } from "@/data/users"
import { NAV_PERMISSIONS, hasPermission } from "@/lib/services/identity"
import type { Role } from "@/types"

// `hms_session` is a FRONTEND-ONLY UI HINT, NOT AUTHENTICATION. It is a plain
// JavaScript-set cookie (not httpOnly) that anyone can create or delete in their
// browser, with no identity or token in it. Its only use is letting the Next
// proxy (src/proxy.ts) send visibly signed-out visitors to /login instead of
// rendering a page shell. It proves nothing and protects no data. The real
// credential is the access token held in memory (src/lib/api/client.ts), and
// only the backend can decide whether a request is authenticated or allowed.
const SESSION_HINT_COOKIE = "hms_session"
const LEGACY_STORAGE_KEY = "hms_user" // demo-era localStorage record; removed on load

// SECURITY NOTE: nothing in this file (or anything derived from `SessionUser`,
// such as `canSee`/`canSeeNav`/`RoleGate`) is an authorization control. It only
// shapes the UI. The backend must authorize every request from the access token;
// a user who tampers with this state gains no server-side access. No role or
// permission is ever assumed: both stay unset until the backend provides them.
//
// Known limitations (no backend behaviour is assumed to work around them):
//  - logout() clears frontend state only; the httpOnly refresh cookie is managed by
//    the backend and is not touched, because no logout contract is available.
//  - A full page reload signs the user out: the in-memory access token is lost and no
//    session-restore contract is available.
//
// What the frontend knows about the signed-in user.
//
// Only `hospitalCode` and `identifier` (what the user typed to sign in) are
// known. The login response's user/role shape is not yet confirmed, so `role`
// is null and `name` falls back to the identifier. Nothing here is invented.
export interface SessionUser {
  hospitalCode: string
  identifier: string
  name: string
  role: Role | null
  /**
   * Permissions for navigation (see NAV_PERMISSIONS). Always null today: nothing populates it
   * until the /auth/me schema is confirmed. Representation (string names) is unconfirmed.
   * null = unknown, which grants nothing.
   */
  permissions: string[] | null
}

function setSessionHint(on: boolean) {
  const secure = window.location.protocol === "https:" ? "; Secure" : ""
  // Session cookie (no max-age): it dies with the browser session.
  document.cookie = on
    ? `${SESSION_HINT_COOKIE}=1; path=/; SameSite=Lax${secure}`
    : `${SESSION_HINT_COOKIE}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`
}

export type LoginResult = { ok: true } | { ok: false; error: string }

// Backend `message` text is written for end users; the request id lets support
// find the exact request. Transport failures use the client's own message.
function describeLoginError(err: unknown): string {
  if (!isApiError(err)) return "Something went wrong while signing in. Please try again."
  const ref = err.requestId ? ` (Reference: ${err.requestId})` : ""
  return `${err.message}${ref}`
}

interface AuthContextValue {
  user: SessionUser | null
  isInitialized: boolean
  login: (credentials: LoginRequest) => Promise<LoginResult>
  logout: () => void
}

const AuthContext = React.createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<SessionUser | null>(null)
  const [isInitialized, setIsInitialized] = React.useState(false)

  // A full page load always starts signed out: the access token lives in memory
  // only, and no session-restoration endpoint is documented, so the httpOnly
  // refresh cookie cannot be exchanged for a new token. Clear stale hints.
  React.useEffect(() => {
    setAccessToken(null)
    setSessionHint(false)
    try {
      localStorage.removeItem(LEGACY_STORAGE_KEY)
    } catch {
      // storage unavailable: nothing to clean up
    }
    setIsInitialized(true)
  }, [])

  const login = React.useCallback(async (credentials: LoginRequest): Promise<LoginResult> => {
    const hospitalCode = credentials.hospitalCode.trim()
    const identifier = credentials.identifier.trim()
    try {
      const res = await api.post<LoginResponse>(
        "/auth/login",
        { hospitalCode, identifier, password: credentials.password },
        { auth: false }
      )
      if (!res || typeof res.accessToken !== "string" || !res.accessToken) {
        return { ok: false, error: "The server sent an unexpected sign-in response. Please contact support." }
      }
      if (process.env.NODE_ENV !== "production") {
        // Dev only: logs the response STRUCTURE (never values). Removed from production builds.
        void import("@/lib/api/devInspect").then((m) => m.logLoginResponseShape(res))
      }
      setAccessToken(res.accessToken)
      setSessionHint(true)
      setUser({ hospitalCode, identifier, name: identifier, role: null, permissions: null })
      return { ok: true }
    } catch (err) {
      return { ok: false, error: describeLoginError(err) }
    }
  }, [])

  // No logout endpoint is documented: this clears the frontend session only.
  // The httpOnly refresh cookie cannot be cleared from JavaScript.
  const logout = React.useCallback(() => {
    setAccessToken(null)
    setSessionHint(false)
    setUser(null)
    window.location.href = "/login"
  }, [])

  const value = React.useMemo(() => ({ user, isInitialized, login, logout }), [user, isInitialized, login, logout])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = React.useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}

export const SIDEBAR_VISIBILITY: Record<Role, string[]> = {
  admin: ["dashboard", "patients", "encounters", "billing", "laboratory", "imaging", "pharmacy", "users", "doctors", "master-data", "reports"],
  doctor: ["dashboard", "patients", "encounters", "laboratory", "imaging", "pharmacy"],
  receptionist: ["dashboard", "patients", "encounters"],
  billing: ["dashboard", "patients", "billing", "imaging", "reports"],
  lab_tech: ["dashboard", "laboratory"],
  pharmacist: ["dashboard", "pharmacy"],
  nurse: ["dashboard", "patients", "encounters", "laboratory"],
}

// Display label for a role; a null role (not yet mapped from the backend) has none.
export function roleLabel(role: Role | null): string {
  return role ? ROLE_LABELS[role] : "Role not set"
}

// A null role (not yet mapped from the backend) can see nothing: permissions are never guessed.
export function canSee(role: Role | null, key: string): boolean {
  return role ? (SIDEBAR_VISIBILITY[role]?.includes(key) ?? false) : false
}

// Navigation visibility. The API Reference says to build navigation from the permissions that
// GET /auth/me returns, so a mapped permission (NAV_PERMISSIONS) decides when the permission
// list is known; otherwise the legacy role table applies, and with no role either, nothing shows.
// UI-only: the backend authorizes every request.
export function canSeeNav(user: Pick<SessionUser, "role" | "permissions"> | null, key: string): boolean {
  if (!user) return false
  const required = NAV_PERMISSIONS[key]
  if (required && user.permissions) return hasPermission(user.permissions, required)
  return canSee(user.role, key)
}
