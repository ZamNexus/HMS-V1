import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { BANK_TRANSACTIONS, CONSULTATION_INVOICES, EXPENSES, EXPENSE_CATEGORIES, PAYMENTS, RECEIPTS, SERVICES_INVOICES, bankRunningBalance } from "@/data/billing"
import { BANKS } from "@/data/settings"
import { ENDPOINTS, type EndpointKey } from "./endpoints"
import { NotConnectedError } from "./errors"
import { FINANCE_OPERATIONS, financeContractStatus } from "./financeContract"
import { bankStatementRows, consultationTotals, expenseTotalsFor, paymentStatusFor, serviceLineAmount, servicesTotals } from "./financeHelpers"
import {
  httpBankAccountsService, httpBankTransactionsService, httpConsultationInvoicesService, httpExpenseCategoriesService, httpExpensesService, httpPaymentsService,
  httpReceiptsService, httpServicesInvoicesService,
} from "./http/finance"
import { bankAccountsService, expenseCategoriesService } from "./index"
import {
  mockBankAccountsService, mockBankTransactionsService, mockConsultationInvoicesService, mockExpenseCategoriesService, mockExpensesService, mockPaymentsService,
  mockReceiptsService, mockServicesInvoicesService,
} from "./mock/finance"
import {
  addMoney, compareMoney, floorAtZero, formatMoneyString, moneyFromInputNumber, moneyFromNumber, multiplyMoney, normalizeMoneyInput, percentOfMoney, subMoney, sumMoney,
} from "./moneyMath"
import { loadShared } from "./reference/cache"
import type { ConsultationInvoiceInput, ServicesInvoiceInput } from "./types"

// Frontend-only unit tests with controlled data. They verify the exact-decimal helpers, the UI-facing behaviour of the mock
// adapters, and that the real-backend adapters send nothing while the contract is unconfirmed. None of them says anything
// about the real backend, whose Billing / Expenses / Bank contract is not published. (Screens are verified in a browser.)

const ULID = "01ARZ3NDEKTSV4RRFFQ69G5FAV"
const snap = <T,>(a: T[]) => structuredClone(a)
const SNAPSHOTS = {
  consultations: snap(CONSULTATION_INVOICES), services: snap(SERVICES_INVOICES), payments: snap(PAYMENTS), receipts: snap(RECEIPTS),
  expenses: snap(EXPENSES), categories: [...EXPENSE_CATEGORIES], banks: snap(BANKS), bank: snap(BANK_TRANSACTIONS),
}
function restore<T>(target: T[], source: T[]) { target.splice(0, target.length, ...structuredClone(source)) }
beforeEach(() => {
  restore(CONSULTATION_INVOICES, SNAPSHOTS.consultations); restore(SERVICES_INVOICES, SNAPSHOTS.services); restore(PAYMENTS, SNAPSHOTS.payments)
  restore(RECEIPTS, SNAPSHOTS.receipts); restore(EXPENSES, SNAPSHOTS.expenses); restore(EXPENSE_CATEGORIES, SNAPSHOTS.categories)
  restore(BANKS, SNAPSHOTS.banks); restore(BANK_TRANSACTIONS, SNAPSHOTS.bank)
})
afterEach(() => {
  vi.unstubAllGlobals()
  for (const k of FINANCE_OPERATIONS) ENDPOINTS[k] = null
})

const consult: ConsultationInvoiceInput = {
  patientId: "2", doctorId: "2", fee: "1500.00", includedInPackage: false, discountType: "percent", discount: "10", gstPct: "5",
  paymentMode: "Cash", amountReceived: "1000.00", notes: "n",
}
const svcInput: ServicesInvoiceInput = {
  patientId: "2", doctorId: "2", discountType: "flat", discount: "40.00", gstPct: "0", paymentMode: "Cash", amountReceived: "600.00",
  lines: [{ name: "Dressing", rate: "300.00", qty: 2, discountPct: "10" }, { name: "BP Check", rate: "100.00", qty: 1, discountPct: "0" }],
}

describe("exact decimal money helpers", () => {
  it("adds, subtracts and sums without floating-point error", () => {
    expect(0.1 + 0.2).not.toBe(0.3) // the failure mode this avoids
    expect(addMoney("0.10", "0.20")).toBe("0.30")
    expect(subMoney("1.00", "0.99")).toBe("0.01")
    expect(sumMoney(["19.99", "0.01", "-5.50"])).toBe("14.50")
    expect(sumMoney([])).toBe("0.00")
    expect(addMoney("1500", "0.5")).toBe("1500.50")
  })

  it("compares, floors at zero and keeps the sign of negatives", () => {
    expect([compareMoney("1.00", "2.00"), compareMoney("2.00", "2"), compareMoney("3.10", "3.09")]).toEqual([-1, 0, 1])
    expect(floorAtZero("-0.01")).toBe("0.00")
    expect(floorAtZero("5.00")).toBe("5.00")
    expect(subMoney("1.00", "2.50")).toBe("-1.50")
  })

  it("takes a percentage, rounding half away from zero to two decimals", () => {
    expect(percentOfMoney("1500.00", "10")).toBe("150.00")
    expect(percentOfMoney("100.00", "33.33")).toBe("33.33")
    expect(percentOfMoney("0.05", "50")).toBe("0.03") // 0.025 rounds up
    expect(percentOfMoney("-0.05", "50")).toBe("-0.03")
    expect(percentOfMoney("1350.00", "5")).toBe("67.50")
    expect(multiplyMoney("300.00", "2")).toBe("600.00")
    expect(multiplyMoney("19.99", "3")).toBe("59.97")
  })

  it("refuses anything that is not a plain decimal string with at most two decimals (no silent rounding)", () => {
    for (const bad of ["1.234", "abc", "", "1e3", " 1", "1,000.00", "--1"]) expect(() => addMoney(bad, "1.00"), bad).toThrow(TypeError)
    expect(() => addMoney(1500 as unknown as string, "1.00")).toThrow(TypeError)
    expect(() => percentOfMoney("10.00", "1.234")).toThrow(TypeError)
  })

  it("converts typed input strictly: a third decimal is an error, not a rounding", () => {
    expect(moneyFromInputNumber(1500.5)).toBe("1500.50")
    expect(moneyFromInputNumber(0.07)).toBe("0.07")
    expect(moneyFromInputNumber(0.015)).toBeNull()
    expect(moneyFromInputNumber(NaN)).toBeNull()
    expect(normalizeMoneyInput(" 1500 ")).toBe("1500.00")
    expect(normalizeMoneyInput("12.5")).toBe("12.50")
    expect(normalizeMoneyInput("")).toBeNull()
    expect(normalizeMoneyInput("12.345")).toBeNull()
  })

  it("legacy demo numbers are rounded to two decimals only at the mock boundary", () => {
    expect(moneyFromNumber(1275.5)).toBe("1275.50")
    expect(moneyFromNumber(0)).toBe("0.00")
    expect(() => moneyFromNumber(Infinity)).toThrow(TypeError)
  })

  it("displays without floating point: paisa only when present", () => {
    expect(formatMoneyString("1500.00")).toBe("Rs. 1,500")
    expect(formatMoneyString("1417.50")).toBe("Rs. 1,417.50")
    expect(formatMoneyString("0.00")).toBe("Rs. 0")
    expect(formatMoneyString("-12.05")).toBe("Rs. -12.05")
    expect(formatMoneyString("-89040.00")).toBe("Rs. -89,040")
    expect(formatMoneyString("9007199254740993.00")).toMatch(/9,?007,?199,?254,?740,?993/) // beyond Number's exact range
  })
})

describe("finance helpers (demo rules, exact arithmetic)", () => {
  it("consultation totals: percent discount, then GST, then balance and status", () => {
    const t = consultationTotals({ fee: "1500.00", includedInPackage: false, discountType: "percent", discount: "10", gstPct: "5", amountReceived: "1000.00" })
    expect(t).toEqual({ subtotal: "1500.00", afterDiscount: "1350.00", gst: "67.50", netTotal: "1417.50", balance: "417.50", status: "partial" })
    expect(consultationTotals({ fee: "1500.00", includedInPackage: true, discountType: "flat", discount: "0", gstPct: "0", amountReceived: "0" })).toMatchObject({ subtotal: "0.00", netTotal: "0.00", balance: "0.00", status: "paid" })
    expect(consultationTotals({ fee: "100.00", includedInPackage: false, discountType: "flat", discount: "250.00", gstPct: "0", amountReceived: "0" }).netTotal).toBe("0.00") // never below zero
  })

  it("status: nothing owing is paid, something received is partial, otherwise unpaid; over-payment leaves no balance", () => {
    expect([paymentStatusFor("0.00", "10.00"), paymentStatusFor("5.00", "10.00"), paymentStatusFor("5.00", "0.00")]).toEqual(["paid", "partial", "unpaid"])
    expect(consultationTotals({ fee: "100.00", includedInPackage: false, discountType: "flat", discount: "0", gstPct: "0", amountReceived: "150.00" }).balance).toBe("0.00")
  })

  it("services totals and line amounts", () => {
    expect(serviceLineAmount("300.00", 2, "10")).toBe("540.00")
    expect(serviceLineAmount("100.00", 1, "0")).toBe("100.00")
    expect(servicesTotals({ lines: [{ amount: "540.00" }, { amount: "100.00" }], discountType: "flat", discount: "40.00", gstPct: "0", amountReceived: "600.00" })).toMatchObject({ subtotal: "640.00", netTotal: "600.00", balance: "0.00", status: "paid" })
  })

  it("bank statement: credits add, debits subtract, in the order given", () => {
    const tx = (debit: string, credit: string) => ({ id: "1", date: "d", description: "x", debit, credit, bank: "b" })
    expect(bankStatementRows([tx("0.00", "100.00"), tx("30.25", "0.00"), tx("0.00", "0.10")]).map((r) => r.balance)).toEqual(["100.00", "69.75", "69.85"])
  })

  it("expense totals by head leave out heads with nothing spent", () => {
    const e = (categoryId: string, amount: string) => ({ id: "1", date: "d", categoryId, categoryName: categoryId, description: "x", amount, mode: "Cash" as const, enteredBy: "u" })
    expect(expenseTotalsFor([e("a", "10.10"), e("a", "0.20"), e("c", "5.00")], [{ id: "a", name: "A" }, { id: "b", name: "B" }, { id: "c", name: "C" }])).toEqual({
      total: "15.30", byCategory: [{ categoryId: "a", categoryName: "A", total: "10.30" }, { categoryId: "c", categoryName: "C", total: "5.00" }],
    })
  })
})

describe("contract-pending behaviour (API mode)", () => {
  const nullKeys = FINANCE_OPERATIONS as readonly EndpointKey[]

  it("has no endpoint configured for any Billing, Expenses or Bank operation", () => {
    expect(nullKeys).toHaveLength(20)
    for (const k of nullKeys) expect(ENDPOINTS[k], k).toBeNull()
  })

  it("every HTTP operation sends no request and reports 'awaiting the backend contract' (no fake success)", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const calls = [
      httpConsultationInvoicesService.list(), httpConsultationInvoicesService.create(consult),
      httpServicesInvoicesService.list(), httpServicesInvoicesService.create(svcInput),
      httpPaymentsService.list(), httpPaymentsService.create({ patientId: "1", date: "2026-01-01", amount: "10.00", mode: "Cash" }),
      httpReceiptsService.list(), httpReceiptsService.create({ patientId: "1", type: "Advance Deposit", amount: "10.00", date: "2026-01-01" }),
      httpExpenseCategoriesService.list(), httpExpenseCategoriesService.create({ name: "x" }), httpExpenseCategoriesService.update("1", { name: "x" }), httpExpenseCategoriesService.remove("1"),
      httpExpensesService.list(), httpExpensesService.create({ date: "2026-01-01", categoryId: "1", description: "x", amount: "10.00", mode: "Cash" }), httpExpensesService.totals(),
      httpBankAccountsService.list(), httpBankAccountsService.create({ bankName: "b", accountTitle: "t", accountNo: "1", branch: "x" }), httpBankAccountsService.update("1", { bankName: "b", accountTitle: "t", accountNo: "1", branch: "x" }),
      httpBankTransactionsService.statement(), httpBankTransactionsService.create({ date: "2026-01-01", bankAccountId: "1", direction: "Deposit", amount: "10.00", description: "x" }),
    ]
    expect(calls).toHaveLength(20) // one per operation
    for (const c of calls) await expect(c).rejects.toBeInstanceOf(NotConnectedError)
    for (const c of calls) await expect(c).rejects.toThrow(/awaiting the backend contract/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("even with paths configured, sends nothing until the request/response mapping is implemented", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ items: [], total: 0 }), { headers: { "content-type": "application/json" } }))
    vi.stubGlobal("fetch", fetchMock)
    for (const k of nullKeys) ENDPOINTS[k] = { method: k.endsWith(".create") ? "POST" : "GET", path: "/hypothetical" } // test-only
    await expect(httpExpensesService.list()).rejects.toThrow(/query parameters/)
    await expect(httpExpensesService.create({ date: "2026-01-01", categoryId: "1", description: "x", amount: "10.00", mode: "Cash" })).rejects.toThrow(/request payload/)
    await expect(httpBankTransactionsService.statement()).rejects.toThrow(/query parameters/)
    await expect(httpPaymentsService.create({ patientId: "1", date: "2026-01-01", amount: "10.00", mode: "Cash" })).rejects.toThrow(/request payload/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("the HTTP adapters can never fall back to demo data (finance.ts is among the files that import nothing from src/data or the mocks)", () => {
    const dir = join(__dirname, "http")
    const files = readdirSync(dir).filter((f) => f.endsWith(".ts"))
    expect(files).toContain("finance.ts")
    expect(readFileSync(join(dir, "finance.ts"), "utf8")).not.toMatch(/from\s+["'][^"']*(\/data\/|\/mock\/)/)
  })

  it("the contract status: API mode with every key null is pending with all 20 operations missing; mock mode never is; one key at a time", () => {
    const api = financeContractStatus("api")
    expect(api.pending).toBe(true)
    expect(api.missing).toHaveLength(20)
    expect(FINANCE_OPERATIONS.some((op) => api.can(op))).toBe(false)
    expect(financeContractStatus("mock")).toMatchObject({ pending: false, missing: [] })
    const table = { ...ENDPOINTS, "expenses.list": { method: "GET" as const, path: "/hypothetical" } } // copy, test-only
    const one = financeContractStatus("api", table)
    expect(one.can("expenses.list")).toBe(true)
    expect(one.can("expenses.create")).toBe(false)
    expect(one.canAll(["expenses.list", "expenses.create"])).toBe(false)
    expect(one.missingOf(["expenses.list", "expenses.create"])).toEqual(["expenses.create"])
  })
})

describe("mock consultation invoices", () => {
  it("lists string-id records with money strings, and shares the legacy array", async () => {
    const { items, total } = await mockConsultationInvoicesService.list()
    expect(total).toBe(CONSULTATION_INVOICES.length)
    expect(items.every((c) => typeof c.id === "string" && typeof c.patientId === "string" && typeof c.fee === "string" && /^-?\d+\.\d{2}$/.test(c.netTotal))).toBe(true)
    expect((await mockConsultationInvoicesService.list({ page: 2, pageSize: 10 })).items).toHaveLength(5)
    const pid = String(CONSULTATION_INVOICES[0].patientId)
    expect((await mockConsultationInvoicesService.list({ patientId: pid })).items.every((c) => c.patientId === pid)).toBe(true)
  })

  it("creates an invoice with exact totals and a derived status; the legacy array gets a numeric record", async () => {
    const before = CONSULTATION_INVOICES.length
    const rec = await mockConsultationInvoicesService.create(consult)
    expect(rec).toMatchObject({ patientId: "2", doctorId: "2", encounterId: null, fee: "1500.00", subtotal: "1500.00", netTotal: "1417.50", amountReceived: "1000.00", balance: "417.50", status: "partial" })
    expect(rec.invoiceNo).toMatch(/^CI-2024-\d{4}$/)
    expect(CONSULTATION_INVOICES).toHaveLength(before + 1)
    expect(CONSULTATION_INVOICES.at(-1)).toMatchObject({ patientId: 2, doctorId: 2, netTotal: 1417.5, balance: 417.5, status: "partial" })
  })

  it("a package invoice has nothing to pay; a Card payment keeps its card amount; links an existing encounter", async () => {
    expect(await mockConsultationInvoicesService.create({ ...consult, includedInPackage: true, amountReceived: "0.00" })).toMatchObject({ subtotal: "0.00", netTotal: "0.00", status: "paid" })
    expect((await mockConsultationInvoicesService.create({ ...consult, paymentMode: "Card", creditCardAmount: "500.00" })).creditCardAmount).toBe("500.00")
    const enc = String(CONSULTATION_INVOICES.find((c) => c.encounterId !== null)!.encounterId)
    expect((await mockConsultationInvoicesService.create({ ...consult, encounterId: enc })).encounterId).toBe(enc)
  })

  it("validates everything and stores nothing; never coerces a non-numeric id", async () => {
    const before = JSON.stringify(CONSULTATION_INVOICES)
    const bad: Partial<ConsultationInvoiceInput>[] = [
      { patientId: ULID }, { doctorId: "007" }, { encounterId: "99999" }, { fee: "-1.00" }, { fee: "12.345" }, { discount: "-5" }, { gstPct: "abc" }, { amountReceived: "-0.01" }, { creditCardAmount: "x" },
    ]
    for (const b of bad) await expect(mockConsultationInvoicesService.create({ ...consult, ...b }), JSON.stringify(b)).rejects.toMatchObject({ status: 400 })
    expect(JSON.stringify(CONSULTATION_INVOICES)).toBe(before)
  })
})

describe("mock services invoices", () => {
  it("creates an invoice with exact line and invoice totals", async () => {
    const before = SERVICES_INVOICES.length
    const rec = await mockServicesInvoicesService.create(svcInput)
    expect(rec.lines.map((l) => [l.name, l.amount])).toEqual([["Dressing", "540.00"], ["BP Check", "100.00"]])
    expect(rec).toMatchObject({ subtotal: "640.00", netTotal: "600.00", amountReceived: "600.00", balance: "0.00", status: "paid", doctorId: "2", encounterId: null })
    expect(SERVICES_INVOICES).toHaveLength(before + 1)
    expect(SERVICES_INVOICES.at(-1)).toMatchObject({ patientId: 2, netTotal: 600, status: "paid" })
  })

  it("doctor and encounter are optional; lines are required and each is validated; nothing stored on failure", async () => {
    expect((await mockServicesInvoicesService.create({ ...svcInput, doctorId: undefined })).doctorId).toBeNull()
    const n = SERVICES_INVOICES.length
    await expect(mockServicesInvoicesService.create({ ...svcInput, lines: [] })).rejects.toMatchObject({ status: 400, body: { details: [{ path: "lines" }] } })
    await expect(mockServicesInvoicesService.create({ ...svcInput, lines: [{ name: " ", rate: "-1.00", qty: 0, discountPct: "x" }] })).rejects.toMatchObject({
      status: 400, body: { details: [{ path: "lines.0.name" }, { path: "lines.0.rate" }, { path: "lines.0.qty" }, { path: "lines.0.discountPct" }] },
    })
    await expect(mockServicesInvoicesService.create({ ...svcInput, patientId: ULID })).rejects.toMatchObject({ status: 400 })
    expect(SERVICES_INVOICES).toHaveLength(n)
  })
})

describe("mock payments and receipts", () => {
  it("records a payment on top with an exact amount, defaulting 'against' to Advance", async () => {
    const n = PAYMENTS.length
    const p = await mockPaymentsService.create({ patientId: "3", date: "2026-02-03", amount: "1250.75", mode: "Card", referenceNo: " R-1 " })
    expect(p).toMatchObject({ patientId: "3", amount: "1250.75", against: "Advance", referenceNo: "R-1", mode: "Card" })
    expect(p.receiptNo).toMatch(/^PAY-2024-\d{4}$/)
    expect(PAYMENTS).toHaveLength(n + 1)
    expect(PAYMENTS[0]).toMatchObject({ patientId: 3, amount: 1250.75 })
    expect((await mockPaymentsService.list()).items[0].id).toBe(p.id)
  })

  it("records a receipt of any documented type; rejects bad input without storing", async () => {
    const r = await mockReceiptsService.create({ patientId: "5", type: "Refund", amount: "20.00", date: "2026-02-03" })
    expect(r).toMatchObject({ type: "Refund", amount: "20.00", balanceRemaining: "0.00" })
    const [np, nr] = [PAYMENTS.length, RECEIPTS.length]
    for (const amount of ["0.00", "-5.00", "1.234", "abc"]) {
      await expect(mockPaymentsService.create({ patientId: "3", date: "2026-02-03", amount, mode: "Cash" })).rejects.toMatchObject({ status: 400, body: { details: [{ path: "amount" }] } })
    }
    await expect(mockPaymentsService.create({ patientId: ULID, date: "2026-02-03", amount: "1.00", mode: "Cash" })).rejects.toMatchObject({ status: 400 })
    await expect(mockReceiptsService.create({ patientId: "5", type: "Refund", amount: "1.00", date: "03/02/2026" })).rejects.toMatchObject({ status: 400, body: { details: [{ path: "date" }] } })
    expect([PAYMENTS.length, RECEIPTS.length]).toEqual([np, nr + 0])
  })
})

describe("mock expense heads and expenses (T6)", () => {
  it("lists heads with stable string ids; creates, renames (expenses follow) and removes them", async () => {
    const before = (await mockExpenseCategoriesService.list()).items
    expect(before.map((h) => h.name)).toEqual(EXPENSE_CATEGORIES)
    expect(new Set(before.map((h) => h.id)).size).toBe(before.length)
    const created = await mockExpenseCategoriesService.create({ name: "  Security  " })
    expect(created.name).toBe("Security")
    const utilities = before.find((h) => h.name === "Utilities")!
    const renamed = await mockExpenseCategoriesService.update(utilities.id, { name: "Utility Bills" })
    expect(renamed).toEqual({ id: utilities.id, name: "Utility Bills" })
    expect(EXPENSES.filter((e) => e.category === "Utility Bills")).toHaveLength(SNAPSHOTS.expenses.filter((e) => e.category === "Utilities").length)
    expect(EXPENSES.some((e) => e.category === "Utilities")).toBe(false)
    await mockExpenseCategoriesService.remove(created.id)
    expect(EXPENSE_CATEGORIES).not.toContain("Security")
    for (const id of ["99999", ULID]) {
      await expect(mockExpenseCategoriesService.update(id, { name: "x" })).rejects.toMatchObject({ status: 404 })
      await expect(mockExpenseCategoriesService.remove(id)).rejects.toMatchObject({ status: 404 })
    }
    await expect(mockExpenseCategoriesService.create({ name: "  " })).rejects.toMatchObject({ status: 400, body: { details: [{ path: "name" }] } })
  })

  it("lists string-id expenses with money strings; creates one against a head, with demo attribution", async () => {
    const { items, total } = await mockExpensesService.list()
    expect(total).toBe(EXPENSES.length)
    expect(items.every((e) => typeof e.id === "string" && e.categoryId !== "" && /^\d+\.\d{2}$/.test(e.amount))).toBe(true)
    const head = (await mockExpenseCategoriesService.list()).items.find((h) => h.name === "Rent")!
    const rec = await mockExpensesService.create({ date: "2026-03-04", categoryId: head.id, description: "Office rent", amount: "25000.50", mode: "Bank" })
    expect(rec).toMatchObject({ categoryId: head.id, categoryName: "Rent", amount: "25000.50", mode: "Bank", enteredBy: "Ali Hassan" })
    expect(EXPENSES.at(-1)).toMatchObject({ category: "Rent", amount: 25000.5, mode: "Bank" })
  })

  it("does not assume an expense is paid or approved: no status field is invented", async () => {
    const head = (await mockExpenseCategoriesService.list()).items[0]
    const rec = await mockExpensesService.create({ date: "2026-03-04", categoryId: head.id, description: "x", amount: "1.00", mode: "Cash" })
    expect(Object.keys(rec).sort()).toEqual(["amount", "categoryId", "categoryName", "date", "description", "enteredBy", "id", "mode"])
  })

  it("rejects bad input and stores nothing (unknown head, ULID head, zero / negative / 3-decimal amount, bad date, blank description)", async () => {
    const head = (await mockExpenseCategoriesService.list()).items[0]
    const n = EXPENSES.length
    const ok = { date: "2026-03-04", categoryId: head.id, description: "x", amount: "1.00", mode: "Cash" as const }
    const bad = [{ categoryId: "99999" }, { categoryId: ULID }, { amount: "0.00" }, { amount: "-1.00" }, { amount: "1.005" }, { date: "4/3/2026" }, { description: "  " }, { mode: "Cheque" as unknown as "Cash" }]
    for (const b of bad) await expect(mockExpensesService.create({ ...ok, ...b }), JSON.stringify(b)).rejects.toMatchObject({ status: 400 })
    expect(EXPENSES).toHaveLength(n)
  })

  it("totals by head are exact, leave out unused heads, and can be limited to a period", async () => {
    const t = await mockExpensesService.totals()
    expect(t.total).toBe("123800.00")
    expect(t.total).toBe(sumMoney(EXPENSES.map((e) => moneyFromNumber(e.amount))))
    expect(t.byCategory.find((c) => c.categoryName === "Rent")?.total).toBe("25000.00")
    expect(t.byCategory.map((c) => c.categoryName)).not.toContain("Nothing Spent")
    const aug = await mockExpensesService.totals({ dateFrom: EXPENSES[0].date.slice(0, 10), dateTo: EXPENSES[0].date.slice(0, 10) })
    expect(aug.total).toBe(moneyFromNumber(EXPENSES.filter((e) => e.date.slice(0, 10) === EXPENSES[0].date.slice(0, 10)).reduce((s, e) => s + e.amount, 0)))
  })
})

describe("mock bank accounts and transactions (T7)", () => {
  it("lists, creates, edits and toggles accounts; unknown ids (a ULID included) are 404", async () => {
    expect((await mockBankAccountsService.list()).items.map((b) => b.bankName)).toEqual(BANKS.map((b) => b.bankName))
    const a = await mockBankAccountsService.create({ bankName: "Test Bank", accountTitle: "T", accountNo: "123", branch: "B" })
    expect(a).toMatchObject({ bankName: "Test Bank", active: true })
    const edited = await mockBankAccountsService.update(a.id, { bankName: "Test Bank 2", accountTitle: "T", accountNo: "123", branch: "B" })
    expect(edited).toMatchObject({ bankName: "Test Bank 2", active: true }) // an edit without `active` keeps it
    expect((await mockBankAccountsService.update(a.id, { bankName: "Test Bank 2", accountTitle: "T", accountNo: "123", branch: "B", active: false })).active).toBe(false)
    for (const id of ["99999", ULID]) await expect(mockBankAccountsService.update(id, { bankName: "x", accountTitle: "", accountNo: "1", branch: "" })).rejects.toMatchObject({ status: 404 })
    const n = BANKS.length
    await expect(mockBankAccountsService.create({ bankName: " ", accountTitle: "", accountNo: "", branch: "" })).rejects.toMatchObject({ status: 400, body: { details: [{ path: "bankName" }, { path: "accountNo" }] } })
    expect(BANKS).toHaveLength(n)
  })

  it("the statement's running balance is exact and matches the legacy ledger", async () => {
    const { items, total } = await mockBankTransactionsService.statement()
    expect(total).toBe(BANK_TRANSACTIONS.length)
    expect(items.map((r) => r.balance)).toEqual(bankRunningBalance().map((r) => moneyFromNumber(r.balance)))
    expect(items.at(-1)!.balance).toBe("32700.00")
    // paging keeps each row's balance (it is computed over the whole ledger first)
    expect((await mockBankTransactionsService.statement({ page: 2, pageSize: 5 })).items.map((r) => r.balance)).toEqual(items.slice(5).map((r) => r.balance))
  })

  it("records a deposit as a credit and a withdrawal as a debit (the dialog's rule); the balance follows", async () => {
    const hbl = (await mockBankAccountsService.list()).items[0]
    const dep = await mockBankTransactionsService.create({ date: "2026-03-04", bankAccountId: hbl.id, direction: "Deposit", amount: "500.25", description: "Cash in", referenceNo: " R9 " })
    expect(dep).toMatchObject({ credit: "500.25", debit: "0.00", bank: hbl.bankName, bankAccountId: hbl.id, referenceNo: "R9" })
    expect(dep.cashMovement).toBeUndefined() // the dialog never set it; whether it should is a backend question
    expect(dep.description).toBe(`Cash in — ${hbl.bankName}`)
    const wd = await mockBankTransactionsService.create({ date: "2026-03-05", bankAccountId: hbl.id, direction: "Withdrawal", amount: "0.25", description: "Cash out" })
    expect(wd).toMatchObject({ debit: "0.25", credit: "0.00" })
    expect((await mockBankTransactionsService.statement()).items.at(-1)!.balance).toBe("33200.00")
    expect(BANK_TRANSACTIONS.at(-1)).toMatchObject({ debit: 0.25, credit: 0 })
  })

  it("rejects bad input and stores nothing (unknown account, ULID, zero / 3-decimal amount, bad date, blank description)", async () => {
    const hbl = (await mockBankAccountsService.list()).items[0]
    const n = BANK_TRANSACTIONS.length
    const ok = { date: "2026-03-04", bankAccountId: hbl.id, direction: "Deposit" as const, amount: "1.00", description: "x" }
    for (const b of [{ bankAccountId: "99999" }, { bankAccountId: ULID }, { amount: "0.00" }, { amount: "1.001" }, { date: "x" }, { description: " " }]) {
      await expect(mockBankTransactionsService.create({ ...ok, ...b }), JSON.stringify(b)).rejects.toMatchObject({ status: 400 })
    }
    expect(BANK_TRANSACTIONS).toHaveLength(n)
  })
})

describe("cache invalidation for the shared head / account lists", () => {
  it("successful head and account changes drop the cached list; failed ones do not", async () => {
    const loader = vi.fn(async () => "x")
    const warm = (key: string) => loadShared(key, loader, 60_000)
    await warm("expenseCategories"); await warm("bankAccounts")
    await expect(expenseCategoriesService.update("99999", { name: "x" })).rejects.toBeDefined()
    await expect(bankAccountsService.update("99999", { bankName: "x", accountTitle: "", accountNo: "1", branch: "" })).rejects.toBeDefined()
    await warm("expenseCategories"); await warm("bankAccounts")
    expect(loader.mock.calls.length).toBe(2)
    await expenseCategoriesService.create({ name: "Cache Test" })
    await warm("expenseCategories")
    expect(loader.mock.calls.length).toBe(3)
    await bankAccountsService.create({ bankName: "Cache Bank", accountTitle: "", accountNo: "9", branch: "" })
    await warm("bankAccounts")
    expect(loader.mock.calls.length).toBe(4)
  })
})
