import type { QueryParams } from "@/lib/api/client"
import { isUlid } from "@/lib/api/convert"
import type { Schemas } from "@/lib/api/contract"
import type { MoneyString } from "@/lib/api/types"
import { normalizeMoneyInput } from "../moneyMath"
import type {
  AccountBalance, AdvanceInput, AppliedCredit, ApplyCreditInput, BillingService, BillingWriteService, ChargeLineInput, ChargeListOptions, ChargePayer, ChargeRegisterRow, ChargeSourceType, CreditNoteInput,
  DiscountInput, InvoiceCharge, InvoiceDetail, InvoiceListOptions, InvoiceStatus, InvoiceSummary, InvoiceTotals, InvoiceVisitRef, ListResult, NewInvoiceInput, PaymentAllocationInput, PaymentInput,
  PaymentListOptions, PaymentRow, Receipt, ReceiptMode, ReceiptPayer, ReceiptType, RefundInput,
} from "../types"
import { callEndpoint, createAndParse } from "./call"
import { asObj, optStr, pageQuery, parsePage, reqBool, reqEnum, reqStr, reqUlid, type Obj } from "./wire"
import { VISIT_STATUSES, VISIT_TYPES } from "./visits"

// Billing, read side (handoff 8.6; docs/openapi.json InvoiceDetailDto_Output, InvoicePageDto_Output, AccountDto_Output). One visit has one invoice; every billed item
// is a charge on it, posted by the event that earns it. Amounts are kept as the decimal strings the server sent: nothing is added up, compared or rounded here.

export const INVOICE_STATUSES: readonly InvoiceStatus[] = ["unpaid", "partial", "paid", "voided"]
export const CHARGE_SOURCE_TYPES: readonly ChargeSourceType[] = ["consultation", "service", "diagnostic", "pharmacy", "room"]
const CHARGE_PAYERS: readonly ChargePayer[] = ["patient", "panel", "counter"]
export const BILLING_LIMITS = { search: 100 } as const
const SORT_RE = /^[A-Za-z]+:(asc|desc)$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const DECIMAL_RE = /^-?\d+(\.\d+)?$/

// ── Reading ──

/** A decimal string, exactly as sent. Anything else (a number, an empty string, "1,500") is a contract break and is refused, never coerced. */
function decimal(o: Obj, key: string, what: string): string {
  const v = o[key]
  if (typeof v !== "string" || !DECIMAL_RE.test(v)) throw new TypeError(`Unexpected response: ${what}.${key} is not a decimal string.`)
  return v
}
const money = (o: Obj, key: string, what: string): MoneyString => decimal(o, key, what) as MoneyString
const instant = (o: Obj, key: string, what: string): string => {
  const v = reqStr(o, key, what)
  if (Number.isNaN(Date.parse(v))) throw new TypeError(`Unexpected response: ${what}.${key} is not a date-time.`)
  return v
}
const optInstant = (o: Obj, key: string, what: string): string | null => (o[key] === null || o[key] === undefined ? null : instant(o, key, what))
/** A single nullable text. The spec types a few of these "array of string" (a spec bug, like the single-text fields elsewhere): a string, null or a one-element array is accepted. */
const optText = (o: Obj, key: string, what: string, dto: string): string | null => optStr(o, key, what, dto) ?? null

function patientRef(raw: unknown, what: string) {
  if (raw === null || raw === undefined) return null
  const o = asObj(raw, what)
  return { id: reqUlid(o, "id", what), mrNo: reqStr(o, "mrNo", what), name: reqStr(o, "name", what) }
}
function visitRef(raw: unknown, what: string, withStatus: boolean): InvoiceVisitRef | null {
  if (raw === null || raw === undefined) return null
  const o = asObj(raw, what)
  return {
    id: reqUlid(o, "id", what), encId: reqStr(o, "encId", what), type: reqEnum(o, "type", what, VISIT_TYPES),
    status: withStatus ? reqEnum(o, "status", what, VISIT_STATUSES) : null,
  }
}

export function parseInvoiceSummary(raw: unknown, what = "invoice"): InvoiceSummary {
  const o = asObj(raw, what)
  const types = o.sourceTypes
  if (!Array.isArray(types)) throw new TypeError(`Unexpected response: ${what}.sourceTypes is not an array.`)
  const patient = patientRef(o.patient, `${what}.patient`)
  const counterCustomer = optText(o, "counterCustomer", what, "InvoicePageDto_Output")
  return {
    id: reqUlid(o, "id", what), invoiceNo: reqStr(o, "invoiceNo", what), issuedAt: instant(o, "issuedAt", what), status: reqEnum(o, "status", what, INVOICE_STATUSES),
    patient, counterCustomer, encounter: visitRef(o.encounter, `${what}.encounter`, false),
    total: money(o, "total", what), discount: money(o, "discount", what), received: money(o, "received", what), balance: money(o, "balance", what),
    sourceTypes: types.map((t, i) => reqEnum({ t }, "t", `${what}.sourceTypes[${i}]`, CHARGE_SOURCE_TYPES)),
  }
}
export function parseInvoiceList(raw: unknown): ListResult<InvoiceSummary> {
  return parsePage(raw, "invoices", (item) => parseInvoiceSummary(item, "invoices[]"))
}

function totalsOf(raw: unknown, what: string): InvoiceTotals {
  const o = asObj(raw, what)
  return {
    gross: money(o, "gross", what), discount: money(o, "discount", what), net: money(o, "net", what), gst: money(o, "gst", what), total: money(o, "total", what),
    received: money(o, "received", what), balance: money(o, "balance", what), patientBalance: money(o, "patientBalance", what), panelBalance: money(o, "panelBalance", what),
  }
}
function chargeOf(raw: unknown, what: string): InvoiceCharge {
  const o = asObj(raw, what)
  const panel = o.panel === null || o.panel === undefined ? null : asObj(o.panel, `${what}.panel`)
  const serviceDate = optStr(o, "serviceDate", what)
  if (serviceDate !== undefined && !DATE_RE.test(serviceDate)) throw new TypeError(`Unexpected response: ${what}.serviceDate is not a date.`)
  return {
    id: reqUlid(o, "id", what), sourceType: reqEnum(o, "sourceType", what, CHARGE_SOURCE_TYPES), description: reqStr(o, "description", what),
    rate: money(o, "rate", what), qty: decimal(o, "qty", what), gross: money(o, "gross", what), discountAmount: money(o, "discountAmount", what), discountPct: decimal(o, "discountPct", what),
    netAmount: money(o, "netAmount", what), gstPct: decimal(o, "gstPct", what), gstAmount: money(o, "gstAmount", what), totalAmount: money(o, "totalAmount", what),
    received: money(o, "received", what), outstanding: money(o, "outstanding", what), payer: reqEnum(o, "payer", what, CHARGE_PAYERS),
    panel: panel ? { id: reqUlid(panel, "id", `${what}.panel`), name: reqStr(panel, "name", `${what}.panel`) } : null,
    chargedAt: instant(o, "chargedAt", what), serviceDate: serviceDate ?? null, voided: reqBool(o, "voided", what), voidedAt: optInstant(o, "voidedAt", what), voidedReason: optText(o, "voidedReason", what, "InvoiceDetailDto_Output"),
  }
}
export function parseInvoiceDetail(raw: unknown, what = "invoice"): InvoiceDetail {
  const o = asObj(raw, what)
  if (!Array.isArray(o.charges)) throw new TypeError(`Unexpected response: ${what}.charges is not an array.`)
  return {
    id: reqUlid(o, "id", what), invoiceNo: reqStr(o, "invoiceNo", what), issuedAt: instant(o, "issuedAt", what), status: reqEnum(o, "status", what, INVOICE_STATUSES),
    patient: patientRef(o.patient, `${what}.patient`), counterCustomer: optText(o, "counterCustomer", what, "InvoiceDetailDto_Output"), encounter: visitRef(o.encounter, `${what}.encounter`, true),
    totals: totalsOf(o.totals, `${what}.totals`), charges: o.charges.map((c, i) => chargeOf(c, `${what}.charges[${i}]`)),
    voidedAt: optInstant(o, "voidedAt", what), voidedReason: optText(o, "voidedReason", what, "InvoiceDetailDto_Output"),
  }
}
export function parseAccount(raw: unknown, what = "account"): AccountBalance {
  const o = asObj(raw, what)
  return { outstanding: money(o, "outstanding", what), credit: money(o, "credit", what) }
}

// ── Writing the query ──

const needUlid = (value: string, label: string): string => {
  if (!isUlid(value)) throw new RangeError(`The ${label} is not valid.`)
  return value
}

/** GET /invoices: server paging and filters; the search text is sent as `search` (never kept in the address bar). */
export function invoiceListQuery(options: InvoiceListOptions = {}): QueryParams {
  const q: QueryParams = { ...pageQuery(options.page, options.pageSize) }
  const search = options.search?.trim()
  if (search) {
    if (search.length > BILLING_LIMITS.search) throw new RangeError(`The search is at most ${BILLING_LIMITS.search} characters.`)
    q.search = search
  }
  if (options.patientId) q.patientId = needUlid(options.patientId, "patient")
  if (options.encounterId) q.encounterId = needUlid(options.encounterId, "visit")
  if (options.status) {
    if (!INVOICE_STATUSES.includes(options.status)) throw new RangeError("The invoice status is not valid.")
    q.status = options.status
  }
  if (options.sourceType) {
    if (!CHARGE_SOURCE_TYPES.includes(options.sourceType)) throw new RangeError("The charge type is not valid.")
    q.sourceType = options.sourceType
  }
  if (options.encounterType) {
    if (!(VISIT_TYPES as readonly string[]).includes(options.encounterType)) throw new RangeError("The visit type is not valid.")
    q.encounterType = options.encounterType
  }
  for (const key of ["dateFrom", "dateTo"] as const) {
    const v = options[key]
    if (v) {
      if (!DATE_RE.test(v)) throw new RangeError("Dates are YYYY-MM-DD.")
      q[key] = v
    }
  }
  if (options.dateFrom && options.dateTo && options.dateFrom > options.dateTo) throw new RangeError("The start date is after the end date.")
  if (options.sort) {
    if (!SORT_RE.test(options.sort)) throw new RangeError("The sort is not valid.")
    q.sort = options.sort
  }
  return q
}

// ── Service ──

const idParam = (id: string) => ({ id: needUlid(id, "record") })

const readService: Pick<BillingService, "listInvoices" | "getInvoice" | "invoiceForEncounter" | "patientAccount" | "panelAccount"> = {
  async listInvoices(options, signal) {
    return parseInvoiceList(await callEndpoint<unknown>("invoices.list", { query: () => invoiceListQuery(options), signal }))
  },
  async getInvoice(id, signal) {
    return parseInvoiceDetail(await callEndpoint<unknown>("invoices.get", { params: idParam(id), signal }))
  },
  async invoiceForEncounter(encounterId, signal) {
    return parseInvoiceDetail(await callEndpoint<unknown>("invoices.forEncounter", { params: idParam(encounterId), signal }))
  },
  async patientAccount(patientId, signal) {
    return parseAccount(await callEndpoint<unknown>("account.patient", { params: idParam(patientId), signal }))
  },
  async panelAccount(panelId, signal) {
    return parseAccount(await callEndpoint<unknown>("account.panel", { params: idParam(panelId), signal }))
  },
}

// ── Write side and registers (B3 to B8) ──

export const RECEIPT_MODES: readonly ReceiptMode[] = ["cash", "card", "bank_transfer", "cheque", "insurance", "on_account"]
export const RECEIPT_TYPES: readonly ReceiptType[] = ["payment", "advance", "refund", "credit_note"]
export const BILLING_WRITE_LIMITS = { reason: { min: 3, max: 500 }, reference: 100, notes: 500, charges: 50, allocations: 200 } as const

const AMOUNT_RE = /^\d+(\.\d{1,2})?$/
const PERCENT_RE = /^(100(\.0{1,2})?|\d{1,2}(\.\d{1,2})?)$/
const NONZERO_RE = /[1-9]/

// A typed amount is checked for SHAPE only (digits, at most two decimals, above zero): the server decides whether it is too much, and every total and
// balance comes back from it. Nothing is parsed into a JavaScript number.
function positiveAmount(text: string, label: string): string {
  const t = (text ?? "").trim()
  if (!AMOUNT_RE.test(t) || !NONZERO_RE.test(t)) throw new RangeError(`${label} must be an amount above zero with at most two decimals.`)
  return normalizeMoneyInput(t) as string
}
function ownRate(text: string): string {
  const t = (text ?? "").trim()
  if (!AMOUNT_RE.test(t)) throw new RangeError("The rate must be an amount with at most two decimals.")
  return normalizeMoneyInput(t) as string
}
function quantity(text: string): string {
  const t = (text ?? "").trim()
  if (!AMOUNT_RE.test(t) || !NONZERO_RE.test(t)) throw new RangeError("The quantity must be above zero with at most two decimals.")
  return t
}
export function discountBody(d: DiscountInput): Schemas["InvoiceDiscountDto"]["discount"] {
  const value = (d.value ?? "").trim()
  if (d.type === "percent") {
    if (!PERCENT_RE.test(value) || !NONZERO_RE.test(value)) throw new RangeError("A percentage discount is above 0 and at most 100, with at most two decimals.")
    return { type: "percent", value }
  }
  if (d.type === "amount") return { type: "amount", value: positiveAmount(value, "The discount") }
  throw new RangeError("The discount is an amount or a percentage.")
}
function reasonText(text: string): string {
  const t = (text ?? "").trim()
  if (t.length < BILLING_WRITE_LIMITS.reason.min || t.length > BILLING_WRITE_LIMITS.reason.max) throw new RangeError(`The reason is ${BILLING_WRITE_LIMITS.reason.min} to ${BILLING_WRITE_LIMITS.reason.max} characters.`)
  return t
}
function optionalText(text: string | undefined, max: number, label: string): string | undefined {
  const t = text?.trim()
  if (!t) return undefined
  if (t.length > max) throw new RangeError(`${label} is at most ${max} characters.`)
  return t
}
function modeOf(mode: string): ReceiptMode {
  if (!RECEIPT_MODES.includes(mode as ReceiptMode)) throw new RangeError("The payment mode is not valid.")
  return mode as ReceiptMode
}
/** A payment, refund or credit note is for a patient or for a panel, never both and never neither. */
function payerIds(input: { patientId?: string; panelId?: string }): { patientId?: string; panelId?: string } {
  const patient = input.patientId?.trim() || undefined
  const panel = input.panelId?.trim() || undefined
  if (!patient === !panel) throw new RangeError("Choose a patient or a panel, not both and not neither.")
  return patient ? { patientId: needUlid(patient, "patient") } : { panelId: needUlid(panel as string, "panel") }
}
function allocationsBody(list: PaymentAllocationInput[] | undefined): Schemas["RecordPaymentDto"]["allocations"] {
  if (!list || list.length === 0) return undefined
  if (list.length > BILLING_WRITE_LIMITS.allocations) throw new RangeError(`At most ${BILLING_WRITE_LIMITS.allocations} allocations.`)
  return list.map((a) => ({ chargeId: needUlid(a.chargeId, "charge"), amount: positiveAmount(a.amount, "An allocation") }))
}
function chargeLines(lines: ChargeLineInput[]): Schemas["CreateInvoiceDto"]["charges"] {
  if (!Array.isArray(lines) || lines.length === 0) throw new RangeError("Add at least one service.")
  if (lines.length > BILLING_WRITE_LIMITS.charges) throw new RangeError(`At most ${BILLING_WRITE_LIMITS.charges} services at a time.`)
  return lines.map((l) => {
    const out: Schemas["CreateInvoiceDto"]["charges"][number] = { serviceId: needUlid(l.serviceId, "service") }
    if (l.qty !== undefined && l.qty.trim() !== "") out.qty = quantity(l.qty)
    if (l.rate !== undefined && l.rate.trim() !== "") out.rate = ownRate(l.rate)
    if (l.discount) out.discount = discountBody(l.discount)
    return out
  })
}

export function createInvoicePayload(input: NewInvoiceInput): Schemas["CreateInvoiceDto"] {
  const body: Schemas["CreateInvoiceDto"] = { patientId: needUlid(input.patientId, "patient"), charges: chargeLines(input.charges) }
  if (input.encounterId) body.encounterId = needUlid(input.encounterId, "visit")
  return body
}
export function addChargesPayload(charges: ChargeLineInput[]): Schemas["AddChargesDto"] {
  return { charges: chargeLines(charges) }
}
export function discountPayload(discount: DiscountInput, reason: string): Schemas["InvoiceDiscountDto"] {
  return { discount: discountBody(discount), reason: reasonText(reason) }
}
export function voidPayload(reason: string): Schemas["VoidDto"] {
  return { reason: reasonText(reason) }
}
export function paymentPayload(input: PaymentInput): Schemas["RecordPaymentDto"] {
  const body: Schemas["RecordPaymentDto"] = { ...payerIds(input), amount: positiveAmount(input.amount, "The amount"), mode: modeOf(input.mode) }
  if (input.invoiceId) body.invoiceId = needUlid(input.invoiceId, "invoice")
  const reference = optionalText(input.reference, BILLING_WRITE_LIMITS.reference, "The reference")
  const notes = optionalText(input.notes, BILLING_WRITE_LIMITS.notes, "The notes")
  if (reference) body.reference = reference
  if (notes) body.notes = notes
  const allocations = allocationsBody(input.allocations)
  if (allocations) body.allocations = allocations
  if (input.excessAsAdvance === true) body.excessAsAdvance = true
  return body
}
export function advancePayload(input: AdvanceInput): Schemas["RecordAdvanceDto"] {
  const body: Schemas["RecordAdvanceDto"] = { patientId: needUlid(input.patientId, "patient"), amount: positiveAmount(input.amount, "The amount"), mode: modeOf(input.mode) }
  const reference = optionalText(input.reference, BILLING_WRITE_LIMITS.reference, "The reference")
  const notes = optionalText(input.notes, BILLING_WRITE_LIMITS.notes, "The notes")
  if (reference) body.reference = reference
  if (notes) body.notes = notes
  return body
}
export function applyCreditPayload(input: ApplyCreditInput): Schemas["ApplyCreditDto"] {
  const body: Schemas["ApplyCreditDto"] = {}
  if (input.invoiceId) body.invoiceId = needUlid(input.invoiceId, "invoice")
  if (input.amount !== undefined && input.amount.trim() !== "") body.amount = positiveAmount(input.amount, "The amount")
  return body
}
export function refundPayload(input: RefundInput): Schemas["RecordRefundDto"] {
  const body: Schemas["RecordRefundDto"] = { ...payerIds(input), amount: positiveAmount(input.amount, "The amount"), mode: modeOf(input.mode), reason: reasonText(input.reason) }
  const reference = optionalText(input.reference, BILLING_WRITE_LIMITS.reference, "The reference")
  if (reference) body.reference = reference
  return body
}
export function creditNotePayload(input: CreditNoteInput): Schemas["RecordCreditNoteDto"] {
  const patient = input.patientId?.trim() || undefined
  const panel = input.panelId?.trim() || undefined
  if (patient && panel) throw new RangeError("Choose a patient or a panel, not both.")
  if (!patient && !panel && !input.invoiceId) throw new RangeError("Choose a patient, a panel or an invoice.")
  const body: Schemas["RecordCreditNoteDto"] = { amount: positiveAmount(input.amount, "The amount"), reason: reasonText(input.reason) }
  if (patient) body.patientId = needUlid(patient, "patient")
  if (panel) body.panelId = needUlid(panel, "panel")
  if (input.invoiceId) body.invoiceId = needUlid(input.invoiceId, "invoice")
  const allocations = allocationsBody(input.allocations)
  if (allocations) body.allocations = allocations
  return body
}

function listFilters(options: { dateFrom?: string; dateTo?: string; sort?: string; patientId?: string; panelId?: string }, q: QueryParams): void {
  if (options.patientId) q.patientId = needUlid(options.patientId, "patient")
  if (options.panelId) q.panelId = needUlid(options.panelId, "panel")
  for (const key of ["dateFrom", "dateTo"] as const) {
    const v = options[key]
    if (v) {
      if (!DATE_RE.test(v)) throw new RangeError("Dates are YYYY-MM-DD.")
      q[key] = v
    }
  }
  if (options.dateFrom && options.dateTo && options.dateFrom > options.dateTo) throw new RangeError("The start date is after the end date.")
  if (options.sort) {
    if (!SORT_RE.test(options.sort)) throw new RangeError("The sort is not valid.")
    q.sort = options.sort
  }
}
export function paymentListQuery(options: PaymentListOptions = {}): QueryParams {
  const q: QueryParams = { ...pageQuery(options.page, options.pageSize) }
  if (options.type) {
    if (!RECEIPT_TYPES.includes(options.type)) throw new RangeError("The receipt type is not valid.")
    q.type = options.type
  }
  if (options.mode) q.mode = modeOf(options.mode)
  if (options.invoiceId) q.invoiceId = needUlid(options.invoiceId, "invoice")
  if (options.receivedBy) q.receivedBy = needUlid(options.receivedBy, "user")
  listFilters(options, q)
  return q
}
export function chargeListQuery(options: ChargeListOptions = {}): QueryParams {
  const q: QueryParams = { ...pageQuery(options.page, options.pageSize) }
  if (options.sourceType) {
    if (!CHARGE_SOURCE_TYPES.includes(options.sourceType)) throw new RangeError("The charge type is not valid.")
    q.sourceType = options.sourceType
  }
  if (options.payer) {
    if (!CHARGE_PAYERS.includes(options.payer)) throw new RangeError("The payer is not valid.")
    q.payer = options.payer
  }
  if (options.diagnosticType) {
    if (options.diagnosticType !== "lab" && options.diagnosticType !== "imaging") throw new RangeError("The test type is not valid.")
    q.diagnosticType = options.diagnosticType
  }
  if (options.modality) {
    if (!["X-Ray", "ECG", "Ultrasound"].includes(options.modality)) throw new RangeError("The modality is not valid.")
    q.modality = options.modality
  }
  if (options.doctorId) q.doctorId = needUlid(options.doctorId, "doctor")
  if (options.includeVoided !== undefined) q.includeVoided = options.includeVoided ? "true" : "false"
  listFilters(options, q)
  return q
}

// ── Reading receipts and registers ──

function payerOf(raw: unknown, what: string): ReceiptPayer {
  const o = asObj(raw, what)
  const kind = reqEnum(o, "kind", what, ["patient", "panel", "counter"] as const)
  if (kind === "patient") return { kind, id: reqUlid(o, "id", what), mrNo: reqStr(o, "mrNo", what), name: reqStr(o, "name", what) }
  if (kind === "panel") return { kind, id: reqUlid(o, "id", what), name: reqStr(o, "name", what) }
  return { kind, invoiceId: reqUlid(o, "invoiceId", what), name: reqStr(o, "name", what) }
}
function paymentCore(o: Obj, what: string, dto: string): PaymentRow {
  const invoice = o.invoice === null || o.invoice === undefined ? null : asObj(o.invoice, `${what}.invoice`)
  const by = asObj(o.receivedBy, `${what}.receivedBy`)
  const mode = o.mode === null || o.mode === undefined ? null : reqEnum(o, "mode", what, RECEIPT_MODES)
  return {
    id: reqUlid(o, "id", what), receiptNo: reqStr(o, "receiptNo", what), type: reqEnum(o, "type", what, RECEIPT_TYPES), mode, amount: money(o, "amount", what), receivedAt: instant(o, "receivedAt", what),
    payer: payerOf(o.payer, `${what}.payer`), invoice: invoice ? { id: reqUlid(invoice, "id", `${what}.invoice`), invoiceNo: reqStr(invoice, "invoiceNo", `${what}.invoice`) } : null,
    receivedBy: { id: reqUlid(by, "id", `${what}.receivedBy`), name: reqStr(by, "name", `${what}.receivedBy`) },
    reference: optText(o, "reference", what, dto), notes: optText(o, "notes", what, dto),
  }
}
export function parsePaymentRow(raw: unknown, what = "payment"): PaymentRow {
  return paymentCore(asObj(raw, what), what, "PaymentPageDto_Output")
}
export function parsePaymentList(raw: unknown): ListResult<PaymentRow> {
  return parsePage(raw, "payments", (item) => parsePaymentRow(item, "payments[]"))
}
export function parseReceipt(raw: unknown, what = "receipt"): Receipt {
  const o = asObj(raw, what)
  const h = asObj(o.hospital, `${what}.hospital`)
  if (!Array.isArray(o.settled)) throw new TypeError(`Unexpected response: ${what}.settled is not an array.`)
  return {
    ...paymentCore(o, what, "ReceiptDto_Output"),
    hospital: { name: reqStr(h, "name", `${what}.hospital`), nameUr: optText(h, "nameUr", `${what}.hospital`, "ReceiptDto_Output"), address: optText(h, "address", `${what}.hospital`, "ReceiptDto_Output"),
      phone: optText(h, "phone", `${what}.hospital`, "ReceiptDto_Output"), printHeader: optText(h, "printHeader", `${what}.hospital`, "ReceiptDto_Output"), currencyCode: reqStr(h, "currencyCode", `${what}.hospital`) },
    settled: o.settled.map((s, i) => { const so = asObj(s, `${what}.settled[${i}]`); return { chargeId: reqUlid(so, "chargeId", `${what}.settled[${i}]`), invoiceNo: reqStr(so, "invoiceNo", `${what}.settled[${i}]`), description: reqStr(so, "description", `${what}.settled[${i}]`), amount: money(so, "amount", `${what}.settled[${i}]`) } }),
    keptAsCredit: money(o, "keptAsCredit", what), account: parseAccount(o.account, `${what}.account`),
  }
}
export function parseApplied(raw: unknown, what = "applied credit"): AppliedCredit {
  const o = asObj(raw, what)
  return { applied: money(o, "applied", what), account: parseAccount(o.account, `${what}.account`) }
}
export function parseChargeRegisterRow(raw: unknown, what = "charge"): ChargeRegisterRow {
  const o = asObj(raw, what)
  const invoice = asObj(o.invoice, `${what}.invoice`)
  const named = (v: unknown, w: string) => (v === null || v === undefined ? null : (() => { const x = asObj(v, w); return { id: reqUlid(x, "id", w), name: reqStr(x, "name", w) } })())
  const serviceDate = optStr(o, "serviceDate", what)
  if (serviceDate !== undefined && !DATE_RE.test(serviceDate)) throw new TypeError(`Unexpected response: ${what}.serviceDate is not a date.`)
  return {
    id: reqUlid(o, "id", what), chargedAt: instant(o, "chargedAt", what), serviceDate: serviceDate ?? null, sourceType: reqEnum(o, "sourceType", what, CHARGE_SOURCE_TYPES), description: reqStr(o, "description", what),
    patient: patientRef(o.patient, `${what}.patient`), counterCustomer: optText(o, "counterCustomer", what, "ChargeRegisterPageDto_Output"),
    invoice: { id: reqUlid(invoice, "id", `${what}.invoice`), invoiceNo: reqStr(invoice, "invoiceNo", `${what}.invoice`) }, doctor: named(o.doctor, `${what}.doctor`), panel: named(o.panel, `${what}.panel`),
    payer: reqEnum(o, "payer", what, CHARGE_PAYERS), totalAmount: money(o, "totalAmount", what), received: money(o, "received", what), outstanding: money(o, "outstanding", what), voided: reqBool(o, "voided", what),
  }
}
export function parseChargeRegisterList(raw: unknown): ListResult<ChargeRegisterRow> {
  return parsePage(raw, "charges", (item) => parseChargeRegisterRow(item, "charges[]"))
}

// ── Service: every write is ONE request (no idempotency keys on the server: a write is never re-sent) ──

const writeService: BillingWriteService = {
  createInvoice(input) {
    return createAndParse("invoices.create", { body: () => createInvoicePayload(input) }, (raw) => parseInvoiceDetail(raw), "invoice")
  },
  addCharges(invoiceId, charges) {
    return createAndParse("invoices.addCharges", { params: idParam(invoiceId), body: () => addChargesPayload(charges) }, (raw) => parseInvoiceDetail(raw), "charges")
  },
  // Discounts, voids and applied credit are not creates, but they are writes all the same: a 2xx the browser cannot read means it HAPPENED. createAndParse turns that into SavedButUnreadableError
  // (refresh, never offer a second try); a plain parse error would look like a form mistake and a second click would apply a 10% discount twice.
  async discountInvoice(invoiceId, discount, reason) {
    return createAndParse("invoices.discount", { params: idParam(invoiceId), body: () => discountPayload(discount, reason) }, (raw) => parseInvoiceDetail(raw), "discount")
  },
  async voidInvoice(invoiceId, reason) {
    return createAndParse("invoices.void", { params: idParam(invoiceId), body: () => voidPayload(reason) }, (raw) => parseInvoiceDetail(raw), "void")
  },
  async voidCharge(chargeId, reason) {
    return createAndParse("charges.void", { params: idParam(chargeId), body: () => voidPayload(reason) }, (raw) => parseInvoiceDetail(raw), "void")
  },
  recordPayment(input) {
    return createAndParse("paymentsRegister.record", { body: () => paymentPayload(input) }, (raw) => parseReceipt(raw), "payment")
  },
  recordAdvance(input) {
    return createAndParse("advances.record", { body: () => advancePayload(input) }, (raw) => parseReceipt(raw), "advance")
  },
  async applyCredit(patientId, input) {
    return createAndParse("credit.apply", { params: idParam(patientId), body: () => applyCreditPayload(input) }, (raw) => parseApplied(raw), "credit")
  },
  refund(input) {
    return createAndParse("refunds.record", { body: () => refundPayload(input) }, (raw) => parseReceipt(raw), "refund")
  },
  creditNote(input) {
    return createAndParse("creditNotes.record", { body: () => creditNotePayload(input) }, (raw) => parseReceipt(raw), "credit note")
  },
  async getReceipt(id, signal) {
    return parseReceipt(await callEndpoint<unknown>("paymentsRegister.get", { params: idParam(id), signal }))
  },
  async listPayments(options, signal) {
    return parsePaymentList(await callEndpoint<unknown>("paymentsRegister.list", { query: () => paymentListQuery(options), signal }))
  },
  async listCharges(options, signal) {
    return parseChargeRegisterList(await callEndpoint<unknown>("charges.list", { query: () => chargeListQuery(options), signal }))
  },
}

export const httpBillingService: BillingService = { ...readService, ...writeService }
