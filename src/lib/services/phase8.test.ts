import { readFileSync } from "node:fs"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { setAccessToken } from "@/lib/api/client"
import { ENDPOINTS } from "./endpoints"
import { NotConnectedError } from "./errors"
import { httpBillingService, invoiceListQuery, parseAccount, parseInvoiceDetail, parseInvoiceList } from "./http/billing"
import { mockBillingService } from "./mock/billing"
import { schemaOf, validate } from "./http/specValidate"
import { HUB_SOURCE, INVOICE_STATUS_LABEL, PAYER_LABEL, SOURCE_LABEL, isCounterSale, partyName, showMoney } from "@/components/billing/billingUi"
import { CHARGE_SOURCE_TYPES, INVOICE_STATUSES } from "./http/billing"

// Phase 8, read side (B1 the visit's bill and the patient's balance, B2 the billing hub, B9 a panel's account; handoff 8.6). Fixtures are validated AGAINST
// docs/openapi.json first. Money is a string end to end: nothing is added, compared or rounded. Nothing here contacts a backend.

afterEach(() => { vi.unstubAllGlobals(); setAccessToken(null) })

const root = process.cwd()
const read = (rel: string) => readFileSync(path.resolve(root, rel), "utf8")
const INV = "01HZXAAAAAAAAAAAAAAAAAAAAA"
const PAT = "01HZXBBBBBBBBBBBBBBBBBBBBB"
const ENC = "01HZXCCCCCCCCCCCCCCCCCCCCC"
const CHG = "01HZXDDDDDDDDDDDDDDDDDDDDD"
const PANEL = "01HZXEEEEEEEEEEEEEEEEEEEEE"
const NOW = "2026-11-07T10:00:00.000Z"
const LENIENT = { lenientStringArrays: true } as const // the spec types counterCustomer and voidedReason on the detail as arrays (a spec bug)

const patient = { id: PAT, mrNo: "MR-2026-0042", name: "Ayesha Khan" }
const charge = (over: Record<string, unknown> = {}) => ({
  id: CHG, sourceType: "consultation", description: "Consultation: Dr Imran", rate: "1500.00", qty: "1", gross: "1500.00", discountAmount: "0.00", discountPct: "0", netAmount: "1500.00",
  gstPct: "0", gstAmount: "0.00", totalAmount: "1500.00", received: "500.00", outstanding: "1000.00", payer: "patient", panel: null, chargedAt: NOW, serviceDate: "2026-11-07",
  voided: false, voidedAt: null, voidedReason: null, ...over,
})
const detail = (over: Record<string, unknown> = {}) => ({
  id: INV, invoiceNo: "INV-2026-0007", issuedAt: NOW, status: "partial", patient, counterCustomer: null, encounter: { id: ENC, encId: "OPD-2026-0012", type: "opd", status: "open" },
  totals: { gross: "1500.00", discount: "0.00", net: "1500.00", gst: "0.00", total: "1500.00", received: "500.00", balance: "1000.00", patientBalance: "1000.00", panelBalance: "0.00" },
  charges: [charge()], voidedAt: null, voidedReason: null, ...over,
})
const row = (over: Record<string, unknown> = {}) => ({
  id: INV, invoiceNo: "INV-2026-0007", issuedAt: NOW, status: "partial", patient, counterCustomer: null, encounter: { id: ENC, encId: "OPD-2026-0012", type: "opd" },
  total: "1500.00", discount: "0.00", received: "500.00", balance: "1000.00", sourceTypes: ["consultation"], ...over,
})
const page = (data: unknown[]) => ({ data, meta: { page: 1, perPage: 10, total: data.length, totalPages: 1 } })

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
function stub(responses: Response[]) {
  const calls: { method: string; url: string }[] = []
  let i = 0
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ method: init.method as string, url })
    return responses[Math.min(i++, responses.length - 1)].clone()
  }))
  return calls
}

describe("fixtures are what the specification says", () => {
  it("the invoice detail, a hub page (with a counter sale), and an account validate against their schemas", () => {
    expect(validate(detail(), schemaOf("InvoiceDetailDto_Output"), LENIENT)).toEqual([])
    expect(validate(page([row(), row({ patient: null, counterCustomer: "Walk-in Ali", encounter: null, sourceTypes: ["pharmacy"] })]), schemaOf("InvoicePageDto_Output"))).toEqual([])
    expect(validate({ outstanding: "1000.00", credit: "250.00" }, schemaOf("AccountDto_Output"))).toEqual([])
  })
})

describe("parsing: amounts stay exactly as sent", () => {
  it("the detail keeps every amount as the server's string, the patient, the visit and the charges", () => {
    const d = parseInvoiceDetail(detail())
    expect(d.totals).toEqual({ gross: "1500.00", discount: "0.00", net: "1500.00", gst: "0.00", total: "1500.00", received: "500.00", balance: "1000.00", patientBalance: "1000.00", panelBalance: "0.00" })
    expect(d.charges[0]).toMatchObject({ rate: "1500.00", qty: "1", outstanding: "1000.00", payer: "patient", panel: null, voided: false })
    expect(d.encounter).toEqual({ id: ENC, encId: "OPD-2026-0012", type: "opd", status: "open" })
    expect(typeof d.totals.balance).toBe("string")
  })
  it("a voided invoice, a panel-paid charge and a counter sale are read as they are", () => {
    const d = parseInvoiceDetail(detail({ status: "voided", voidedAt: NOW, voidedReason: "Entered twice", patient: null, counterCustomer: "Walk-in Ali", encounter: null, charges: [charge({ payer: "panel", panel: { id: PANEL, name: "State Life" }, voided: true, voidedAt: NOW, voidedReason: "Wrong service" })] }))
    expect(d).toMatchObject({ status: "voided", voidedReason: "Entered twice", patient: null, counterCustomer: "Walk-in Ali", encounter: null })
    expect(d.charges[0]).toMatchObject({ payer: "panel", panel: { id: PANEL, name: "State Life" }, voided: true, voidedReason: "Wrong service" })
  })
  it("the spec bug is tolerated: counterCustomer and voidedReason as a string, null or a one-element array", () => {
    expect(parseInvoiceDetail(detail({ counterCustomer: ["Walk-in Ali"], voidedReason: ["Entered twice"], patient: null, encounter: null })).counterCustomer).toBe("Walk-in Ali")
    expect(parseInvoiceDetail(detail({ counterCustomer: [], voidedReason: [] }))).toMatchObject({ counterCustomer: null, voidedReason: null })
    expect(parseInvoiceDetail(detail({ voidedReason: "Entered twice" })).voidedReason).toBe("Entered twice")
  })
  it("a list row has no visit status; the page carries the server's total", () => {
    const l = parseInvoiceList(page([row(), row({ patient: null, counterCustomer: "Walk-in Ali", encounter: null })]))
    expect(l.total).toBe(2)
    expect(l.items[0].encounter).toEqual({ id: ENC, encId: "OPD-2026-0012", type: "opd", status: null })
    expect(l.items[1]).toMatchObject({ patient: null, counterCustomer: "Walk-in Ali", encounter: null })
  })
  it("a number where money should be, a non-decimal string, an unknown status or a missing field is refused, never coerced", () => {
    expect(() => parseInvoiceDetail(detail({ totals: { ...detail().totals, balance: 1000 } }))).toThrow(/not a decimal string/)
    expect(() => parseInvoiceDetail(detail({ totals: { ...detail().totals, total: "1,500.00" } }))).toThrow(/not a decimal string/)
    expect(() => parseInvoiceDetail(detail({ charges: [charge({ qty: 1 })] }))).toThrow(/not a decimal string/)
    expect(() => parseInvoiceDetail(detail({ status: "settled" }))).toThrow()
    expect(() => parseInvoiceDetail({ ...detail(), totals: undefined })).toThrow()
    expect(() => parseInvoiceList(page([row({ sourceTypes: ["unknown"] })]))).toThrow()
    expect(() => parseAccount({ outstanding: "10.00" })).toThrow()
    expect(() => parseAccount({ outstanding: 10, credit: "0.00" })).toThrow(/not a decimal string/)
  })
  it("the account is two strings", () => {
    expect(parseAccount({ outstanding: "1000.00", credit: "250.00" })).toEqual({ outstanding: "1000.00", credit: "250.00" })
  })
})

describe("the hub query", () => {
  it("sends only what is set: paging, trimmed search, ids, status, charge type, dates, sort", () => {
    expect(invoiceListQuery({})).toEqual({ page: undefined, perPage: undefined })
    expect(invoiceListQuery({ page: 2, pageSize: 10, search: "  ayesha ", patientId: PAT, encounterId: ENC, status: "unpaid", sourceType: "service", dateFrom: "2026-11-01", dateTo: "2026-11-07", sort: "issuedAt:desc" }))
      .toEqual({ page: 2, perPage: 10, search: "ayesha", patientId: PAT, encounterId: ENC, status: "unpaid", sourceType: "service", dateFrom: "2026-11-01", dateTo: "2026-11-07", sort: "issuedAt:desc" })
  })
  it("sends the OPD/IPD filter the handoff names (8.6: encounterType), and only when it is set", () => {
    expect(invoiceListQuery({ page: 1, pageSize: 10, encounterType: "ipd" })).toEqual({ page: 1, perPage: 10, encounterType: "ipd" })
    expect(Object.keys(invoiceListQuery({ page: 1, pageSize: 10, status: "paid" }))).not.toContain("encounterType")
    expect(() => invoiceListQuery({ encounterType: "daycare" as never })).toThrow(RangeError)
  })
  it("refuses a bad value before any request: page size over 100, bad ids, dates, status, type, sort, an end before the start", () => {
    expect(() => invoiceListQuery({ pageSize: 101 })).toThrow(RangeError)
    expect(() => invoiceListQuery({ patientId: "x" })).toThrow(RangeError)
    expect(() => invoiceListQuery({ encounterId: "x" })).toThrow(RangeError)
    expect(() => invoiceListQuery({ dateFrom: "07/11/2026" })).toThrow(RangeError)
    expect(() => invoiceListQuery({ status: "settled" as never })).toThrow(RangeError)
    expect(() => invoiceListQuery({ sourceType: "pizza" as never })).toThrow(RangeError)
    expect(() => invoiceListQuery({ sort: "issuedAt" })).toThrow(RangeError)
    expect(() => invoiceListQuery({ dateFrom: "2026-11-07", dateTo: "2026-11-01" })).toThrow(RangeError)
    expect(() => invoiceListQuery({ search: "a".repeat(101) })).toThrow(RangeError)
  })
})

describe("HTTP adapter: exact requests (all GET)", () => {
  it("each read is its own call with the documented path, and the list sends the query", async () => {
    const calls = stub([json(page([row()])), json(detail()), json(detail()), json({ outstanding: "1000.00", credit: "0.00" }), json({ outstanding: "0.00", credit: "0.00" })])
    await httpBillingService.listInvoices({ page: 1, pageSize: 10, status: "unpaid" })
    await httpBillingService.getInvoice(INV)
    await httpBillingService.invoiceForEncounter(ENC)
    await httpBillingService.patientAccount(PAT)
    await httpBillingService.panelAccount(PANEL)
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      "GET /api/v1/invoices?page=1&perPage=10&status=unpaid", `GET /api/v1/invoices/${INV}`, `GET /api/v1/encounters/${ENC}/invoice`, `GET /api/v1/patients/${PAT}/account`, `GET /api/v1/panels/${PANEL}/account`,
    ])
  })
  it("a bad id is refused before any request", async () => {
    const calls = stub([json(detail())])
    await expect(httpBillingService.getInvoice("not-an-id")).rejects.toBeInstanceOf(RangeError)
    await expect(httpBillingService.patientAccount("x")).rejects.toBeInstanceOf(RangeError)
    expect(calls).toHaveLength(0)
  })
  it("an answer that is not the documented shape is an error, not a half-filled bill", async () => {
    stub([json({ id: INV })])
    await expect(httpBillingService.getInvoice(INV)).rejects.toBeInstanceOf(TypeError)
  })
})

describe("wiring", () => {
  it("the five read keys are connected to the documented routes; the old demo bill-summary keys stay unset", () => {
    expect(ENDPOINTS["invoices.list"]).toEqual({ method: "GET", path: "/invoices" })
    expect(ENDPOINTS["invoices.get"]).toEqual({ method: "GET", path: "/invoices/:id" })
    expect(ENDPOINTS["invoices.forEncounter"]).toEqual({ method: "GET", path: "/encounters/:id/invoice" })
    expect(ENDPOINTS["account.patient"]).toEqual({ method: "GET", path: "/patients/:id/account" })
    expect(ENDPOINTS["account.panel"]).toEqual({ method: "GET", path: "/panels/:id/account" })
    expect(ENDPOINTS["billSummary.patient"]).toBeNull()
    expect(ENDPOINTS["billSummary.encounter"]).toBeNull()
  })
  it("the demo has no invoices: every call says so, with no request", async () => {
    const calls = stub([json({})])
    await expect(mockBillingService.listInvoices()).rejects.toBeInstanceOf(NotConnectedError)
    await expect(mockBillingService.patientAccount(PAT)).rejects.toBeInstanceOf(NotConnectedError)
    expect(calls).toHaveLength(0)
  })
  it("no money arithmetic anywhere in the billing reader or the money display code it is rendered with", () => {
    const code = read("src/lib/services/http/billing.ts").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
    expect(code).not.toMatch(/addMoney|subMoney|compareMoney|parseFloat|Number\(|toFixed/)
  })
})

describe("what the billing screens show", () => {
  it("amounts are shown exactly: two decimals as Rs. with grouping, anything with more decimals is shown as sent and never rounded", () => {
    expect(showMoney("1500.00")).toBe("Rs. 1,500")
    expect(showMoney("1500.50")).toBe("Rs. 1,500.50")
    expect(showMoney("0.00")).toBe("Rs. 0")
    expect(showMoney("-250.00")).toBe("Rs. -250")
    expect(showMoney("1500.005")).toBe("Rs. 1500.005")
  })
  it("a counter sale has no patient: its customer's name stands where a patient name would", () => {
    expect(partyName({ patient: { name: "Ayesha Khan" }, counterCustomer: null })).toBe("Ayesha Khan")
    expect(partyName({ patient: null, counterCustomer: "Walk-in Ali" })).toBe("Walk-in Ali")
    expect(partyName({ patient: null, counterCustomer: null })).toBe("Counter sale")
    expect(isCounterSale({ patient: null })).toBe(true)
    expect(isCounterSale({ patient: { name: "x" } })).toBe(false)
  })
  it("every status, charge type and payer the spec lists has a label, and the hub's two tabs are the two charge sources the handoff names", () => {
    for (const s of INVOICE_STATUSES) expect(INVOICE_STATUS_LABEL[s]).toBeTruthy()
    for (const s of CHARGE_SOURCE_TYPES) expect(SOURCE_LABEL[s]).toBeTruthy()
    expect(Object.keys(PAYER_LABEL).sort()).toEqual(["counter", "panel", "patient"])
    expect(HUB_SOURCE).toEqual({ consultations: "consultation", services: "service" })
  })
})

describe("the screens are wired as the handoff says", () => {
  it("the visit's Billing tab, the patient's balance, the hub's two invoice tabs and the panel account are the new read-only screens in API mode", () => {
    expect(read("src/components/visits/VisitDetailScreen.tsx")).toContain("<VisitBillTab visitId={v.id} />")
    expect(read("src/app/(dashboard)/patients/[id]/page.tsx")).toContain('dataSource === "api" ? (')
    expect(read("src/app/(dashboard)/patients/[id]/page.tsx")).toContain("<PatientAccountPanel patientId={patient.id} patientName={patient.name} />")
    const hub = read("src/app/(dashboard)/billing/[tab]/BillingHub.tsx")
    expect(hub).toContain('<InvoicesTab sourceType="consultation" />')
    expect(hub).toContain('<InvoicesTab sourceType="service" />')
    expect(hub).toContain("<ConsultationsTab />") // the demo keeps its own tabs
    const panels = read("src/components/masterdata/PanelsTab.tsx")
    expect(panels).toContain('dataSource === "api" && can("billing.read")')
    expect(panels).toContain("<PanelAccountDialog")
  })
  it("every billing read needs billing.read: the tabs say so instead of asking the server", () => {
    for (const f of ["VisitBillTab", "AccountPanels", "InvoicesTab"]) expect(read(`src/components/billing/${f}.tsx`), f).toContain('can("billing.read")')
  })
  it("the invoice list is server-paged (10 a page), sends the search as a parameter and keeps it out of the address bar", () => {
    const src = read("src/components/billing/InvoicesTab.tsx")
    expect(src).toContain("const PAGE_SIZE = 10")
    expect(src).toContain('const URL_KEYS = ["page", "status", "from", "to", "patient", "type"] as const')
    expect(src).not.toMatch(/url\.set\(\{[^}]*search/)
  })
  it("no money arithmetic or number conversion in any billing screen file: every figure is the server's string", () => {
    for (const f of ["billingUi.ts", "InvoicePanel.tsx", "VisitBillTab.tsx", "AccountPanels.tsx", "InvoicesTab.tsx"]) {
      const code = read(`src/components/billing/${f}`).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
      expect(code, f).not.toMatch(/addMoney|subMoney|sumMoney|compareMoney|moneyFromNumber|parseFloat|Number\(|toFixed|\.reduce\(/)
    }
  })
})
