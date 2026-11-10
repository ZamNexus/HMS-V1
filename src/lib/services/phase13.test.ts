import { describe, expect, it } from "vitest"

import { KIND_LABEL, MODE_LABEL, canCorrectExpense, canVoidBankEntry, entryVoided, kindLabel, modeLabel, nameOf } from "@/components/accounts/acUi"
import { cellText, columnsOf, documentCsv, kindOf, looksLikeMoney, prettyKey, refName, splitObject, tablesOf } from "@/components/reportsApi/docUi"
import { ENDPOINTS } from "./endpoints"
import {
  AC_ENTERABLE_KINDS, AC_LIMITS, AC_MODES, bankTxPayload, canonicalMoney, drawerPayload, expenseListQuery, expensePatchPayload, expensePayload, parseBankTx, parseDrawer, parseExpense,
  parseExpensePage, parseStatement, statementQuery, voidPayload,
} from "./http/accountsApi"
import { cashFlowQuery, parseDashboard, parsePrescriptionPage, pharmacyReportQuery, prescriptionQuery, revenueDailyQuery } from "./http/reportsApi"
import { seriesOf } from "./http/series"
import type { AcExpense } from "./types"

// Phase 13: expenses, bank, cash drawer, dashboard, the remaining reports and prescription history (handoff 8.10 / 8.11). Request shapes are the handoff's own; the ANSWERS of the
// accounts and report routes are not described field by field, so these tests pin what is read defensively and what is refused. They say nothing about the real backend.

const U1 = "01JABCDEFGHJKMNPQRSTVWXYZ0", U2 = "01JABCDEFGHJKMNPQRSTVWXYZ1", U3 = "01JABCDEFGHJKMNPQRSTVWXYZ2"
const expenseRow = { id: U1, date: "2026-11-05", description: "Generator fuel", amount: "4500.00", mode: "bank_transfer", category: { id: U2, name: "Utilities" }, bankAccount: { id: U3, name: "Meezan" }, referenceNo: "TRX-1", updatedAt: "2026-11-05T09:00:00.000Z" }

describe("expense answers", () => {
  it("reads the facts the request carries and keeps the whole row", () => {
    const e = parseExpense(expenseRow)
    expect(e).toMatchObject({ id: U1, date: "2026-11-05", description: "Generator fuel", amount: "4500.00", mode: "bank_transfer", referenceNo: "TRX-1", voided: false, updatedAt: "2026-11-05T09:00:00.000Z" })
    expect(e.category).toEqual({ id: U2, name: "Utilities" })
    expect(e.bankAccount).toEqual({ id: U3, name: "Meezan" })
    expect(e.raw).toBe(expenseRow)
  })
  it("also reads an id beside a name, and a cash expense has no bank account", () => {
    const e = parseExpense({ id: U1, expenseDate: "2026-11-05T00:00:00Z", description: "x", amount: "10.00", mode: "cash", categoryId: U2, categoryName: "Fuel" })
    expect(e.date).toBe("2026-11-05")
    expect(e.category).toEqual({ id: U2, name: "Fuel" })
    expect(e.bankAccount).toBeNull()
  })
  it("a missing name is null (the screen looks it up), never invented", () => {
    const e = parseExpense({ id: U1, date: "2026-11-05", description: "x", amount: "10.00", mode: "cash", categoryId: U2 })
    expect(e.category).toEqual({ id: U2, name: null })
  })
  it("a voided row is recognised by any of the usual marks", () => {
    expect(parseExpense({ ...expenseRow, voided: true }).voided).toBe(true)
    expect(parseExpense({ ...expenseRow, voidedAt: "2026-11-06T00:00:00Z" }).voided).toBe(true)
    expect(parseExpense({ ...expenseRow, status: "voided" }).voided).toBe(true)
  })
  it("refuses an answer with no id, no day or no money amount", () => {
    expect(() => parseExpense({ ...expenseRow, id: "nope" })).toThrow(/id/)
    expect(() => parseExpense({ ...expenseRow, date: "yesterday" })).toThrow(/day/)
    expect(() => parseExpense({ ...expenseRow, amount: 4500 })).toThrow(/decimal string/)
    expect(() => parseExpense(null)).toThrow()
  })
  it("a page needs its list and its total; the server's total amount is kept as text when it is there", () => {
    const page = parseExpensePage({ data: [expenseRow], meta: { total: 7 }, totalAmount: "31500.00" })
    expect(page).toMatchObject({ total: 7, totalAmount: "31500.00" })
    expect(page.items).toHaveLength(1)
    expect(parseExpensePage({ data: [], meta: { total: 0 } }).totalAmount).toBeNull()
    expect(() => parseExpensePage({ data: {}, meta: { total: 0 } })).toThrow(/array/)
    expect(() => parseExpensePage({ data: [] })).toThrow()
  })
})

describe("expense requests", () => {
  const input = { date: "2026-11-05", categoryId: U2, description: " Generator fuel ", amount: "4500.50", mode: "bank_transfer" as const, bankAccountId: U3, referenceNo: " TRX-1 " }
  it("POST /expenses carries exactly the handoff's fields, trimmed", () => {
    expect(expensePayload(input)).toEqual({ date: "2026-11-05", categoryId: U2, description: "Generator fuel", amount: "4500.50", mode: "bank_transfer", bankAccountId: U3, referenceNo: "TRX-1" })
  })
  it("a cash expense has no bank account; every other mode needs one", () => {
    expect(expensePayload({ ...input, mode: "cash", bankAccountId: undefined, referenceNo: "" })).toEqual({ date: "2026-11-05", categoryId: U2, description: "Generator fuel", amount: "4500.50", mode: "cash" })
    expect(() => expensePayload({ ...input, mode: "cash" })).toThrow(/no bank account/)
    for (const mode of ["bank_transfer", "cheque", "card"] as const) expect(() => expensePayload({ ...input, mode, bankAccountId: undefined })).toThrow(/bank account/)
  })
  it("refuses a bad date, id, amount, mode or description before any request", () => {
    expect(() => expensePayload({ ...input, date: "5/11/2026" })).toThrow(/date/)
    expect(() => expensePayload({ ...input, categoryId: "x" })).toThrow(/category/)
    for (const amount of ["0", "0.00", "-5", "1,500", "12.345", "abc", ""]) expect(() => expensePayload({ ...input, amount }), amount).toThrow(/amount/)
    expect(() => expensePayload({ ...input, mode: "barter" as never })).toThrow(/paid/)
    expect(() => expensePayload({ ...input, description: "  " })).toThrow(/required/)
    expect(() => expensePayload({ ...input, description: "x".repeat(AC_LIMITS.description + 1) })).toThrow(/at most/)
  })
  it("the modes are the handoff's four", () => { expect([...AC_MODES]).toEqual(["cash", "bank_transfer", "cheque", "card"]) })

  const base = parseExpense(expenseRow) as AcExpense
  const same = { date: base.date, categoryId: U2, description: base.description, amount: "4500.00", referenceNo: "TRX-1" }
  it("PATCH sends only what changed, with expectedUpdatedAt when the record has one", () => {
    expect(expensePatchPayload(base, { ...same, description: "Fuel for the generator" })).toEqual({ description: "Fuel for the generator", expectedUpdatedAt: "2026-11-05T09:00:00.000Z" })
    expect(expensePatchPayload(base, { ...same, amount: "4600" })).toEqual({ amount: "4600", expectedUpdatedAt: "2026-11-05T09:00:00.000Z" })
  })
  it("a spelling of the same amount is not a change; nothing changed is refused", () => {
    expect(() => expensePatchPayload(base, { ...same, amount: "4500" })).toThrow(/Nothing changed/)
    expect(() => expensePatchPayload(base, { ...same, amount: "4500.0" })).toThrow(/Nothing changed/)
    expect(() => expensePatchPayload(base, same)).toThrow(/Nothing changed/)
  })
  it("a cleared reference is sent as null; no updatedAt means no expectedUpdatedAt", () => {
    expect(expensePatchPayload(base, { ...same, referenceNo: "" })).toMatchObject({ referenceNo: null })
    const bare = { ...base, updatedAt: null }
    expect(expensePatchPayload(bare, { ...same, date: "2026-11-04" })).toEqual({ date: "2026-11-04" })
  })
  it("the payment mode cannot be changed by a correction", () => {
    expect(Object.keys(expensePatchPayload(base, { ...same, description: "z" }))).not.toContain("mode")
    expect(Object.keys(expensePatchPayload(base, { ...same, description: "z" }))).not.toContain("bankAccountId")
  })
  it("a void needs a reason of 3 to 500 characters", () => {
    expect(voidPayload("  entered twice ")).toEqual({ reason: "entered twice" })
    expect(() => voidPayload("no")).toThrow(/reason/)
    expect(() => voidPayload("x".repeat(501))).toThrow(/reason/)
  })
  it("money is compared as text without arithmetic", () => {
    expect(canonicalMoney("1500")).toBe("1500.00")
    expect(canonicalMoney("1500.5")).toBe("1500.50")
    expect(canonicalMoney("0001500.00")).toBe("1500.00")
    expect(canonicalMoney("0.5")).toBe("0.50")
  })
  it("the list query carries the documented filters only when they are set", () => {
    expect(expenseListQuery({ page: 2, pageSize: 10, dateFrom: "2026-11-01", dateTo: "2026-11-30", categoryId: U2, mode: "cash", bankAccountId: U3, search: " fuel ", includeVoided: true, sort: "date:desc" })).toMatchObject({
      page: 2, perPage: 10, dateFrom: "2026-11-01", dateTo: "2026-11-30", categoryId: U2, mode: "cash", bankAccountId: U3, search: "fuel", includeVoided: "true", sort: "date:desc",
    })
    const q = expenseListQuery({})
    for (const k of ["dateFrom", "dateTo", "categoryId", "mode", "bankAccountId", "search", "includeVoided", "sort"]) expect(q).not.toHaveProperty(k)
    expect(() => expenseListQuery({ dateFrom: "2026-11-30", dateTo: "2026-11-01" })).toThrow(/after/)
    expect(() => expenseListQuery({ mode: "x" as never })).toThrow()
    expect(() => expenseListQuery({ sort: "date; drop" })).toThrow(/sort/)
  })
})

describe("bank entries, statements and the cash drawer", () => {
  it("the entry kinds a user may enter exclude the automatic one", () => {
    expect([...AC_ENTERABLE_KINDS]).toEqual(["opening_balance", "deposit", "withdrawal", "other_credit", "other_debit"])
    expect(() => bankTxPayload({ bankAccountId: U3, date: "2026-11-05", kind: "expense" as never, amount: "10", description: "x" })).toThrow(/kind/)
  })
  it("POST /bank-transactions carries the handoff's fields", () => {
    expect(bankTxPayload({ bankAccountId: U3, date: "2026-11-05", kind: "deposit", amount: "25000", description: " Cash banked ", referenceNo: "" })).toEqual({ bankAccountId: U3, date: "2026-11-05", kind: "deposit", amount: "25000", description: "Cash banked" })
    expect(() => bankTxPayload({ bankAccountId: "x", date: "2026-11-05", kind: "deposit", amount: "10", description: "d" })).toThrow(/bank account/)
  })
  it("reads an entry and refuses one with no id, day or amount", () => {
    expect(parseBankTx({ id: U1, bankAccountId: U3, date: "2026-11-05", kind: "deposit", amount: "25000.00", description: "d", voided: true })).toMatchObject({ id: U1, bankAccountId: U3, kind: "deposit", voided: true })
    expect(() => parseBankTx({ id: U1, date: "2026-11-05", kind: "deposit", amount: 5 })).toThrow()
  })
  it("a statement keeps the whole answer and recognises opening, closing and entries", () => {
    const raw = { opening: "1000.00", entries: [{ date: "2026-11-02", amount: "50.00", runningBalance: "1050.00" }], closing: "1050.00" }
    const s = parseStatement(raw)
    expect(s).toMatchObject({ opening: "1000.00", closing: "1050.00" })
    expect(s.entries).toHaveLength(1)
    expect(s.raw).toBe(raw)
    expect(parseStatement({ openingBalance: { balance: "5.00" }, closingBalance: "6.00", transactions: [] })).toMatchObject({ opening: "5.00", closing: "6.00", entries: [] })
    expect(parseStatement({ something: 1 })).toMatchObject({ opening: null, closing: null, entries: null })
    expect(parseStatement([{ a: 1 }]).entries).toEqual([{ a: 1 }])
    expect(parseStatement("odd")).toMatchObject({ opening: null, entries: null })
  })
  it("the statement query needs both days, in order", () => {
    expect(statementQuery({ dateFrom: "2026-11-01", dateTo: "2026-11-30" })).toEqual({ dateFrom: "2026-11-01", dateTo: "2026-11-30" })
    expect(() => statementQuery({ dateFrom: "2026-12-01", dateTo: "2026-11-30" })).toThrow(/after/)
    expect(() => statementQuery({ dateFrom: "", dateTo: "2026-11-30" })).toThrow(/date/)
  })
  it("the drawer opening is { amount, date } and zero is allowed", () => {
    expect(drawerPayload({ amount: "0", date: "2026-11-01" })).toEqual({ amount: "0", date: "2026-11-01" })
    expect(drawerPayload({ amount: " 15000.50 ", date: "2026-11-01" })).toEqual({ amount: "15000.50", date: "2026-11-01" })
    expect(() => drawerPayload({ amount: "-1", date: "2026-11-01" })).toThrow()
    expect(() => drawerPayload({ amount: "10", date: "soon" })).toThrow(/date/)
  })
  it("a drawer that answers with no amount is 'not set'", () => {
    expect(parseDrawer({ amount: "15000.00", date: "2026-11-01" })).toMatchObject({ isSet: true, amount: "15000.00", date: "2026-11-01" })
    expect(parseDrawer({})).toMatchObject({ isSet: false, amount: null })
    expect(parseDrawer(null)).toMatchObject({ isSet: false })
  })
  it("the screen helpers", () => {
    expect(modeLabel("bank_transfer")).toBe("Bank transfer"); expect(modeLabel("")).toBe("—"); expect(modeLabel("weird")).toBe("weird")
    expect(kindLabel("expense")).toBe(KIND_LABEL.expense); expect(Object.keys(MODE_LABEL)).toEqual([...AC_MODES])
    expect(nameOf({ id: U1, name: "Sent" }, new Map([[U1, "Held"]]))).toBe("Sent")
    expect(nameOf({ id: U1, name: null }, new Map([[U1, "Held"]]))).toBe("Held")
    expect(nameOf({ id: U2, name: null }, new Map([[U1, "Held"]]))).toBeNull()
    expect(nameOf(null, new Map())).toBeNull()
    expect(canCorrectExpense({ voided: false })).toBe(true); expect(canCorrectExpense({ voided: true })).toBe(false)
    expect(canVoidBankEntry("deposit", false)).toBe(true); expect(canVoidBankEntry("expense", false)).toBe(false); expect(canVoidBankEntry("deposit", true)).toBe(false)
    expect(entryVoided({ voided: true })).toBe(true); expect(entryVoided({ status: "voided" })).toBe(true); expect(entryVoided({})).toBe(false)
  })
})

describe("the dashboard answer (the handoff names every field)", () => {
  const full = {
    visits: { today: 14, yesterday: 11, mine: 3 }, admitted: { total: 5, male: 2, female: 3, other: 0 }, lab: { pending: 4, doneToday: 9 }, imaging: { pending: 1, doneToday: 2 },
    pharmacy: { dispensedToday: 20, dispensedYesterday: 18, lowStock: 6 }, revenue: { today: "12500.00", yesterday: "9800.00", last7Days: [{ date: "2026-11-02", amount: "100.00" }, { date: "2026-11-03", amount: "250.00" }] },
    patientFlow: { last7Days: [3, 5, 4, 6, 2, 7, 8], total: 35 },
  }
  it("reads every section", () => {
    const d = parseDashboard(full)
    expect(d.visits).toEqual({ today: 14, yesterday: 11, mine: 3 })
    expect(d.admitted).toEqual({ total: 5, male: 2, female: 3, other: 0 })
    expect(d.revenue?.today).toBe("12500.00")
    expect(d.revenue?.last7Days).toEqual([{ label: "2026-11-02", value: "100.00" }, { label: "2026-11-03", value: "250.00" }])
    expect(d.patientFlow?.last7Days?.map((p) => p.value)).toEqual(["3", "5", "4", "6", "2", "7", "8"])
    expect(d.patientFlow?.total).toBe(35)
  })
  it("reads the backend's own answer: lowStock and mine are objects, the series are { date, revenue } and { date, visits }", async () => {
    const { schemaOf, validate } = await import("./http/specValidate")
    const real = {
      today: "2026-11-10",
      visits: { today: 14, yesterday: 11, mine: { today: 3, open: 1 } }, admitted: { total: 5, male: 2, female: 3, other: 0 }, lab: { pending: 4, doneToday: 9 }, imaging: { pending: 1, doneToday: 2 },
      pharmacy: { dispensedToday: 20, dispensedYesterday: 18, lowStock: { count: 6, outOfStock: 1, first: [{ medicine: { id: "01JAAAAAAAAAAAAAAAAAAAAAAA", name: "Paracetamol" }, onHand: 0, reorderLevel: 20 }] } },
      revenue: { today: "12500.00", yesterday: "9800.00", last7Days: [{ date: "2026-11-09", revenue: "100.00" }, { date: "2026-11-10", revenue: "250.00" }] },
      patientFlow: { last7Days: [{ date: "2026-11-09", visits: 3 }, { date: "2026-11-10", visits: 5 }], total: 8 },
    }
    expect(validate(real, schemaOf("DashboardDto_Output"))).toEqual([])
    const d = parseDashboard(real)
    expect(d.visits).toEqual({ today: 14, yesterday: 11, mine: 3 })
    expect(d.pharmacy).toEqual({ dispensedToday: 20, dispensedYesterday: 18, lowStock: 6 })
    expect(d.revenue?.last7Days).toEqual([{ label: "2026-11-09", value: "100.00" }, { label: "2026-11-10", value: "250.00" }])
    expect(d.patientFlow?.last7Days?.map((p) => p.value)).toEqual(["3", "5"])
    expect(parseDashboard({ ...real, visits: { ...real.visits, mine: null } }).visits?.mine).toBeNull()
  })
  it("a section the user may not see is null, and a missing field is null", () => {
    const d = parseDashboard({ visits: { today: 1 }, revenue: null, lab: null })
    expect(d.visits).toEqual({ today: 1, yesterday: null, mine: null })
    expect(d.revenue).toBeNull(); expect(d.lab).toBeNull(); expect(d.admitted).toBeNull(); expect(d.pharmacy).toBeNull()
  })
  it("a count that is not a whole number, or money that is not text, is refused", () => {
    expect(() => parseDashboard({ visits: { today: "14" } })).toThrow(/whole number/)
    expect(() => parseDashboard({ visits: { today: -1 } })).toThrow(/whole number/)
    expect(() => parseDashboard({ revenue: { today: 12500 } })).toThrow(/decimal string/)
    expect(() => parseDashboard([])).toThrow()
  })
  it("a series it cannot recognise is null, not guessed", () => {
    expect(parseDashboard({ revenue: { last7Days: [{ a: 1, b: 2 }] } }).revenue?.last7Days).toBeNull()
  })
})

describe("series", () => {
  it("numbers, number text and one-day-one-number records", () => {
    expect(seriesOf([1, "2.50"])).toEqual([{ label: "1", value: "1" }, { label: "2", value: "2.50" }])
    expect(seriesOf([{ day: "2026-11-01", total: "10.00" }])).toEqual([{ label: "2026-11-01", value: "10.00" }])
    expect(seriesOf({ rows: [{ date: "2026-11-01", n: 4 }] })).toEqual([{ label: "2026-11-01", value: "4" }])
  })
  it("anything else is not a series", () => {
    expect(seriesOf([])).toBeNull(); expect(seriesOf(null)).toBeNull(); expect(seriesOf("x")).toBeNull(); expect(seriesOf([{ date: "2026-11-01", a: 1, b: 2 }])).toBeNull()
    expect(seriesOf([1, { a: 1 }])).toBeNull(); expect(seriesOf([{ date: "2026-11-01" }])).toBeNull()
  })
})

describe("report requests (handoff 8.11)", () => {
  const p = { dateFrom: "2026-11-01", dateTo: "2026-11-30" }
  it("the pharmacy report adds expiringWithinDays only when asked, 1 to 3650", () => {
    expect(pharmacyReportQuery(p)).toEqual(p)
    expect(pharmacyReportQuery(p, 60)).toEqual({ ...p, expiringWithinDays: 60 })
    for (const d of [0, 3651, 1.5]) expect(() => pharmacyReportQuery(p, d)).toThrow(/days/)
  })
  it("daily revenue takes an optional sourceType from the five kinds", () => {
    expect(revenueDailyQuery(p)).toEqual(p)
    expect(revenueDailyQuery(p, "pharmacy")).toEqual({ ...p, sourceType: "pharmacy" })
    expect(() => revenueDailyQuery(p, "lunch" as never)).toThrow(/kind/)
  })
  it("cash flow takes one day OR a period, never both and never neither", () => {
    expect(cashFlowQuery({ date: "2026-11-08" })).toEqual({ date: "2026-11-08" })
    expect(cashFlowQuery(p)).toEqual(p)
    expect(() => cashFlowQuery({ date: "2026-11-08", ...p })).toThrow(/not both/)
    expect(() => cashFlowQuery({})).toThrow(/Choose/)
    expect(() => cashFlowQuery({ dateFrom: "2026-11-01" })).toThrow(/Choose/)
    expect(() => cashFlowQuery({ date: "08/11/2026" })).toThrow(/YYYY-MM-DD/)
  })
  it("a report period is at most 366 days, in order", () => {
    expect(() => pharmacyReportQuery({ dateFrom: "2025-01-01", dateTo: "2026-11-30" })).toThrow()
    expect(() => pharmacyReportQuery({ dateFrom: "2026-11-30", dateTo: "2026-11-01" })).toThrow()
  })
  it("prescription history filters are the handoff's six", () => {
    expect(prescriptionQuery({ page: 3, pageSize: 10, dateFrom: "2026-11-01", dateTo: "2026-11-30", patientId: U1, doctorId: U2, medicineId: U3, search: " amox " })).toMatchObject({
      page: 3, perPage: 10, dateFrom: "2026-11-01", dateTo: "2026-11-30", patientId: U1, doctorId: U2, medicineId: U3, search: "amox",
    })
    expect(Object.keys(prescriptionQuery({}))).not.toEqual(expect.arrayContaining(["dateFrom", "search", "patientId"]))
    expect(() => prescriptionQuery({ dateFrom: "2026-11-01" })).toThrow(/both dates/)
    expect(() => prescriptionQuery({ patientId: "x" })).toThrow(/valid id/)
  })
  it("a prescription page is a list of records and a total", () => {
    expect(parsePrescriptionPage({ data: [{ a: 1 }], meta: { total: 4 } })).toEqual({ items: [{ a: 1 }], total: 4 })
    expect(() => parsePrescriptionPage({ data: [1], meta: { total: 1 } })).toThrow(/records/)
    expect(() => parsePrescriptionPage({ data: [] })).toThrow()
  })
})

describe("the route table carries these screens' endpoints", () => {
  it("each route is the handoff's", () => {
    expect(ENDPOINTS["accountsApi.expenses"]).toMatchObject({ method: "GET" })
    expect(ENDPOINTS["accountsApi.expenseCreate"]).toMatchObject({ method: "POST" })
    expect(ENDPOINTS["accountsApi.expenseUpdate"]).toMatchObject({ method: "PATCH" })
    expect(ENDPOINTS["accountsApi.expenseVoid"]).toMatchObject({ method: "POST" })
    expect(ENDPOINTS["accountsApi.bankBalances"]).toMatchObject({ method: "GET" })
    expect(ENDPOINTS["accountsApi.drawerSet"]).toMatchObject({ method: "PUT" })
    expect(ENDPOINTS["reportsApi.dashboard"]).toMatchObject({ method: "GET" })
  })
})

describe("the document viewer reads any JSON without naming fields", () => {
  it("prettyKey", () => {
    expect(prettyKey("dateFrom")).toBe("Date from"); expect(prettyKey("days0to30")).toBe("Days 0 to 30"); expect(prettyKey("mrNo")).toBe("MR no"); expect(prettyKey("patient_id")).toBe("Patient ID")
  })
  it("money is recognised by its form and a rate is not money", () => {
    expect(looksLikeMoney("total", "1500.00")).toBe(true)
    expect(looksLikeMoney("discountPct", "10.00")).toBe(false)
    expect(looksLikeMoney("total", "1500")).toBe(false)
    expect(looksLikeMoney("name", "abc")).toBe(false)
  })
  it("cell text shows exactly what was sent", () => {
    const money = (m: string) => `Rs ${m}`
    expect(cellText("total", "1500.00", undefined, money)).toBe("Rs 1500.00")
    expect(cellText("discountPct", "10.00", undefined, money)).toBe("10.00")
    expect(cellText("x", null)).toBe("—"); expect(cellText("x", "")).toBe("—"); expect(cellText("x", true)).toBe("Yes"); expect(cellText("x", false)).toBe("No")
    expect(cellText("doctor", { id: U1, name: "Dr Khan" })).toBe("Dr Khan")
    expect(cellText("tags", ["a", "b"])).toBe("a, b")
  })
  it("kinds, splitting and columns", () => {
    expect(kindOf([{ a: 1 }])).toBe("records"); expect(kindOf([1, 2])).toBe("scalars"); expect(kindOf({ a: 1 })).toBe("object"); expect(kindOf({ id: U1, name: "n" })).toBe("scalar"); expect(refName({ name: "n", x: 1 })).toBeNull()
    expect(splitObject({ a: 1, b: { c: 2 }, d: [{ e: 1 }] })).toEqual({ tiles: [["a", 1]], parts: [["b", { c: 2 }], ["d", [{ e: 1 }]]] })
    expect(columnsOf([{ id: U1, name: "n", z: 1 }, { id: U2, name: "m", a: 2 }], ["z"])).toEqual(["z", "name", "a"]) // the all-id column is hidden; priority first
  })
  it("tables are found anywhere and become CSV; a formula cell is defused", () => {
    const data = { total: "100.00", rows: [{ name: "=HYPERLINK(\"http://x\")", amount: "5.00" }], nested: { inner: [{ k: "v" }] } }
    const tables = tablesOf(data, "Report", undefined, (m) => m)
    expect(tables.map((t) => t.title)).toEqual(["Report", "Report / Rows", "Report / Nested / Inner"])
    expect(tables[0]).toEqual({ title: "Report", headers: ["Item", "Value"], rows: [["Total", "100.00"]] })
    const csv = documentCsv(tables)
    expect(csv).toContain("'=HYPERLINK")
    expect(csv).not.toMatch(/(^|,|\n)=HYPERLINK/)
    expect(csv.split("\n\n")).toHaveLength(3)
  })
  it("an empty or scalar-only document has no tables", () => {
    expect(tablesOf(null)).toEqual([]); expect(tablesOf("x")).toEqual([]); expect(tablesOf({})).toEqual([])
  })
})
