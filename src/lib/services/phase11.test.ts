import { describe, expect, it } from "vitest"
import { ENDPOINTS, HANDOFF_ONLY_ROUTE_KEYS } from "./endpoints"
import { NotConnectedError } from "./errors"
import { chargeListQuery } from "./http/billing"
import { RP_MAX_DAYS, daysBetween, parseCollections, parseOutstanding, parsePatientBalance, parseRevenue, patientBalanceQuery, periodQuery } from "./http/reportsApi"
import { mockReportsApiService } from "./mock/reportsApi"

// Phase 11 service layer: the report adapters read the server's figures as exact text and refuse anything that does not match docs/openapi.json; the period is checked before a request.

const U1 = "01JBXQ7K3M8N9P0Q1R2S3T4V5W"
const U2 = "01JBXQ7K3M8N9P0Q1R2S3T4V5X"
const period = { dateFrom: "2026-11-01", dateTo: "2026-11-07" }
const revenue = () => ({
  period, grossRevenue: "100000.00", creditNotes: "500.00", netRevenue: "99500.00", gstCollected: "1200.00", discountsGiven: "300.00", voided: "250.00",
  bySource: [{ sourceType: "consultation", charges: 40, revenue: "60000.00", gst: "0.00" }, { sourceType: "pharmacy", charges: 12, revenue: "39500.00", gst: "1200.00" }],
  byDoctor: [{ doctor: { id: U1, name: "Dr. Amna Khan" }, charges: 30, revenue: "45000.00", commission: "4500.00" }],
  byPanel: [{ panel: { id: U2, name: "Jubilee" }, charges: 5, revenue: "8000.00", commission: "0.00" }],
})
const aging = { days0to30: "100.00", days31to60: "50.00", days61to90: "25.00", over90: "5.00" }

describe("the report endpoint keys", () => {
  it("are the four routes of handoff 8.11 that docs/openapi.json describes, all GET", () => {
    expect(ENDPOINTS["reportsApi.revenue"]).toEqual({ method: "GET", path: "/reports/revenue" })
    expect(ENDPOINTS["reportsApi.collections"]).toEqual({ method: "GET", path: "/reports/collections" })
    expect(ENDPOINTS["reportsApi.outstanding"]).toEqual({ method: "GET", path: "/reports/outstanding" })
    expect(ENDPOINTS["reportsApi.outstandingPatients"]).toEqual({ method: "GET", path: "/reports/outstanding/patients" })
  })
  it("leave the routes the backend has not published a shape for unconnected (no invented fields)", () => {
    for (const k of ["reports.dailySummary", "reports.opdStatistics", "reports.laboratory", "reports.pharmacy", "reports.demographics", "reports.prescriptionHistory", "dashboard.summary", "statistics.summary", "dashboard.cashFlow"] as const) {
      expect(ENDPOINTS[k], k).toBeNull()
    }
  })
})

describe("the period every report takes", () => {
  it("is two valid hospital days, the start not after the end, at most 366 days apart", () => {
    expect(periodQuery(period)).toEqual(period)
    expect(periodQuery({ dateFrom: "2026-11-07", dateTo: "2026-11-07" })).toEqual({ dateFrom: "2026-11-07", dateTo: "2026-11-07" })
    expect(() => periodQuery({ dateFrom: "2026-11-08", dateTo: "2026-11-07" })).toThrow(RangeError)
    expect(() => periodQuery({ dateFrom: "2026-13-01", dateTo: "2026-13-02" })).toThrow(RangeError)
    expect(() => periodQuery({ dateFrom: "11/01/2026", dateTo: "2026-11-07" })).toThrow(RangeError)
  })
  it("allows exactly 366 days apart and refuses 367", () => {
    expect(RP_MAX_DAYS).toBe(366)
    expect(daysBetween("2026-01-01", "2027-01-02")).toBe(366)
    expect(() => periodQuery({ dateFrom: "2026-01-01", dateTo: "2027-01-02" })).not.toThrow()
    expect(() => periodQuery({ dateFrom: "2026-01-01", dateTo: "2027-01-03" })).toThrow(/366/)
  })
  it("counts days in whole days across a clock change (dates only, no time of day)", () => {
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2)
    expect(daysBetween("2026-10-24", "2026-10-26")).toBe(2)
  })
})

describe("the revenue report", () => {
  it("is read as the server's text: money is never turned into a number", () => {
    const r = parseRevenue(revenue())
    expect(r.netRevenue).toBe("99500.00")
    expect(r.bySource.map((s) => [s.sourceType, s.charges, s.revenue])).toEqual([["consultation", 40, "60000.00"], ["pharmacy", 12, "39500.00"]])
    expect(r.byDoctor[0]).toEqual({ doctor: { id: U1, name: "Dr. Amna Khan" }, charges: 30, revenue: "45000.00", commission: "4500.00" })
    expect(r.byPanel[0].panel.name).toBe("Jubilee")
    expect(r.period).toEqual(period)
  })
  it("refuses a number where the server sends money text, an unknown kind of charge, a negative count or a missing section", () => {
    expect(() => parseRevenue({ ...revenue(), netRevenue: 99500 })).toThrow(/netRevenue/)
    expect(() => parseRevenue({ ...revenue(), grossRevenue: "1e5" })).toThrow(/grossRevenue/)
    expect(() => parseRevenue({ ...revenue(), bySource: [{ sourceType: "parking", charges: 1, revenue: "1.00", gst: "0.00" }] })).toThrow(/sourceType/)
    expect(() => parseRevenue({ ...revenue(), bySource: [{ sourceType: "room", charges: -1, revenue: "1.00", gst: "0.00" }] })).toThrow(/charges/)
    const rest: Record<string, unknown> = { ...revenue() }
    delete rest.byPanel
    expect(() => parseRevenue(rest)).toThrow(/byPanel/)
    expect(() => parseRevenue({ ...revenue(), byDoctor: [{ doctor: { id: "nope", name: "X" }, charges: 1, revenue: "1.00", commission: "0.00" }] })).toThrow(/id/)
  })
})

describe("the collections report", () => {
  const col = () => ({
    period, received: "90000.00", refunded: "1000.00", net: "89000.00",
    byMode: [{ mode: "cash", received: "50000.00", refunded: "1000.00" }, { mode: "on_account", received: "40000.00", refunded: "0.00" }],
    byCollector: [{ user: { id: U1, name: "Reception One" }, receipts: 25, received: "90000.00", refunded: "1000.00" }],
  })
  it("keeps received, refunded and net exactly as sent (the browser never recomputes the net)", () => {
    const c = parseCollections({ ...col(), net: "88999.99" })
    expect(c.net).toBe("88999.99")
    expect(c.byMode.map((m) => m.mode)).toEqual(["cash", "on_account"])
    expect(c.byCollector[0].receipts).toBe(25)
  })
  it("refuses an unknown payment mode", () => {
    expect(() => parseCollections({ ...col(), byMode: [{ mode: "barter", received: "1.00", refunded: "0.00" }] })).toThrow(/mode/)
  })
})

describe("what is owed", () => {
  const out = () => ({ asOf: "2026-11-07", patients: { total: "180.00", aging }, panels: { total: "0.00", aging: { days0to30: "0.00", days31to60: "0.00", days61to90: "0.00", over90: "0.00" } }, byPanel: [{ panel: { id: U2, name: "Jubilee" }, outstanding: "0.00" }] })
  it("reads patients and panels apart, each aged in four buckets, with the server's totals", () => {
    const o = parseOutstanding(out())
    expect(o.asOf).toBe("2026-11-07")
    expect(o.patients.total).toBe("180.00")
    expect(o.patients.aging).toEqual(aging)
    expect(o.byPanel[0].panel.name).toBe("Jubilee")
  })
  it("refuses a bucket that is missing or not money", () => {
    expect(() => parseOutstanding({ ...out(), patients: { total: "1.00", aging: { ...aging, over90: 5 } } })).toThrow(/over90/)
    expect(() => parseOutstanding({ ...out(), asOf: "yesterday" })).toThrow(/asOf/)
  })
  it("reads a patient's balance with the date of the oldest unpaid charge", () => {
    const b = parsePatientBalance({ patient: { id: U1, mrNo: "MR-0001", name: "Zainab Qureshi", phone: "0300-1234567" }, outstanding: "1500.00", oldestUnpaid: "2026-09-30" })
    expect(b).toEqual({ patient: { id: U1, mrNo: "MR-0001", name: "Zainab Qureshi", phone: "0300-1234567" }, outstanding: "1500.00", oldestUnpaid: "2026-09-30" })
    expect(() => parsePatientBalance({ patient: { id: U1, mrNo: "MR-1", name: "X", phone: "" }, outstanding: 1500, oldestUnpaid: "2026-09-30" })).toThrow(/outstanding/)
  })
  it("pages with page and perPage (at most 100)", () => {
    expect(patientBalanceQuery({ page: 2, pageSize: 10 })).toEqual({ page: 2, perPage: 10 })
    expect(() => patientBalanceQuery({ pageSize: 101 })).toThrow(RangeError)
  })
})

describe("the demo has no API-shaped reports", () => {
  it("every call says it is not connected (the demo keeps its own report screens)", async () => {
    await expect(mockReportsApiService.revenue(period)).rejects.toBeInstanceOf(NotConnectedError)
    await expect(mockReportsApiService.collections(period)).rejects.toBeInstanceOf(NotConnectedError)
    await expect(mockReportsApiService.outstanding()).rejects.toBeInstanceOf(NotConnectedError)
    await expect(mockReportsApiService.outstandingPatients()).rejects.toBeInstanceOf(NotConnectedError)
  })
})

describe("the charges register filters of Financial Statistics (handoff 8.11)", () => {
  it("sends diagnosticType=lab and modality=X-Ray / ECG / Ultrasound", () => {
    expect(chargeListQuery({ diagnosticType: "lab" })).toMatchObject({ diagnosticType: "lab" })
    expect(chargeListQuery({ diagnosticType: "imaging" })).toMatchObject({ diagnosticType: "imaging" })
    for (const m of ["X-Ray", "ECG", "Ultrasound"] as const) expect(chargeListQuery({ modality: m })).toMatchObject({ modality: m })
    expect(chargeListQuery({ sourceType: "pharmacy" })).toMatchObject({ sourceType: "pharmacy" })
  })
  it("refuses a value the handoff does not list", () => {
    expect(() => chargeListQuery({ diagnosticType: "radiology" as never })).toThrow(RangeError)
    expect(() => chargeListQuery({ modality: "MRI" as never })).toThrow(RangeError)
  })
})

describe("the doctors' weekly schedule in the Lists report (handoff 8.11: each doctor may carry `schedule`)", () => {
  it("is read in week order with the hours, and a doctor without one simply has no days", async () => {
    const { scheduleFields, parseDoctorSummary } = await import("./http/doctorPicker")
    expect(scheduleFields({ days: ["wed", "mon", "fri"], from: "09:00", to: "17:00", slotMinutes: 15 })).toEqual({ availableDays: ["Mon", "Wed", "Fri"], hoursFrom: "09:00", hoursTo: "17:00" })
    expect(scheduleFields({ days: [], from: null, to: null, slotMinutes: 15 })).toEqual({ availableDays: [], hoursFrom: "", hoursTo: "" })
    expect(scheduleFields(undefined)).toEqual({ availableDays: [], hoursFrom: "", hoursTo: "" })
    const d = parseDoctorSummary({ id: U1, name: "Dr. Amna Khan", specialization: "ENT", qualifications: "MBBS", consultationFee: "1500.00" })
    expect(d.availableDays).toEqual([])
    const withDays = parseDoctorSummary({ id: U1, name: "Dr. Amna Khan", specialization: "ENT", qualifications: "MBBS", consultationFee: "1500.00", schedule: { days: ["tue", "sat"], from: "10:00", to: "14:00", slotMinutes: 20 } })
    expect(withDays.availableDays).toEqual(["Tue", "Sat"])
    expect([withDays.hoursFrom, withDays.hoursTo]).toEqual(["10:00", "14:00"])
  })
  it("ignores a schedule it cannot read instead of failing the whole list (the spec does not list the field)", async () => {
    const { scheduleFields } = await import("./http/doctorPicker")
    for (const bad of ["Mon-Fri", 5, [], { days: "mon" }, { days: [1, 2] }, { days: ["funday"], from: "9am", to: "5pm" }]) expect(scheduleFields(bad).availableDays, JSON.stringify(bad)).toEqual([])
    expect(scheduleFields({ days: ["mon"], from: "9am", to: "17:00" })).toEqual({ availableDays: ["Mon"], hoursFrom: "", hoursTo: "" }) // hours are kept only as a valid pair
  })
})

describe("the routes the handoff names for the chunks that have no published shape (routes only)", () => {
  const ROUTES: [string, string, string][] = [
    ["accountsApi.expenses", "GET", "/expenses"], ["accountsApi.expenseCreate", "POST", "/expenses"], ["accountsApi.expenseGet", "GET", "/expenses/:id"], ["accountsApi.expenseUpdate", "PATCH", "/expenses/:id"], ["accountsApi.expenseVoid", "POST", "/expenses/:id/void"],
    ["accountsApi.bankBalances", "GET", "/bank-balances"], ["accountsApi.bankStatement", "GET", "/bank-accounts/:id/statement"], ["accountsApi.bankTxCreate", "POST", "/bank-transactions"], ["accountsApi.bankTxGet", "GET", "/bank-transactions/:id"], ["accountsApi.bankTxVoid", "POST", "/bank-transactions/:id/void"],
    ["accountsApi.drawerGet", "GET", "/cash-drawer/opening"], ["accountsApi.drawerSet", "PUT", "/cash-drawer/opening"],
    ["reportsApi.dailySummary", "GET", "/reports/daily-summary"], ["reportsApi.opd", "GET", "/reports/opd"], ["reportsApi.demographics", "GET", "/reports/demographics"], ["reportsApi.lab", "GET", "/reports/lab"], ["reportsApi.pharmacy", "GET", "/reports/pharmacy"],
    ["reportsApi.financialSummary", "GET", "/reports/financial-summary"], ["reportsApi.revenueDaily", "GET", "/reports/revenue/daily"], ["reportsApi.cashFlow", "GET", "/reports/cash-flow"], ["reportsApi.expenses", "GET", "/reports/expenses"],
    ["reportsApi.prescriptions", "GET", "/prescriptions"], ["reportsApi.dashboard", "GET", "/dashboard"],
  ]
  it("are registered with the method and path of handoff 8.10 and 8.11", () => {
    for (const [k, method, p] of ROUTES) expect((ENDPOINTS as Record<string, unknown>)[k], k).toEqual({ method, path: p })
    expect(ROUTES).toHaveLength(23)
  })
  it("are used only by the adapter that owns them: accountsApi.* by http/accountsApi.ts, reportsApi.* by http/reportsApi.ts, and by no screen directly", async () => {
    const { readdirSync, readFileSync, statSync } = await import("node:fs")
    const path = await import("node:path")
    const files: string[] = []
    const walk = (dir: string) => { for (const e of readdirSync(dir)) { const p = path.join(dir, e); if (statSync(p).isDirectory()) walk(p); else if (/\.(ts|tsx)$/.test(e)) files.push(p) } }
    walk(path.resolve(process.cwd(), "src"))
    const routeOnly = ROUTES.map(([k]) => k).filter((k) => !["reportsApi.revenue"].includes(k))
    const owner = (k: string) => (k.startsWith("accountsApi.") ? "src/lib/services/http/accountsApi.ts" : "src/lib/services/http/reportsApi.ts")
    for (const f of files) {
      if (/endpoints\.ts$/.test(f) || /\.test\.ts$/.test(f)) continue
      const code = readFileSync(f, "utf8")
      const rel = path.relative(process.cwd(), f).split(path.sep).join("/")
      for (const k of routeOnly) if (rel !== owner(k)) expect(code.includes(`"${k}"`), `${rel} uses ${k}`).toBe(false)
    }
    // ...and each adapter really calls every one of its routes (a route nothing calls would be a screen that cannot work)
    const accounts = readFileSync(path.resolve(process.cwd(), "src/lib/services/http/accountsApi.ts"), "utf8")
    const reports = readFileSync(path.resolve(process.cwd(), "src/lib/services/http/reportsApi.ts"), "utf8")
    for (const k of routeOnly) expect((k.startsWith("accountsApi.") ? accounts : reports).includes(`"${k}"`), `${k} is called by its adapter`).toBe(true)
  })
  it("are exactly the keys the spec guards skip, and the list shrinks: a route the spec now describes must be taken off it", async () => {
    expect([...HANDOFF_ONLY_ROUTE_KEYS].sort()).toEqual(ROUTES.map(([k]) => k).sort())
    const { operation, spec } = await import("./http/specValidate")
    for (const [k, method, p] of ROUTES) {
      const specPath = "/api/v1" + p.replace(/:([A-Za-z]+)/g, "{$1}")
      const inSpec = (() => { try { operation(method, specPath); return true } catch { return false } })() || !!spec("draft").paths[specPath]?.[method.toLowerCase()]
      expect(inSpec, `${k} is now in the spec: remove it from HANDOFF_ONLY_ROUTE_KEYS`).toBe(false)
    }
  })
  it("leave the demo-shaped keys unconfigured: filling them would make the old payload builders send guessed fields", () => {
    for (const k of ["expenses.list", "expenses.create", "expenses.totals", "bankTransactions.statement", "bankTransactions.create", "dashboard.summary", "dashboard.cashFlow", "statistics.summary", "statistics.records", "reports.dailySummary", "reports.prescriptionHistory"] as const) expect(ENDPOINTS[k], k).toBeNull()
  })
})
