import type { AppointmentAction, AppointmentRecord, AppointmentStatus } from "@/lib/services"

// Pure helpers for the appointment screens (unit-tested). Times and dates are the HOSPITAL's (the API sends them already in its zone).

export const STATUS_LABEL: Record<AppointmentStatus, string> = {
  requested: "Requested", confirmed: "Confirmed", completed: "Completed", cancelled: "Cancelled", no_show: "No show",
}

export const ACTION_LABEL: Record<AppointmentAction, string> = {
  confirm: "Confirm", reschedule: "Reschedule", cancel: "Cancel", no_show: "Mark no-show", check_in: "Check in",
}

/** The permission each button needs on top of the appointment allowing it (handoff 8.4: appointments.write; check-in opens a visit: encounters.check_in). */
const ACTION_PERMISSION: Record<AppointmentAction, string> = {
  confirm: "appointments.write", reschedule: "appointments.write", cancel: "appointments.write", no_show: "appointments.write", check_in: "encounters.check_in",
}

/**
 * EXACTLY the buttons to show: the actions the API lists in `allowedActions` that the user also has the permission for, in a fixed order. Never an
 * action the API did not list (it would refuse it), whatever the status looks like.
 */
export function visibleActions(appointment: Pick<AppointmentRecord, "allowedActions">, can: (permission: string) => boolean): AppointmentAction[] {
  return appointment.allowedActions.filter((a) => can(ACTION_PERMISSION[a]))
}

/** "09:30" -> "9:30 AM". Anything that is not HH:MM is returned as it came. */
export function time12(hhmm: string): string {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm)
  if (!m) return hhmm
  const h = Number(m[1])
  return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${h < 12 ? "AM" : "PM"}`
}

/** YYYY-MM-DD plus a number of days, by calendar arithmetic (no time zone, no browser clock). */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + days))
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`
}

/** The query the list screen sends for its date choice: today (default), "all", "upcoming" (from today on) or one chosen day. */
export function dateFilterQuery(choice: string | undefined, today: string): { date?: string; dateFrom?: string } {
  if (choice === "all") return {}
  if (choice === "upcoming") return { dateFrom: today }
  if (choice && /^\d{4}-\d{2}-\d{2}$/.test(choice)) return { date: choice }
  return { date: today }
}
