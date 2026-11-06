import { BANK_TRANSACTIONS, EXPENSES, PAYMENTS, RECEIPTS, SERVICES_INVOICES } from "@/data/billing"
import { ENCOUNTERS } from "@/data/encounters"
import { IMAGING_ORDERS } from "@/data/imaging"
import { LAB_ORDERS } from "@/data/lab"
import { MEDICINES } from "@/data/medicines"
import { PATIENTS } from "@/data/patients"
import { DISPENSE_RECORDS } from "@/data/pharmacy"
import type { MoneyString } from "@/lib/api/types"
import { addMoney, moneyFromNumber, subMoney, sumMoney } from "../moneyMath"
import { isoDay } from "../reportHelpers"
import type { DashboardService, StatisticsCategory, StatisticsRecordRow, StatisticsService } from "../types"

// Mock Dashboard / Financial Statistics adapters. Like the report mocks they build each MODEL from the same shared demo arrays the
// screens used to read directly, with exact money sums; legacy demo numbers are converted at this boundary only. Many Dashboard
// values were never data — hard-coded numbers in the old screen — and are reproduced as named DEMO_* constants so mock mode looks as
// before. They are NOT data and NOT backend rules (they are listed in the handoff). The backend owns every aggregate in API mode.

const m = moneyFromNumber
const S = String

/** Old dashboard/page.tsx: hard-coded tile values, the hero sentence and the trend notes. Not data. */
const DEMO_TILES = { todaysPatients: 24, revenueToday: 42500, pendingLabReports: 7, pendingOrders: 7, dispensedToday: 18, completedToday: 12, myPatients: 11 }
const DEMO_NOTES = { todaysPatients: "+3 from yesterday", revenueToday: "+12% vs yesterday", dispensedToday: "+4 from yesterday" }
/** Old DashboardCharts.tsx: the weekly visits and the 7-day revenue series. Not data. */
const DEMO_WEEKLY_VISITS = [["Mon", 18], ["Tue", 22], ["Wed", 19], ["Thu", 31], ["Fri", 28], ["Sat", 15], ["Sun", 8]] as const
const DEMO_REVENUE_7D = [35000, 42000, 38000, 51000, 44000, 39000, 42500]
/** Old dashboard/page.tsx: the "Up Next" appointments. Not data (the appointments module is a separate, unbuilt screen). */
const DEMO_UP_NEXT = [
  { time: "09:00", patient: "Kamran Iqbal", mr: "MR-2024-0091", doctor: "Dr. Sarah Khan", type: "OPD", status: "Completed" },
  { time: "09:30", patient: "Sana Butt", mr: "MR-2024-0145", doctor: "Dr. Sarah Khan", type: "OPD", status: "In Progress" },
  { time: "10:00", patient: "Muhammad Ali", mr: "MR-2024-0203", doctor: "Dr. Imran Siddiqui", type: "OPD", status: "Waiting" },
  { time: "10:30", patient: "Asma Nawaz", mr: "MR-2024-0067", doctor: "Dr. Sarah Khan", type: "OPD", status: "Waiting" },
  { time: "11:00", patient: "Tariq Mehmood", mr: "MR-2024-0312", doctor: "Dr. Imran Siddiqui", type: "Cardiology", status: "Waiting" },
]
/** Old Financial Statistics: `CASH_DRAWER_OPENING = 5000` "petty-cash float carried in the drawer at start of day". Not data. */
const DEMO_CASH_DRAWER_OPENING = 5000
/** Old Financial Statistics: Medicine and X-Ray rows were all given the status "paid". Not data. */
const DEMO_ALWAYS_PAID = "paid"

type Kind = "OPD" | "IPD"
const kindOf = (encounterId: number | null): Kind => (encounterId === null ? "OPD" : ENCOUNTERS.find((e) => e.id === encounterId)?.type ?? "OPD")

interface CategoryEntry { value: number; cash: number; credit: number; type: Kind }

/** The six sales categories, in the order the screen shows them, with the cash / credit rules the screen always used. */
function categories(): { label: string; entries: CategoryEntry[] }[] {
  const consultation = ENCOUNTERS.map((e) => ({ value: e.netTotal, cash: e.paymentMode === "Cash" ? e.amountReceived ?? 0 : 0, credit: e.paymentStatus !== "paid" ? e.balance ?? 0 : 0, type: e.type }))
  const services = SERVICES_INVOICES.map((s) => ({ value: s.netTotal, cash: s.paymentMode === "Cash" ? s.amountReceived : 0, credit: s.balance, type: kindOf(s.encounterId) }))
  const lab = LAB_ORDERS.map((o) => ({ value: o.total, cash: o.paymentStatus === "paid" ? o.total : 0, credit: o.paymentStatus === "paid" ? 0 : o.total, type: kindOf(o.encounterId) }))
  const medicine = DISPENSE_RECORDS.map((d) => ({ value: d.netPayable, cash: d.paymentMode === "Cash" ? d.netPayable : 0, credit: d.paymentMode === "On Account" ? d.netPayable : 0, type: kindOf(d.encounterId) }))
  const xrays = IMAGING_ORDERS.map((o) => ({ value: o.total, cash: o.paymentMode === "Cash" ? o.total : 0, credit: o.paymentMode !== "Cash" ? o.total : 0, type: kindOf(o.encounterId) }))
  return [
    { label: "Services", entries: services }, { label: "Laboratory", entries: lab }, { label: "Consultation", entries: consultation },
    { label: "Medicines", entries: medicine }, { label: "X-Rays", entries: xrays },
    { label: "ECG, Ultra-Sound", entries: [] }, // the old screen had no data here; the Task List says it "can be filled from" imaging orders (rule undefined)
  ]
}

const sumField = (entries: CategoryEntry[], pick: (e: CategoryEntry) => number): MoneyString => sumMoney(entries.map((e) => m(pick(e))))

function summarize(entries: CategoryEntry[]) {
  return {
    value: sumField(entries, (e) => e.value), count: entries.length, cash: sumField(entries, (e) => e.cash), credit: sumField(entries, (e) => e.credit),
    opd: sumField(entries.filter((e) => e.type === "OPD"), (e) => e.value), ipd: sumField(entries.filter((e) => e.type === "IPD"), (e) => e.value),
  }
}

export const mockDashboardService: DashboardService = {
  async summary() {
    const admitted = ENCOUNTERS.filter((e) => e.type === "IPD" && e.status === "open") // the same rule as the Lists report's admitted patients
    const male = admitted.filter((e) => PATIENTS.find((p) => p.id === e.patientId)?.gender === "Male").length
    const female = admitted.filter((e) => PATIENTS.find((p) => p.id === e.patientId)?.gender === "Female").length
    return {
      todaysPatients: DEMO_TILES.todaysPatients,
      admittedIpd: admitted.length,
      revenueToday: m(DEMO_TILES.revenueToday),
      pendingLabReports: DEMO_TILES.pendingLabReports,
      pendingOrders: DEMO_TILES.pendingOrders,
      lowStockItems: MEDICINES.filter((x) => x.stock < x.reorderLevel).length,
      dispensedToday: DEMO_TILES.dispensedToday,
      completedToday: DEMO_TILES.completedToday,
      myPatients: DEMO_TILES.myPatients,
      notes: { ...DEMO_NOTES, admittedIpd: `${male} male · ${female} female` },
    }
  },

  async weeklyVisits() {
    return { points: DEMO_WEEKLY_VISITS.map(([label, count]) => ({ label, count })), total: DEMO_WEEKLY_VISITS.reduce((s, [, c]) => s + c, 0) }
  },

  async revenueTrend() {
    const now = Date.now()
    return DEMO_REVENUE_7D.map((v, i) => ({ date: isoDay(now - (6 - i) * 86_400_000), amount: m(v) }))
  },

  async upNext() {
    return DEMO_UP_NEXT.map((a) => ({
      time: a.time, patientName: a.patient, mrNo: a.mr, patientId: S(PATIENTS.find((p) => p.name === a.patient)?.id ?? "") || null,
      doctorName: a.doctor, type: a.type, status: a.status,
    }))
  },

  async cashFlow() {
    const sales = categories().flatMap((c) => c.entries)
    const cashSales = sumField(sales, (e) => e.cash)
    const cashReceipts = sumMoney(RECEIPTS.map((r) => m(r.amount))) // every receipt, whatever its mode — the screen's rule
    const drawnFromBank = sumMoney(BANK_TRANSACTIONS.filter((t) => t.cashMovement === "withdrawal").map((t) => m(t.debit)))
    const cashExpenses = sumMoney(EXPENSES.filter((e) => e.mode === "Cash").map((e) => m(e.amount)))
    const cashPayments = sumMoney(PAYMENTS.filter((p) => p.mode === "Cash").map((p) => m(p.amount)))
    const depositInBank = sumMoney(BANK_TRANSACTIONS.filter((t) => t.cashMovement === "deposit").map((t) => m(t.credit)))
    const opening = m(DEMO_CASH_DRAWER_OPENING)
    const cashIn = sumMoney([cashSales, cashReceipts, drawnFromBank])
    const cashOut = sumMoney([cashExpenses, cashPayments, depositInBank])
    return {
      opening, closing: subMoney(addMoney(opening, cashIn), cashOut),
      cashIn: { cashSales, cashReceipts, drawnFromBank, total: cashIn },
      cashOut: { cashExpenses, cashPayments, depositInBank, total: cashOut },
    }
  },
}

export const mockStatisticsService: StatisticsService = {
  async summary() {
    const cats = categories()
    const all = cats.flatMap((c) => c.entries)
    return {
      categories: cats.map((c) => ({ label: c.label, ...summarize(c.entries) })),
      totalSales: summarize(all),
      payments: { value: sumMoney(PAYMENTS.map((p) => m(p.amount))), count: PAYMENTS.length },
      receipts: { value: sumMoney(RECEIPTS.map((r) => m(r.amount))), count: RECEIPTS.length },
      expenses: { value: sumMoney(EXPENSES.map((e) => m(e.amount))), count: EXPENSES.length },
      banks: { value: sumMoney(BANK_TRANSACTIONS.map((t) => subMoney(m(t.credit), m(t.debit)))), count: BANK_TRANSACTIONS.length },
    }
  },

  async records(category: StatisticsCategory) {
    const row = (id: string, date: string, patientId: number | null, amount: number, status: string, description?: string): StatisticsRecordRow => ({
      id, date, patientId: patientId === null ? null : S(patientId), description, amount: m(amount), status,
    })
    const byCategory: Record<StatisticsCategory, () => StatisticsRecordRow[]> = {
      Services: () => SERVICES_INVOICES.map((s) => row(s.invoiceNo, s.date, s.patientId, s.netTotal, s.status)),
      Checkups: () => ENCOUNTERS.map((e) => row(e.encId, e.date, e.patientId, e.netTotal, e.paymentStatus)),
      "Lab Tests": () => LAB_ORDERS.map((o) => row(o.labNo, o.date, o.patientId, o.total, o.paymentStatus)),
      Medicine: () => DISPENSE_RECORDS.map((d) => row(d.disNo, d.date, d.patientId, d.netPayable, DEMO_ALWAYS_PAID)),
      "X-Rays": () => IMAGING_ORDERS.map((o) => row(o.xrNo, o.date, o.patientId, o.total, DEMO_ALWAYS_PAID)),
      Receipts: () => RECEIPTS.map((r) => row(r.receiptNo, r.date, r.patientId, r.amount, r.type)),
      Payments: () => PAYMENTS.map((p) => row(p.receiptNo, p.date, p.patientId, p.amount, p.mode)),
      Expenses: () => EXPENSES.map((e) => row(S(e.id), e.date, null, e.amount, e.category, e.description)),
    }
    return { rows: byCategory[category]() }
  },

  async dailyCheckupRevenue() {
    const byDay = new Map<string, MoneyString[]>()
    ENCOUNTERS.forEach((e) => byDay.set(e.date.slice(0, 10), [...(byDay.get(e.date.slice(0, 10)) ?? []), m(e.netTotal)]))
    return [...byDay.entries()].map(([date, amounts]) => ({ date, amount: sumMoney(amounts) }))
  },
}
