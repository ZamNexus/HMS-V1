import { readFileSync } from "node:fs"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { setAccessToken } from "@/lib/api/client"
import { ENDPOINTS } from "./endpoints"
import { classifyCreateError } from "./createOutcome"
import {
  addChargesPayload, advancePayload, applyCreditPayload, chargeListQuery, createInvoicePayload, creditNotePayload, discountPayload, httpBillingService, parseApplied, parseChargeRegisterList, parsePaymentList,
  parseReceipt, paymentListQuery, paymentPayload, refundPayload, voidPayload,
} from "./http/billing"
import { mockBillingService } from "./mock/billing"
import { schemaOf, validate } from "./http/specValidate"

// Phase 8, write side (B3 charge services, B4 payments and receipts, B5 advances and credit, B6 discount and void, B7 refunds and credit notes, B8 the registers;
// handoff 8.6). The backend has NO idempotency keys: two identical POST /payments record two payments. So every write is ONE request, never re-sent, and every
// payload is validated AGAINST docs/openapi.json. Nothing here contacts a backend.

afterEach(() => { vi.unstubAllGlobals(); setAccessToken(null) })

const root = process.cwd()
const read = (rel: string) => readFileSync(path.resolve(root, rel), "utf8")
const ID = (c: string) => `01HZX${c.repeat(21)}`
const INV = ID("A"), PAT = ID("B"), ENC = ID("C"), CHG = ID("D"), PANEL = ID("E"), SVC = ID("F"), USER = ID("G"), PAY = ID("H")
const NOW = "2026-11-07T10:00:00.000Z"
const LENIENT = { lenientStringArrays: true } as const // the spec types ReceiptDto reference and notes as arrays (a spec bug)

const hospital = { name: "City Hospital", nameUr: null, address: "Lahore", phone: null, printHeader: null, currencyCode: "PKR" }
const account = { outstanding: "500.00", credit: "0.00" }
const receipt = (over: Record<string, unknown> = {}) => ({
  id: PAY, receiptNo: "RCT-2026-0031", type: "payment", mode: "cash", amount: "1000.00", receivedAt: NOW, payer: { kind: "patient", id: PAT, mrNo: "MR-2026-0042", name: "Ayesha Khan" },
  invoice: { id: INV, invoiceNo: "INV-2026-0007" }, receivedBy: { id: USER, name: "Billing Clerk" }, reference: null, notes: null, hospital,
  settled: [{ chargeId: CHG, invoiceNo: "INV-2026-0007", description: "Consultation: Dr Imran", amount: "1000.00" }], keptAsCredit: "0.00", account, ...over,
})
const payRow = (over: Record<string, unknown> = {}) => {
  const { hospital: _h, settled: _s, keptAsCredit: _k, account: _a, ...row } = receipt(over)
  void _h; void _s; void _k; void _a
  return row
}
const chargeRow = (over: Record<string, unknown> = {}) => ({
  id: CHG, chargedAt: NOW, serviceDate: "2026-11-07", sourceType: "consultation", description: "Consultation: Dr Imran", patient: { id: PAT, mrNo: "MR-2026-0042", name: "Ayesha Khan" }, counterCustomer: null,
  invoice: { id: INV, invoiceNo: "INV-2026-0007" }, doctor: { id: USER, name: "Dr Imran" }, panel: null, payer: "patient", totalAmount: "1500.00", received: "500.00", outstanding: "1000.00", voided: false, ...over,
})
const page = (data: unknown[]) => ({ data, meta: { page: 1, perPage: 10, total: data.length, totalPages: 1 } })
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
const errorBody = (statusCode: number, code: string, message: string, details?: unknown) => ({ statusCode, code, message, requestId: "req-1", path: "/api/v1/payments", timestamp: NOW, details })
function stub(responses: Array<Response | Error>) {
  const calls: { method: string; url: string; body: unknown }[] = []
  let i = 0
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ method: init.method as string, url, body: init.body ? JSON.parse(init.body as string) : undefined })
    const r = responses[Math.min(i++, responses.length - 1)]
    if (r instanceof Error) throw r
    return r.clone()
  }))
  return calls
}
const invoiceDetail = () => ({
  id: INV, invoiceNo: "INV-2026-0007", issuedAt: NOW, status: "partial", patient: { id: PAT, mrNo: "MR-2026-0042", name: "Ayesha Khan" }, counterCustomer: null, encounter: { id: ENC, encId: "OPD-2026-0012", type: "opd", status: "open" },
  totals: { gross: "1500.00", discount: "0.00", net: "1500.00", gst: "0.00", total: "1500.00", received: "500.00", balance: "1000.00", patientBalance: "1000.00", panelBalance: "0.00" }, charges: [], voidedAt: null, voidedReason: null,
})

describe("fixtures are what the specification says", () => {
  it("a receipt for each kind of payer, a credit note (no mode), the payments register, the charges register and an applied credit validate against their schemas", () => {
    expect(validate(receipt(), schemaOf("ReceiptDto_Output"), LENIENT)).toEqual([])
    expect(validate(receipt({ payer: { kind: "panel", id: PANEL, name: "State Life" }, mode: "insurance" }), schemaOf("ReceiptDto_Output"), LENIENT)).toEqual([])
    expect(validate(receipt({ payer: { kind: "counter", invoiceId: INV, name: "Walk-in Ali" } }), schemaOf("ReceiptDto_Output"), LENIENT)).toEqual([])
    expect(validate(receipt({ type: "credit_note", mode: null }), schemaOf("ReceiptDto_Output"), LENIENT)).toEqual([])
    expect(validate(page([payRow(), payRow({ type: "refund", id: ID("J") })]), schemaOf("PaymentPageDto_Output"), LENIENT)).toEqual([])
    expect(validate(page([chargeRow(), chargeRow({ patient: null, counterCustomer: "Walk-in Ali", doctor: null, payer: "counter", voided: true })]), schemaOf("ChargeRegisterPageDto_Output"), LENIENT)).toEqual([])
    expect(validate({ applied: "250.00", account }, schemaOf("AppliedCreditDto_Output"))).toEqual([])
  })
})

describe("payloads are what the specification's DTOs say", () => {
  it("every payload validates against its DTO", () => {
    const lines = [{ serviceId: SVC, qty: "2" }, { serviceId: SVC, qty: "1", rate: "800", discount: { type: "percent" as const, value: "10" } }]
    expect(validate(createInvoicePayload({ patientId: PAT, encounterId: ENC, charges: lines }), schemaOf("CreateInvoiceDto"))).toEqual([])
    expect(validate(addChargesPayload(lines), schemaOf("AddChargesDto"))).toEqual([])
    expect(validate(discountPayload({ type: "amount", value: "100" }, "Staff concession"), schemaOf("InvoiceDiscountDto"))).toEqual([])
    expect(validate(discountPayload({ type: "percent", value: "100" }, "Included in package"), schemaOf("InvoiceDiscountDto"))).toEqual([])
    expect(validate(voidPayload("Entered twice"), schemaOf("BillingVoidDto"))).toEqual([])
    expect(validate(paymentPayload({ patientId: PAT, invoiceId: INV, amount: "1000", mode: "cash", reference: "R-1", notes: "n", allocations: [{ chargeId: CHG, amount: "1000" }], excessAsAdvance: true }), schemaOf("RecordPaymentDto"))).toEqual([])
    expect(validate(paymentPayload({ panelId: PANEL, amount: "5000.50", mode: "insurance" }), schemaOf("RecordPaymentDto"))).toEqual([])
    expect(validate(advancePayload({ patientId: PAT, amount: "2000", mode: "card" }), schemaOf("RecordAdvanceDto"))).toEqual([])
    expect(validate(applyCreditPayload({ invoiceId: INV, amount: "250" }), schemaOf("ApplyCreditDto"))).toEqual([])
    expect(validate(applyCreditPayload({}), schemaOf("ApplyCreditDto"))).toEqual([])
    expect(validate(refundPayload({ patientId: PAT, amount: "300", mode: "cash", reason: "Unused advance" }), schemaOf("RecordRefundDto"))).toEqual([])
    expect(validate(creditNotePayload({ patientId: PAT, invoiceId: INV, amount: "200", reason: "Concession", allocations: [{ chargeId: CHG, amount: "200" }] }), schemaOf("RecordCreditNoteDto"))).toEqual([])
  })
  it("amounts are sent as normalized strings, never numbers; optional fields are left out unless set; excessAsAdvance only when true", () => {
    const p = paymentPayload({ patientId: PAT, amount: " 1000 ", mode: "cash", excessAsAdvance: false })
    expect(p).toEqual({ patientId: PAT, amount: "1000.00", mode: "cash" })
    expect(typeof p.amount).toBe("string")
    expect(paymentPayload({ patientId: PAT, amount: "250.5", mode: "card", excessAsAdvance: true }).excessAsAdvance).toBe(true)
    expect(createInvoicePayload({ patientId: PAT, charges: [{ serviceId: SVC }] })).toEqual({ patientId: PAT, charges: [{ serviceId: SVC }] })
    expect(createInvoicePayload({ patientId: PAT, charges: [{ serviceId: SVC, rate: "0" }] }).charges[0].rate).toBe("0.00") // a free item is an own rate of zero
  })
})

describe("input the server would refuse is refused first, with no request", () => {
  it("amounts: zero, negative, three decimals, text and empty are refused", () => {
    for (const amount of ["0", "0.00", "-5", "1.234", "abc", "", "1,000", "1e3"]) {
      expect(() => paymentPayload({ patientId: PAT, amount, mode: "cash" }), amount).toThrow(RangeError)
      expect(() => advancePayload({ patientId: PAT, amount, mode: "cash" }), amount).toThrow(RangeError)
    }
  })
  it("a payment is for a patient OR a panel; the mode, reference, notes and ids are checked", () => {
    expect(() => paymentPayload({ amount: "10", mode: "cash" })).toThrow(/patient or a panel/)
    expect(() => paymentPayload({ patientId: PAT, panelId: PANEL, amount: "10", mode: "cash" })).toThrow(/patient or a panel/)
    expect(() => paymentPayload({ patientId: PAT, amount: "10", mode: "bitcoin" as never })).toThrow(RangeError)
    expect(() => paymentPayload({ patientId: PAT, amount: "10", mode: "cash", reference: "x".repeat(101) })).toThrow(RangeError)
    expect(() => paymentPayload({ patientId: "nope", amount: "10", mode: "cash" })).toThrow(RangeError)
    expect(() => paymentPayload({ patientId: PAT, invoiceId: "nope", amount: "10", mode: "cash" })).toThrow(RangeError)
    expect(() => paymentPayload({ patientId: PAT, amount: "10", mode: "cash", allocations: [{ chargeId: CHG, amount: "0" }] })).toThrow(RangeError)
  })
  it("discounts: a percentage is above 0 and at most 100; an amount is above zero; a reason is 3 to 500 characters", () => {
    for (const value of ["0", "100.5", "101", "-1", "abc", ""]) expect(() => discountPayload({ type: "percent", value }, "Concession"), value).toThrow(RangeError)
    for (const value of ["0", "-5", "1.234", ""]) expect(() => discountPayload({ type: "amount", value }, "Concession"), value).toThrow(RangeError)
    expect(() => discountPayload({ type: "percent", value: "10" }, "no")).toThrow(RangeError)
    expect(() => voidPayload("x".repeat(501))).toThrow(RangeError)
    expect(() => refundPayload({ patientId: PAT, amount: "5", mode: "cash", reason: "ab" })).toThrow(RangeError)
    expect(discountPayload({ type: "percent", value: "100" }, "Included in package").discount).toEqual({ type: "percent", value: "100" })
  })
  it("charge lines: 1 to 50, a service id, a quantity above zero", () => {
    expect(() => createInvoicePayload({ patientId: PAT, charges: [] })).toThrow(/at least one/)
    expect(() => addChargesPayload(Array.from({ length: 51 }, () => ({ serviceId: SVC })))).toThrow(RangeError)
    expect(() => addChargesPayload([{ serviceId: "nope" }])).toThrow(RangeError)
    expect(() => addChargesPayload([{ serviceId: SVC, qty: "0" }])).toThrow(RangeError)
    expect(() => addChargesPayload([{ serviceId: SVC, rate: "-1" }])).toThrow(RangeError)
  })
  it("a credit note needs a patient, a panel or an invoice, and not a patient and a panel together", () => {
    expect(() => creditNotePayload({ amount: "5", reason: "Concession" })).toThrow(RangeError)
    expect(() => creditNotePayload({ patientId: PAT, panelId: PANEL, amount: "5", reason: "Concession" })).toThrow(RangeError)
    expect(creditNotePayload({ invoiceId: INV, amount: "5", reason: "Concession" })).toEqual({ invoiceId: INV, amount: "5.00", reason: "Concession" })
  })
})

describe("HTTP adapter: ONE request per write, never re-sent", () => {
  it("each write is its own call with the documented method, path and body", async () => {
    const calls = stub([
      json(invoiceDetail(), 201), json(invoiceDetail(), 201), json(invoiceDetail()), json(invoiceDetail()), json(invoiceDetail()),
      json(receipt(), 201), json(receipt({ type: "advance" }), 201), json({ applied: "250.00", account }), json(receipt({ type: "refund" }), 201), json(receipt({ type: "credit_note", mode: null }), 201),
    ])
    const lines = [{ serviceId: SVC, qty: "2" }]
    await httpBillingService.createInvoice({ patientId: PAT, encounterId: ENC, charges: lines })
    await httpBillingService.addCharges(INV, lines)
    await httpBillingService.discountInvoice(INV, { type: "percent", value: "10" }, "Concession")
    await httpBillingService.voidInvoice(INV, "Entered twice")
    await httpBillingService.voidCharge(CHG, "Wrong service")
    await httpBillingService.recordPayment({ patientId: PAT, invoiceId: INV, amount: "1000", mode: "cash" })
    await httpBillingService.recordAdvance({ patientId: PAT, amount: "2000", mode: "card" })
    await httpBillingService.applyCredit(PAT, { invoiceId: INV, amount: "250" })
    await httpBillingService.refund({ patientId: PAT, amount: "300", mode: "cash", reason: "Unused advance" })
    await httpBillingService.creditNote({ patientId: PAT, amount: "200", reason: "Concession" })
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      "POST /api/v1/invoices", `POST /api/v1/invoices/${INV}/charges`, `POST /api/v1/invoices/${INV}/discount`, `POST /api/v1/invoices/${INV}/void`, `POST /api/v1/charges/${CHG}/void`,
      "POST /api/v1/payments", "POST /api/v1/advances", `POST /api/v1/patients/${PAT}/apply-credit`, "POST /api/v1/refunds", "POST /api/v1/credit-notes",
    ])
    expect(calls[5].body).toEqual({ patientId: PAT, invoiceId: INV, amount: "1000.00", mode: "cash" })
    expect(calls[3].body).toEqual({ reason: "Entered twice" })
  })
  it("a payment the server refuses (422 OVERPAYMENT, 422 INVOICE_VOIDED, 403, 500) keeps its code and is sent exactly once", async () => {
    for (const [status, code] of [[422, "OVERPAYMENT"], [422, "INVOICE_VOIDED"], [403, "FORBIDDEN"], [500, "INTERNAL_ERROR"]] as const) {
      const calls = stub([json(errorBody(status, code, "refused", code === "OVERPAYMENT" ? { owed: "400.00" } : undefined), status)])
      await expect(httpBillingService.recordPayment({ patientId: PAT, amount: "1000", mode: "cash" })).rejects.toMatchObject({ status, code })
      expect(calls, code).toHaveLength(1)
    }
  })
  it("a payment whose network drops mid-request is NOT sent again (the payment may have been recorded)", async () => {
    const calls = stub([new TypeError("Failed to fetch")])
    await expect(httpBillingService.recordPayment({ patientId: PAT, amount: "1000", mode: "cash" })).rejects.toBeTruthy()
    expect(calls).toHaveLength(1)
  })
  it("a payment accepted (2xx) but unreadable is 'saved': the money exists, so it is never sent again", async () => {
    const calls = stub([new Response("<html>ok</html>", { status: 201, headers: { "content-type": "text/html" } })])
    const err = await httpBillingService.recordPayment({ patientId: PAT, amount: "1000", mode: "cash" }).then(() => null, (e: unknown) => e)
    expect(classifyCreateError(err).kind).toBe("saved-unreadable")
    expect(calls).toHaveLength(1)
    const calls2 = stub([json({ id: PAY }, 201)])
    const err2 = await httpBillingService.recordAdvance({ patientId: PAT, amount: "5", mode: "cash" }).then(() => null, (e: unknown) => e)
    expect(classifyCreateError(err2).kind).toBe("saved-unreadable")
    expect(calls2).toHaveLength(1)
  })
  it("a bad value is refused before any request", async () => {
    const calls = stub([json(receipt(), 201)])
    await expect(httpBillingService.recordPayment({ patientId: PAT, amount: "0", mode: "cash" })).rejects.toBeInstanceOf(RangeError)
    await expect(httpBillingService.voidInvoice(INV, "no")).rejects.toBeInstanceOf(RangeError)
    await expect(httpBillingService.discountInvoice("nope", { type: "percent", value: "10" }, "Concession")).rejects.toBeInstanceOf(RangeError)
    expect(calls).toHaveLength(0)
  })
})

describe("reading receipts and registers", () => {
  it("a receipt keeps every amount as sent, the payer by kind, what it settled and the account after it", () => {
    const r = parseReceipt(receipt({ keptAsCredit: "250.00", account: { outstanding: "0.00", credit: "250.00" } }))
    expect(r).toMatchObject({ receiptNo: "RCT-2026-0031", type: "payment", mode: "cash", amount: "1000.00", keptAsCredit: "250.00", account: { outstanding: "0.00", credit: "250.00" } })
    expect(r.payer).toEqual({ kind: "patient", id: PAT, mrNo: "MR-2026-0042", name: "Ayesha Khan" })
    expect(r.settled).toEqual([{ chargeId: CHG, invoiceNo: "INV-2026-0007", description: "Consultation: Dr Imran", amount: "1000.00" }])
    expect(r.hospital.currencyCode).toBe("PKR")
  })
  it("a panel payer, a counter-sale payer and a credit note (no mode, no invoice) are read as they are", () => {
    expect(parseReceipt(receipt({ payer: { kind: "panel", id: PANEL, name: "State Life" }, mode: "insurance" })).payer).toEqual({ kind: "panel", id: PANEL, name: "State Life" })
    expect(parseReceipt(receipt({ payer: { kind: "counter", invoiceId: INV, name: "Walk-in Ali" } })).payer).toEqual({ kind: "counter", invoiceId: INV, name: "Walk-in Ali" })
    expect(parseReceipt(receipt({ type: "credit_note", mode: null, invoice: null }))).toMatchObject({ type: "credit_note", mode: null, invoice: null })
  })
  it("the spec bug is tolerated: reference and notes as a string, null or a one-element array", () => {
    expect(parseReceipt(receipt({ reference: ["CHQ-77"], notes: ["Paid by son"] }))).toMatchObject({ reference: "CHQ-77", notes: "Paid by son" })
    expect(parseReceipt(receipt({ reference: [], notes: "text" }))).toMatchObject({ reference: null, notes: "text" })
  })
  it("a number where money should be, an unknown payer kind or an unknown mode is refused, never coerced", () => {
    expect(() => parseReceipt(receipt({ amount: 1000 }))).toThrow(/not a decimal string/)
    expect(() => parseReceipt(receipt({ keptAsCredit: undefined }))).toThrow()
    expect(() => parseReceipt(receipt({ payer: { kind: "company", id: PAT, name: "x" } }))).toThrow()
    expect(() => parseReceipt(receipt({ mode: "bitcoin" }))).toThrow()
    expect(() => parseApplied({ applied: 250, account })).toThrow()
  })
  it("the registers keep the server's total and every amount as a string", () => {
    const p = parsePaymentList(page([payRow(), payRow({ type: "advance", mode: "card", id: ID("K") })]))
    expect(p.total).toBe(2)
    expect(p.items[1]).toMatchObject({ type: "advance", mode: "card", amount: "1000.00" })
    const c = parseChargeRegisterList(page([chargeRow(), chargeRow({ patient: null, counterCustomer: "Walk-in Ali", doctor: null, payer: "counter", voided: true })]))
    expect(c.items[0]).toMatchObject({ totalAmount: "1500.00", received: "500.00", outstanding: "1000.00", voided: false })
    expect(c.items[1]).toMatchObject({ patient: null, counterCustomer: "Walk-in Ali", doctor: null, payer: "counter", voided: true })
    expect(parseApplied({ applied: "250.00", account })).toEqual({ applied: "250.00", account })
  })
  it("register queries send only what is set and refuse bad values", () => {
    expect(paymentListQuery({ page: 2, pageSize: 10, type: "advance", mode: "card", dateFrom: "2026-11-01", dateTo: "2026-11-07", patientId: PAT, receivedBy: USER }))
      .toEqual({ page: 2, perPage: 10, type: "advance", mode: "card", dateFrom: "2026-11-01", dateTo: "2026-11-07", patientId: PAT, receivedBy: USER })
    expect(chargeListQuery({ page: 1, pageSize: 10, sourceType: "service", payer: "panel", panelId: PANEL, doctorId: USER, includeVoided: true, dateFrom: "2026-11-01" }))
      .toEqual({ page: 1, perPage: 10, sourceType: "service", payer: "panel", panelId: PANEL, doctorId: USER, includeVoided: "true", dateFrom: "2026-11-01" })
    expect(() => paymentListQuery({ type: "gift" as never })).toThrow(RangeError)
    expect(() => paymentListQuery({ pageSize: 101 })).toThrow(RangeError)
    expect(() => chargeListQuery({ payer: "company" as never })).toThrow(RangeError)
    expect(() => chargeListQuery({ dateFrom: "2026-11-07", dateTo: "2026-11-01" })).toThrow(RangeError)
  })
})

describe("wiring", () => {
  it("the thirteen new keys are the documented routes", () => {
    expect(ENDPOINTS["invoices.create"]).toEqual({ method: "POST", path: "/invoices" })
    expect(ENDPOINTS["invoices.addCharges"]).toEqual({ method: "POST", path: "/invoices/:id/charges" })
    expect(ENDPOINTS["invoices.discount"]).toEqual({ method: "POST", path: "/invoices/:id/discount" })
    expect(ENDPOINTS["invoices.void"]).toEqual({ method: "POST", path: "/invoices/:id/void" })
    expect(ENDPOINTS["charges.void"]).toEqual({ method: "POST", path: "/charges/:id/void" })
    expect(ENDPOINTS["charges.list"]).toEqual({ method: "GET", path: "/charges" })
    expect(ENDPOINTS["paymentsRegister.list"]).toEqual({ method: "GET", path: "/payments" })
    expect(ENDPOINTS["paymentsRegister.get"]).toEqual({ method: "GET", path: "/payments/:id" })
    expect(ENDPOINTS["paymentsRegister.record"]).toEqual({ method: "POST", path: "/payments" })
    expect(ENDPOINTS["advances.record"]).toEqual({ method: "POST", path: "/advances" })
    expect(ENDPOINTS["credit.apply"]).toEqual({ method: "POST", path: "/patients/:id/apply-credit" })
    expect(ENDPOINTS["refunds.record"]).toEqual({ method: "POST", path: "/refunds" })
    expect(ENDPOINTS["creditNotes.record"]).toEqual({ method: "POST", path: "/credit-notes" })
    expect(ENDPOINTS["payments.create"]).toBeNull() // the demo's own payment keys stay unset
  })
  it("every billing write refreshes the bill, the hub lists, the accounts and both registers", () => {
    const src = read("src/lib/services/index.ts")
    expect(src).toContain('["invoice", "invoices", "account", "payments", "charges"]')
    for (const m of ["createInvoice", "addCharges", "discountInvoice", "voidInvoice", "voidCharge", "recordPayment", "recordAdvance", "applyCredit", "refund", "creditNote"]) expect(src, m).toContain(`"${m}"`)
  })
  it("the demo has no payments: every write says so, with no request", async () => {
    const calls = stub([json({})])
    await expect(mockBillingService.recordPayment({ patientId: PAT, amount: "5", mode: "cash" })).rejects.toThrow(/not connected/i)
    expect(calls).toHaveLength(0)
  })
  it("no amount is parsed into a number or added up in the billing service", () => {
    const code = read("src/lib/services/http/billing.ts").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
    expect(code).not.toMatch(/addMoney|subMoney|sumMoney|compareMoney|parseFloat|Number\(|toFixed|\.reduce\(/)
  })
})
