import type { ConsultationInvoice, Expense, ServicesInvoice } from "@/types"
import {
  BANK_TRANSACTIONS, CONSULTATION_INVOICES, EXPENSES, EXPENSE_CATEGORIES, PAYMENTS, RECEIPTS, SERVICES_INVOICES,
} from "@/data/billing"
import { ENCOUNTERS } from "@/data/encounters"
import { BANKS } from "@/data/settings"
import type { MoneyString } from "@/lib/api/types"
import { paginate } from "../listing"
import { bankStatementRows, consultationTotals, expenseTotalsFor, serviceLineAmount, servicesTotals } from "../financeHelpers"
import { compareMoney, isMoneyString, moneyFromNumber } from "../moneyMath"
import { legacyNumericId } from "../reference/refId"
import type {
  BankAccountRecord, BankAccountsService, BankTransactionRecord, BankTransactionsService, BillingPaymentRecord, BillingReceiptRecord, ConsultationInvoiceRecord,
  ConsultationInvoicesService, ExpenseCategoriesService, ExpenseCategoryRecord, ExpenseRecord, ExpensesService, PaymentsService, ReceiptsService,
  ServicesInvoiceRecord, ServicesInvoicesService,
} from "../types"
import { mockApiError } from "./mockError"

// Mutate the shared legacy arrays in place, as the screens used to do inline: billingAggregate, the reports, the dashboard's
// cash flow and the patient / encounter billing summaries still read them directly (as `number`s) and must keep seeing the
// same records. Mock mode understands only legacy numeric ids; anything else is rejected, never coerced. Money crosses the
// boundary as a string in the service records and as a `number` only inside the legacy arrays (demo data, converted by
// moneyFromNumber on the way out and Number() on the way in). Every rule here is a DEMO rule the screens already had; none
// is a documented backend rule.

const invalid = (details: { path: string; message: string }[]) => mockApiError(400, "VALIDATION_FAILED", "Validation failed", details)
const fieldError = (path: string, message: string) => invalid([{ path, message }])

function legacyId(value: string, path: string): number {
  const n = legacyNumericId(value)
  if (n === null) throw fieldError(path, "Mock mode only supports numeric legacy ids")
  return n
}

const padId = (n: number) => String(n).padStart(4, "0")
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const nonNegative = (v: string) => isMoneyString(v) && compareMoney(v, "0.00") >= 0
const positive = (v: string) => isMoneyString(v) && compareMoney(v, "0.00") > 0

/** Collects every problem, then throws once (so nothing is stored when anything is wrong). */
function check(problems: [boolean, string, string][]) {
  const details = problems.filter(([ok]) => !ok).map(([, path, message]) => ({ path, message }))
  if (details.length) throw invalid(details)
}

const optionalMoney = (n: number | undefined): MoneyString | undefined => (n === undefined ? undefined : moneyFromNumber(n))

// ── Consultation invoices ──────────────────────────────────────────────────────────────

function toConsultation(c: ConsultationInvoice): ConsultationInvoiceRecord {
  return {
    id: String(c.id), invoiceNo: c.invoiceNo, encounterId: c.encounterId === null ? null : String(c.encounterId), patientId: String(c.patientId),
    doctorId: String(c.doctorId), date: c.date, fee: moneyFromNumber(c.fee), includedInPackage: c.includedInPackage, subtotal: moneyFromNumber(c.subtotal),
    discountType: c.discountType, discount: moneyFromNumber(c.discount), gstPct: optionalMoney(c.gstPct), netTotal: moneyFromNumber(c.netTotal),
    paymentMode: c.paymentMode, creditCardAmount: optionalMoney(c.creditCardAmount), amountReceived: moneyFromNumber(c.amountReceived),
    balance: moneyFromNumber(c.balance), referenceNo: c.referenceNo, notes: c.notes, status: c.status,
  }
}

const matchesPatient = (patientId: number, wanted?: string) => !wanted || String(patientId) === wanted

export const mockConsultationInvoicesService: ConsultationInvoicesService = {
  async list(opts = {}) {
    const matches = CONSULTATION_INVOICES.filter((c) => matchesPatient(c.patientId, opts.patientId))
    return { items: paginate(matches, opts.page, opts.pageSize).map(toConsultation), total: matches.length }
  },

  async create(input) {
    const patientId = legacyId(input.patientId, "patientId")
    const doctorId = legacyId(input.doctorId, "doctorId")
    const encounterId = input.encounterId === undefined ? null : legacyId(input.encounterId, "encounterId")
    check([
      [encounterId === null || ENCOUNTERS.some((e) => e.id === encounterId), "encounterId", "Unknown encounter"],
      [nonNegative(input.fee), "fee", "Fee must be a non-negative amount"],
      [nonNegative(input.discount), "discount", "Discount must be a non-negative number"],
      [nonNegative(input.gstPct), "gstPct", "GST % must be a non-negative number"],
      [nonNegative(input.amountReceived), "amountReceived", "Amount received must be a non-negative amount"],
      [input.creditCardAmount === undefined || nonNegative(input.creditCardAmount), "creditCardAmount", "Credit card amount must be a non-negative amount"],
    ])
    const t = consultationTotals(input)
    const record: ConsultationInvoice = {
      id: Math.max(0, ...CONSULTATION_INVOICES.map((c) => c.id)) + 1,
      invoiceNo: `CI-2024-${padId(CONSULTATION_INVOICES.length + 1)}`,
      encounterId, patientId, doctorId, date: new Date().toISOString(),
      fee: Number(input.fee), includedInPackage: input.includedInPackage, subtotal: Number(t.subtotal),
      discountType: input.discountType, discount: Number(input.discount), gstPct: Number(input.gstPct), netTotal: Number(t.netTotal),
      paymentMode: input.paymentMode, creditCardAmount: input.paymentMode === "Card" && input.creditCardAmount !== undefined ? Number(input.creditCardAmount) : undefined,
      amountReceived: Number(input.amountReceived), balance: Number(t.balance), notes: input.notes, status: t.status,
    }
    CONSULTATION_INVOICES.push(record)
    return toConsultation(record)
  },
}

// ── Services invoices ──────────────────────────────────────────────────────────────────

function toServices(s: ServicesInvoice): ServicesInvoiceRecord {
  return {
    id: String(s.id), invoiceNo: s.invoiceNo, encounterId: s.encounterId === null ? null : String(s.encounterId), patientId: String(s.patientId),
    doctorId: s.doctorId === null ? null : String(s.doctorId), date: s.date, vitals: s.vitals,
    lines: s.lines.map((l) => ({ id: l.id, name: l.name, rate: moneyFromNumber(l.rate), qty: l.qty, discountPct: moneyFromNumber(l.discountPct), amount: moneyFromNumber(l.amount) })),
    subtotal: moneyFromNumber(s.subtotal), discountType: s.discountType, discount: moneyFromNumber(s.discount), gstPct: moneyFromNumber(s.gstPct),
    netTotal: moneyFromNumber(s.netTotal), paymentMode: s.paymentMode, amountReceived: moneyFromNumber(s.amountReceived), balance: moneyFromNumber(s.balance), status: s.status,
  }
}

export const mockServicesInvoicesService: ServicesInvoicesService = {
  async list(opts = {}) {
    const matches = SERVICES_INVOICES.filter((s) => matchesPatient(s.patientId, opts.patientId))
    return { items: paginate(matches, opts.page, opts.pageSize).map(toServices), total: matches.length }
  },

  async create(input) {
    const patientId = legacyId(input.patientId, "patientId")
    const doctorId = input.doctorId === undefined ? null : legacyId(input.doctorId, "doctorId")
    const encounterId = input.encounterId === undefined ? null : legacyId(input.encounterId, "encounterId")
    check([
      [encounterId === null || ENCOUNTERS.some((e) => e.id === encounterId), "encounterId", "Unknown encounter"],
      [input.lines.length > 0, "lines", "Add at least one service"],
      [nonNegative(input.discount), "discount", "Discount must be a non-negative number"],
      [nonNegative(input.gstPct), "gstPct", "GST % must be a non-negative number"],
      [nonNegative(input.amountReceived), "amountReceived", "Amount received must be a non-negative amount"],
      ...input.lines.flatMap((l, i): [boolean, string, string][] => [
        [l.name.trim().length > 0, `lines.${i}.name`, "Service name is required"],
        [nonNegative(l.rate), `lines.${i}.rate`, "Rate must be a non-negative amount"],
        [Number.isFinite(l.qty) && l.qty > 0, `lines.${i}.qty`, "Quantity must be greater than 0"],
        [nonNegative(l.discountPct), `lines.${i}.discountPct`, "Discount % must be a non-negative number"],
      ]),
    ])
    const id = Math.max(0, ...SERVICES_INVOICES.map((s) => s.id)) + 1
    const lines = input.lines.map((l, i) => ({ ...l, id: `${id}-${i}`, amount: serviceLineAmount(l.rate, l.qty, l.discountPct) }))
    const t = servicesTotals({ ...input, lines })
    const record: ServicesInvoice = {
      id, invoiceNo: `SI-2024-${padId(SERVICES_INVOICES.length + 1)}`, encounterId, patientId, doctorId, date: new Date().toISOString(), vitals: input.vitals,
      lines: lines.map((l) => ({ id: l.id, name: l.name, rate: Number(l.rate), qty: l.qty, discountPct: Number(l.discountPct), amount: Number(l.amount) })),
      subtotal: Number(t.subtotal), discountType: input.discountType, discount: Number(input.discount), gstPct: Number(input.gstPct), netTotal: Number(t.netTotal),
      paymentMode: input.paymentMode, amountReceived: Number(input.amountReceived), balance: Number(t.balance), status: t.status,
    }
    SERVICES_INVOICES.push(record)
    return toServices(record)
  },
}

// ── Payments and receipts ──────────────────────────────────────────────────────────────

function toPayment(p: (typeof PAYMENTS)[number]): BillingPaymentRecord {
  return {
    id: String(p.id), receiptNo: p.receiptNo, patientId: String(p.patientId), date: p.date, amount: moneyFromNumber(p.amount), mode: p.mode,
    against: p.against, referenceNo: p.referenceNo, notes: p.notes, receivedBy: p.receivedBy,
  }
}

export const mockPaymentsService: PaymentsService = {
  async list(opts = {}) {
    const matches = PAYMENTS.filter((p) => matchesPatient(p.patientId, opts.patientId))
    return { items: paginate(matches, opts.page, opts.pageSize).map(toPayment), total: matches.length }
  },

  async create(input) {
    const patientId = legacyId(input.patientId, "patientId")
    check([
      [positive(input.amount), "amount", "Amount must be greater than 0"],
      [DATE_RE.test(input.date), "date", "Date must be YYYY-MM-DD"],
    ])
    const record = {
      id: Math.max(0, ...PAYMENTS.map((p) => p.id)) + 1,
      receiptNo: `PAY-2024-${padId(PAYMENTS.length + 1)}`,
      patientId, date: input.date, amount: Number(input.amount), mode: input.mode,
      against: input.against?.trim() || "Advance", referenceNo: input.referenceNo?.trim() || undefined,
      receivedBy: "Ali Hassan", // demo attribution, as the dialog always stored; the form never asks who received it
    }
    PAYMENTS.unshift(record) // newest on top, as the dialog always did
    return toPayment(record)
  },
}

function toReceipt(r: (typeof RECEIPTS)[number]): BillingReceiptRecord {
  return { id: String(r.id), receiptNo: r.receiptNo, patientId: String(r.patientId), type: r.type, amount: moneyFromNumber(r.amount), date: r.date, balanceRemaining: moneyFromNumber(r.balanceRemaining), notes: r.notes }
}

export const mockReceiptsService: ReceiptsService = {
  async list(opts = {}) {
    const matches = RECEIPTS.filter((r) => matchesPatient(r.patientId, opts.patientId))
    return { items: paginate(matches, opts.page, opts.pageSize).map(toReceipt), total: matches.length }
  },

  async create(input) {
    const patientId = legacyId(input.patientId, "patientId")
    check([
      [positive(input.amount), "amount", "Amount must be greater than 0"],
      [DATE_RE.test(input.date), "date", "Date must be YYYY-MM-DD"],
    ])
    const record = {
      id: Math.max(0, ...RECEIPTS.map((r) => r.id)) + 1,
      receiptNo: `RCT-2024-${padId(RECEIPTS.length + 1)}`,
      patientId, type: input.type, amount: Number(input.amount), date: input.date,
      balanceRemaining: 0, // as the dialog always stored; how a receipt's remaining balance is derived is CONTRACT REQUIRED
    }
    RECEIPTS.unshift(record)
    return toReceipt(record)
  },
}

// ── Expense heads (categories) ─────────────────────────────────────────────────────────
// The demo heads are plain strings in EXPENSE_CATEGORIES. Stable ids are minted here (never derived from list position), so a
// rename keeps its id. Renaming a head also renames it on the expenses that carry it, standing in for the real backend
// referencing a head by id (CONTRACT REQUIRED). Removing a head leaves existing expenses untouched, as the screen always did.

let nextHeadId = 1
const headIds = new Map<string, number>()

function heads(): ExpenseCategoryRecord[] {
  for (const name of EXPENSE_CATEGORIES) if (!headIds.has(name)) headIds.set(name, nextHeadId++)
  for (const name of [...headIds.keys()]) if (!EXPENSE_CATEGORIES.includes(name)) headIds.delete(name)
  return EXPENSE_CATEGORIES.map((name) => ({ id: String(headIds.get(name)), name }))
}

function findHead(id: string): ExpenseCategoryRecord {
  const head = heads().find((h) => h.id === id)
  if (!head) throw mockApiError(404, "NOT_FOUND", "Expense category not found")
  return head
}

export const mockExpenseCategoriesService: ExpenseCategoriesService = {
  async list(opts = {}) {
    const all = heads()
    return { items: paginate(all, opts.page, opts.pageSize), total: all.length }
  },

  async create(input) {
    check([[input.name.trim().length > 0, "name", "Category name is required"]])
    EXPENSE_CATEGORIES.push(input.name.trim())
    return heads()[EXPENSE_CATEGORIES.length - 1]
  },

  async update(id, input) {
    const head = findHead(id)
    check([[input.name.trim().length > 0, "name", "Category name is required"]])
    const name = input.name.trim()
    const idx = EXPENSE_CATEGORIES.indexOf(head.name)
    EXPENSE_CATEGORIES[idx] = name
    headIds.delete(head.name)
    headIds.set(name, Number(id))
    EXPENSES.forEach((e, i) => { if (e.category === head.name) EXPENSES[i] = { ...e, category: name } })
    return { id, name }
  },

  async remove(id) {
    const head = findHead(id)
    EXPENSE_CATEGORIES.splice(EXPENSE_CATEGORIES.indexOf(head.name), 1)
    headIds.delete(head.name)
  },
}

// ── Expenses ───────────────────────────────────────────────────────────────────────────

function toExpense(e: Expense): ExpenseRecord {
  const head = heads().find((h) => h.name === e.category)
  return { id: String(e.id), date: e.date, categoryId: head?.id ?? "", categoryName: e.category, description: e.description, amount: moneyFromNumber(e.amount), mode: e.mode, enteredBy: e.enteredBy }
}

export const mockExpensesService: ExpensesService = {
  async list(opts = {}) {
    return { items: paginate(EXPENSES, opts.page, opts.pageSize).map(toExpense), total: EXPENSES.length }
  },

  async create(input) {
    const head = heads().find((h) => h.id === input.categoryId)
    check([
      [DATE_RE.test(input.date), "date", "Date must be YYYY-MM-DD"],
      [head !== undefined, "categoryId", "Unknown expense category"],
      [input.description.trim().length > 0, "description", "Description is required"],
      [positive(input.amount), "amount", "Amount must be greater than 0"],
      [input.mode === "Cash" || input.mode === "Bank", "mode", "Mode must be Cash or Bank"],
    ])
    const record: Expense = {
      id: Math.max(0, ...EXPENSES.map((e) => e.id)) + 1, date: input.date, category: head!.name, description: input.description,
      amount: Number(input.amount), mode: input.mode,
      enteredBy: "Ali Hassan", // demo attribution, as the dialog always stored
    }
    EXPENSES.push(record)
    return toExpense(record)
  },

  async totals(opts = {}) {
    const inPeriod = EXPENSES.filter((e) => (!opts.dateFrom || e.date.slice(0, 10) >= opts.dateFrom) && (!opts.dateTo || e.date.slice(0, 10) <= opts.dateTo))
    return expenseTotalsFor(inPeriod.map(toExpense), heads())
  },
}

// ── Bank accounts and transactions ─────────────────────────────────────────────────────

const toBankAccount = (b: (typeof BANKS)[number]): BankAccountRecord => ({ id: String(b.id), bankName: b.bankName, accountTitle: b.accountTitle, accountNo: b.accountNo, branch: b.branch, active: b.active })

export const mockBankAccountsService: BankAccountsService = {
  async list(opts = {}) {
    return { items: paginate(BANKS, opts.page, opts.pageSize).map(toBankAccount), total: BANKS.length }
  },

  async create(input) {
    check([[input.bankName.trim().length > 0, "bankName", "Bank Name is required"], [input.accountNo.trim().length > 0, "accountNo", "Account No. is required"]])
    const record = { id: Math.max(0, ...BANKS.map((b) => b.id)) + 1, bankName: input.bankName, accountTitle: input.accountTitle, accountNo: input.accountNo, branch: input.branch, active: input.active ?? true }
    BANKS.push(record)
    return toBankAccount(record)
  },

  async update(id, input) {
    const idx = BANKS.findIndex((b) => String(b.id) === id)
    if (idx < 0) throw mockApiError(404, "NOT_FOUND", "Bank account not found")
    check([[input.bankName.trim().length > 0, "bankName", "Bank Name is required"], [input.accountNo.trim().length > 0, "accountNo", "Account No. is required"]])
    BANKS[idx] = { ...BANKS[idx], bankName: input.bankName, accountTitle: input.accountTitle, accountNo: input.accountNo, branch: input.branch, active: input.active ?? BANKS[idx].active }
    return toBankAccount(BANKS[idx])
  },
}

function toBankTransaction(t: (typeof BANK_TRANSACTIONS)[number]): BankTransactionRecord {
  const account = BANKS.find((b) => b.bankName === t.bank)
  return {
    id: String(t.id), date: t.date, description: t.description, debit: moneyFromNumber(t.debit), credit: moneyFromNumber(t.credit), bank: t.bank,
    bankAccountId: account === undefined ? undefined : String(account.id), referenceNo: t.referenceNo, cashMovement: t.cashMovement,
  }
}

export const mockBankTransactionsService: BankTransactionsService = {
  async statement(opts = {}) {
    // The running balance needs every earlier row, so it is computed over the whole ledger and only then paged.
    const rows = bankStatementRows(BANK_TRANSACTIONS.map(toBankTransaction))
    return { items: paginate(rows, opts.page, opts.pageSize), total: rows.length }
  },

  async create(input) {
    const account = BANKS.find((b) => String(b.id) === input.bankAccountId)
    check([
      [account !== undefined, "bankAccountId", "Unknown bank account"],
      [DATE_RE.test(input.date), "date", "Date must be YYYY-MM-DD"],
      [positive(input.amount), "amount", "Amount must be greater than 0"],
      [input.description.trim().length > 0, "description", "Description is required"],
    ])
    const amount = Number(input.amount)
    const record = {
      id: Math.max(0, ...BANK_TRANSACTIONS.map((b) => b.id)) + 1,
      date: input.date,
      description: `${input.description} — ${account!.bankName}`, // as the dialog always stored it
      debit: input.direction === "Withdrawal" ? amount : 0,
      credit: input.direction === "Deposit" ? amount : 0,
      bank: account!.bankName, referenceNo: input.referenceNo?.trim() || undefined,
    }
    BANK_TRANSACTIONS.push(record)
    return toBankTransaction(record)
  },
}
