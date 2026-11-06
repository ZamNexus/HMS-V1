import { callEndpoint } from "./http/call"
import { parseCurrentUser } from "./http/mappers"
import type { CurrentUser } from "./types"

// Signed-in user's permissions. Deliberately has NO mock implementation: permissions
// must only ever come from the backend.
//
// STATUS: prepared, not wired. Nothing calls this during login (the Phase 2 login flow is
// unchanged) because the /auth/me response schema is not in the provided documentation,
// so parseCurrentUser is still pending. Wire it in src/lib/auth.tsx once the schema is known.

export const authService = {
  /** GET /api/v1/auth/me (documented path; response schema pending confirmation). */
  async me(signal?: AbortSignal): Promise<CurrentUser> {
    return parseCurrentUser(await callEndpoint<unknown>("auth.me", { signal }))
  },
}

/**
 * Sidebar item key -> the backend permission that unlocks it. The API Reference says to
 * build navigation from the permissions returned by /auth/me but lists no permission
 * names, so this is EMPTY ON PURPOSE. Fill from the OpenAPI spec. An item without an
 * entry here is never unlocked by permissions.
 */
export const NAV_PERMISSIONS: Readonly<Record<string, string>> = {}

/** True only when the permission list is known and contains `permission`. Unknown (null) grants nothing. */
export function hasPermission(permissions: readonly string[] | null | undefined, permission: string): boolean {
  return !!permissions && permissions.includes(permission)
}
