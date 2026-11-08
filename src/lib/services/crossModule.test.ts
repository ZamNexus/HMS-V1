import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { SERVICES_INVOICES } from "@/data/billing"
import { ENCOUNTERS } from "@/data/encounters"
import { LAB_ORDERS } from "@/data/lab"
import { MEDICINES } from "@/data/medicines"
import { PATIENTS } from "@/data/patients"
import { SERVICE_CATALOG } from "@/data/services"
import { AUDIT_LOG } from "@/data/settings"
import { CROSS_MODULE_OPERATIONS, crossModuleContractStatus } from "./crossModuleContract"
import { ENDPOINTS } from "./endpoints"
import { NotConnectedError } from "./errors"
import { httpBillSummaryService, httpNotificationsService, httpServiceUsageService } from "./http/crossModule"
import { mockBillSummaryService, mockItemHistoryService, mockNotificationsService, mockServiceUsageService } from "./mock/crossModule"
import { mockMedicinesService } from "./mock/pharmacy"
import { httpMedicinesService } from "./http/pharmacy"
import { pharmacyContractStatus } from "./pharmacyContract"
import type { ItemHistoryEntry, MedicineRecord, ServiceUsageEntry } from "./types"
import type { PrescriptionItem } from "@/types"
import { mockReportsService, mockServiceCatalogService } from "./mock/reports"
import type { BillSummaryState } from "@/lib/useBillSummary"

// Frontend-only unit tests with controlled demo data. They say nothing about the real backend: no contract for Item History (T12), the
// catalogue writes, the bill summary or notifications has been published, so none of it is wired.

// The services catalogue (S5) and Item History (D8: the handoff's route plus the proposed entry fields) are connected; the bill summary still awaits its contract.
const PENDING_OPERATIONS = CROSS_MODULE_OPERATIONS.filter((k) => !k.startsWith("serviceCatalog.") && k !== "itemHistory.list")
afterEach(() => {
  vi.unstubAllGlobals()
  for (const k of PENDING_OPERATIONS) ENDPOINTS[k] = null
})

const root = join(__dirname, "../../..")
const source = (rel: string) => readFileSync(join(root, rel), "utf8")

describe("contract-pending behaviour (API mode)", () => {
  it("has no endpoint configured for Item History or the bill summary, the catalogue is connected, and no notification key exists at all", () => {
    expect(CROSS_MODULE_OPERATIONS).toHaveLength(6)
    expect(PENDING_OPERATIONS).toEqual(["billSummary.patient", "billSummary.encounter"])
    expect(ENDPOINTS["itemHistory.list"]).toEqual({ method: "GET", path: "/audit-entries" })
    for (const k of PENDING_OPERATIONS) expect(ENDPOINTS[k], k).toBeNull()
    expect(ENDPOINTS["serviceCatalog.list"]).toEqual({ method: "GET", path: "/services" })
    expect(Object.keys(ENDPOINTS).filter((k) => /notification|usage/i.test(k))).toEqual([]) // invoice usage is a demo view: no key either
  })

  it("every HTTP operation sends no request and reports 'awaiting the backend contract' (no fake record, no zero)", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const calls = [
      httpBillSummaryService.forPatient("01HX"),
      httpBillSummaryService.forEncounter("01HX"),
      httpNotificationsService.list(),
      httpServiceUsageService.list({ id: "01HX" }),
    ]
    for (const c of calls) await expect(c).rejects.toBeInstanceOf(NotConnectedError)
    for (const c of calls) await expect(c).rejects.toThrow(/awaiting the backend contract/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("even with paths configured, sends nothing until the request/response mapping is implemented", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({}), { headers: { "content-type": "application/json" } }))
    vi.stubGlobal("fetch", fetchMock)
    for (const k of PENDING_OPERATIONS) ENDPOINTS[k] = { method: "GET", path: "/hypothetical" } // test-only
    await expect(httpBillSummaryService.forPatient("01HX")).rejects.toThrow(/query parameters/)
    await expect(httpBillSummaryService.forEncounter("01HX")).rejects.toThrow(/query parameters/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("the HTTP adapters can never fall back to demo data: they import nothing from src/data or the mocks", () => {
    for (const f of ["src/lib/services/http/crossModule.ts", "src/lib/services/http/reports.ts"]) {
      expect(source(f), f).not.toMatch(/from\s+["'][^"']*(\/data\/|\/mock\/|billingAggregate)/)
    }
  })

  it("the contract status: API mode is pending for the 2 unpublished bill-summary operations only; mock mode never is; one key at a time", () => {
    const api = crossModuleContractStatus("api")
    expect(api.pending).toBe(true)
    expect(api.missing).toEqual(PENDING_OPERATIONS)
    expect(PENDING_OPERATIONS.some((op) => api.can(op))).toBe(false)
    expect(api.can("serviceCatalog.list") && api.can("serviceCatalog.create") && api.can("serviceCatalog.update")).toBe(true)
    expect(crossModuleContractStatus("mock")).toMatchObject({ pending: false, missing: [] })
    const one = crossModuleContractStatus("api", { ...ENDPOINTS, "billSummary.patient": { method: "GET" as const, path: "/hypothetical" } }) // copy, test-only
    expect(one.can("billSummary.patient")).toBe(true)
    expect(one.can("billSummary.encounter")).toBe(false)
  })
})

describe("no screen in scope reads a demo array or the billing aggregate directly", () => {
  it("Topbar, balance panels, encounter / patient detail, services catalogue and the Services Invoice picker", () => {
    expect(source("src/components/layout/Topbar.tsx")).not.toMatch(/from\s+["']@\/data\//)
    for (const f of [
      "src/components/layout/Topbar.tsx", "src/components/shared/PatientInfoPanel.tsx", "src/components/patients/PatientForm.tsx",
      "src/app/(dashboard)/patients/[id]/page.tsx", "src/app/(dashboard)/encounters/[id]/page.tsx",
      "src/app/(dashboard)/admin/master-data/page.tsx", "src/app/(dashboard)/billing/services/new/page.tsx",
    ]) {
      expect(source(f), f).not.toMatch(/billingAggregate|from\s+["']@\/data\/services["']|\/mock\//)
    }
    // The Master Data page no longer reads the invoices or the patients for the old usage list.
    expect(source("src/app/(dashboard)/admin/master-data/page.tsx")).not.toMatch(/from\s+["']@\/data\/(billing|patients)["']/)
  })
})

describe("Item History (T12 audit log) and Invoice Usage are separate concepts", () => {
  const used = () => {
    const counts = new Map<string, number>()
    for (const inv of SERVICES_INVOICES) for (const l of inv.lines) counts.set(l.name, (counts.get(l.name) ?? 0) + 1)
    return counts
  }
  const itemHistoryMockSource = () => {
    const src = source("src/lib/services/mock/crossModule.ts")
    return src.slice(src.indexOf("export const mockItemHistoryService"), src.indexOf("export const mockServiceUsageService"))
  }

  it("mock audit history NEVER turns invoice lines into audit events: an invoiced service still has no audit entries", async () => {
    const counts = used()
    const svc = SERVICE_CATALOG.find((s) => counts.has(s.name))
    expect(svc, "the demo data should contain an invoiced service").toBeDefined()
    expect(counts.get(svc!.name)).toBeGreaterThan(0) // it IS used on invoices ...
    expect(await mockItemHistoryService.list({ subject: "serviceCatalogItem", id: String(svc!.id) })).toEqual({ items: [], total: 0 }) // ... and still has no audit events
    for (const s of SERVICE_CATALOG.slice(0, 6)) expect((await mockItemHistoryService.list({ subject: "serviceCatalogItem", id: String(s.id) })).items).toEqual([])
  })

  it("the audit mock reads no invoice, patient or other demo array, and invents no action, actor, timestamp or detail text", () => {
    const body = itemHistoryMockSource()
    expect(body).toContain("export const mockItemHistoryService")
    expect(body).not.toMatch(/SERVICES_INVOICES|PATIENTS|AUDIT_LOG|inv\.|Billed on invoice|actor:|action:|details:|new Date/)
  })

  it("the only audit-shaped demo data (AUDIT_LOG) concerns other modules and no catalogue item, so it cannot honestly back this dialog", () => {
    expect(AUDIT_LOG.length).toBeGreaterThan(0)
    expect(AUDIT_LOG.some((e) => /service|catalog/i.test(e.module))).toBe(false)
    for (const f of ["src/app/(dashboard)/admin/master-data/page.tsx", "src/components/shared/ItemHistoryView.tsx", "src/lib/services/http/crossModule.ts"]) expect(source(f), f).not.toMatch(/AUDIT_LOG/)
  })

  it("an unknown or non-numeric id is a 404, never an empty audit history", async () => {
    await expect(mockItemHistoryService.list({ subject: "serviceCatalogItem", id: "99999" })).rejects.toMatchObject({ status: 404 })
    await expect(mockItemHistoryService.list({ subject: "serviceCatalogItem", id: "01HXULIDLIKE" })).rejects.toMatchObject({ status: 404 })
  })

  it("the audit entry type has no invoice fields and the usage entry type has no audit fields (the two shapes cannot be swapped)", () => {
    const types = source("src/lib/services/types.ts")
    const usage = types.slice(types.indexOf("export interface ServiceUsageEntry"), types.indexOf("export interface ServiceUsageService"))
    expect(usage).not.toMatch(/action|actor|details/)
    const audit = types.slice(types.indexOf("export interface ItemHistoryEntry"), types.indexOf("export interface ItemHistoryService"))
    expect(audit).not.toMatch(/invoice|quantity|amount|rate/i)
    // compile-time: neither is assignable to the other
    // @ts-expect-error a usage entry is not an audit entry
    const notAudit: ItemHistoryEntry = {} as ServiceUsageEntry
    // @ts-expect-error an audit entry is not a usage entry
    const notUsage: ServiceUsageEntry = {} as ItemHistoryEntry
    void notAudit; void notUsage
  })

  it("mock invoice usage lists exactly the invoice lines whose name equals the service, newest first, with exact money and no actor or action", async () => {
    const counts = used()
    const svc = SERVICE_CATALOG.find((s) => counts.has(s.name))!
    const r = await mockServiceUsageService.list({ id: String(svc.id) })
    expect(r.total).toBe(counts.get(svc.name))
    expect(r.items).toHaveLength(counts.get(svc.name)!)
    const times = r.items.map((e) => new Date(e.at).getTime())
    expect([...times].sort((a, b) => b - a)).toEqual(times)
    const invoices = new Set(SERVICES_INVOICES.filter((i) => i.lines.some((l) => l.name === svc.name)).map((i) => i.invoiceNo))
    for (const e of r.items) {
      expect(invoices.has(e.invoiceNo)).toBe(true)
      expect(e.rate).toMatch(/^\d+\.\d{2}$/)
      expect(e.amount).toMatch(/^\d+\.\d{2}$/)
      expect(Object.keys(e).sort()).toEqual(["amount", "at", "id", "invoiceNo", "patient", "quantity", "rate"])
    }
  })

  it("a never-invoiced service has an empty usage list, and an unknown or non-numeric id is a 404", async () => {
    const never = SERVICE_CATALOG.find((s) => !used().has(s.name))
    expect(never).toBeDefined()
    expect(await mockServiceUsageService.list({ id: String(never!.id) })).toEqual({ items: [], total: 0 })
    await expect(mockServiceUsageService.list({ id: "99999" })).rejects.toMatchObject({ status: 404 })
    await expect(mockServiceUsageService.list({ id: "01HXULIDLIKE" })).rejects.toMatchObject({ status: 404 })
  })

  it("the Master Data dialog is audit-first, offers the usage tab under an explicit demo label in mock mode only, and keeps the old audit wording out", () => {
    const page = source("src/app/(dashboard)/admin/master-data/page.tsx")
    const body = page.slice(page.indexOf("function ServiceHistoryBody"), page.indexOf("function AuditHistoryPanel"))
    expect(body.indexOf('value="audit"')).toBeGreaterThan(-1)
    expect(body.indexOf('value="audit"')).toBeLessThan(body.indexOf('value="usage"'))
    expect(body).toContain("Audit history")
    expect(body).toContain("Invoice usage (demo)")
    expect(body.match(/dataSource === "mock"/g)).toHaveLength(2) // both the tab trigger and its panel are mock-only
    expect(page).toContain("itemHistoryService.list")
    expect(page).toContain("serviceUsageService.list")
    expect(page).not.toMatch(/Billed on invoice/)
    expect(source("src/components/shared/ItemHistoryView.tsx")).not.toMatch(/Billed on invoice/)
  })
})

describe("ItemHistoryView / ServiceUsageView states (server-rendered)", () => {
  const retry = () => {}
  const view = async () => import("@/components/shared/ItemHistoryView")
  beforeAll(async () => { await view() }, 30_000) // the first dynamic import of the view pulls in the UI kit and is slow on a cold run
  const none = { entries: null, error: null, loading: false, onRetry: retry }

  it("API mode, no contract: the audit view is a contract-pending notice — no entries, no 'no history' claim, no usage records", async () => {
    const { ItemHistoryView } = await view()
    const html = renderToStaticMarkup(createElement(ItemHistoryView, { source: "api", state: { ...none, error: new NotConnectedError("endpoint \"itemHistory.list\"") } }))
    expect(html).toContain('data-testid="item-history-pending"')
    expect(html).toMatch(/Not connected/)
    expect(html).toMatch(/not an empty audit history/)
    expect(html).toContain("Item History (audit-log read, T12)")
    expect(html).not.toMatch(/No audit entries|No history|No audit log in mock mode|Billed on invoice|<table/)
  })

  it("mock mode, empty: says the demo keeps no audit log and that this does not mean the item was never changed; no events", async () => {
    const { ItemHistoryView } = await view()
    const html = renderToStaticMarkup(createElement(ItemHistoryView, { source: "mock", state: { ...none, entries: [] } }))
    expect(html).toContain('data-testid="item-history-mock-empty"')
    expect(html).toMatch(/No audit log in mock mode/)
    expect(html).toMatch(/does not mean the item was never changed/)
    expect(html).not.toMatch(/<table|Billed on invoice/)
  })

  it("API mode, a real empty result, is worded as the backend's answer (and only reachable once a contract exists)", async () => {
    const { ItemHistoryView } = await view()
    const html = renderToStaticMarkup(createElement(ItemHistoryView, { source: "api", state: { ...none, entries: [] } }))
    expect(html).toContain('data-testid="item-history-empty"')
    expect(html).toMatch(/audit log returned no entries/)
  })

  it("loading and error states: skeleton, then the backend message with a retry — no entries either way", async () => {
    const { ItemHistoryView } = await view()
    expect(renderToStaticMarkup(createElement(ItemHistoryView, { source: "api", state: { ...none, loading: true } }))).toContain('aria-label="Loading audit history"')
    const html = renderToStaticMarkup(createElement(ItemHistoryView, { source: "api", state: { ...none, error: new Error("boom") } }))
    expect(html).toContain('data-testid="item-history-error"')
    expect(html).toContain("Try again")
    expect(html).not.toContain("<table")
  })

  it("entries are rendered verbatim from the service; a missing actor is a dash, nothing is invented", async () => {
    const { ItemHistoryView } = await view()
    const entries: ItemHistoryEntry[] = [{ id: "e1", at: "2026-01-02T03:04:05.000Z", action: "ACTION-FROM-SERVICE", actor: null, details: "DETAILS-FROM-SERVICE" }]
    const html = renderToStaticMarkup(createElement(ItemHistoryView, { source: "api", state: { ...none, entries } }))
    for (const h of ["When", "Action", "By", "Details"]) expect(html).toContain(h)
    expect(html).toContain("ACTION-FROM-SERVICE")
    expect(html).toContain("DETAILS-FROM-SERVICE")
    expect(html).toContain("—")
  })

  it("Invoice Usage carries an explicit 'not an audit log' demo notice, invoice columns only, and no audit vocabulary", async () => {
    const { ServiceUsageView } = await view()
    const entries: ServiceUsageEntry[] = [{ id: "u1", invoiceNo: "SINV-0001", at: "2026-01-02T03:04:05.000Z", patient: "Test Patient", quantity: 2, rate: "100.00", amount: "200.00" }]
    const html = renderToStaticMarkup(createElement(ServiceUsageView, { state: { ...none, entries } }))
    expect(html).toContain('data-testid="service-usage-notice"')
    expect(html).toMatch(/Demo data/)
    expect(html).toMatch(/not an audit log/)
    for (const h of ["Invoice date", "Invoice", "Patient", "Qty", "Rate", "Amount"]) expect(html).toContain(h)
    expect(html).toContain("SINV-0001")
    expect(html).toContain("Rs. 200") // formatMoneyString drops a ".00" tail, as formatCurrency always did
    expect(html).toContain("Rs. 100")
    expect(html).not.toMatch(/>Action<|>By<|>When<|>Details<|audit history/i)
  })

  it("Invoice Usage states: empty is 'Not invoiced yet'; the real-API adapter's pending state is its own notice, never an empty list", async () => {
    const { ServiceUsageView } = await view()
    expect(renderToStaticMarkup(createElement(ServiceUsageView, { state: { ...none, entries: [] } }))).toContain('data-testid="service-usage-empty"')
    const pending = renderToStaticMarkup(createElement(ServiceUsageView, { state: { ...none, error: new NotConnectedError("service invoice usage") } }))
    expect(pending).toContain('data-testid="service-usage-pending"')
    expect(pending).toMatch(/not an empty usage list/)
  })
})

describe("New Encounter prescription step (Correction A: no demo medicine in API mode)", () => {
  const med = (over: Partial<MedicineRecord>): MedicineRecord => ({ ...(over as MedicineRecord) })
  const rows: PrescriptionItem[] = [{ medicine: "", dose: "", route: "Oral", frequency: "OD", duration: "", instructions: "" }]
  const noMedicines = { items: [] as MedicineRecord[], loading: false, error: null as unknown, reload: () => {} }
  const render = async (props: { pending: boolean; medicines?: Partial<typeof noMedicines>; rows?: PrescriptionItem[] }) => {
    const { PrescriptionRows } = await import("@/components/encounters/PrescriptionRows")
    return renderToStaticMarkup(createElement(PrescriptionRows, {
      uid: "u", rows: props.rows ?? rows, medicines: { ...noMedicines, ...props.medicines }, pending: props.pending, onUpdate: () => {}, onRemove: () => {}, onAdd: () => {},
    }))
  }

  it("the medicines.list operation is pending in API mode (no endpoint) and connected in mock mode", () => {
    expect(pharmacyContractStatus("api").can("medicines.list")).toBe(false)
    expect(pharmacyContractStatus("mock").can("medicines.list")).toBe(true)
  })

  it("API mode, no contract: only the contract-pending notice — no picker, no demo medicine name, no stock, no Add button, no 'empty' message", async () => {
    // even if a (hypothetical) leaked list and a selected demo medicine were passed in, the pending state renders none of it
    const demo = (await mockMedicinesService.list({ pageSize: 1000 })).items
    expect(demo.length).toBeGreaterThan(0)
    const html = await render({ pending: true, medicines: { items: demo }, rows: [{ ...rows[0], medicine: demo[0].name }] })
    expect(html).toContain('data-testid="encounter-medicines-pending"')
    expect(html).toMatch(/Not connected/)
    expect(html).toMatch(/not an empty medicine list/)
    expect(html).toContain("list medicines")
    for (const m of MEDICINES) expect(html, m.name).not.toContain(m.name)
    expect(html).not.toMatch(/Stock:|low stock|Add Medicine|role="combobox"|Search medicine|No medicines/)
  })

  it("mock mode: the lines show the picker, the stock note for the selected demo medicine, and the Add button (existing behaviour)", async () => {
    const demo = (await mockMedicinesService.list({ pageSize: 1000 })).items
    expect(demo).toHaveLength(MEDICINES.length)
    const low = demo.find((m) => m.stock < m.reorderLevel)
    const ok = demo.find((m) => m.stock >= m.reorderLevel)!
    const html = await render({ pending: false, medicines: { items: demo }, rows: [{ ...rows[0], medicine: ok.name }] })
    expect(html).toContain('role="combobox"')
    expect(html).toContain("Add Medicine")
    expect(html).toContain(`Stock: ${ok.stock} ${ok.unit}`)
    expect(html).not.toContain("encounter-medicines-pending")
    if (low) {
      const lowHtml = await render({ pending: false, medicines: { items: demo }, rows: [{ ...rows[0], medicine: low.name }] })
      expect(lowHtml).toContain(`Stock: ${low.stock} ${low.unit} (low stock)`)
    }
  })

  it("a medicine the list does not contain gets no stock line (nothing is looked up in a demo array)", async () => {
    const html = await render({ pending: false, medicines: { items: [med({ id: "1", name: "Only One", stock: 5, reorderLevel: 1, unit: "tab" })] }, rows: [{ ...rows[0], medicine: MEDICINES[0].name }] })
    expect(html).not.toContain("Stock:")
  })

  it("loading and error (contract connected): a loading placeholder, then the backend message with a retry and no lines", async () => {
    expect(await render({ pending: false, medicines: { loading: true } })).toContain("Loading medicines")
    const html = await render({ pending: false, medicines: { error: new Error("boom") } })
    expect(html).toContain('data-testid="encounter-medicines-error"')
    expect(html).toContain("Try again")
    expect(html).not.toMatch(/role="combobox"|Add Medicine|Stock:/)
  })

  it("the page reads no demo medicine array: it uses the shared medicines hook behind the contract, requests nothing while pending, and saves no prescription then", () => {
    const page = source("src/app/(dashboard)/encounters/new/page.tsx")
    expect(page).not.toMatch(/@\/data\/medicines|MEDICINES/)
    expect(page).toContain('pharmacyContractStatus(dataSource)')
    expect(page).toContain('const medicinesPending = !medicinesContract.can("medicines.list")')
    expect(page).toContain("useMedicines(!medicinesPending)")
    expect(page).toContain("prescription: medicinesPending ? []")
    expect(source("src/components/encounters/PrescriptionRows.tsx")).not.toMatch(/@\/data\/|\/mock\//)
  })

  it("no request is made: the real-API medicines list reports 'awaiting the backend contract' without calling fetch", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    await expect(httpMedicinesService.list({ pageSize: 1000 })).rejects.toBeInstanceOf(NotConnectedError)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe("mock bill summary (billingAggregate behind the service, exact money)", () => {
  const num = (s: string) => Number(s)

  it("a patient's summary has two-decimal money strings whose parts add up to the total, and agrees with the Patient Balances report", async () => {
    const report = await mockReportsService.patientBalances()
    let checked = 0
    for (const row of report.rows.slice(0, 12)) {
      const s = await mockBillSummaryService.forPatient(row.patientId)
      for (const v of Object.values(s)) expect(v).toMatch(/^-?\d+\.\d{2}$/)
      expect(num(s.consultation) + num(s.services) + num(s.laboratory) + num(s.imaging) + num(s.medicines)).toBeCloseTo(num(s.total), 2)
      expect(s.total).toBe(row.totalBilled)
      expect(s.received).toBe(row.received)
      expect(s.balance).toBe(row.balance)
      checked++
    }
    expect(checked).toBeGreaterThan(0)
  })

  it("an encounter's summary has the same shape and its balance is never negative", async () => {
    for (const e of ENCOUNTERS.slice(0, 8)) {
      const s = await mockBillSummaryService.forEncounter(String(e.id))
      expect(s.balance).toMatch(/^\d+\.\d{2}$/)
      expect(num(s.total)).toBeGreaterThanOrEqual(0)
    }
  })

  it("never fabricates a zero: a ULID, a non-numeric id or an unknown record is rejected", async () => {
    await expect(mockBillSummaryService.forPatient("01HXULIDLIKE00000000000000")).rejects.toMatchObject({ status: 400 })
    await expect(mockBillSummaryService.forEncounter("01HXULIDLIKE00000000000000")).rejects.toMatchObject({ status: 400 })
    await expect(mockBillSummaryService.forPatient("999999")).rejects.toMatchObject({ status: 404 })
    await expect(mockBillSummaryService.forEncounter("999999")).rejects.toMatchObject({ status: 404 })
    expect(PATIENTS.some((p) => p.id === 999999)).toBe(false)
  })
})

describe("mock notifications (the old top-bar rules, recomputed independently)", () => {
  it("lists completed lab orders, out-of-stock and running-low medicines, in that order, with the same counts", async () => {
    const completed = LAB_ORDERS.filter((o) => o.status === "Completed").length
    const out = MEDICINES.filter((m) => m.stock === 0).length
    const low = MEDICINES.filter((m) => m.stock > 0 && m.stock <= m.reorderLevel).length
    const expected = [
      completed > 0 && { id: "lab-ready", title: `${completed} Lab orders completed`, to: "/lab/orders" },
      out > 0 && { id: "out-of-stock", title: `${out} Medicines out of stock`, to: "/pharmacy/inventory" },
      low > 0 && { id: "low-stock", title: `${low} Medicines running low`, to: "/pharmacy/inventory" },
    ].filter(Boolean)
    const items = await mockNotificationsService.list()
    expect(items.map(({ id, title, to }) => ({ id, title, to }))).toEqual(expected)
  })
})

describe("mock services catalogue (list / create / update behind the service)", () => {
  it("filters by category, reports the filtered total, and returns string ids", async () => {
    const all = await mockServiceCatalogService.list({ pageSize: 1000 })
    expect(all.total).toBe(SERVICE_CATALOG.length)
    const procedures = await mockServiceCatalogService.list({ category: "Procedure", pageSize: 1000 })
    expect(procedures.total).toBe(SERVICE_CATALOG.filter((s) => s.category === "Procedure").length)
    for (const r of procedures.items) {
      expect(typeof r.id).toBe("string")
      expect(r.category).toBe("Procedure")
    }
  })

  it("create appends to the shared catalogue and update changes it in place (including deactivating), then restores", async () => {
    const before = SERVICE_CATALOG.length
    const created = await mockServiceCatalogService.create({ code: "T-1", name: "Test Service", category: "Procedure", rate: 123, active: true })
    try {
      expect(SERVICE_CATALOG).toHaveLength(before + 1)
      expect(created.id).toBe(String(SERVICE_CATALOG[SERVICE_CATALOG.length - 1].id))
      const updated = await mockServiceCatalogService.update(created.id, { code: "T-1", name: "Test Service", category: "Procedure", rate: 123, active: false })
      expect(updated.active).toBe(false)
      expect(SERVICE_CATALOG.find((s) => String(s.id) === created.id)?.active).toBe(false)
      const listed = await mockServiceCatalogService.list({ pageSize: 1000 })
      expect(listed.items.find((s) => s.id === created.id)?.active).toBe(false)
      await expect(mockServiceCatalogService.update("99999", { code: "x", name: "x", category: "x", rate: 1, active: true })).rejects.toMatchObject({ status: 404 })
    } finally {
      const idx = SERVICE_CATALOG.findIndex((s) => String(s.id) === created.id)
      if (idx >= 0) SERVICE_CATALOG.splice(idx, 1)
    }
    expect(SERVICE_CATALOG).toHaveLength(before)
  })
})

// The balance panels hang off a patient / encounter record that cannot load in API mode (their own contracts are missing), so a browser
// can never reach them there. Their non-data states are therefore rendered here, on the server renderer, from synthetic states.
describe("BillSummaryNotice states (what a balance panel shows instead of figures)", () => {
  const render = async (state: Partial<BillSummaryState>) => {
    const { BillSummaryNotice } = await import("@/components/shared/BillSummaryNotice")
    const base: BillSummaryState = { data: null, error: null, loading: false, pending: false, idle: false, reload: () => {} }
    return renderToStaticMarkup(createElement(BillSummaryNotice, { state: { ...base, ...state }, awaiting: "patient bill summary", testId: "x" }))
  }

  it("pending: an explicit 'not connected' notice that says it is not an empty bill — and no figure, not even a zero", async () => {
    const html = await render({ pending: true, error: new NotConnectedError("endpoint \"billSummary.patient\"") })
    expect(html).toContain('data-testid="x"')
    expect(html).toMatch(/Not connected/)
    expect(html).toMatch(/not an empty bill/)
    expect(html).toContain("patient bill summary")
    expect(html).not.toMatch(/Rs\.|\b0\.00\b/)
  })

  it("error: the backend's message, a retry button, and no figure", async () => {
    const html = await render({ error: new Error("boom") })
    expect(html).toContain('role="alert"')
    expect(html).toContain("Try again")
    expect(html).not.toMatch(/Rs\./)
  })

  it("loading shows a status skeleton; data or idle shows nothing (the caller renders the figures)", async () => {
    expect(await render({ loading: true })).toContain('role="status"')
    expect(await render({ data: { consultation: "1.00", services: "0.00", laboratory: "0.00", imaging: "0.00", medicines: "0.00", total: "1.00", received: "0.00", balance: "1.00" } })).toBe("")
    expect(await render({ idle: true })).toBe("")
  })
})
