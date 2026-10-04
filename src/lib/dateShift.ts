// All dummy data was authored around a fixed narrative date (27 Aug 2024, the
// most recent date used across the seed data). This shifts every stored date
// forward by the same number of days so "today" in the running app always
// lines up with the most recent dummy activity, keeping relative-time labels
// ("3 days ago") realistic no matter when the app is actually run.
const ANCHOR = new Date("2024-08-27T23:59:59")
const SHIFT_DAYS = Math.floor((Date.now() - ANCHOR.getTime()) / 86400000)

export function shiftDate<T extends string | undefined>(iso: T): T {
  if (!iso) return iso
  const hasTime = iso.includes("T")
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  d.setUTCDate(d.getUTCDate() + SHIFT_DAYS)
  const result = hasTime ? d.toISOString().slice(0, 19) : d.toISOString().slice(0, 10)
  return result as T
}
