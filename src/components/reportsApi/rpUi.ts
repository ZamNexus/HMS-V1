import { RP_MAX_DAYS, daysBetween, type RpPeriod } from "@/lib/services"

// Pure rules of the report screens (handoff 8.11): the date presets are worked out from the HOSPITAL's today (GET /settings `today`), never the browser's clock; every report takes
// two hospital days, inclusive, at most 366 days apart. Dates here are plain YYYY-MM-DD strings handled as UTC midnights so a time zone can never move a day.

export const RP_RANGES = ["today", "yesterday", "week", "month", "lastMonth", "custom"] as const
export type RpRange = (typeof RP_RANGES)[number]
export const RP_RANGE_LABEL: Record<RpRange, string> = { today: "Today", yesterday: "Yesterday", week: "This Week", month: "This Month", lastMonth: "Last Month", custom: "Custom" }
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const DAY_MS = 86_400_000

const toUtc = (date: string): number => Date.parse(`${date}T00:00:00Z`)
const fromUtc = (ms: number): string => new Date(ms).toISOString().slice(0, 10)

export const isDay = (v: string | undefined): v is string => !!v && DATE_RE.test(v) && !Number.isNaN(toUtc(v)) && fromUtc(toUtc(v)) === v
export const addDays = (date: string, n: number): string => fromUtc(toUtc(date) + n * DAY_MS)
export const monthStart = (date: string): string => `${date.slice(0, 7)}-01`
/** The last day of the month the date is in. */
export const monthEnd = (date: string): string => { const d = new Date(toUtc(monthStart(date))); return fromUtc(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) - DAY_MS) }
/** The Monday of the week the date is in (weeks run Monday to Sunday). */
export const weekStart = (date: string): string => { const dow = new Date(toUtc(date)).getUTCDay(); return addDays(date, -((dow + 6) % 7)) }

export interface PeriodResult { period: RpPeriod | null; problem: string | null }

/** The two dates for a preset (or the typed custom dates), or the reason there are none. Nothing is sent while there is a problem. */
export function periodFor(range: RpRange, today: string | null, custom: { from?: string; to?: string } = {}): PeriodResult {
  if (range === "custom") {
    if (!isDay(custom.from) || !isDay(custom.to)) return { period: null, problem: "Choose both dates." }
    if (custom.from > custom.to) return { period: null, problem: "The start date is after the end date." }
    if (daysBetween(custom.from, custom.to) > RP_MAX_DAYS) return { period: null, problem: `A report covers at most ${RP_MAX_DAYS} days.` }
    return { period: { dateFrom: custom.from, dateTo: custom.to }, problem: null }
  }
  if (!today) return { period: null, problem: null } // the hospital's date is still loading
  switch (range) {
    case "today": return { period: { dateFrom: today, dateTo: today }, problem: null }
    case "yesterday": { const y = addDays(today, -1); return { period: { dateFrom: y, dateTo: y }, problem: null } }
    case "week": return { period: { dateFrom: weekStart(today), dateTo: today }, problem: null }
    case "month": return { period: { dateFrom: monthStart(today), dateTo: today }, problem: null }
    case "lastMonth": { const lastDay = addDays(monthStart(today), -1); return { period: { dateFrom: monthStart(lastDay), dateTo: lastDay }, problem: null } }
  }
}

/**
 * The filters the registers (charges, payments, invoices) keep in the address bar. Switching to another report, tab or view must drop them: a leftover `type=refund` from one tab would
 * override the next tab's own default (Receipts and Payments are the same register with a different starting type).
 */
export const REGISTER_FILTER_KEYS = ["type", "mode", "from", "to", "payer", "doctor", "source", "voided", "status", "patient", "category", "bank", "medicine"] as const
export const clearedRegisterFilters = (): Record<(typeof REGISTER_FILTER_KEYS)[number], undefined> => ({ type: undefined, mode: undefined, from: undefined, to: undefined, payer: undefined, doctor: undefined, source: undefined, voided: undefined, status: undefined, patient: undefined, category: undefined, bank: undefined, medicine: undefined })

export const rangeFromUrl = (v: string | undefined): RpRange => RP_RANGES.find((r) => r === v) ?? "month"

/** The reports in the hub: where each comes from, what it needs, and whether it can run yet. A report with no published route stays listed, saying what it awaits. */
export const RP_REPORTS = ["revenue", "daily-transactions", "balances", "accounts", "lists", "daily", "opd", "lab", "pharmacy", "expense", "cash-flow", "demographics", "prescriptions"] as const
export type RpReport = (typeof RP_REPORTS)[number]
export const RP_REPORT_LABEL: Record<RpReport, string> = {
  revenue: "Revenue", "daily-transactions": "Daily Transactions", balances: "Patient Balances", accounts: "Accounts", lists: "Lists",
  daily: "Daily Summary", opd: "OPD Statistics", lab: "Laboratory", pharmacy: "Pharmacy", expense: "Expenses", "cash-flow": "Cash Flow", demographics: "Patient Demographics", prescriptions: "Prescription History",
}
export const RP_GROUPS: { title: string; reports: readonly RpReport[] }[] = [
  { title: "Analytics", reports: ["revenue", "daily", "opd", "lab", "pharmacy", "expense", "cash-flow", "demographics"] },
  { title: "Lists & History", reports: ["daily-transactions", "balances", "accounts", "lists", "prescriptions"] },
]
/** The routes of the reports the backend has not published a shape for (handoff 8.11 names them; docs/openapi.json does not have them). */
/** Reports that take a period (the others are lists or as-of-now figures). */
export const RP_TAKES_PERIOD: ReadonlySet<RpReport> = new Set<RpReport>(["revenue", "daily-transactions", "daily", "opd", "lab", "pharmacy", "expense", "cash-flow", "demographics"])
