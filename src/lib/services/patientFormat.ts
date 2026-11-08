// Display helpers for a patient (handoff 4 and 8.3): age on the HOSPITAL's calendar, "~45 yrs" for an estimated age, phone shown from E.164
// and a CNIC with its dashes. Pure and text-only: nothing here reads the browser clock except `localToday`, which is for the demo (mock mode)
// where no hospital settings exist.

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

function parts(date: string): { y: number; m: number; d: number } | null {
  const m = DATE_RE.exec(date)
  return m ? { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) } : null
}

const DAY_MS = 86_400_000
const utcDay = (p: { y: number; m: number; d: number }) => Date.UTC(p.y, p.m - 1, p.d) / DAY_MS

/** Today's date in the browser's own time zone as YYYY-MM-DD. Only the demo uses this; the real API's "today" is `GET /settings` `today`. */
export function localToday(): string {
  const n = new Date()
  const pad = (v: number) => String(v).padStart(2, "0")
  return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`
}

/** Whole years, the months after them, and the days between two calendar dates; null when either is not a date or `dob` is after `on`. */
export function ageParts(dob: string, on: string): { years: number; months: number; days: number } | null {
  const a = parts(dob)
  const b = parts(on)
  if (!a || !b || utcDay(a) > utcDay(b)) return null
  let years = b.y - a.y
  let months = b.m - a.m
  if (b.d < a.d) months -= 1
  if (months < 0) { years -= 1; months += 12 }
  return { years, months, days: Math.round(utcDay(b) - utcDay(a)) }
}

/**
 * "34 yrs", "1 yr", "7 mo", "12 days"; "~45 yrs" when the date of birth was estimated. Counts to the date of death for a deceased patient and
 * otherwise to `today` (the hospital's date). "—" when the dates cannot be compared.
 */
export function formatPatientAge(p: { dob: string; dobEstimated?: boolean; deceasedOn?: string | null }, today: string): string {
  const age = ageParts(p.dob, p.deceasedOn ?? today)
  if (!age) return "—"
  const text =
    age.years >= 2 ? `${age.years} yrs`
    : age.years === 1 ? "1 yr"
    : age.months >= 1 ? `${age.months} mo`
    : `${age.days} ${age.days === 1 ? "day" : "days"}`
  return p.dobEstimated ? `~${text}` : text
}

/** "+923001234567" (E.164) or "03001234567" -> "0300-1234567". Anything else (a landline, a foreign number) is shown as stored. */
export function formatPhone(raw: string | null | undefined): string {
  const v = (raw ?? "").trim()
  if (v === "") return ""
  const e164 = /^\+92(3\d{2})(\d{7})$/.exec(v)
  if (e164) return `0${e164[1]}-${e164[2]}`
  const local = /^(03\d{2})-?(\d{7})$/.exec(v)
  if (local) return `${local[1]}-${local[2]}`
  return v
}

/** 13 digits -> "12345-1234567-1"; anything else is shown as stored. */
export function formatCnic(raw: string | null | undefined): string {
  const v = (raw ?? "").trim()
  const m = /^(\d{5})-?(\d{7})-?(\d)$/.exec(v)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : v
}
