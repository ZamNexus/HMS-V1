import type { QueryParams } from "@/lib/api/client"
import { isApiError } from "@/lib/api/client"
import { isUlid } from "@/lib/api/convert"
import type {
  AcBankKind, AcBankTx, AcBankTxInput, AcDrawer, AcDrawerInput, AcExpense, AcExpenseEdit, AcExpenseInput, AcExpenseListOptions, AcExpensePage, AcMode, AcRef, AcStatement,
  AcStatementOptions, AccountsApiService,
} from "../types"
import { callEndpoint, createAndParse } from "./call"
import { asObj, pageQuery, reqInt, reqUlid, type Obj } from "./wire"

// Expenses, bank and the cash drawer (handoff 8.10; permissions accounts.read / accounts.write, the drawer's PUT settings.write). The handoff fixes every REQUEST body and the query
// parameters and error codes; it does not list the fields of the ANSWERS. So what is read from an answer is the small set of facts the request itself carries (an expense has a date,
// a category, a description, an amount, a mode, a bank account and a reference; a bank entry has an account, a date, a kind, an amount, a description and a reference) and nothing is
// guessed beyond them: an answer that lacks an id, a day or a money amount is refused, a name that is not there is looked up in the lists the screen already holds, and the whole
// answer stays in "raw" so the details view can show everything the server sent. Money is text, never a number.

export const AC_MODES: readonly AcMode[] = ["cash", "bank_transfer", "cheque", "card"]
/** The kinds a user may enter. The "expense" kind is posted by the server when a bank-paid expense is recorded and is never entered (handoff 8.10). */
export const AC_ENTERABLE_KINDS: readonly AcBankKind[] = ["opening_balance", "deposit", "withdrawal", "other_credit", "other_debit"]
export const AC_LIMITS = { search: 100, reason: { min: 3, max: 300 }, reference: 60, description: 300 } as const
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const AMOUNT_RE = /^\d+(\.\d{1,2})?$/
const DECIMAL_RE = /^-?\d+(\.\d+)?$/
const SORT_RE = /^[A-Za-z]+:(asc|desc)$/

// ── Reading ──

/** The first of several possible keys that holds a value; "a.b" reads inside an object. */
function pick(o: Obj, ...keys: string[]): unknown {
  for (const k of keys) {
    let v: unknown = o
    for (const part of k.split(".")) v = v !== null && typeof v === "object" ? (v as Obj)[part] : undefined
    if (v !== undefined && v !== null) return v
  }
  return undefined
}
const text = (o: Obj, ...keys: string[]): string | null => { const v = pick(o, ...keys); return typeof v === "string" && v !== "" ? v : null }
function money(o: Obj, what: string, ...keys: string[]): string {
  const v = pick(o, ...keys)
  if (typeof v !== "string" || !DECIMAL_RE.test(v)) throw new TypeError(`Unexpected response: ${what}.${keys[0]} is not a decimal string.`)
  return v
}
const moneyOrNull = (o: Obj, ...keys: string[]): string | null => { const v = pick(o, ...keys); return typeof v === "string" && DECIMAL_RE.test(v) ? v : null }
function day(o: Obj, what: string, ...keys: string[]): string {
  const v = pick(o, ...keys)
  const d = typeof v === "string" ? v.slice(0, 10) : ""
  if (!DATE_RE.test(d)) throw new TypeError(`Unexpected response: ${what}.${keys[0]} is not a day.`)
  return d
}
/** A reference to another record in either of the two usual forms: an object "{ id, name }" or an id beside a name. A missing name is null (the screen looks it up). */
function ref(o: Obj, objectKey: string, idKey: string, nameKeys: string[]): AcRef {
  const obj = o[objectKey]
  if (obj !== null && typeof obj === "object" && !Array.isArray(obj)) {
    const r = obj as Obj
    return { id: typeof r.id === "string" && isUlid(r.id) ? r.id : null, name: text(r, "name", "title", "bankName") }
  }
  const id = o[idKey]
  return { id: typeof id === "string" && isUlid(id) ? id : null, name: text(o, ...nameKeys) }
}
// The backend sends `voided` as `{ at, by, reason }` on a voided record and `null` on a live one.
const voidOf = (o: Obj): Obj | null => (o.voided !== null && typeof o.voided === "object" && !Array.isArray(o.voided) ? (o.voided as Obj) : null)
const isVoided = (o: Obj): boolean => voidOf(o) !== null || o.voided === true || (typeof o.voidedAt === "string" && o.voidedAt !== "") || o.status === "voided" || o.isVoided === true

export function parseExpense(raw: unknown): AcExpense {
  const o = asObj(raw, "expense")
  const bank = ref(o, "bankAccount", "bankAccountId", ["bankAccountName", "bankName"])
  return {
    id: reqUlid(o, "id", "expense"),
    date: day(o, "expense", "date", "expenseDate"),
    description: text(o, "description") ?? "",
    amount: money(o, "expense", "amount"),
    mode: text(o, "mode", "paymentMode") ?? "",
    category: ref(o, "category", "categoryId", ["categoryName"]),
    bankAccount: bank.id || bank.name ? bank : null,
    referenceNo: text(o, "referenceNo", "reference"),
    voided: isVoided(o),
    voidReason: text(voidOf(o) ?? {}, "reason") ?? text(o, "voidReason", "voidedReason"),
    updatedAt: text(o, "updatedAt"),
    raw: o,
  }
}

export function parseExpensePage(raw: unknown): AcExpensePage {
  const o = asObj(raw, "expenses")
  if (!Array.isArray(o.data)) throw new TypeError("Unexpected response: expenses.data is not an array.")
  const meta = asObj(o.meta, "expenses.meta")
  return { items: o.data.map(parseExpense), total: reqInt(meta, "total", "expenses.meta"), totalAmount: moneyOrNull(o, "totalAmount", "meta.totalAmount", "totals.amount") }
}

/** A bank entry carries `debit` and `credit` (one of them "0.00"); its amount is whichever moved money. */
function bankAmount(o: Obj): string {
  if (o.amount !== undefined) return money(o, "bank transaction", "amount")
  const credit = money(o, "bank transaction", "credit")
  return /^0+(.0+)?$/.test(credit) ? money(o, "bank transaction", "debit") : credit
}

export function parseBankTx(raw: unknown): AcBankTx {
  const o = asObj(raw, "bank transaction")
  const account = ref(o, "bankAccount", "bankAccountId", [])
  return {
    id: reqUlid(o, "id", "bank transaction"),
    bankAccountId: account.id,
    date: day(o, "bank transaction", "date"),
    kind: text(o, "kind", "type") ?? "",
    amount: bankAmount(o),
    description: text(o, "description") ?? "",
    referenceNo: text(o, "referenceNo", "reference"),
    voided: isVoided(o),
    raw: o,
  }
}

/** A statement as received. Recognised: an opening and a closing amount (text, or an object holding one) and a list of entries; everything else is still in "raw". */
export function parseStatement(raw: unknown): AcStatement {
  const amountOf = (v: unknown): string | null => {
    if (typeof v === "string" && DECIMAL_RE.test(v)) return v
    if (v !== null && typeof v === "object") return moneyOrNull(v as Obj, "balance", "amount")
    return null
  }
  const o = raw !== null && typeof raw === "object" && !Array.isArray(raw) ? (raw as Obj) : null
  const entries = o ? pick(o, "entries", "transactions", "lines") : Array.isArray(raw) ? raw : undefined
  return {
    raw,
    opening: o ? amountOf(pick(o, "opening", "openingBalance")) : null,
    closing: o ? amountOf(pick(o, "closing", "closingBalance")) : null,
    entries: Array.isArray(entries) && entries.every((e) => e !== null && typeof e === "object" && !Array.isArray(e)) ? (entries as Record<string, unknown>[]) : null,
  }
}

export function parseDrawer(raw: unknown): AcDrawer {
  const o = raw !== null && typeof raw === "object" && !Array.isArray(raw) ? (raw as Obj) : null
  const amount = o ? moneyOrNull(o, "amount", "openingAmount", "opening.amount") : null
  const date = o ? (typeof pick(o, "date", "openingDate", "opening.date") === "string" ? String(pick(o, "date", "openingDate", "opening.date")).slice(0, 10) : null) : null
  return { isSet: amount !== null, amount, date: date && DATE_RE.test(date) ? date : null, raw }
}

// ── Writing ──

const needUlid = (value: string | undefined, label: string): string => {
  if (!value || !isUlid(value)) throw new RangeError(`The ${label} is not valid.`)
  return value
}
function dayText(value: string, label: string): string {
  if (!DATE_RE.test(value) || Number.isNaN(Date.parse(value))) throw new RangeError(`${label} is a date (YYYY-MM-DD).`)
  return value
}
function amountText(value: string, label: string): string {
  const t = (value ?? "").trim()
  if (!AMOUNT_RE.test(t) || !/[1-9]/.test(t)) throw new RangeError(`${label} is an amount above zero with at most two decimals.`)
  return t
}
/** Money text with exactly two decimals and no leading zeros, so "1500", "1500.0" and "1500.00" compare equal without any arithmetic. */
export function canonicalMoney(s: string): string {
  const [whole = "0", frac = ""] = s.split(".")
  return `${whole.replace(/^0+(?=\d)/, "")}.${(frac + "00").slice(0, 2)}`
}
function descriptionText(value: string): string {
  const t = (value ?? "").trim()
  if (t.length === 0) throw new RangeError("The description is required.")
  if (t.length > AC_LIMITS.description) throw new RangeError(`The description is at most ${AC_LIMITS.description} characters.`)
  return t
}
function reasonText(value: string): string {
  const t = (value ?? "").trim()
  if (t.length < AC_LIMITS.reason.min || t.length > AC_LIMITS.reason.max) throw new RangeError(`The reason is ${AC_LIMITS.reason.min} to ${AC_LIMITS.reason.max} characters.`)
  return t
}
function referenceText(value: string | undefined): string | undefined {
  const t = (value ?? "").trim()
  if (t.length > AC_LIMITS.reference) throw new RangeError(`The reference is at most ${AC_LIMITS.reference} characters.`)
  return t === "" ? undefined : t
}

/** POST /expenses { date, categoryId, description, amount, mode, bankAccountId?, referenceNo? }. Cash needs no bank account; every other mode needs one (handoff 8.10). */
export function expensePayload(input: AcExpenseInput): Record<string, unknown> {
  if (!AC_MODES.includes(input.mode)) throw new RangeError("Choose how the expense was paid.")
  const body: Record<string, unknown> = {
    date: dayText(input.date, "The date"), categoryId: needUlid(input.categoryId, "category"), description: descriptionText(input.description), amount: amountText(input.amount, "The amount"), mode: input.mode,
  }
  if (input.mode === "cash") {
    if (input.bankAccountId) throw new RangeError("A cash expense has no bank account.")
  } else body.bankAccountId = needUlid(input.bankAccountId, "bank account")
  const ref = referenceText(input.referenceNo)
  if (ref !== undefined) body.referenceNo = ref
  return body
}

/**
 * PATCH /expenses/{id}: only what changed, from date, category, description, amount and reference (how it was paid cannot change, handoff 8.10). A cleared reference is sent as null.
 * "expectedUpdatedAt" goes with it when the record carries an "updatedAt" (handoff 4: "where the resource takes it"). Nothing changed is refused before any request.
 */
export function expensePatchPayload(base: AcExpense, edit: AcExpenseEdit): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  const date = dayText(edit.date, "The date")
  if (date !== base.date) body.date = date
  const categoryId = needUlid(edit.categoryId, "category")
  if (categoryId !== base.category.id) body.categoryId = categoryId
  const description = descriptionText(edit.description)
  if (description !== base.description) body.description = description
  const amount = amountText(edit.amount, "The amount")
  if (canonicalMoney(amount) !== canonicalMoney(base.amount)) body.amount = amount
  const reference = referenceText(edit.referenceNo) ?? null
  if (reference !== (base.referenceNo ?? null)) body.referenceNo = reference
  if (Object.keys(body).length === 0) throw new RangeError("Nothing changed.")
  if (base.updatedAt) body.expectedUpdatedAt = base.updatedAt
  return body
}

export const voidPayload = (reason: string): { reason: string } => ({ reason: reasonText(reason) })

/** POST /bank-transactions { bankAccountId, date, kind, amount, description, referenceNo? }; "expense" is never entered. */
export function bankTxPayload(input: AcBankTxInput): Record<string, unknown> {
  if (!AC_ENTERABLE_KINDS.includes(input.kind)) throw new RangeError("Choose what kind of entry this is.")
  const body: Record<string, unknown> = {
    bankAccountId: needUlid(input.bankAccountId, "bank account"), date: dayText(input.date, "The date"), kind: input.kind, amount: amountText(input.amount, "The amount"), description: descriptionText(input.description),
  }
  const ref = referenceText(input.referenceNo)
  if (ref !== undefined) body.referenceNo = ref
  return body
}

/** PUT /cash-drawer/opening { amount, date }: set once by the admin at go-live. Zero is a valid opening amount. */
export function drawerPayload(input: AcDrawerInput): { amount: string; date: string } {
  const t = (input.amount ?? "").trim()
  if (!AMOUNT_RE.test(t)) throw new RangeError("The opening cash is an amount with at most two decimals (zero is allowed).")
  return { amount: t, date: dayText(input.date, "The date") }
}

export function expenseListQuery(o: AcExpenseListOptions = {}): QueryParams {
  const q: QueryParams = { ...pageQuery(o.page, o.pageSize) }
  for (const k of ["dateFrom", "dateTo"] as const) if (o[k]) q[k] = dayText(o[k] as string, k === "dateFrom" ? "The start date" : "The end date")
  if (o.dateFrom && o.dateTo && o.dateFrom > o.dateTo) throw new RangeError("The start date is after the end date.")
  if (o.categoryId) q.categoryId = needUlid(o.categoryId, "category")
  if (o.bankAccountId) q.bankAccountId = needUlid(o.bankAccountId, "bank account")
  if (o.mode) { if (!AC_MODES.includes(o.mode)) throw new RangeError("The payment mode is not valid."); q.mode = o.mode }
  const search = o.search?.trim()
  if (search) { if (search.length > AC_LIMITS.search) throw new RangeError(`The search is at most ${AC_LIMITS.search} characters.`); q.search = search }
  if (o.includeVoided !== undefined) q.includeVoided = o.includeVoided ? "true" : "false"
  if (o.sort) { if (!SORT_RE.test(o.sort)) throw new RangeError("The sort is not valid."); q.sort = o.sort }
  return q
}

export function statementQuery(o: AcStatementOptions): QueryParams {
  const dateFrom = dayText(o.dateFrom, "The start date"), dateTo = dayText(o.dateTo, "The end date")
  if (dateFrom > dateTo) throw new RangeError("The start date is after the end date.")
  return { dateFrom, dateTo }
}

const idParam = (id: string) => ({ id: needUlid(id, "record") })

export const httpAccountsApiService: AccountsApiService = {
  async listExpenses(options, signal) { return parseExpensePage(await callEndpoint<unknown>("accountsApi.expenses", { query: () => expenseListQuery(options), signal })) },
  async getExpense(id, signal) { return parseExpense(await callEndpoint<unknown>("accountsApi.expenseGet", { params: idParam(id), signal })) },
  createExpense(input) { return createAndParse("accountsApi.expenseCreate", { body: () => expensePayload(input) }, (raw) => parseExpense(raw), "expense") },
  async updateExpense(base, edit) { return createAndParse("accountsApi.expenseUpdate", { params: idParam(base.id), body: () => expensePatchPayload(base, edit) }, (raw) => parseExpense(raw), "expense") },
  async voidExpense(id, reason) { return createAndParse("accountsApi.expenseVoid", { params: idParam(id), body: () => voidPayload(reason) }, (raw) => parseExpense(raw), "void") },
  async bankBalances(signal) { return await callEndpoint<unknown>("accountsApi.bankBalances", { signal }) },
  async bankStatement(accountId, options, signal) { return parseStatement(await callEndpoint<unknown>("accountsApi.bankStatement", { params: idParam(accountId), query: () => statementQuery(options), signal })) },
  createBankTransaction(input) { return createAndParse("accountsApi.bankTxCreate", { body: () => bankTxPayload(input) }, (raw) => parseBankTx(raw), "bank entry") },
  async getBankTransaction(id, signal) { return parseBankTx(await callEndpoint<unknown>("accountsApi.bankTxGet", { params: idParam(id), signal })) },
  async voidBankTransaction(id, reason) { return createAndParse("accountsApi.bankTxVoid", { params: idParam(id), body: () => voidPayload(reason) }, (raw) => parseBankTx(raw), "void") },
  async drawerOpening(signal) {
    try { return parseDrawer(await callEndpoint<unknown>("accountsApi.drawerGet", { signal })) } catch (err) {
      if (isApiError(err) && err.status === 404) return { isSet: false, amount: null, date: null, raw: null } // not set yet
      throw err
    }
  },
  setDrawerOpening(input) { return createAndParse("accountsApi.drawerSet", { body: () => drawerPayload(input) }, (raw) => parseDrawer(raw), "opening cash") },
}
