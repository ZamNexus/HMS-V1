import { callEndpoint } from "./http/call"
import { parseCurrentUser } from "./http/mappers"
import type { CurrentUser } from "./types"

// Signed-in user's permissions. Deliberately has NO mock implementation: permissions
// must only ever come from the backend.
//
// STATUS: the session code (src/lib/session/session.ts) reads GET /auth/me itself and builds the full SessionUser; this thin permissions-only
// reader remains for the contract tests and is replaced in chunk H1.

export const authService = {
  /** GET /api/v1/auth/me (documented path; response schema pending confirmation). */
  async me(signal?: AbortSignal): Promise<CurrentUser> {
    return parseCurrentUser(await callEndpoint<unknown>("auth.me", { signal }))
  },
}

// Navigation and route rules now live in src/lib/session/permissions.ts (NAV_RULES, ROUTE_RULES), built from the handoff's screen table.
export { hasPermission } from "@/lib/session/permissions"
