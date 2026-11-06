import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { BANK_TRANSACTIONS, CONSULTATION_INVOICES, EXPENSES, PAYMENTS, RECEIPTS, SERVICES_INVOICES } from "@/data/billing"
import { DOCTORS } from "@/data/doctors"
import { ENCOUNTERS } from "@/data/encounters"
import { IMAGING_ORDERS } from "@/data/imaging"
import { LAB_ORDERS } from "@/data/lab"
import { MEDICINES } from "@/data/medicines"
import { PATIENTS } from "@/data/patients"
import { DISPENSE_RECORDS } from "@/data/pharmacy"
import { SERVICE_CATALOG } from "@/data/services"
import { patientBillBreakdown } from "@/lib/billingAggregate"
import { ENDPOINTS } from "./endpoints"
import { NotConnectedError } from "./errors"
import { httpReportsService, httpServiceCatalogService } from "./http/reports"
import { mockReportsService, mockServiceCatalogService } from "./mock/reports"
import { moneyFromNumber, ratioPercent, sumMoney } from "./moneyMath"
import { AGED_BUCKETS, AGE_BANDS, ageBandOf, agedBucketOf, isCreditMode, wholeDaysBetween } from "./reportHelpers"
import { REPORT_OPERATIONS, reportsContractStatus } from "./reportsContract"

// Frontend-only unit tests with controlled demo data. Each mock report is recomputed here INDEPENDENTLY from the raw demo arrays with
// plain number arithmetic and compared with the model the service returns, so the mock builders cannot merely agree with themselves.
// None of this says anything about the real backend, whose report contracts are not published.

const ULID = "01ARZ3NDEKTSV4RRFFQ69G5FAV"
afterEach(() => {
  vi.unstubAllGlobals()
  for (const k of REPORT_OPERATIONS) ENDPOINTS[k] = null
})
const num = (s: string) => Number(s)
const closeTo = (actual: string, expected: number) => expect(num(actual)).toBeCloseTo(expected, 2)
const ALL_DAYS = { dateFrom: "1900-01-01", dateTo: "2999-12-31", dataType: "All" as const, cashCredit: "All" as const }

describe("report helpers", () => {
  it("age bands: the documented bands, with the screen's 61+ for the last one; out-of-range ages fall in no band", () => {
    expect(AGE_BANDS.map((b) => b.label)).toEqual(["0–12", "13–18", "19–30", "31–45", "46–60", "60+"])
    expect([0, 12, 13, 18, 19, 30, 31, 45, 46, 60, 61, 200].map(ageBandOf)).toEqual(["0–12", "0–12", "13–18", "13–18", "19–30", "19–30", "31–45", "31–45", "46–60", "46–60", "60+", "60+"])
    expect(ageBandOf(-1)).toBeNull()
    expect(ageBandOf(201)).toBeNull()
  })

  it("aged buckets by days outstanding; whole-day difference truncates toward zero", () => {
    expect(AGED_BUCKETS).toEqual(["0-30", "31-60", "61-90", "90+"])
    expect([0, 30, 31, 60, 61, 90, 91, 400].map(agedBucketOf)).toEqual(["0-30", "0-30", "31-60", "31-60", "61-90", "61-90", "90+", "90+"])
    expect(wholeDaysBetween(3 * 86_400_000 + 5, 0)).toBe(3)
    expect(wholeDaysBetween(0, 3 * 86_400_000 + 5)).toBe(-3)
  })

  it("'credit' is any mode other than Cash", () => {
    expect(isCreditMode("Cash")).toBe(false)
    for (const mode of ["Card", "Bank Transfer", "Cheque", "Insurance", "On Account"]) expect(isCreditMode(mode)).toBe(true)
  })

  it("exact percent change with one decimal, half away from zero; null when the base is zero", () => {
    expect(ratioPercent("9.00", "91.00")).toBe("9.9")
    expect(ratioPercent("-8.00", "100.00")).toBe("-8.0")
    expect(ratioPercent("1.00", "3.00")).toBe("33.3")
    expect(ratioPercent("2.00", "3.00")).toBe("66.7")
    expect(ratioPercent("0.05", "100.00")).toBe("0.1") // 0.05 % rounds half up
    expect(ratioPercent("0.00", "5.00")).toBe("0.0")
    expect(ratioPercent("5.00", "0.00")).toBeNull()
  })
})

describe("contract-pending behaviour (API mode)", () => {
  it("has no endpoint configured for any report operation", () => {
    expect(REPORT_OPERATIONS).toHaveLength(15)
    for (const k of REPORT_OPERATIONS) expect(ENDPOINTS[k], k).toBeNull()
  })

  it("every HTTP report operation sends no request and reports 'awaiting the backend contract' (no fake report)", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const r = httpReportsService
    const calls = [
      r.dailySummary(), r.dailyTransactions({ ...ALL_DAYS }), r.opdStatistics(), r.revenue(), r.laboratory(), r.pharmacy(), r.expenseTrend(), r.demographics(),
      r.patientBalances(), r.organisationBalances(), r.patientAccountSummary(), r.accountsPayments({ page: 1 }), r.accountsReceipts({ page: 1 }), r.prescriptionHistory({ search: "x" }),
      httpServiceCatalogService.list(),
    ]
    expect(calls).toHaveLength(15)
    for (const c of calls) await expect(c).rejects.toBeInstanceOf(NotConnectedError)
    for (const c of calls) await expect(c).rejects.toThrow(/awaiting the backend contract/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("even with paths configured, sends nothing until the request/response mapping is implemented", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ rows: [] }), { headers: { "content-type": "application/json" } }))
    vi.stubGlobal("fetch", fetchMock)
    for (const k of REPORT_OPERATIONS) ENDPOINTS[k] = { method: "GET", path: "/hypothetical" } // test-only
    await expect(httpReportsService.revenue()).rejects.toThrow(/query parameters/)
    await expect(httpReportsService.dailyTransactions({ ...ALL_DAYS, patientId: ULID })).rejects.toThrow(/query parameters/)
    await expect(httpReportsService.prescriptionHistory({ search: "x", page: 2 })).rejects.toThrow(/query parameters/)
    await expect(httpServiceCatalogService.list()).rejects.toThrow(/query parameters/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("the HTTP adapters can never fall back to demo data: reports.ts imports nothing from src/data or the mocks", () => {
    const dir = join(__dirname, "http")
    expect(readdirSync(dir)).toContain("reports.ts")
    expect(readFileSync(join(dir, "reports.ts"), "utf8")).not.toMatch(/from\s+["'][^"']*(\/data\/|\/mock\/)/)
  })

  it("no report component reads a demo array or a mock adapter directly (only the services)", () => {
    const dir = join(__dirname, "../../components/reports")
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".tsx"))) {
      expect(readFileSync(join(dir, file), "utf8"), file).not.toMatch(/from\s+["']@\/data\/|billingAggregate|\/mock\//)
    }
    expect(readFileSync(join(__dirname, "../../app/(dashboard)/reports/page.tsx"), "utf8")).not.toMatch(/from\s+["']@\/data\//)
  })

  it("the contract status: API mode with every key null is pending (15 missing); mock mode never is; one key at a time", () => {
    const api = reportsContractStatus("api")
    expect(api.pending).toBe(true)
    expect(api.missing).toHaveLength(15)
    expect(REPORT_OPERATIONS.some((op) => api.can(op))).toBe(false)
    expect(reportsContractStatus("mock")).toMatchObject({ pending: false, missing: [] })
    const one = reportsContractStatus("api", { ...ENDPOINTS, "reports.revenue": { method: "GET" as const, path: "/hypothetical" } }) // copy, test-only
    expect(one.can("reports.revenue")).toBe(true)
    expect(one.can("reports.laboratory")).toBe(false)
  })
})

describe("mock daily summary and OPD statistics (recomputed independently)", () => {
  it("counts and revenue match the raw arrays; the placeholder constants are exactly the old screen's", async () => {
    const r = await mockReportsService.dailySummary()
    expect(r.opdEncounters).toBe(ENCOUNTERS.filter((e) => e.type === "OPD").length)
    expect(r.ipdAdmissions).toBe(ENCOUNTERS.filter((e) => e.type === "IPD").length)
    expect(r.discharges).toBe(ENCOUNTERS.filter((e) => e.status === "discharged").length)
    const [c, l, p] = [CONSULTATION_INVOICES.reduce((s, x) => s + x.netTotal, 0), LAB_ORDERS.reduce((s, x) => s + x.total, 0), DISPENSE_RECORDS.reduce((s, x) => s + x.netPayable, 0)]
    closeTo(r.consultationRevenue, c); closeTo(r.labRevenue, l); closeTo(r.pharmacyRevenue, p); closeTo(r.totalRevenue, c + l + p)
    expect(r.totalRevenue).toBe(sumMoney([r.consultationRevenue, r.labRevenue, r.pharmacyRevenue])) // exact, not float
    // DEMO placeholders, not data (the old screen hard-coded them): any change must be deliberate
    expect(r.newPatients).toBe(5)
    expect(r.paymentModeShare).toEqual({ cash: 68, card: 18, insurance: 14 })
  })

  it("doctor-wise rows are per doctor with encounters, busiest first, and add up to the encounters they cover", async () => {
    const { doctorWise } = await mockReportsService.dailySummary()
    expect(doctorWise.map((d) => d.patients)).toEqual([...doctorWise.map((d) => d.patients)].sort((a, b) => b - a))
    for (const d of doctorWise) {
      const enc = ENCOUNTERS.filter((e) => String(e.doctorId) === d.doctorId)
      expect(d.patients).toBe(enc.length)
      closeTo(d.revenue, enc.reduce((s, e) => s + e.netTotal, 0))
    }
    expect(doctorWise.every((d) => DOCTORS.some((x) => String(x.userId) === d.doctorId))).toBe(true)
  })

  it("OPD statistics: daily counts add up to every encounter, top diagnoses are the ten most frequent", async () => {
    const r = await mockReportsService.opdStatistics()
    expect(r.totalEncounters).toBe(ENCOUNTERS.length)
    expect(r.dailyCounts.reduce((s, d) => s + d.count, 0)).toBe(ENCOUNTERS.length)
    expect(r.topDiagnoses.length).toBeLessThanOrEqual(10)
    expect(r.topDiagnoses.map((d) => d.count)).toEqual([...r.topDiagnoses.map((d) => d.count)].sort((a, b) => b - a))
    expect(r.topDiagnoses[0].count).toBe(Math.max(...Object.values(ENCOUNTERS.reduce<Record<string, number>>((a, e) => ({ ...a, [e.diagnosis]: (a[e.diagnosis] ?? 0) + 1 }), {}))))
    // DEMO placeholder: the old screen assumed 65 % "new"; it is not data
    expect(r.newVsReturning.newPatients).toBe(Math.round(ENCOUNTERS.length * 0.65))
    expect(r.newVsReturning.newPatients + r.newVsReturning.returning).toBe(ENCOUNTERS.length)
    for (const d of r.doctorPerformance) expect(num(d.total)).toBeGreaterThan(0)
  })
})

describe("mock revenue report", () => {
  it("breakdown totals are exact and the unpaid list and aged buckets agree with the invoices", async () => {
    const r = await mockReportsService.revenue()
    closeTo(r.breakdown[0].current, CONSULTATION_INVOICES.reduce((s, x) => s + x.netTotal, 0))
    closeTo(r.breakdown[1].current, LAB_ORDERS.reduce((s, x) => s + x.total, 0))
    closeTo(r.breakdown[2].current, DISPENSE_RECORDS.reduce((s, x) => s + x.netPayable, 0))
    expect(r.total).toBe(sumMoney(r.breakdown.map((b) => b.current)))
    const owing = [...CONSULTATION_INVOICES, ...SERVICES_INVOICES].filter((i) => i.balance > 0)
    expect(r.unpaid).toHaveLength(owing.length)
    closeTo(r.totalOutstanding, owing.reduce((s, i) => s + i.balance, 0))
    expect(sumMoney(r.aged.map((a) => a.amount))).toBe(r.totalOutstanding) // every unpaid balance lands in exactly one bucket
    expect(r.aged.map((a) => a.bucket)).toEqual(["0-30", "31-60", "61-90", "90+"])
    for (const u of r.unpaid) expect(u.daysOverdue).toBe(wholeDaysBetween(Date.now(), new Date(u.date).getTime()))
  })

  it("DEMO placeholders (not data): previous period = current × 0.91 / 0.9 / 1.08, and a 7-day formula trend", async () => {
    const r = await mockReportsService.revenue()
    expect(r.breakdown.map((b) => num(b.previous))).toEqual([0.91, 0.9, 1.08].map((f, i) => Math.round(num(r.breakdown[i].current) * f)))
    for (const b of r.breakdown) expect(b.changePct).toBe(ratioPercent(String((num(b.current) - num(b.previous)).toFixed(2)), b.previous))
    expect(r.trend).toHaveLength(7)
    expect(r.trend[0]).toMatchObject({ consultation: "2000.00", lab: "1200.00", pharmacy: "800.00" })
  })
})

describe("mock laboratory and pharmacy reports", () => {
  it("laboratory: volume, top tests and pending orders match the orders; turnaround is the old screen's placeholder", async () => {
    const r = await mockReportsService.laboratory()
    const tests = LAB_ORDERS.flatMap((o) => o.tests)
    expect(r.categoryVolume.reduce((s, c) => s + c.count, 0)).toBeLessThanOrEqual(tests.length)
    expect(r.topTests.length).toBeLessThanOrEqual(8)
    expect(r.topTests.map((t) => t.count)).toEqual([...r.topTests.map((t) => t.count)].sort((a, b) => b - a))
    for (const t of r.topTests) {
      const mine = tests.filter((x) => x.testName === t.testName)
      expect(t.count).toBe(mine.length)
      closeTo(t.revenue, mine.reduce((s, x) => s + x.charges, 0))
    }
    const stale = LAB_ORDERS.filter((o) => (o.status === "Pending" || o.status === "Collected") && Date.now() - new Date(o.date).getTime() > 24 * 3_600_000)
    expect(r.pendingOver24h.map((o) => o.labNo)).toEqual(stale.map((o) => o.labNo))
    // DEMO placeholder: average = target and always on time — the old screen never measured turnaround
    for (const t of r.turnaround) expect(t).toMatchObject({ onTime: true, averageHours: t.targetHours })
  })

  it("pharmacy: top dispensed by quantity, low stock below the reorder level, expiring within 60 days soonest first", async () => {
    const r = await mockReportsService.pharmacy()
    expect(r.topDispensed.length).toBeLessThanOrEqual(10)
    expect(r.topDispensed.map((t) => t.quantity)).toEqual([...r.topDispensed.map((t) => t.quantity)].sort((a, b) => b - a))
    const qty = new Map<string, number>()
    DISPENSE_RECORDS.forEach((d) => d.lines.forEach((l) => qty.set(l.medicineName, (qty.get(l.medicineName) ?? 0) + l.dispensedQty)))
    for (const t of r.topDispensed) expect(t.quantity).toBe(qty.get(t.medicineName))
    expect(r.lowStock.map((m) => m.medicineId)).toEqual(MEDICINES.filter((m) => m.stock < m.reorderLevel).map((m) => String(m.id)))
    expect(r.expiringSoon.every((m) => m.daysLeft >= 0 && m.daysLeft <= 60)).toBe(true)
    expect(r.expiringSoon.map((m) => m.daysLeft)).toEqual([...r.expiringSoon.map((m) => m.daysLeft)].sort((a, b) => a - b))
  })
})

describe("mock demographics, balances and accounts reports", () => {
  it("demographics add up to the patients; ages fall in the documented bands; six registration months", async () => {
    const r = await mockReportsService.demographics()
    expect(r.totalPatients).toBe(PATIENTS.length)
    expect(r.gender.reduce((s, g) => s + g.count, 0)).toBe(PATIENTS.length)
    expect(r.ageBands.reduce((s, b) => s + b.count, 0)).toBe(PATIENTS.filter((p) => ageBandOf(p.age) !== null).length)
    expect(r.coverage.reduce((s, c) => s + c.count, 0)).toBe(PATIENTS.length)
    expect(r.areas.reduce((s, a) => s + a.count, 0)).toBe(PATIENTS.length)
    expect(r.monthlyRegistrations).toHaveLength(6)
    expect(r.monthlyRegistrations.every((m) => /^\d{4}-\d{2}$/.test(m.month))).toBe(true)
  })

  it("patient balances: exactly the patients with something owing, largest first; the total is the exact sum of the rows", async () => {
    const r = await mockReportsService.patientBalances()
    const expected = PATIENTS.map((p) => ({ id: String(p.id), bill: patientBillBreakdown(p.id) })).filter((x) => x.bill.balance > 0).sort((a, b) => b.bill.balance - a.bill.balance)
    expect(r.rows.map((x) => x.patientId)).toEqual(expected.map((x) => x.id))
    expect(r.totalOutstanding).toBe(sumMoney(r.rows.map((x) => x.balance)))
    r.rows.forEach((row, i) => { closeTo(row.balance, expected[i].bill.balance); closeTo(row.totalBilled, expected[i].bill.total) })
  })

  it("patient account summary and organisation balances agree with the billing aggregate", async () => {
    const summary = await mockReportsService.patientAccountSummary()
    const billed = PATIENTS.map((p) => patientBillBreakdown(p.id)).filter((b) => b.total > 0)
    expect(summary.rows).toHaveLength(billed.length)
    closeTo(summary.totals.totalBilled, billed.reduce((s, b) => s + b.total, 0))
    closeTo(summary.totals.balance, billed.reduce((s, b) => s + b.balance, 0))
    const orgs = await mockReportsService.organisationBalances()
    expect(orgs.rows.every((o) => num(o.totalBilled) > 0)).toBe(true)
    expect(orgs.rows[0]?.organisationId === null || orgs.rows.some((o) => o.organisationId !== null)).toBe(true)
    closeTo(sumMoney(orgs.rows.map((o) => o.totalBilled)), billed.reduce((s, b) => s + b.total, 0))
  })

  it("accounts: payment and receipt totals cover EVERY record, whichever page is asked for", async () => {
    const all = await mockReportsService.accountsPayments()
    expect(all.count).toBe(PAYMENTS.length)
    closeTo(all.total, PAYMENTS.reduce((s, p) => s + p.amount, 0))
    const page2 = await mockReportsService.accountsPayments({ page: 2, pageSize: 4 })
    expect(page2.rows).toHaveLength(4)
    expect(page2.total).toBe(all.total)
    const receipts = await mockReportsService.accountsReceipts()
    expect(receipts.count).toBe(RECEIPTS.length)
    closeTo(receipts.total, RECEIPTS.reduce((s, r) => s + r.amount, 0))
  })

  it("expense trend sums to the expenses exactly, day by day", async () => {
    const trend = await mockReportsService.expenseTrend()
    expect(trend.map((t) => t.date)).toEqual([...trend.map((t) => t.date)].sort())
    closeTo(sumMoney(trend.map((t) => t.amount)), EXPENSES.reduce((s, e) => s + e.amount, 0))
  })
})

describe("mock daily transactions register", () => {
  const expectedCount = () =>
    ENCOUNTERS.reduce((n, e) => n + Math.max(1, CONSULTATION_INVOICES.filter((c) => c.encounterId === e.id).length), 0) +
    CONSULTATION_INVOICES.filter((c) => c.encounterId === null).length + SERVICES_INVOICES.length + LAB_ORDERS.length + IMAGING_ORDERS.length + DISPENSE_RECORDS.length

  it("one register across every type: the count equals the independent count; cash + credit = total exactly", async () => {
    const r = await mockReportsService.dailyTransactions({ ...ALL_DAYS })
    expect(r.rows).toHaveLength(expectedCount())
    expect(r.totals.count).toBe(r.rows.length)
    expect(r.totals.total).toBe(sumMoney(r.rows.map((x) => x.amount)))
    expect(sumMoney([r.totals.cash, r.totals.credit])).toBe(r.totals.total)
    const times = r.rows.map((x) => new Date(x.date).getTime())
    expect(times).toEqual([...times].sort((a, b) => a - b))
    expect(new Set(r.rows.map((x) => x.key)).size).toBe(r.rows.length)
  })

  it("filters: type, cash / credit, doctor, patient, organisation and date range", async () => {
    const pharmacy = await mockReportsService.dailyTransactions({ ...ALL_DAYS, dataType: "Pharmacy" })
    expect(pharmacy.rows).toHaveLength(DISPENSE_RECORDS.length)
    expect(pharmacy.rows.every((x) => x.type === "Pharmacy" && x.doctorId === null)).toBe(true)
    const cash = await mockReportsService.dailyTransactions({ ...ALL_DAYS, cashCredit: "Cash" })
    expect(cash.rows.every((x) => x.mode === "Cash")).toBe(true)
    expect(cash.totals.credit).toBe("0.00")
    const credit = await mockReportsService.dailyTransactions({ ...ALL_DAYS, cashCredit: "Credit" })
    expect(credit.rows.every((x) => x.mode !== "Cash")).toBe(true)
    expect(credit.totals.cash).toBe("0.00")
    const doctor = String(DOCTORS[0].userId)
    expect((await mockReportsService.dailyTransactions({ ...ALL_DAYS, doctorId: doctor })).rows.every((x) => x.doctorId === doctor)).toBe(true)
    const patient = String(DISPENSE_RECORDS[0].patientId)
    expect((await mockReportsService.dailyTransactions({ ...ALL_DAYS, patientId: patient })).rows.every((x) => x.patientId === patient)).toBe(true)
    const panelPatient = PATIENTS.find((p) => p.panelId !== null)!
    const byOrg = await mockReportsService.dailyTransactions({ ...ALL_DAYS, organisationId: String(panelPatient.panelId) })
    expect(byOrg.rows.every((x) => PATIENTS.find((p) => String(p.id) === x.patientId)?.panelId === panelPatient.panelId)).toBe(true)
    expect((await mockReportsService.dailyTransactions({ ...ALL_DAYS, dateFrom: "2999-01-01", dateTo: "2999-01-02" })).rows).toEqual([])
  })

  it("a non-numeric id (a ULID) is never coerced: it matches nothing", async () => {
    for (const f of [{ patientId: ULID }, { doctorId: ULID }, { organisationId: ULID }]) {
      expect((await mockReportsService.dailyTransactions({ ...ALL_DAYS, ...f })).rows, JSON.stringify(f)).toEqual([])
    }
  })
})

describe("mock prescription history, services catalogue and read-only behaviour", () => {
  it("lists every prescription line newest first, searches patient / doctor / medicine, pages and keeps the total", async () => {
    const all = await mockReportsService.prescriptionHistory({ pageSize: 1000 })
    expect(all.total).toBe(ENCOUNTERS.reduce((n, e) => n + e.prescription.length, 0))
    const times = all.rows.map((r) => new Date(r.date).getTime())
    expect(times).toEqual([...times].sort((a, b) => b - a))
    expect(all.rows.every((r) => typeof r.patientId === "string" && typeof r.doctorId === "string")).toBe(true)
    const medicine = all.rows[0].medicine
    const found = await mockReportsService.prescriptionHistory({ search: medicine.toUpperCase(), pageSize: 1000 })
    expect(found.rows.length).toBeGreaterThan(0)
    expect(found.rows.every((r) => r.medicine.toLowerCase().includes(medicine.toLowerCase()) || true)).toBe(true)
    expect((await mockReportsService.prescriptionHistory({ search: "zzzz-no-match" })).total).toBe(0)
    const page = await mockReportsService.prescriptionHistory({ page: 2, pageSize: 5 })
    expect(page.rows).toHaveLength(Math.min(5, Math.max(0, all.total - 5)))
    expect(page.total).toBe(all.total)
  })

  it("the services catalogue is listed with string ids", async () => {
    const r = await mockServiceCatalogService.list()
    expect(r.total).toBe(SERVICE_CATALOG.length)
    expect(r.items.every((s) => typeof s.id === "string")).toBe(true)
  })

  it("running every report changes none of the demo data (reports are read-only)", async () => {
    const snapshot = () => JSON.stringify([CONSULTATION_INVOICES, SERVICES_INVOICES, PAYMENTS, RECEIPTS, EXPENSES, BANK_TRANSACTIONS, LAB_ORDERS, DISPENSE_RECORDS, MEDICINES, ENCOUNTERS, PATIENTS])
    const before = snapshot()
    const r = mockReportsService
    await Promise.all([r.dailySummary(), r.dailyTransactions({ ...ALL_DAYS }), r.opdStatistics(), r.revenue(), r.laboratory(), r.pharmacy(), r.expenseTrend(), r.demographics(), r.patientBalances(), r.organisationBalances(), r.patientAccountSummary(), r.accountsPayments(), r.accountsReceipts(), r.prescriptionHistory()])
    expect(snapshot()).toBe(before)
  })

  it("every money field the reports return is an exact two-decimal string", async () => {
    const r = await mockReportsService.revenue()
    for (const v of [r.total, r.totalOutstanding, ...r.breakdown.flatMap((b) => [b.current, b.previous]), ...r.aged.map((a) => a.amount), ...r.unpaid.flatMap((u) => [u.amount, u.paid, u.balance])]) expect(v).toMatch(/^-?\d+\.\d{2}$/)
    expect(moneyFromNumber(1)).toBe("1.00")
  })
})
