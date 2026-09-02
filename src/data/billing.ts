import type {
  ConsultationInvoice, ServicesInvoice, PaymentRecord, ReceiptRecord, Expense, BankTransaction, PaymentMode,
} from "@/types"
import { PATIENTS } from "@/data/patients"
import { DOCTORS } from "@/data/doctors"
import { ENCOUNTERS } from "@/data/encounters"
import { shiftDate } from "@/lib/dateShift"

const MODES: PaymentMode[] = ["Cash", "Card", "Bank Transfer", "Cheque", "Insurance"]

function padId(n: number) {
  return String(n).padStart(4, "0")
}

// ─── Consultation Invoices (15) ───────────────────────────────────
export const CONSULTATION_INVOICES: ConsultationInvoice[] = ENCOUNTERS.slice(0, 15).map((enc, i) => {
  const doctor = DOCTORS.find((d) => d.userId === enc.doctorId)
  const mode = enc.paymentMode && MODES.includes(enc.paymentMode as PaymentMode)
    ? (enc.paymentMode as PaymentMode)
    : MODES[i % MODES.length]
  return {
    id: i + 1,
    invoiceNo: `CI-2024-${padId(i + 1)}`,
    encounterId: enc.id,
    patientId: enc.patientId,
    doctorId: enc.doctorId,
    date: enc.date,
    fee: doctor?.fee ?? enc.fee,
    subtotal: enc.fee,
    discountType: enc.discountType,
    discount: enc.discount,
    netTotal: enc.netTotal,
    paymentMode: mode,
    amountReceived: enc.amountReceived ?? 0,
    balance: enc.balance ?? 0,
    status: enc.paymentStatus,
  }
})

// ─── Services Invoices (12) ────────────────────────────────────────
const SERVICE_INVOICE_SEED = [
  { patientId: 2, lines: [{ name: "Dressing", rate: 300 }, { name: "BP Check", rate: 100 }], mode: "Cash" as PaymentMode, status: "paid" as const },
  { patientId: 9, lines: [{ name: "IV Drip Setup", rate: 200 }, { name: "Injection Admin", rate: 150 }], mode: "Insurance" as PaymentMode, status: "partial" as const },
  { patientId: 3, lines: [{ name: "Nebulisation", rate: 400 }], mode: "Cash" as PaymentMode, status: "paid" as const },
  { patientId: 10, lines: [{ name: "Wound Suturing", rate: 1500 }], mode: "Card" as PaymentMode, status: "paid" as const },
  { patientId: 13, lines: [{ name: "Plaster", rate: 800 }, { name: "BP Check", rate: 100 }], mode: "Cash" as PaymentMode, status: "unpaid" as const },
  { patientId: 17, lines: [{ name: "EMG", rate: 14000 }], mode: "Insurance" as PaymentMode, status: "partial" as const },
  { patientId: 1, lines: [{ name: "BP Check", rate: 100 }], mode: "Cash" as PaymentMode, status: "paid" as const },
  { patientId: 6, lines: [{ name: "Dressing", rate: 300 }], mode: "Cash" as PaymentMode, status: "paid" as const },
  { patientId: 11, lines: [{ name: "Injection Admin", rate: 150 }, { name: "Nebulisation", rate: 400 }], mode: "Bank Transfer" as PaymentMode, status: "paid" as const },
  { patientId: 15, lines: [{ name: "Emergency Charges", rate: 1000 }], mode: "Cash" as PaymentMode, status: "unpaid" as const },
  { patientId: 19, lines: [{ name: "Dressing", rate: 300 }], mode: "Cash" as PaymentMode, status: "paid" as const },
  { patientId: 8, lines: [{ name: "IV Drip Setup", rate: 200 }], mode: "Cash" as PaymentMode, status: "paid" as const },
]

export const SERVICES_INVOICES: ServicesInvoice[] = SERVICE_INVOICE_SEED.map((seed, i) => {
  const lines = seed.lines.map((l, li) => ({
    id: `${i + 1}-${li}`, name: l.name, rate: l.rate, qty: 1, discountPct: 0, amount: l.rate,
  }))
  const subtotal = lines.reduce((s, l) => s + l.amount, 0)
  const netTotal = subtotal
  const amountReceived = seed.status === "paid" ? netTotal : seed.status === "partial" ? Math.round(netTotal * 0.5) : 0
  return {
    id: i + 1,
    invoiceNo: `SI-2024-${padId(i + 1)}`,
    encounterId: null,
    patientId: seed.patientId,
    doctorId: null,
    date: shiftDate(`2024-08-${String(10 + i).padStart(2, "0")}T${10 + (i % 6)}:00:00`),
    lines,
    subtotal,
    discountType: "flat",
    discount: 0,
    gstPct: 0,
    netTotal,
    paymentMode: seed.mode,
    amountReceived,
    balance: netTotal - amountReceived,
    status: seed.status,
  }
})

// ─── Payments (10) ──────────────────────────────────────────────────
export const PAYMENTS: PaymentRecord[] = Array.from({ length: 10 }).map((_, i) => {
  const patient = PATIENTS[(i * 3 + 2) % PATIENTS.length]
  return {
    id: i + 1,
    receiptNo: `PAY-2024-${padId(i + 1)}`,
    patientId: patient.id,
    date: shiftDate(`2024-08-${String(12 + i).padStart(2, "0")}T${String(9 + (i % 8)).padStart(2, "0")}:15:00`),
    amount: [500, 800, 1200, 2000, 650, 1500, 300, 1000, 900, 450][i],
    mode: MODES[i % MODES.length],
    against: i % 3 === 0 ? "Advance" : `CI-2024-${padId((i % 15) + 1)}`,
    referenceNo: i % 2 === 0 ? `REF-${1000 + i}` : undefined,
    receivedBy: "Ali Hassan",
  }
})

// ─── Receipts (5) ────────────────────────────────────────────────────
const RAW_RECEIPTS: ReceiptRecord[] = [
  { id: 1, receiptNo: "RCT-2024-0001", patientId: 5, type: "Advance Deposit", amount: 5000, date: "2024-08-05T10:00:00", balanceRemaining: 3200 },
  { id: 2, receiptNo: "RCT-2024-0002", patientId: 8, type: "Advance Deposit", amount: 2000, date: "2024-08-08T11:30:00", balanceRemaining: 800 },
  { id: 3, receiptNo: "RCT-2024-0003", patientId: 3, type: "Refund", amount: 500, date: "2024-08-11T14:00:00", balanceRemaining: 0 },
  { id: 4, receiptNo: "RCT-2024-0004", patientId: 12, type: "Credit Note", amount: 1200, date: "2024-08-14T09:45:00", balanceRemaining: 1200 },
  { id: 5, receiptNo: "RCT-2024-0005", patientId: 17, type: "Advance Deposit", amount: 10000, date: "2024-08-09T08:30:00", balanceRemaining: 4500 },
]
export const RECEIPTS: ReceiptRecord[] = RAW_RECEIPTS.map((r) => ({ ...r, date: shiftDate(r.date) }))

// ─── Expense Categories ───────────────────────────────────────────────
export const EXPENSE_CATEGORIES = [
  "Utilities", "Salaries", "Supplies", "Equipment", "Rent", "Maintenance", "Lab Reagents", "Miscellaneous",
]

// ─── Expenses (15) ─────────────────────────────────────────────────────
const RAW_EXPENSES: Expense[] = [
  { id: 1, date: "2024-08-01", category: "Rent", description: "Clinic monthly rent", amount: 25000, mode: "Bank", enteredBy: "Ali Hassan" },
  { id: 2, date: "2024-08-02", category: "Utilities", description: "Electricity bill", amount: 8500, mode: "Cash", enteredBy: "Ali Hassan" },
  { id: 3, date: "2024-08-03", category: "Supplies", description: "Medical supplies", amount: 3200, mode: "Cash", enteredBy: "Fatima Malik" },
  { id: 4, date: "2024-08-04", category: "Miscellaneous", description: "Chai / pantry supplies", amount: 800, mode: "Cash", enteredBy: "Fatima Malik" },
  { id: 5, date: "2024-08-05", category: "Supplies", description: "Medicine purchase - Zafar Traders", amount: 22000, mode: "Bank", enteredBy: "Omar Farooq" },
  { id: 6, date: "2024-08-06", category: "Salaries", description: "Nursing staff salary - Aug (advance)", amount: 15000, mode: "Bank", enteredBy: "Ali Hassan" },
  { id: 7, date: "2024-08-08", category: "Maintenance", description: "AC servicing - all rooms", amount: 4500, mode: "Cash", enteredBy: "Ali Hassan" },
  { id: 8, date: "2024-08-09", category: "Equipment", description: "New BP apparatus x2", amount: 6000, mode: "Cash", enteredBy: "Fatima Malik" },
  { id: 9, date: "2024-08-11", category: "Utilities", description: "Water bill", amount: 1200, mode: "Cash", enteredBy: "Ali Hassan" },
  { id: 10, date: "2024-08-12", category: "Lab Reagents", description: "Lab reagent restock", amount: 9800, mode: "Bank", enteredBy: "Zara Ahmed" },
  { id: 11, date: "2024-08-14", category: "Utilities", description: "Internet & phone bill", amount: 3500, mode: "Bank", enteredBy: "Ali Hassan" },
  { id: 12, date: "2024-08-16", category: "Miscellaneous", description: "Stationery & printing", amount: 1600, mode: "Cash", enteredBy: "Fatima Malik" },
  { id: 13, date: "2024-08-18", category: "Maintenance", description: "Plumbing repair", amount: 2200, mode: "Cash", enteredBy: "Ali Hassan" },
  { id: 14, date: "2024-08-20", category: "Equipment", description: "Nebulizer machine", amount: 8500, mode: "Bank", enteredBy: "Ali Hassan" },
  { id: 15, date: "2024-08-22", category: "Salaries", description: "Lab technician salary - Aug (advance)", amount: 12000, mode: "Bank", enteredBy: "Ali Hassan" },
]
export const EXPENSES: Expense[] = RAW_EXPENSES.map((e) => ({ ...e, date: shiftDate(e.date) }))

// ─── Bank Transactions (8) ───────────────────────────────────────────
const bankSeed: { date: string; description: string; debit: number; credit: number }[] = [
  { date: "2024-08-01", description: "Opening Balance", debit: 0, credit: 45000 },
  { date: "2024-08-02", description: "Cash deposit - Habib Bank", debit: 0, credit: 15000 },
  { date: "2024-08-05", description: "Medicine purchase payment", debit: 22000, credit: 0 },
  { date: "2024-08-06", description: "Cash deposit - Habib Bank", debit: 0, credit: 20000 },
  { date: "2024-08-08", description: "Rent payment", debit: 25000, credit: 0 },
  { date: "2024-08-12", description: "Lab reagent payment", debit: 9800, credit: 0 },
  { date: "2024-08-16", description: "Cash deposit - Habib Bank", debit: 0, credit: 18000 },
  { date: "2024-08-20", description: "Equipment purchase - nebulizer", debit: 8500, credit: 0 },
]
export const BANK_TRANSACTIONS: BankTransaction[] = bankSeed.map((b, i) => ({
  id: i + 1, date: shiftDate(b.date), description: b.description, debit: b.debit, credit: b.credit, bank: "Habib Bank Ltd", referenceNo: i % 2 === 0 ? `TXN-${5000 + i}` : undefined,
}))

export function bankRunningBalance(): { transaction: BankTransaction; balance: number }[] {
  let bal = 0
  return BANK_TRANSACTIONS.map((t) => {
    bal = bal - t.debit + t.credit
    return { transaction: t, balance: bal }
  })
}
