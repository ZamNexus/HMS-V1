"use client"
import * as React from "react"
import {
  setAuthRefreshHandler, setForbiddenHandler, setPasswordChangeRequiredHandler, setSessionOverHandler,
} from "@/lib/api/client"
import { ROLE_LABELS } from "@/lib/labels"
import { invalidateFamily } from "@/lib/query/invalidate"
import { IDLE_TIMEOUT_MS, createSessionManager, defaultDeps, type EndReason, type SessionManager, type SessionState, type SignInInput, type SignInResult } from "@/lib/session/session"
import { watchIdle } from "@/lib/session/idle"
import type { SessionUser } from "@/lib/session/sessionUser"

export type { SessionUser } from "@/lib/session/sessionUser"
export type { EndReason, SignInInput, SignInResult } from "@/lib/session/session"

// SECURITY NOTE: nothing derived from `SessionUser` is an authorization control. It only shapes the UI. The backend authorizes every request from
// the access token; a user who tampers with this state gains no server-side access. What the user may see comes from `user.permissions`
// (GET /auth/me), never from `user.role` (src/lib/session/permissions.ts).
//
// The rules of the session (boot refresh, one shared refresh, sign-out, multi-tab, idle) are in src/lib/session/session.ts and are unit-tested
// there. This file only connects them to React.

const LEGACY_STORAGE_KEY = "hms_user" // demo-era localStorage record; removed on load

let manager: SessionManager | null = null
function getManager(): SessionManager {
  manager ??= createSessionManager(defaultDeps())
  return manager
}

const SERVER_STATE: SessionState = { status: "booting", user: null, endedReason: null, bootError: null }

interface AuthContextValue {
  user: SessionUser | null
  /** False until the boot refresh has answered: show a neutral splash, never the sign-in form. */
  isInitialized: boolean
  endedReason: EndReason | null
  /** The boot could not reach the server (this is not "not signed in"). */
  bootError: string | null
  login: (credentials: SignInInput) => Promise<SignInResult>
  logout: () => Promise<void>
  logoutAll: () => Promise<void>
  /** Read /auth/me again (after a password change, or when the permissions may have changed). */
  reloadUser: () => Promise<void>
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>
}

const AuthContext = React.createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const m = getManager()
  const state = React.useSyncExternalStore(m.subscribe, m.getState, () => SERVER_STATE)

  // Start once: handlers, tab channel, boot refresh, focus handling.
  React.useEffect(() => {
    try {
      localStorage.removeItem(LEGACY_STORAGE_KEY)
    } catch {
      // storage unavailable: nothing to clean up
    }
    const uninstall = m.install()
    setAuthRefreshHandler(async () => { await m.refreshAccessToken() })
    setSessionOverHandler((code, sentToken) => m.handlers.sessionOver(code, sentToken))
    setForbiddenHandler((sentToken) => m.handlers.onForbidden(sentToken))
    setPasswordChangeRequiredHandler(() => m.handlers.onPasswordChangeRequired())
    const onFocus = () => m.handlers.onFocus()
    const onOnline = () => m.handlers.onOnline()
    window.addEventListener("focus", onFocus)
    window.addEventListener("online", onOnline)
    void m.boot()
    return () => {
      window.removeEventListener("focus", onFocus)
      window.removeEventListener("online", onOnline)
      setAuthRefreshHandler(null)
      setSessionOverHandler(null)
      setForbiddenHandler(null)
      setPasswordChangeRequiredHandler(null)
      uninstall()
    }
  }, [m])

  // Sign out after 15 minutes without activity.
  const signedIn = state.status === "signed-in"
  React.useEffect(() => {
    if (!signedIn) return
    const watcher = watchIdle(IDLE_TIMEOUT_MS, () => { void m.signOut({ reason: "idle" }) }, { onActivity: () => m.announceActivity() })
    const stopPeers = m.onPeerActivity(() => watcher.touch())
    return () => {
      stopPeers()
      watcher()
    }
  }, [signedIn, m])

  const value = React.useMemo<AuthContextValue>(
    () => ({
      user: state.user,
      isInitialized: state.status !== "booting",
      endedReason: state.endedReason,
      bootError: state.bootError,
      login: (credentials) => m.signIn(credentials),
      logout: () => m.signOut(),
      logoutAll: () => m.signOut({ all: true }),
      // the department switches and settings are read again together with the user (an admin may have changed them)
      reloadUser: async () => {
        await m.reloadUser()
        void invalidateFamily("settings")
      },
      changePassword: (current, next) => m.changePassword(current, next),
    }),
    [state, m]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = React.useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}

/** Display label for a role (the backend's role names, e.g. "lab_tech"). For DISPLAY only: never used to decide what a user may do. */
export function roleLabel(role: string | null): string {
  if (!role) return "Role not set"
  const known = (ROLE_LABELS as Record<string, string>)[role]
  if (known) return known
  return role.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())
}
