import { EXPENSES } from "@/data/billing"
import { DOCTORS } from "@/data/doctors"
import { ENCOUNTERS } from "@/data/encounters"
import { IMAGING_ORDERS } from "@/data/imaging"
import { LAB_ORDERS } from "@/data/lab"
import { LAB_TEST_CATEGORIES, getLabTest } from "@/data/labTests"
import { MEDICINES } from "@/data/medicines"
import { PANELS } from "@/data/organisations"
import { PATIENTS } from "@/data/patients"
import { DISPENSE_RECORDS } from "@/data/pharmacy"
import { SERVICE_CATALOG } from "@/data/services"
import { CONSULTATION_INVOICES, SERVICES_INVOICES } from "@/data/billing"
import type { MoneyString } from "@/lib/api/types"
import { patientBillBreakdown } from "@/lib/billingAggregate"
import { paginate } from "../listing"
import { AGED_BUCKETS, AGE_BANDS, ageBandOf, agedBucketOf, isCreditMode, isoDay, wholeDaysBetween } from "../reportHelpers"
import { legacyNumericId } from "../reference/refId"
import { listAll } from "../reference/listAll"
import { ratioPercent, subMoney, sumMoney, moneyFromNumber } from "../moneyMath"
import type { DailyTransactionRow, DailyTransactionsFilter, ReportsService, ServiceCatalogService, BalanceRow } from "../types"
import { mockPaymentsService, mockReceiptsService } from "./finance"
import { mockApiError } from "./mockError"

// Mock report adapters: they build each report's MODEL from the same shared demo arrays the screens used to read directly (so the
// numbers match the billing, expenses, bank, laboratory and pharmacy mocks), then hand it to the screen. Sums are exact (money
// strings); legacy demo numbers are converted at this boundary only. A few values were never data — hard-coded placeholders in the
// old screens — and are reproduced here as DEMO_* constants so mock mode looks as before; they are listed in the handoff and are
// NOT backend rules. The backend owns every aggregate in API mode.

const m = moneyFromNumber
const S = String
const sumOf = <T,>(items: readonly T[], pick: (item: T) => number): MoneyString => sumMoney(items.map((i) => m(pick(i))))

/** Old DailySummaryReport: `const newPatients = 5` and `cash = 68, card = 18, insurance = 14`. Not data. */
const DEMO_NEW_PATIENTS = 5
const DEMO_PAYMENT_MODE_SHARE = { cash: 68, card: 18, insurance: 14 }
/** Old OpdStatisticsReport: `newCount = Math.round(ENCOUNTERS.length * 0.65)`. Not data. */
const DEMO_NEW_PATIENT_RATIO = 0.65
/** Old RevenueReport: the 7-day trend formulas and "previous period" = current × 0.91 / 0.9 / 1.08. Not data. */
const DEMO_PREVIOUS_FACTORS = { consultation: 0.91, lab: 0.9, pharmacy: 1.08 }
const demoTrend = (i: number) => ({ consultation: 2000 + i * 400 + (i % 2) * 500, lab: 1200 + i * 250, pharmacy: 800 + i * 150 })
/** Old LabReport: average turnaround = the test's target hours and every category "On Time". Not data. */
const DEMO_ON_TIME = true

const patientName = (id: number) => PATIENTS.find((p) => p.id === id)?.name ?? "—"
const doctorName = (id: number) => DOCTORS.find((d) => d.userId === id)?.name ?? "—"

export const mockReportsService: ReportsService = {
  async dailySummary() {
    const consultationRevenue = sumOf(CONSULTATION_INVOICES, (c) => c.netTotal)
    const labRevenue = sumOf(LAB_ORDERS, (o) => o.total)
    const pharmacyRevenue = sumOf(DISPENSE_RECORDS, (d) => d.netPayable)
    const doctorWise = DOCTORS.map((d) => {
      const enc = ENCOUNTERS.filter((e) => e.doctorId === d.userId)
      return { doctorId: S(d.userId), patients: enc.length, revenue: sumOf(enc, (e) => e.netTotal) }
    }).filter((d) => d.patients > 0).sort((a, b) => b.patients - a.patients)
    return {
      newPatients: DEMO_NEW_PATIENTS,
      opdEncounters: ENCOUNTERS.filter((e) => e.type === "OPD").length,
      ipdAdmissions: ENCOUNTERS.filter((e) => e.type === "IPD").length,
      discharges: ENCOUNTERS.filter((e) => e.status === "discharged").length,
      consultationRevenue, labRevenue, pharmacyRevenue, totalRevenue: sumMoney([consultationRevenue, labRevenue, pharmacyRevenue]),
      doctorWise,
      doctorWiseTotals: { patients: doctorWise.reduce((s, d) => s + d.patients, 0), revenue: sumMoney(doctorWise.map((d) => d.revenue)) },
      paymentModeShare: DEMO_PAYMENT_MODE_SHARE,
    }
  },

  async opdStatistics() {
    const byDay = new Map<string, number>()
    ENCOUNTERS.forEach((e) => byDay.set(e.date.slice(0, 10), (byDay.get(e.date.slice(0, 10)) ?? 0) + 1))
    const dx = new Map<string, number>()
    ENCOUNTERS.forEach((e) => dx.set(e.diagnosis, (dx.get(e.diagnosis) ?? 0) + 1))
    const newPatients = Math.round(ENCOUNTERS.length * DEMO_NEW_PATIENT_RATIO)
    return {
      totalEncounters: ENCOUNTERS.length,
      dailyCounts: [...byDay.entries()].map(([date, count]) => ({ date, count })),
      topDiagnoses: [...dx.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([diagnosis, count]) => ({ diagnosis, count })),
      newVsReturning: { newPatients, returning: ENCOUNTERS.length - newPatients },
      doctorPerformance: DOCTORS.map((d) => {
        const enc = ENCOUNTERS.filter((e) => e.doctorId === d.userId)
        const total = enc.reduce((s, e) => s + e.netTotal, 0)
        return { doctorId: S(d.userId), patients: enc.length, averageFee: m(enc.length ? Math.round(total / enc.length) : 0), total: sumOf(enc, (e) => e.netTotal) }
      }).filter((d) => d.patients > 0),
    }
  },

  async revenue() {
    const consultation = sumOf(CONSULTATION_INVOICES, (c) => c.netTotal)
    const lab = sumOf(LAB_ORDERS, (o) => o.total)
    const pharmacy = sumOf(DISPENSE_RECORDS, (d) => d.netPayable)
    const row = (label: string, current: MoneyString, factor: number) => {
      const previous = m(Math.round(Number(current) * factor))
      return { label, current, previous, changePct: ratioPercent(subMoney(current, previous), previous) }
    }
    const unpaid = [
      ...CONSULTATION_INVOICES.filter((c) => c.balance > 0).map((c) => ({ invoiceNo: c.invoiceNo, patientId: S(c.patientId), type: "Consultation" as const, amount: m(c.netTotal), paid: m(c.amountReceived), balance: m(c.balance), date: c.date })),
      ...SERVICES_INVOICES.filter((s) => s.balance > 0).map((s) => ({ invoiceNo: s.invoiceNo, patientId: S(s.patientId), type: "Services" as const, amount: m(s.netTotal), paid: m(s.amountReceived), balance: m(s.balance), date: s.date })),
    ].map((u) => ({ ...u, daysOverdue: wholeDaysBetween(Date.now(), new Date(u.date).getTime()) }))
    const now = Date.now()
    return {
      trend: [...Array(7)].map((_, i) => {
        const t = demoTrend(i)
        return { date: isoDay(now - (6 - i) * 86_400_000), consultation: m(t.consultation), lab: m(t.lab), pharmacy: m(t.pharmacy) }
      }),
      breakdown: [row("Consultations", consultation, DEMO_PREVIOUS_FACTORS.consultation), row("Lab Services", lab, DEMO_PREVIOUS_FACTORS.lab), row("Pharmacy", pharmacy, DEMO_PREVIOUS_FACTORS.pharmacy)],
      total: sumMoney([consultation, lab, pharmacy]),
      unpaid,
      totalOutstanding: sumMoney(unpaid.map((u) => u.balance)),
      aged: AGED_BUCKETS.map((bucket) => ({ bucket, amount: sumMoney(unpaid.filter((u) => agedBucketOf(u.daysOverdue) === bucket).map((u) => u.balance)) })),
    }
  },

  async laboratory() {
    const tests = LAB_ORDERS.flatMap((o) => o.tests)
    const perTest = new Map<string, { count: number; charges: MoneyString[] }>()
    tests.forEach((t) => {
      const e = perTest.get(t.testName) ?? { count: 0, charges: [] }
      perTest.set(t.testName, { count: e.count + 1, charges: [...e.charges, m(t.charges)] })
    })
    return {
      categoryVolume: LAB_TEST_CATEGORIES.map((category) => ({ category: S(category), count: tests.filter((t) => getLabTest(t.testId)?.category === category).length })).filter((c) => c.count > 0),
      pendingOver24h: LAB_ORDERS.filter((o) => (o.status === "Pending" || o.status === "Collected") && Date.now() - new Date(o.date).getTime() > 24 * 3_600_000).map((o) => ({ labNo: o.labNo })),
      topTests: [...perTest.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 8).map(([testName, d]) => ({ testName, count: d.count, revenue: sumMoney(d.charges) })),
      turnaround: LAB_TEST_CATEGORIES.flatMap((category) => {
        const inCategory = tests.map((t) => getLabTest(t.testId)).filter((t) => t?.category === category)
        if (inCategory.length === 0) return []
        const target = inCategory[0]!.turnaroundHours
        return [{ category: S(category), averageHours: target, targetHours: target, onTime: DEMO_ON_TIME }]
      }),
    }
  },

  async pharmacy() {
    const perMedicine = new Map<string, { quantity: number; revenue: MoneyString[] }>()
    DISPENSE_RECORDS.forEach((d) => d.lines.forEach((l) => {
      const e = perMedicine.get(l.medicineName) ?? { quantity: 0, revenue: [] }
      perMedicine.set(l.medicineName, { quantity: e.quantity + l.dispensedQty, revenue: [...e.revenue, m(l.total)] })
    }))
    return {
      topDispensed: [...perMedicine.entries()].sort((a, b) => b[1].quantity - a[1].quantity).slice(0, 10).map(([medicineName, d]) => ({ medicineName, quantity: d.quantity, revenue: sumMoney(d.revenue) })),
      lowStock: MEDICINES.filter((x) => x.stock < x.reorderLevel).map((x) => ({ medicineId: S(x.id), name: x.name, stock: x.stock, reorderLevel: x.reorderLevel })),
      expiringSoon: MEDICINES.map((x) => ({ x, daysLeft: Math.floor((new Date(x.expiry).getTime() - Date.now()) / 86_400_000) }))
        .filter(({ daysLeft }) => daysLeft <= 60 && daysLeft >= 0).sort((a, b) => a.daysLeft - b.daysLeft)
        .map(({ x, daysLeft }) => ({ medicineId: S(x.id), name: x.name, batchNo: x.batchNo, stock: x.stock, daysLeft })),
    }
  },

  async expenseTrend() {
    const byDay = new Map<string, MoneyString[]>()
    ;[...EXPENSES].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).forEach((e) => {
      const day = e.date.slice(0, 10)
      byDay.set(day, [...(byDay.get(day) ?? []), m(e.amount)])
    })
    return [...byDay.entries()].map(([date, amounts]) => ({ date, amount: sumMoney(amounts) }))
  },

  async demographics() {
    const areas = new Map<string, number>()
    PATIENTS.forEach((p) => areas.set(p.area ?? "Other", (areas.get(p.area ?? "Other") ?? 0) + 1))
    const now = new Date()
    return {
      totalPatients: PATIENTS.length,
      gender: ["Male", "Female", "Other"].map((name) => ({ name, count: PATIENTS.filter((p) => p.gender === name).length })).filter((g) => g.count > 0),
      ageBands: AGE_BANDS.map((b) => ({ label: b.label, count: PATIENTS.filter((p) => ageBandOf(p.age) === b.label).length })),
      coverage: [
        { name: "Self-Pay", count: PATIENTS.filter((p) => p.panelId === null).length },
        ...PANELS.map((panel) => ({ name: panel.name, count: PATIENTS.filter((p) => p.panelId === panel.id).length })).filter((p) => p.count > 0),
      ],
      areas: [...areas.entries()].sort((a, b) => b[1] - a[1]).map(([area, count]) => ({ area, count })),
      monthlyRegistrations: [...Array(6)].map((_, i) => {
        const month = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)
        const count = PATIENTS.filter((p) => { const d = new Date(p.registrationDate); return d.getMonth() === month.getMonth() && d.getFullYear() === month.getFullYear() }).length
        return { month: `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`, count }
      }),
    }
  },

  async patientBalances() {
    const rows = balanceRows().filter((r) => r.bill.balance > 0).sort((a, b) => b.bill.balance - a.bill.balance)
    return { rows: rows.map(toBalanceRow), totalOutstanding: sumOf(rows, (r) => r.bill.balance) }
  },

  async organisationBalances() {
    const groups = [{ id: null as number | null, name: "Self-Pay" }, ...PANELS.map((p) => ({ id: p.id as number | null, name: p.name }))].map((g) => {
      const patients = PATIENTS.filter((p) => p.panelId === g.id)
      const bills = patients.map((p) => patientBillBreakdown(p.id))
      return {
        organisationId: g.id === null ? null : S(g.id), name: g.name, patientCount: patients.length,
        totalBilled: sumOf(bills, (b) => b.total), received: sumOf(bills, (b) => b.received), balance: sumOf(bills, (b) => b.balance),
        hasBilling: bills.reduce((s, b) => s + b.total, 0) > 0,
      }
    }).filter((g) => g.hasBilling)
    return { rows: groups.map(({ hasBilling, ...g }) => (void hasBilling, g)) }
  },

  async patientAccountSummary() {
    const rows = balanceRows().filter((r) => r.bill.total > 0).sort((a, b) => b.bill.balance - a.bill.balance)
    return {
      rows: rows.map(toBalanceRow),
      totals: { totalBilled: sumOf(rows, (r) => r.bill.total), received: sumOf(rows, (r) => r.bill.received), balance: sumOf(rows, (r) => r.bill.balance) },
    }
  },

  async accountsPayments(opts = {}) {
    const all = await listAll((o) => mockPaymentsService.list(o))
    return { rows: paginate(all.items, opts.page, opts.pageSize), total: sumMoney(all.items.map((p) => p.amount)), count: all.items.length }
  },

  async accountsReceipts(opts = {}) {
    const all = await listAll((o) => mockReceiptsService.list(o))
    return { rows: paginate(all.items, opts.page, opts.pageSize), total: sumMoney(all.items.map((r) => r.amount)), count: all.items.length }
  },

  async dailyTransactions(filter) {
    const rows = filterTransactions(allTransactions(), filter)
    const total = sumMoney(rows.map((r) => r.amount))
    const cash = sumMoney(rows.filter((r) => !isCreditMode(r.mode)).map((r) => r.amount))
    return { rows, totals: { count: rows.length, total, cash, credit: subMoney(total, cash) } }
  },

  async prescriptionHistory(opts = {}) {
    const flat = ENCOUNTERS.flatMap((e) => e.prescription.map((rx, i) => ({
      key: `${e.id}-${i}`, encId: e.encId, date: e.date, patientId: e.patientId, doctorId: e.doctorId, medicine: rx.medicine, dose: rx.dose, frequency: rx.frequency, duration: rx.duration,
    }))).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    const q = opts.search?.trim().toLowerCase()
    const matches = q ? flat.filter((r) => patientName(r.patientId).toLowerCase().includes(q) || r.medicine.toLowerCase().includes(q) || doctorName(r.doctorId).toLowerCase().includes(q)) : flat
    return { rows: paginate(matches, opts.page, opts.pageSize).map((r) => ({ ...r, patientId: S(r.patientId), doctorId: S(r.doctorId) })), total: matches.length }
  },
}

function balanceRows() {
  return PATIENTS.map((p) => ({ patient: p, bill: patientBillBreakdown(p.id) }))
}

function toBalanceRow(r: ReturnType<typeof balanceRows>[number]): BalanceRow {
  return { patientId: S(r.patient.id), totalBilled: m(r.bill.total), received: m(r.bill.received), balance: m(r.bill.balance) }
}

/**
 * One register across every transaction type, as the screen always built it. Checkup revenue can land on a standalone Consultation
 * Invoice or directly on the Encounter (billed through the wizard's own Billing step) — the same fallback encounterBillBreakdown uses.
 */
function allTransactions(): (DailyTransactionRow & { legacyPatientId: number; legacyDoctorId: number | null })[] {
  const row = (r: { key: string; date: string; type: DailyTransactionRow["type"]; refNo: string; patientId: number; doctorId: number | null; amount: number; mode: DailyTransactionRow["mode"]; status: string }) => ({
    key: r.key, date: r.date, type: r.type, refNo: r.refNo, patientId: S(r.patientId), doctorId: r.doctorId === null ? null : S(r.doctorId), amount: m(r.amount), mode: r.mode, status: r.status,
    legacyPatientId: r.patientId, legacyDoctorId: r.doctorId,
  })
  const consult = (c: (typeof CONSULTATION_INVOICES)[number]) => row({ key: `c-${c.id}`, date: c.date, type: "Checkup", refNo: c.invoiceNo, patientId: c.patientId, doctorId: c.doctorId, amount: c.netTotal, mode: c.paymentMode, status: c.status })
  const checkups = ENCOUNTERS.flatMap((e) => {
    const linked = CONSULTATION_INVOICES.filter((c) => c.encounterId === e.id)
    return linked.length > 0 ? linked.map(consult) : [row({ key: `e-${e.id}`, date: e.date, type: "Checkup", refNo: e.encId, patientId: e.patientId, doctorId: e.doctorId, amount: e.netTotal, mode: e.paymentMode, status: e.paymentStatus })]
  })
  return [
    ...checkups,
    ...CONSULTATION_INVOICES.filter((c) => c.encounterId === null).map(consult),
    ...SERVICES_INVOICES.map((s) => row({ key: `s-${s.id}`, date: s.date, type: "Admission/Services", refNo: s.invoiceNo, patientId: s.patientId, doctorId: s.doctorId, amount: s.netTotal, mode: s.paymentMode, status: s.status })),
    ...LAB_ORDERS.map((o) => row({ key: `l-${o.id}`, date: o.date, type: "Lab Slips", refNo: o.labNo, patientId: o.patientId, doctorId: o.doctorId, amount: o.total, mode: o.paymentMode, status: o.paymentStatus })),
    ...IMAGING_ORDERS.map((o) => row({ key: `x-${o.id}`, date: o.date, type: "X-Rays", refNo: o.xrNo, patientId: o.patientId, doctorId: o.doctorId, amount: o.total, mode: o.paymentMode, status: o.paymentMode === "On Account" ? "unpaid" : "paid" })),
    ...DISPENSE_RECORDS.map((d) => row({ key: `p-${d.id}`, date: d.date, type: "Pharmacy", refNo: d.disNo, patientId: d.patientId, doctorId: null, amount: d.netPayable, mode: d.paymentMode, status: d.paymentMode === "On Account" ? "unpaid" : "paid" })),
  ]
}

function filterTransactions(rows: ReturnType<typeof allTransactions>, f: DailyTransactionsFilter): DailyTransactionRow[] {
  const doctor = f.doctorId === undefined ? undefined : legacyNumericId(f.doctorId)
  const patient = f.patientId === undefined ? undefined : legacyNumericId(f.patientId)
  const panel = f.organisationId === undefined ? undefined : legacyNumericId(f.organisationId)
  // A filter id that is not a legacy numeric id can match nothing. (Without this, the failed conversion's `null` would equal the
  // "no doctor" of pharmacy / walk-in rows and the "self-pay" of unassigned patients.)
  if ((f.doctorId !== undefined && doctor === null) || (f.patientId !== undefined && patient === null) || (f.organisationId !== undefined && panel === null)) return []
  return rows
    .filter((r) => {
      const day = r.date.slice(0, 10)
      if (day < f.dateFrom || day > f.dateTo) return false
      if (f.dataType !== "All" && r.type !== f.dataType) return false
      if (f.cashCredit === "Cash" && isCreditMode(r.mode)) return false
      if (f.cashCredit === "Credit" && !isCreditMode(r.mode)) return false
      if (f.doctorId !== undefined && r.legacyDoctorId !== doctor) return false
      if (f.patientId !== undefined && r.legacyPatientId !== patient) return false
      if (f.organisationId !== undefined) {
        const p = PATIENTS.find((x) => x.id === r.legacyPatientId)
        if (!p || p.panelId !== panel) return false
      }
      return true
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map(({ legacyPatientId, legacyDoctorId, ...rest }) => (void legacyPatientId, void legacyDoctorId, rest))
}

// Mutates the shared SERVICE_CATALOG in place, as the Master Data tab and the Services Invoice form used to do inline.
export const mockServiceCatalogService: ServiceCatalogService = {
  async list(opts = {}) {
    const matches = SERVICE_CATALOG.filter((s) => (!opts.category || s.category === opts.category) && (opts.active === undefined || s.active === opts.active))
    return { items: paginate(matches, opts.page, opts.pageSize).map((s) => ({ ...s, id: S(s.id) })), total: matches.length }
  },
  async create(input) {
    const record = { ...input, id: Math.max(0, ...SERVICE_CATALOG.map((s) => s.id)) + 1 }
    SERVICE_CATALOG.push(record)
    return { ...record, id: S(record.id) }
  },
  async update(id, input) {
    const numeric = legacyNumericId(id)
    const idx = numeric === null ? -1 : SERVICE_CATALOG.findIndex((s) => s.id === numeric)
    if (idx < 0) throw mockApiError(404, "NOT_FOUND", "Catalogue item not found")
    SERVICE_CATALOG[idx] = { ...SERVICE_CATALOG[idx], ...input }
    return { ...SERVICE_CATALOG[idx], id: S(SERVICE_CATALOG[idx].id) }
  },
  async patch(id, patch) {
    const numeric = legacyNumericId(id)
    const idx = numeric === null ? -1 : SERVICE_CATALOG.findIndex((s) => s.id === numeric)
    if (idx < 0) throw mockApiError(404, "NOT_FOUND", "Catalogue item not found")
    SERVICE_CATALOG[idx] = { ...SERVICE_CATALOG[idx], ...patch }
    return { ...SERVICE_CATALOG[idx], id: S(SERVICE_CATALOG[idx].id) }
  },
  async setActive(id, active) {
    const numeric = legacyNumericId(id)
    const idx = numeric === null ? -1 : SERVICE_CATALOG.findIndex((s) => s.id === numeric)
    if (idx < 0) throw mockApiError(404, "NOT_FOUND", "Catalogue item not found")
    SERVICE_CATALOG[idx] = { ...SERVICE_CATALOG[idx], active }
    return { ...SERVICE_CATALOG[idx], id: S(SERVICE_CATALOG[idx].id) }
  },
}
