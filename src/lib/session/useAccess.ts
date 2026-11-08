"use client"
import * as React from "react"
import { useAuth } from "@/lib/auth"
import { useHospital } from "./useHospital"
import { NAV_RULES, OPEN_TO_SIGNED_IN, hasPermission, ruleForPath, satisfies, type AccessRule } from "./permissions"

/**
 * What the signed-in user may see and do: permissions from GET /auth/me, plus the department switches from GET /settings/modules.
 * Never the role. UI only: the API enforces the same rules and every 403 is still handled.
 */
export function useAccess() {
  const { user } = useAuth()
  const { modules, loading: hospitalLoading, error: hospitalError, reload: reloadHospital } = useHospital()
  return React.useMemo(() => {
    const permissions = user?.permissions ?? null
    return {
      permissions,
      modules,
      /** Read the department switches again (after a failure). */
      reloadHospital,
      /** One permission, e.g. can("billing.write"). */
      can: (permission: string) => hasPermission(permissions, permission),
      /** Any of several permissions. */
      canAny: (...list: string[]) => list.some((p) => hasPermission(permissions, p)),
      /** A rule (permissions and/or a department module). */
      allows: (rule: AccessRule) => satisfies(rule, permissions, modules),
      /** A sidebar item. */
      canNav: (key: string) => !!NAV_RULES[key] && satisfies(NAV_RULES[key], permissions, modules),
      /**
       * A page address typed into the browser: "allowed", "denied", or "loading" while the department switches are still being read (a screen of a
       * switched-off department must not flash), or "unknown" when they could not be read. A page with no rule is refused (default deny).
       */
      routeStatus: (pathname: string): "allowed" | "denied" | "loading" | "unknown" => {
        const rule = ruleForPath(pathname)
        // default deny: a page with no rule is refused unless it is one of the few that only need a signed-in user
        if (!rule) return user && OPEN_TO_SIGNED_IN.includes(pathname.replace(/\/+$/, "")) ? "allowed" : "denied"
        if (!permissions || (rule.any && !rule.any.some((p) => permissions.includes(p))) || (rule.all && !rule.all.every((p) => permissions.includes(p)))) return "denied"
        // the department switches could not be read: say so (with a retry) instead of pretending the user may not enter
        if (rule.module && !modules) return hospitalLoading ? "loading" : hospitalError ? "unknown" : "denied"
        return satisfies(rule, permissions, modules) ? "allowed" : "denied"
      },
    }
  }, [user, modules, hospitalLoading, hospitalError, reloadHospital])
}
