import type { QueryParams } from "@/lib/api/client"
import { isUlid } from "@/lib/api/convert"
import type {
  DashSeriesPoint, DashboardApiData, ReportsApiService, RpAging, RpCashFlowQuery, RpCollectMode, RpCollections, RpOutstanding, RpPatientBalance, RpPatientBalanceOptions, RpPeriod, RpPerson,
  RpPrescriptionOptions, RpRevenue, RpSourceType,
} from "../types"
import { callEndpoint } from "./call"
import { seriesOf } from "./series"
import { asObj, pageQuery, parsePage, reqDate, reqEnum, reqInt, reqStr, reqUlid, type Obj } from "./wire"

// Reports (handoff 8.11; docs/openapi.json RevenueReport / CollectionsReport / OutstandingReport / PatientBalance*). Every figure is computed by the server and kept as the exact text it sent:
// the browser never adds, rounds or re-derives one. Every report takes dateFrom and dateTo as hospital days (inclusive), at most 366 days apart; reads need reports.read.

export const RP_MAX_DAYS = 366
export const RP_SOURCE_TYPES: readonly RpSourceType[] = ["consultation", "service", "diagnostic", "pharmacy", "room"]
export const RP_COLLECT_MODES: readonly RpCollectMode[] = ["cash", "card", "bank_transfer", "cheque", "insurance", "on_account"]
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const DECIMAL_RE = /^-?\d+(\.\d+)?$/
const DAY_MS = 86_400_000

/** Whole days from one YYYY-MM-DD to another (dates only, no clock: both read as UTC midnights). */
export const daysBetween = (from: string, to: string): number => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS)

/** The two dates every report takes, checked before anything is sent: valid days, the start not after the end, at most 366 days apart. */
export function periodQuery(period: RpPeriod): QueryParams {
  if (!DATE_RE.test(period.dateFrom) || !DATE_RE.test(period.dateTo) || Number.isNaN(Date.parse(period.dateFrom)) || Number.isNaN(Date.parse(period.dateTo))) throw new RangeError("Dates are YYYY-MM-DD.")
  if (period.dateFrom > period.dateTo) throw new RangeError("The start date is after the end date.")
  if (daysBetween(period.dateFrom, period.dateTo) > RP_MAX_DAYS) throw new RangeError("A report covers at most 366 days.")
  return { dateFrom: period.dateFrom, dateTo: period.dateTo }
}

// ── Reading ──

const money = (o: Obj, key: string, what: string): string => {
  const v = o[key]
  if (typeof v !== "string" || !DECIMAL_RE.test(v)) throw new TypeError(`Unexpected response: ${what}.${key} is not a decimal string.`)
  return v
}
const count = (o: Obj, key: string, what: string): number => {
  const n = reqInt(o, key, what)
  if (n < 0) throw new TypeError(`Unexpected response: ${what}.${key} is negative.`)
  return n
}
const list = <T>(o: Obj, key: string, what: string, item: (raw: unknown) => T): T[] => {
  const v = o[key]
  if (!Array.isArray(v)) throw new TypeError(`Unexpected response: ${what}.${key} is not an array.`)
  return v.map(item)
}
const person = (raw: unknown, what: string): RpPerson => { const o = asObj(raw, what); return { id: reqUlid(o, "id", what), name: reqStr(o, "name", what) } }
const period = (raw: unknown, what: string): RpPeriod => { const o = asObj(raw, `${what}.period`); return { dateFrom: reqDate(o, "dateFrom", `${what}.period`), dateTo: reqDate(o, "dateTo", `${what}.period`) } }

export function parseRevenue(raw: unknown): RpRevenue {
  const o = asObj(raw, "RevenueReport")
  return {
    period: period(o.period, "RevenueReport"),
    grossRevenue: money(o, "grossRevenue", "RevenueReport"), creditNotes: money(o, "creditNotes", "RevenueReport"), netRevenue: money(o, "netRevenue", "RevenueReport"),
    gstCollected: money(o, "gstCollected", "RevenueReport"), discountsGiven: money(o, "discountsGiven", "RevenueReport"), voided: money(o, "voided", "RevenueReport"),
    bySource: list(o, "bySource", "RevenueReport", (r) => { const x = asObj(r, "RevenueReport.bySource"); return { sourceType: reqEnum(x, "sourceType", "RevenueReport.bySource", RP_SOURCE_TYPES), charges: count(x, "charges", "RevenueReport.bySource"), revenue: money(x, "revenue", "RevenueReport.bySource"), gst: money(x, "gst", "RevenueReport.bySource") } }),
    byDoctor: list(o, "byDoctor", "RevenueReport", (r) => { const x = asObj(r, "RevenueReport.byDoctor"); return { doctor: person(x.doctor, "RevenueReport.byDoctor.doctor"), charges: count(x, "charges", "RevenueReport.byDoctor"), revenue: money(x, "revenue", "RevenueReport.byDoctor"), commission: money(x, "commission", "RevenueReport.byDoctor") } }),
    byPanel: list(o, "byPanel", "RevenueReport", (r) => { const x = asObj(r, "RevenueReport.byPanel"); return { panel: person(x.panel, "RevenueReport.byPanel.panel"), charges: count(x, "charges", "RevenueReport.byPanel"), revenue: money(x, "revenue", "RevenueReport.byPanel"), commission: money(x, "commission", "RevenueReport.byPanel") } }),
  }
}

export function parseCollections(raw: unknown): RpCollections {
  const o = asObj(raw, "CollectionsReport")
  return {
    period: period(o.period, "CollectionsReport"),
    received: money(o, "received", "CollectionsReport"), refunded: money(o, "refunded", "CollectionsReport"), net: money(o, "net", "CollectionsReport"),
    byMode: list(o, "byMode", "CollectionsReport", (r) => { const x = asObj(r, "CollectionsReport.byMode"); return { mode: reqEnum(x, "mode", "CollectionsReport.byMode", RP_COLLECT_MODES), received: money(x, "received", "CollectionsReport.byMode"), refunded: money(x, "refunded", "CollectionsReport.byMode") } }),
    byCollector: list(o, "byCollector", "CollectionsReport", (r) => { const x = asObj(r, "CollectionsReport.byCollector"); return { user: person(x.user, "CollectionsReport.byCollector.user"), receipts: count(x, "receipts", "CollectionsReport.byCollector"), received: money(x, "received", "CollectionsReport.byCollector"), refunded: money(x, "refunded", "CollectionsReport.byCollector") } }),
  }
}

const aging = (raw: unknown, what: string): RpAging => {
  const o = asObj(raw, what)
  return { days0to30: money(o, "days0to30", what), days31to60: money(o, "days31to60", what), days61to90: money(o, "days61to90", what), over90: money(o, "over90", what) }
}
const owed = (raw: unknown, what: string) => { const o = asObj(raw, what); return { total: money(o, "total", what), aging: aging(o.aging, `${what}.aging`) } }

export function parseOutstanding(raw: unknown): RpOutstanding {
  const o = asObj(raw, "OutstandingReport")
  return {
    asOf: reqDate(o, "asOf", "OutstandingReport"),
    patients: owed(o.patients, "OutstandingReport.patients"),
    panels: owed(o.panels, "OutstandingReport.panels"),
    byPanel: list(o, "byPanel", "OutstandingReport", (r) => { const x = asObj(r, "OutstandingReport.byPanel"); return { panel: person(x.panel, "OutstandingReport.byPanel.panel"), outstanding: money(x, "outstanding", "OutstandingReport.byPanel") } }),
  }
}

export function parsePatientBalance(raw: unknown): RpPatientBalance {
  const o = asObj(raw, "PatientBalance")
  const p = asObj(o.patient, "PatientBalance.patient")
  return {
    patient: { id: reqUlid(p, "id", "PatientBalance.patient"), mrNo: reqStr(p, "mrNo", "PatientBalance.patient"), name: reqStr(p, "name", "PatientBalance.patient"), phone: reqStr(p, "phone", "PatientBalance.patient") },
    outstanding: money(o, "outstanding", "PatientBalance"),
    oldestUnpaid: reqDate(o, "oldestUnpaid", "PatientBalance"),
  }
}

export function patientBalanceQuery(options: RpPatientBalanceOptions = {}): QueryParams {
  return { ...pageQuery(options.page, options.pageSize) }
}

// ── The reports the handoff describes in words only (8.11): returned as received, shown as sent ──

/** A document: an object or a list. A bare number, text or null is not a report. */
function document(raw: unknown, what: string): unknown {
  if (raw !== null && typeof raw === "object") return raw
  throw new TypeError(`Unexpected response: ${what} is not a document.`)
}
const DAY = /^\d{4}-\d{2}-\d{2}$/

export function pharmacyReportQuery(p: RpPeriod, days?: number): QueryParams {
  const q = periodQuery(p)
  if (days !== undefined) {
    if (!Number.isInteger(days) || days < 1 || days > 3650) throw new RangeError("The number of days is a whole number from 1 to 3650.")
    q.expiringWithinDays = days
  }
  return q
}

export function revenueDailyQuery(p: RpPeriod, sourceType?: RpSourceType): QueryParams {
  const q = periodQuery(p)
  if (sourceType !== undefined) {
    if (!RP_SOURCE_TYPES.includes(sourceType)) throw new RangeError("The kind of charge is not valid.")
    q.sourceType = sourceType
  }
  return q
}

/** GET /reports/cash-flow takes ONE day (`date`, the Dashboard's Cash Flow) or a period (`dateFrom` and `dateTo`), never both (handoff 8.10). */
export function cashFlowQuery(c: RpCashFlowQuery): QueryParams {
  if (c.date !== undefined) {
    if (c.dateFrom !== undefined || c.dateTo !== undefined) throw new RangeError("Ask for one day or for a period, not both.")
    if (!DAY.test(c.date) || Number.isNaN(Date.parse(c.date))) throw new RangeError("The date is YYYY-MM-DD.")
    return { date: c.date }
  }
  if (c.dateFrom === undefined || c.dateTo === undefined) throw new RangeError("Choose a day or a period.")
  return periodQuery({ dateFrom: c.dateFrom, dateTo: c.dateTo })
}

/** GET /prescriptions (encounters.read): dateFrom, dateTo, patientId, doctorId, medicineId, search; paged. */
export function prescriptionQuery(o: RpPrescriptionOptions = {}): QueryParams {
  const q: QueryParams = { ...pageQuery(o.page, o.pageSize) }
  if (o.dateFrom !== undefined || o.dateTo !== undefined) {
    if (o.dateFrom === undefined || o.dateTo === undefined) throw new RangeError("Choose both dates, or neither.")
    Object.assign(q, periodQuery({ dateFrom: o.dateFrom, dateTo: o.dateTo }))
  }
  for (const k of ["patientId", "doctorId", "medicineId"] as const) {
    const v = o[k]
    if (v !== undefined) { if (!isUlid(v)) throw new RangeError("The filter is not a valid id."); q[k] = v }
  }
  const search = o.search?.trim()
  if (search) { if (search.length > 100) throw new RangeError("The search is at most 100 characters."); q.search = search }
  return q
}

// ── The dashboard (GET /dashboard): the field names are the handoff's own ──

function dashCount(s: Obj, key: string, what: string): number | null {
  const v = s[key]
  if (v === undefined || v === null) return null
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0) throw new TypeError(`Unexpected response: ${what}.${key} is not a whole number.`)
  return v
}
function moneyText(s: Obj, key: string, what: string): string | null {
  const v = s[key]
  if (v === undefined || v === null) return null
  if (typeof v !== "string" || !/^-?\d+(\.\d+)?$/.test(v)) throw new TypeError(`Unexpected response: ${what}.${key} is not a decimal string.`)
  return v
}
/** A count the backend nests in an object (`lowStock: { count, ... }`, `mine: { today, open }`); a plain number is still read. */
function nestedCount(s: Obj, key: string, inner: string, what: string): number | null {
  const v = s[key]
  return v !== null && typeof v === "object" && !Array.isArray(v) ? dashCount(v as Obj, inner, `${what}.${key}`) : dashCount(s, key, what)
}
const series = (s: Obj, key: string): DashSeriesPoint[] | null => (s[key] === undefined || s[key] === null ? null : seriesOf(s[key]))

export function parseDashboard(raw: unknown): DashboardApiData {
  const o = asObj(raw, "dashboard")
  const section = (key: string): Obj | null => (o[key] === undefined || o[key] === null ? null : asObj(o[key], `dashboard.${key}`))
  const visits = section("visits"), admitted = section("admitted"), lab = section("lab"), imaging = section("imaging"), pharmacy = section("pharmacy"), revenue = section("revenue"), flow = section("patientFlow")
  return {
    visits: visits && { today: dashCount(visits, "today", "visits"), yesterday: dashCount(visits, "yesterday", "visits"), mine: nestedCount(visits, "mine", "today", "visits") },
    admitted: admitted && { total: dashCount(admitted, "total", "admitted"), male: dashCount(admitted, "male", "admitted"), female: dashCount(admitted, "female", "admitted"), other: dashCount(admitted, "other", "admitted") },
    lab: lab && { pending: dashCount(lab, "pending", "lab"), doneToday: dashCount(lab, "doneToday", "lab") },
    imaging: imaging && { pending: dashCount(imaging, "pending", "imaging"), doneToday: dashCount(imaging, "doneToday", "imaging") },
    pharmacy: pharmacy && { dispensedToday: dashCount(pharmacy, "dispensedToday", "pharmacy"), dispensedYesterday: dashCount(pharmacy, "dispensedYesterday", "pharmacy"), lowStock: nestedCount(pharmacy, "lowStock", "count", "pharmacy") },
    revenue: revenue && { today: moneyText(revenue, "today", "revenue"), yesterday: moneyText(revenue, "yesterday", "revenue"), last7Days: series(revenue, "last7Days") },
    patientFlow: flow && { last7Days: series(flow, "last7Days"), total: dashCount(flow, "total", "patientFlow") },
    raw,
  }
}

export function parsePrescriptionPage(raw: unknown): { items: Record<string, unknown>[]; total: number } {
  const o = asObj(raw, "prescriptions")
  if (!Array.isArray(o.data) || !o.data.every((r) => r !== null && typeof r === "object" && !Array.isArray(r))) throw new TypeError("Unexpected response: prescriptions.data is not a list of records.")
  return { items: o.data as Record<string, unknown>[], total: reqInt(asObj(o.meta, "prescriptions.meta"), "total", "prescriptions.meta") }
}

export const httpReportsApiService: ReportsApiService = {
  async dailySummary(p, signal) { return document(await callEndpoint<unknown>("reportsApi.dailySummary", { query: () => periodQuery(p), signal }), "the daily summary") },
  async opd(p, signal) { return document(await callEndpoint<unknown>("reportsApi.opd", { query: () => periodQuery(p), signal }), "the OPD report") },
  async demographics(p, signal) { return document(await callEndpoint<unknown>("reportsApi.demographics", { query: () => periodQuery(p), signal }), "the demographics report") },
  async lab(p, signal) { return document(await callEndpoint<unknown>("reportsApi.lab", { query: () => periodQuery(p), signal }), "the laboratory report") },
  async pharmacy(p, options = {}, signal) { return document(await callEndpoint<unknown>("reportsApi.pharmacy", { query: () => pharmacyReportQuery(p, options.expiringWithinDays), signal }), "the pharmacy report") },
  async financialSummary(p, signal) { return document(await callEndpoint<unknown>("reportsApi.financialSummary", { query: () => periodQuery(p), signal }), "the financial summary") },
  async revenueDaily(p, options = {}, signal) { return document(await callEndpoint<unknown>("reportsApi.revenueDaily", { query: () => revenueDailyQuery(p, options.sourceType), signal }), "the daily revenue") },
  async cashFlow(c, signal) { return document(await callEndpoint<unknown>("reportsApi.cashFlow", { query: () => cashFlowQuery(c), signal }), "the cash flow") },
  async expensesReport(p, signal) { return document(await callEndpoint<unknown>("reportsApi.expenses", { query: () => periodQuery(p), signal }), "the expenses report") },
  async prescriptions(options = {}, signal) { return parsePrescriptionPage(await callEndpoint<unknown>("reportsApi.prescriptions", { query: () => prescriptionQuery(options), signal })) },
  async dashboard(signal) { return parseDashboard(await callEndpoint<unknown>("reportsApi.dashboard", { signal })) },
  async revenue(p, signal) {
    return parseRevenue(await callEndpoint<unknown>("reportsApi.revenue", { query: () => periodQuery(p), signal }))
  },
  async collections(p, signal) {
    return parseCollections(await callEndpoint<unknown>("reportsApi.collections", { query: () => periodQuery(p), signal }))
  },
  async outstanding(signal) {
    return parseOutstanding(await callEndpoint<unknown>("reportsApi.outstanding", { signal }))
  },
  async outstandingPatients(options = {}, signal) {
    return parsePage(await callEndpoint<unknown>("reportsApi.outstandingPatients", { query: () => patientBalanceQuery(options), signal }), "PatientBalancePage", parsePatientBalance)
  },
}
