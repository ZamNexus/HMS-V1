"use client"
import * as React from "react"
import { USERS } from "@/data/users"
import type { Role, User } from "@/types"

const STORAGE_KEY = "hms_user"

interface AuthContextValue {
  user: User | null
  isInitialized: boolean
  login: (email: string, password: string) => { ok: true } | { ok: false; error: string }
  logout: () => void
}

const AuthContext = React.createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<User | null>(null)
  const [isInitialized, setIsInitialized] = React.useState(false)

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) setUser(JSON.parse(raw) as User)
    } catch {
      // ignore
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(found))
    // Set a cookie so middleware can see it
    document.cookie = `${STORAGE_KEY}=${encodeURIComponent(JSON.stringify({ id: found.id, role: found.role }))}; path=/; max-age=86400`
    setUser(found)
    return { ok: true as const }
  }, [])

  const logout = React.useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    document.cookie = `${STORAGE_KEY}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`
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
