// A 400 VALIDATION_FAILED lists { path, message } per invalid field (MD section 4). The server is authoritative; the form shows each message
// under its own field and keeps everything the user typed.
import { ApiError, fieldErrorsOf } from "@/lib/api/client"

export const VALIDATION_FAILED = "VALIDATION_FAILED"

export function isValidationFailed(err: unknown): err is ApiError {
  return err instanceof ApiError && err.code === VALIDATION_FAILED
}

/** { "phone": "…", "coverages.0.panelId": "…" }: the first message per path. */
export function fieldErrorMap(err: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  for (const { path, message } of fieldErrorsOf(err)) if (!(path in out)) out[path] = message
  return out
}

/**
 * Applies the messages to a form. `setError` is react-hook-form's. A path the form has no field for is returned (not dropped) so the screen can
 * show it in a summary instead of hiding the problem. `aliases` maps a wire path to the form's field name when they differ.
 */
export function applyFieldErrors(
  err: unknown,
  setError: (name: string, error: { type: string; message: string }) => void,
  hasField: (name: string) => boolean,
  aliases: Record<string, string> = {}
): { unplaced: { path: string; message: string }[] } {
  const unplaced: { path: string; message: string }[] = []
  for (const [path, message] of Object.entries(fieldErrorMap(err))) {
    const name = aliases[path] ?? path
    if (hasField(name)) setError(name, { type: "server", message })
    else unplaced.push({ path, message })
  }
  return { unplaced }
}

/** "*_CHANGED" (PATIENT_CHANGED, ENCOUNTER_CHANGED, SETTINGS_CHANGED, APPOINTMENT_CHANGED, EXPENSE_CHANGED): someone else saved first. */
export function isConflictChanged(err: unknown): boolean {
  return err instanceof ApiError && err.status === 409 && /_CHANGED$/.test(err.code)
}
