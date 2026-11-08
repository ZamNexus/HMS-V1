// POST /auth/change-password failures (MD section 3). Branch on `code`, never on the message:
//   422 WEAK_PASSWORD            details.problems[] lists each problem (shown under the new-password field)
//   422 INVALID_CURRENT_PASSWORD shown under the current-password field
//   422 PASSWORD_UNCHANGED       the new password equals the old one
//   400 VALIDATION_FAILED        per-field details
import { ApiError, fieldErrorsOf } from "@/lib/api/client"

/** Rules shown BEFORE the user types (MD section 3). The server decides; this only tells the user what to expect. */
export const PASSWORD_RULES: readonly string[] = [
  "At least 10 characters.",
  "Not a common password.",
  "Does not contain your username, email or Hospital Code.",
]
export const MIN_PASSWORD_LENGTH = 10

export interface PasswordFormErrors {
  current?: string
  next?: string
  problems: string[]
  /** Anything that is not about one field (network, 5xx, 429): shown as a general message with the support reference. */
  general?: string
  requestId?: string | null
}

export function passwordErrorsFrom(err: unknown): PasswordFormErrors {
  if (!(err instanceof ApiError)) return { problems: [], general: "Something went wrong. Please try again." }
  const out: PasswordFormErrors = { problems: [], requestId: err.requestId }
  switch (err.code) {
    case "WEAK_PASSWORD": {
      const d = err.body?.details
      const list = d && !Array.isArray(d) && Array.isArray((d as { problems?: unknown }).problems) ? (d as { problems: unknown[] }).problems : []
      out.problems = list.filter((p): p is string => typeof p === "string")
      out.next = out.problems.length === 0 ? err.message : "That password is not strong enough:"
      return out
    }
    case "INVALID_CURRENT_PASSWORD":
      out.current = err.message
      return out
    case "PASSWORD_UNCHANGED":
      out.next = err.message
      return out
    case "VALIDATION_FAILED": {
      for (const f of fieldErrorsOf(err)) {
        if (f.path === "currentPassword") out.current ??= f.message
        else if (f.path === "newPassword") out.next ??= f.message
      }
      if (!out.current && !out.next) out.general = "Some details need correcting."
      return out
    }
    default:
      // no connection / timeout / offline: the client's own wording; anything else gets a neutral sentence plus the support reference
      out.general = err.status === 0 ? err.message : "Could not change the password. Please try again."
      return out
  }
}
