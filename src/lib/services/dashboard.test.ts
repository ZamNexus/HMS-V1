import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { BANK_TRANSACTIONS, CONSULTATION_INVOICES, EXPENSES, PAYMENTS, RECEIPTS, SERVICES_INVOICES, bankRunningBalance } from "@/data/billing"
import { ENCOUNTERS } from "@/data/encounters"
import { IMAGING_ORDERS } from "@/data/imaging"
import { LAB_ORDERS } from "@/data/lab"
import { MEDICINES } from "@/data/medicines"
import { PATIENTS } from "@/data/patients"
import { DISPENSE_RECORDS } from "@/data/pharmacy"
import { DASHBOARD_OPERATIONS, dashboardContractStatus } from "./dashboardContract"
import { ENDPOINTS } from "./endpoints"
import { NotConnectedError } from "./errors"
import { httpDashboardService, httpStatisticsService } from "./http/dashboard"
import { mockBankTransactionsService, mockExpensesService } from "./mock/finance"
import { mockDashboardService, mockStatisticsService } from "./mock/dashboard"
import { mockReportsService } from "./mock/reports"
import { moneyFromNumber, sumMoney } from "./moneyMath"
import type { StatisticsCategory } from "./types"

// Frontend-only unit tests with controlled demo data. Every mock figure is recomputed here INDEPENDENTLY from the raw arrays with plain
// number arithmetic, and cross-checked against the Phase 4H / 4I services, so the mock builders cannot merely agree with themselves.
// None of this says anything about the real backend, whose Dashboard / Financial Statistics contract is not published.

afterEach(() => {
  vi.unstubAllGlobals()
  for (const k of DASHBOARD_OPERATIONS) ENDPOINTS[k] = null
})
const num = (s: string) => Number(s)
const closeTo = (actual: string, expected: number) => expect(num(actual)).toBeCloseTo(expected, 2)
const TWO_DP = /^-?\d+\.\d{2}$/
const addUp = (items: readonly { n: number }[]) => items.reduce((s, i) => s + i.n, 0)

describe("contract-pending behaviour (API mode)", () => {
  it("has no endpoint configured for any Dashboard or Financial Statistics operation (their routes have no published shape yet)", () => {
    expect(DASHBOARD_OPERATIONS).toHaveLength(8)
    for (const k of DASHBOARD_OPERATIONS) expect(ENDPOINTS[k], k).toBeNull()
    // GET /reports/revenue IS published now (docs/openapi.json RevenueReport) and serves the Revenue REPORT through its own key (Phase 11). The prototype's
    // demo-shaped key stays unconfigured. The statistics Summary and Graphs routes (/reports/financial-summary, /reports/revenue/daily) are registered as ROUTES ONLY
    // (HANDOFF_ONLY_ROUTE_KEYS): no parser or screen uses them, so nothing is sent.
    expect(ENDPOINTS["reports.revenue"]).toBeNull()
    expect(Object.entries(ENDPOINTS).filter(([, e]) => e && /reports\/revenue$/.test(e.path)).map(([k]) => k)).toEqual(["reportsApi.revenue"])
    expect(Object.entries(ENDPOINTS).filter(([, e]) => e && /financial-summary|revenue\/daily/.test(e.path)).map(([k]) => k).sort()).toEqual(["reportsApi.financialSummary", "reportsApi.revenueDaily"])
  })

  it("every HTTP operation sends no request and reports 'awaiting the backend contract' (no fake figure)", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const d = httpDashboardService
    const s = httpStatisticsService
    const calls = [d.summary(), d.weeklyVisits(), d.revenueTrend(), d.upNext(), d.cashFlow(), s.summary(), s.records("Services"), s.dailyCheckupRevenue()]
    expect(calls).toHaveLength(8)
    for (const c of calls) await expect(c).rejects.toBeInstanceOf(NotConnectedError)
    for (const c of calls) await expect(c).rejects.toThrow(/awaiting the backend contract/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("even with paths configured, sends nothing until the request/response mapping is implemented", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ total: 1 }), { headers: { "content-type": "application/json" } }))
    vi.stubGlobal("fetch", fetchMock)
    for (const k of DASHBOARD_OPERATIONS) ENDPOINTS[k] = { method: "GET", path: "/hypothetical" } // test-only
    await expect(httpDashboardService.summary()).rejects.toThrow(/query parameters/)
    await expect(httpDashboardService.cashFlow()).rejects.toThrow(/query parameters/)
    await expect(httpStatisticsService.records("Expenses")).rejects.toThrow(/query parameters/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("the HTTP adapters can never fall back to demo data: dashboard.ts imports nothing from src/data or the mocks", () => {
    const dir = join(__dirname, "http")
    expect(readdirSync(dir)).toContain("dashboard.ts")
    expect(readFileSync(join(dir, "dashboard.ts"), "utf8")).not.toMatch(/from\s+["'][^"']*(\/data\/|\/mock\/)/)
  })

  it("neither dashboard page, nor its charts, reads a demo array or a mock adapter directly (only the services)", () => {
    const dir = join(__dirname, "../../app/(dashboard)/dashboard")
    for (const file of ["page.tsx", "DashboardCharts.tsx", "stats/page.tsx"]) {
      expect(readFileSync(join(dir, file), "utf8"), file).not.toMatch(/from\s+["']@\/data\/|billingAggregate|\/mock\//)
    }
  })

  it("the contract status: API mode with every key null is pending (8 missing); mock mode never is; one key at a time", () => {
    const api = dashboardContractStatus("api")
    expect(api.pending).toBe(true)
    expect(api.missing).toHaveLength(8)
    expect(DASHBOARD_OPERATIONS.some((op) => api.can(op))).toBe(false)
    expect(dashboardContractStatus("mock")).toMatchObject({ pending: false, missing: [] })
    const one = dashboardContractStatus("api", { ...ENDPOINTS, "dashboard.cashFlow": { method: "GET" as const, path: "/hypothetical" } }) // copy, test-only
    expect(one.can("dashboard.cashFlow")).toBe(true)
    expect(one.can("dashboard.summary")).toBe(false)
  })
})

describe("mock Financial Statistics summary (recomputed independently)", () => {
  const consultation = () => ENCOUNTERS.map((e) => ({ value: e.netTotal, cash: e.paymentMode === "Cash" ? e.amountReceived ?? 0 : 0, credit: e.paymentStatus !== "paid" ? e.balance ?? 0 : 0 }))

  it("category rows are in the screen's order and agree with the raw arrays", async () => {
    const r = await mockStatisticsService.summary()
    expect(r.categories.map((c) => c.label)).toEqual(["Services", "Laboratory", "Consultation", "Medicines", "X-Rays", "ECG, Ultra-Sound"])
    const byLabel = Object.fromEntries(r.categories.map((c) => [c.label, c]))
    closeTo(byLabel.Services.value, SERVICES_INVOICES.reduce((s, x) => s + x.netTotal, 0))
    expect(byLabel.Services.count).toBe(SERVICES_INVOICES.length)
    closeTo(byLabel.Services.cash, SERVICES_INVOICES.filter((x) => x.paymentMode === "Cash").reduce((s, x) => s + x.amountReceived, 0))
    closeTo(byLabel.Services.credit, SERVICES_INVOICES.reduce((s, x) => s + x.balance, 0))
    closeTo(byLabel.Laboratory.value, LAB_ORDERS.reduce((s, x) => s + x.total, 0))
    closeTo(byLabel.Laboratory.credit, LAB_ORDERS.filter((x) => x.paymentStatus !== "paid").reduce((s, x) => s + x.total, 0))
    closeTo(byLabel.Consultation.value, consultation().reduce((s, x) => s + x.value, 0))
    closeTo(byLabel.Consultation.cash, consultation().reduce((s, x) => s + x.cash, 0))
    expect(byLabel.Consultation.count).toBe(ENCOUNTERS.length)
    closeTo(byLabel.Medicines.value, DISPENSE_RECORDS.reduce((s, x) => s + x.netPayable, 0))
    closeTo(byLabel.Medicines.credit, DISPENSE_RECORDS.filter((x) => x.paymentMode === "On Account").reduce((s, x) => s + x.netPayable, 0))
    closeTo(byLabel["X-Rays"].value, IMAGING_ORDERS.reduce((s, x) => s + x.total, 0))
    closeTo(byLabel["X-Rays"].cash, IMAGING_ORDERS.filter((x) => x.paymentMode === "Cash").reduce((s, x) => s + x.total, 0))
    // the ECG / Ultra-Sound row has no data in the old screen; the rule for filling it from imaging orders is undefined
    expect(byLabel["ECG, Ultra-Sound"]).toMatchObject({ value: "0.00", count: 0, cash: "0.00", credit: "0.00" })
  })

  it("OPD + IPD cover each category's value, and Total Sales is the exact sum of the rows", async () => {
    const r = await mockStatisticsService.summary()
    for (const c of r.categories) expect(sumMoney([c.opd, c.ipd]), c.label).toBe(c.value)
    expect(r.totalSales.value).toBe(sumMoney(r.categories.map((c) => c.value)))
    expect(r.totalSales.cash).toBe(sumMoney(r.categories.map((c) => c.cash)))
    expect(r.totalSales.credit).toBe(sumMoney(r.categories.map((c) => c.credit)))
    expect(r.totalSales.count).toBe(addUp(r.categories.map((c) => ({ n: c.count }))))
  })

  it("payments, receipts, expenses and banks agree with the raw arrays AND with the Phase 4H / 4I services", async () => {
    const r = await mockStatisticsService.summary()
    closeTo(r.payments.value, PAYMENTS.reduce((s, p) => s + p.amount, 0)); expect(r.payments.count).toBe(PAYMENTS.length)
    closeTo(r.receipts.value, RECEIPTS.reduce((s, x) => s + x.amount, 0)); expect(r.receipts.count).toBe(RECEIPTS.length)
    closeTo(r.expenses.value, EXPENSES.reduce((s, x) => s + x.amount, 0)); expect(r.expenses.count).toBe(EXPENSES.length)
    expect((await mockReportsService.accountsPayments()).total).toBe(r.payments.value) // Accounts report (Phase 4I)
    expect((await mockReportsService.accountsReceipts()).total).toBe(r.receipts.value)
    expect((await mockExpensesService.totals()).total).toBe(r.expenses.value) // Expenses service (Phase 4H)
    // "Banks" is the ledger's final balance: credits minus debits, the same number the bank statement ends on
    closeTo(r.banks.value, BANK_TRANSACTIONS.reduce((s, t) => s + t.credit - t.debit, 0))
    const statement = await mockBankTransactionsService.statement()
    expect(statement.items.at(-1)!.balance).toBe(r.banks.value)
    expect(moneyFromNumber(bankRunningBalance().at(-1)!.balance)).toBe(r.banks.value)
    expect(r.banks.count).toBe(BANK_TRANSACTIONS.length)
  })
})

describe("mock Cash Flow (the demo screen's lines, exact money)", () => {
  it("closing = opening + cash in − cash out; each line recomputed from the raw arrays", async () => {
    const cf = await mockDashboardService.cashFlow()
    const summary = await mockStatisticsService.summary()
    expect(cf.cashIn.cashSales).toBe(summary.totalSales.cash) // the same cash sales the Statistics table shows
    closeTo(cf.cashIn.cashReceipts, RECEIPTS.reduce((s, r) => s + r.amount, 0)) // every receipt, whatever its mode — the screen's rule
    closeTo(cf.cashIn.drawnFromBank, BANK_TRANSACTIONS.filter((t) => t.cashMovement === "withdrawal").reduce((s, t) => s + t.debit, 0))
    closeTo(cf.cashOut.cashExpenses, EXPENSES.filter((e) => e.mode === "Cash").reduce((s, e) => s + e.amount, 0))
    closeTo(cf.cashOut.cashPayments, PAYMENTS.filter((p) => p.mode === "Cash").reduce((s, p) => s + p.amount, 0))
    closeTo(cf.cashOut.depositInBank, BANK_TRANSACTIONS.filter((t) => t.cashMovement === "deposit").reduce((s, t) => s + t.credit, 0))
    expect(cf.cashIn.total).toBe(sumMoney([cf.cashIn.cashSales, cf.cashIn.cashReceipts, cf.cashIn.drawnFromBank]))
    expect(cf.cashOut.total).toBe(sumMoney([cf.cashOut.cashExpenses, cf.cashOut.cashPayments, cf.cashOut.depositInBank]))
    closeTo(cf.closing, num(cf.opening) + num(cf.cashIn.total) - num(cf.cashOut.total))
    for (const v of [cf.opening, cf.closing, cf.cashIn.total, cf.cashOut.total]) expect(v).toMatch(TWO_DP)
  })

  it("cash expenses agree with the Phase 4H expense list; the opening amount is the old screen's DEMO constant", async () => {
    const cf = await mockDashboardService.cashFlow()
    const all = await mockExpensesService.list({ pageSize: 1000 })
    expect(cf.cashOut.cashExpenses).toBe(sumMoney(all.items.filter((e) => e.mode === "Cash").map((e) => e.amount)))
    // DEMO placeholder, not data (the old screen hard-coded a 5000 "petty-cash float"): the Task List says the opening amount is set once, by the backend
    expect(cf.opening).toBe("5000.00")
  })
})

describe("mock Dashboard", () => {
  it("summary: the computed tiles follow the data, the rest are the old screen's DEMO constants (named, asserted)", async () => {
    const s = await mockDashboardService.summary()
    const admitted = ENCOUNTERS.filter((e) => e.type === "IPD" && e.status === "open")
    expect(s.admittedIpd).toBe(admitted.length)
    expect(s.lowStockItems).toBe(MEDICINES.filter((m) => m.stock < m.reorderLevel).length)
    expect((await mockReportsService.pharmacy()).lowStock).toHaveLength(s.lowStockItems) // same definition as the Pharmacy report
    const gender = (g: string) => admitted.filter((e) => PATIENTS.find((p) => p.id === e.patientId)?.gender === g).length
    expect(s.notes?.admittedIpd).toBe(`${gender("Male")} male · ${gender("Female")} female`)
    expect(s).toMatchObject({ todaysPatients: 24, revenueToday: "42500.00", pendingLabReports: 7, pendingOrders: 7, dispensedToday: 18, completedToday: 12, myPatients: 11 })
    expect(s.notes).toMatchObject({ todaysPatients: "+3 from yesterday", revenueToday: "+12% vs yesterday", dispensedToday: "+4 from yesterday" })
  })

  it("weekly visits: the caption total comes from the service and is the sum of the points (141, as the old caption said)", async () => {
    const w = await mockDashboardService.weeklyVisits()
    expect(w.points.map((p) => p.label)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"])
    expect(w.total).toBe(w.points.reduce((s, p) => s + p.count, 0))
    expect(w.total).toBe(141)
  })

  it("revenue trend: seven consecutive days ending today, exact money", async () => {
    const t = await mockDashboardService.revenueTrend()
    expect(t).toHaveLength(7)
    expect(t.at(-1)).toMatchObject({ date: new Date().toISOString().slice(0, 10), amount: "42500.00" })
    expect(t.map((p) => p.date)).toEqual([...t.map((p) => p.date)].sort())
    for (const p of t) expect(p.amount).toMatch(TWO_DP)
  })

  it("up next: five demo rows, linked to a patient record where the name resolves", async () => {
    const rows = await mockDashboardService.upNext()
    expect(rows).toHaveLength(5)
    for (const r of rows) expect(r.patientId === null || PATIENTS.some((p) => String(p.id) === r.patientId && p.name === r.patientName)).toBe(true)
    expect(rows.some((r) => r.patientId !== null)).toBe(true)
  })
})

describe("mock Financial Statistics records and graph", () => {
  const CATEGORIES: [StatisticsCategory, number][] = [
    ["Services", SERVICES_INVOICES.length], ["Checkups", ENCOUNTERS.length], ["Lab Tests", LAB_ORDERS.length], ["Medicine", DISPENSE_RECORDS.length],
    ["X-Rays", IMAGING_ORDERS.length], ["Receipts", RECEIPTS.length], ["Payments", PAYMENTS.length], ["Expenses", EXPENSES.length],
  ]

  it("every category lists exactly its records, with exact amounts", async () => {
    for (const [category, count] of CATEGORIES) {
      const { rows } = await mockStatisticsService.records(category)
      expect(rows, category).toHaveLength(count)
      for (const r of rows) expect(r.amount).toMatch(TWO_DP)
    }
  })

  it("statuses and attribution: the demo rules the old screen used are explicit", async () => {
    expect((await mockStatisticsService.records("Medicine")).rows.every((r) => r.status === "paid")).toBe(true) // DEMO: never read from the dispense
    expect((await mockStatisticsService.records("X-Rays")).rows.every((r) => r.status === "paid")).toBe(true)
    expect((await mockStatisticsService.records("Receipts")).rows.map((r) => r.status)).toEqual(RECEIPTS.map((r) => r.type))
    expect((await mockStatisticsService.records("Payments")).rows.map((r) => r.status)).toEqual(PAYMENTS.map((p) => p.mode))
    const expenses = (await mockStatisticsService.records("Expenses")).rows
    expect(expenses.every((r) => r.patientId === null && typeof r.description === "string")).toBe(true)
    expect(expenses.map((r) => r.status)).toEqual(EXPENSES.map((e) => e.category))
    expect((await mockStatisticsService.records("Checkups")).rows.every((r) => typeof r.patientId === "string")).toBe(true)
  })

  it("the records add up to the summary's category totals", async () => {
    const summary = await mockStatisticsService.summary()
    const value = (label: string) => summary.categories.find((c) => c.label === label)!.value
    expect(sumMoney((await mockStatisticsService.records("Services")).rows.map((r) => r.amount))).toBe(value("Services"))
    expect(sumMoney((await mockStatisticsService.records("Lab Tests")).rows.map((r) => r.amount))).toBe(value("Laboratory"))
    expect(sumMoney((await mockStatisticsService.records("Checkups")).rows.map((r) => r.amount))).toBe(value("Consultation"))
    expect(sumMoney((await mockStatisticsService.records("Medicine")).rows.map((r) => r.amount))).toBe(value("Medicines"))
    expect(sumMoney((await mockStatisticsService.records("Expenses")).rows.map((r) => r.amount))).toBe(summary.expenses.value)
  })

  it("daily checkup revenue sums to every encounter's net total, exactly", async () => {
    const pts = await mockStatisticsService.dailyCheckupRevenue()
    closeTo(sumMoney(pts.map((p) => p.amount)), ENCOUNTERS.reduce((s, e) => s + e.netTotal, 0))
    expect(new Set(pts.map((p) => p.date)).size).toBe(pts.length)
  })

  it("running every operation changes none of the demo data (read-only)", async () => {
    const snapshot = () => JSON.stringify([CONSULTATION_INVOICES, SERVICES_INVOICES, PAYMENTS, RECEIPTS, EXPENSES, BANK_TRANSACTIONS, LAB_ORDERS, IMAGING_ORDERS, DISPENSE_RECORDS, MEDICINES, ENCOUNTERS, PATIENTS])
    const before = snapshot()
    await Promise.all([
      mockDashboardService.summary(), mockDashboardService.weeklyVisits(), mockDashboardService.revenueTrend(), mockDashboardService.upNext(), mockDashboardService.cashFlow(),
      mockStatisticsService.summary(), mockStatisticsService.dailyCheckupRevenue(), ...CATEGORIES.map(([c]) => mockStatisticsService.records(c)),
    ])
    expect(snapshot()).toBe(before)
  })
})
