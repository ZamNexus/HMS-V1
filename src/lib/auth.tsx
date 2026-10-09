"use client"
import * as React from "react"
import { USERS } from "@/data/users"
import type { Role, User } from "@/types"

const STORAGE_KEY = "hms_user"
const SESSION_MAX_AGE = 86400 // seconds; the cookie is the session's source of truth

// What the browser keeps about the signed-in user. Never includes the password.
export type SessionUser = Omit<User, "password">

function toSessionUser(u: User | SessionUser): SessionUser {
  const { password: _password, ...session } = u as User // eslint-disable-line @typescript-eslint/no-unused-vars
  return session
}

function hasSessionCookie(): boolean {
  return document.cookie.split("; ").some((c) => c.startsWith(`${STORAGE_KEY}=`))
}

function readStoredUser(): SessionUser | null {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  const parsed = JSON.parse(raw) as Partial<User>
  if (typeof parsed?.id !== "number" || typeof parsed.role !== "string" || typeof parsed.name !== "string") return null
  return toSessionUser(parsed as User)
}

interface AuthContextValue {
  user: SessionUser | null
  isInitialized: boolean
  login: (email: string, password: string) => { ok: true } | { ok: false; error: string }
  logout: () => void
}

const AuthContext = React.createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<SessionUser | null>(null)
  const [isInitialized, setIsInitialized] = React.useState(false)

  React.useEffect(() => {
    try {
      // An expired/missing cookie means signed out, even if localStorage still has a user.
      // Otherwise the login page would show "Already signed in" while the proxy bounces
      // every dashboard request back to /login.
      const stored = hasSessionCookie() ? readStoredUser() : null
      if (stored) {
        // Re-save so records written before passwords were stripped get cleaned up
        localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
        setUser(stored)
      } else {
        localStorage.removeItem(STORAGE_KEY)
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY)
    } finally {
      setIsInitialized(true)
    }
  }, [])

  const login = React.useCallback((email: string, password: string) => {
    const found = USERS.find(
      (u) => u.email.toLowerCase() === email.trim().toLowerCase() && u.password === password
    )
    if (!found) {
      return { ok: false as const, error: "Invalid email or password." }
    }
    const session = toSessionUser(found)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
    // Set a cookie so the proxy can see it. Demo only: it is not signed or HttpOnly,
    // so it must be replaced by a backend-issued session cookie.
    const secure = window.location.protocol === "https:" ? "; Secure" : ""
    document.cookie = `${STORAGE_KEY}=${encodeURIComponent(JSON.stringify({ id: found.id, role: found.role }))}; path=/; max-age=${SESSION_MAX_AGE}; SameSite=Lax${secure}`
    setUser(session)
    return { ok: true as const }
  }, [])

  const logout = React.useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    document.cookie = `${STORAGE_KEY}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`
    setUser(null)
    window.location.href = '/login'
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

export function canSee(role: Role, key: string): boolean {
  return SIDEBAR_VISIBILITY[role]?.includes(key) ?? false
}
