import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { INVOICE_ACTION_LABEL, chargeVoidState, invoiceActionStates, MODE_LABEL, payerLabel, RECEIPT_TYPE_LABEL, type InvoiceActionKey } from "@/components/billing/billingUi"
import { chargeLinesOf } from "@/components/billing/ChargeServicesDialog"
import { RECEIPT_MODES, RECEIPT_TYPES } from "./http/billing"
import type { ChargeSourceType, InvoiceStatus } from "./types"

// Phase 8, the money screens (B3 to B8): which button each invoice shows (handoff 5: no permission or never applicable = not shown, permitted but the state
// forbids it = shown OFF with the reason), the conversion of the charge rows, and the wiring. Pure logic is tested directly; the rest is checked in the source.

const root = process.cwd()
const read = (rel: string) => readFileSync(path.resolve(root, rel), "utf8")
const can = (list: readonly string[]) => (p: string) => list.includes(p)
const PERMS = ["billing.read", "billing.charge", "billing.collect_payment", "billing.write"] as const
const subsets = (): string[][] => {
  const out: string[][] = []
  for (let m = 0; m < 1 << PERMS.length; m++) out.push(PERMS.filter((_, i) => m & (1 << i)))
  return out
}
const patient = { id: "p" }
const inv = (over: Partial<{ status: InvoiceStatus; patient: unknown; visit: string | null }> = {}) => ({
  status: (over.status ?? "partial") as InvoiceStatus, patient: "patient" in over ? over.patient : patient, encounter: over.visit === null ? null : { status: over.visit ?? "closed" },
})

describe("which money buttons an invoice shows", () => {
  it("a closed visit's open invoice, with every permission: add services, pay, discount, credit note and void, all on", () => {
    const s = invoiceActionStates(inv(), can(PERMS))
    expect(s.map((x) => x.action)).toEqual(["add_services", "pay", "discount", "credit_note", "void"])
    expect(s.every((x) => x.enabled && x.reason === null)).toBe(true)
  })
  it("a counter sale has NO billing action at all (COUNTER_SALE), whatever the permissions", () => {
    expect(invoiceActionStates(inv({ patient: null, visit: null }), can(PERMS))).toEqual([])
  })
  it("a voided invoice allows nothing: every permitted button is OFF with the reason", () => {
    const s = invoiceActionStates(inv({ status: "voided" }), can(PERMS))
    expect(s).toHaveLength(5)
    expect(s.every((x) => !x.enabled && x.reason === "This invoice is voided.")).toBe(true)
  })
  it("an invoice cannot be voided while its visit is under way: Void is OFF with that reason, the others stay on", () => {
    const s = invoiceActionStates(inv({ visit: "open" }), can(PERMS))
    expect(s.find((x) => x.action === "void")).toEqual({ action: "void", enabled: false, reason: "An invoice cannot be voided while the visit is under way." })
    expect(s.filter((x) => x.action !== "void").every((x) => x.enabled)).toBe(true)
    expect(invoiceActionStates(inv({ visit: null }), can(PERMS)).find((x) => x.action === "void")?.enabled).toBe(true) // a stand-alone invoice has no visit under way
  })
  it("each role sees its own buttons: billing clerk (charge + collect), cashier (collect), manager (write)", () => {
    expect(invoiceActionStates(inv(), can(["billing.read", "billing.charge", "billing.collect_payment"])).map((x) => x.action)).toEqual(["add_services", "pay"])
    expect(invoiceActionStates(inv(), can(["billing.read", "billing.collect_payment"])).map((x) => x.action)).toEqual(["pay"])
    expect(invoiceActionStates(inv(), can(["billing.read", "billing.write"])).map((x) => x.action)).toEqual(["discount", "credit_note", "void"])
    expect(invoiceActionStates(inv(), can(["billing.read"]))).toEqual([])
  })
  it("property: for every invoice status, visit state, patient/counter and permission set, a button is shown only with its permission; OFF always has a reason, ON never does", () => {
    const need: Record<InvoiceActionKey, string> = { add_services: "billing.charge", pay: "billing.collect_payment", discount: "billing.write", credit_note: "billing.write", void: "billing.write" }
    for (const status of ["unpaid", "partial", "paid", "voided"] as InvoiceStatus[]) for (const visit of ["open", "closed", "discharged", null]) for (const counter of [false, true]) for (const perms of subsets()) {
      const states = invoiceActionStates(inv({ status, visit, patient: counter ? null : patient }), can(perms))
      const where = `${status}/${visit}/${counter ? "counter" : "patient"}/${perms.join(",")}`
      if (counter) { expect(states, where).toEqual([]); continue }
      for (const s of states) {
        expect(perms.includes(need[s.action]), `permission ${s.action} ${where}`).toBe(true)
        if (s.enabled) expect(s.reason, `${s.action} ${where}`).toBeNull()
        else expect(typeof s.reason === "string" && s.reason.length > 0, `reason ${s.action} ${where}`).toBe(true)
        if (status === "voided") expect(s.enabled, `voided ${s.action} ${where}`).toBe(false)
      }
      expect(states.length, where).toBe((["add_services", "pay", "discount", "credit_note", "void"] as InvoiceActionKey[]).filter((a) => perms.includes(need[a])).length)
      for (const a of Object.keys(INVOICE_ACTION_LABEL)) expect(INVOICE_ACTION_LABEL[a as InvoiceActionKey]).toBeTruthy()
    }
  })
})

describe("the Void button on one charge", () => {
  const c = (sourceType: ChargeSourceType, voided = false) => ({ sourceType, voided })
  it("consultation, service and room charges can be voided by billing.write", () => {
    for (const t of ["consultation", "service", "room"] as ChargeSourceType[]) expect(chargeVoidState(inv(), c(t), can(["billing.write"]))).toEqual({ enabled: true, reason: null })
  })
  it("lab, imaging and medicine charges are changed where they came from: Void is OFF with that reason (CHARGE_FROM_LAB_ORDER / CHARGE_FROM_DISPENSE)", () => {
    for (const t of ["diagnostic", "pharmacy"] as ChargeSourceType[]) {
      const s = chargeVoidState(inv(), c(t), can(["billing.write"]))
      expect(s?.enabled).toBe(false)
      expect(s?.reason).toMatch(/cancel the test or return the medicine/)
    }
  })
  it("no button without billing.write, on a charge already voided, or on a counter sale; a voided invoice turns it OFF", () => {
    expect(chargeVoidState(inv(), c("service"), can(["billing.collect_payment", "billing.charge"]))).toBeNull()
    expect(chargeVoidState(inv(), c("service", true), can(["billing.write"]))).toBeNull()
    expect(chargeVoidState(inv({ patient: null }), c("service"), can(["billing.write"]))).toBeNull()
    expect(chargeVoidState(inv({ status: "voided" }), c("service"), can(["billing.write"]))).toEqual({ enabled: false, reason: "This invoice is voided." })
  })
})

describe("charge rows become the API's charge lines", () => {
  const line = { key: 1, serviceId: "svc", name: "X-ray", catalogueRate: "800.00", qty: "2", rate: "", discountType: "" as const, discountValue: "" }
  it("an empty own rate and no discount are left out; typed ones are sent as the text typed", () => {
    expect(chargeLinesOf([line])).toEqual([{ serviceId: "svc", qty: "2", rate: undefined, discount: undefined }])
    expect(chargeLinesOf([{ ...line, rate: "750", discountType: "percent", discountValue: "10" }])).toEqual([{ serviceId: "svc", qty: "2", rate: "750", discount: { type: "percent", value: "10" } }])
    expect(chargeLinesOf([{ ...line, discountType: "amount", discountValue: " " }])[0].discount).toBeUndefined() // a discount type with no value is nothing
  })
})

describe("labels", () => {
  it("every mode, receipt type and payer kind has a label", () => {
    for (const m of RECEIPT_MODES) expect(MODE_LABEL[m]).toBeTruthy()
    for (const t of RECEIPT_TYPES) expect(RECEIPT_TYPE_LABEL[t]).toBeTruthy()
    expect(payerLabel({ kind: "patient", id: "1", mrNo: "MR-1", name: "Ayesha" })).toBe("Ayesha (MR-1)")
    expect(payerLabel({ kind: "panel", id: "1", name: "State Life" })).toBe("State Life (panel)")
    expect(payerLabel({ kind: "counter", invoiceId: "1", name: "Walk-in Ali" })).toBe("Walk-in Ali (counter sale)")
  })
})

describe("the screens are wired as the handoff says", () => {
  it("every money dialog makes exactly one service call through the shared single-request dialog", () => {
    const forms = read("src/components/billing/MoneyForms.tsx")
    for (const call of ["billingService.recordPayment", "billingService.recordAdvance", "billingService.applyCredit", "billingService.refund", "billingService.creditNote", "billingService.discountInvoice", "billingService.voidInvoice", "billingService.voidCharge"]) expect(forms, call).toContain(call)
    const dialog = read("src/components/billing/BillingActionDialog.tsx")
    expect(dialog).toContain("useSubmitGuard")
    expect(dialog).toContain("classifyCreateError")
    expect(dialog).not.toMatch(/retry|setTimeout|while \(/) // a write is never re-sent
    expect(read("src/components/billing/ChargeServicesDialog.tsx")).toContain("BillingActionDialog")
  })
  it("the permissions that open each action follow the handoff: collect_payment for money in, write for refunds, credit notes, discounts and voids, charge for services", () => {
    const ui = read("src/components/billing/billingUi.ts")
    expect(ui).toContain('add("add_services", can("billing.charge")')
    expect(ui).toContain('add("pay", can("billing.collect_payment")')
    expect(ui).toContain('add("void", can("billing.write")')
    const accounts = read("src/components/billing/AccountPanels.tsx")
    expect(accounts).toContain('can("billing.collect_payment")')
    expect(accounts).toContain('can("billing.write")')
    expect(read("src/components/billing/ChargeServicesDialog.tsx")).toContain('can("billing.write")') // own rate and discount
    expect(read("src/components/billing/InvoicesTab.tsx")).toContain('can("billing.charge")') // New services invoice
  })
  it("the hub: Payments and Receipts are the payments register, Daily Transactions the charges register, in API mode; the demo keeps its own tabs", () => {
    const hub = read("src/app/(dashboard)/billing/[tab]/BillingHub.tsx")
    expect(hub).toContain('<PaymentsRegisterTab defaultType="payment" />')
    expect(hub).toContain('<PaymentsRegisterTab defaultType="advance" />')
    expect(hub).toContain("<ChargesRegisterTab />")
    expect(hub).toContain("<PaymentsTab onChanged={changed} />")
    expect(hub).toContain("<ReceiptsTab onChanged={changed} />")
    expect(read("src/app/(dashboard)/billing/[tab]/tabs.ts")).toContain('"transactions"')
  })
  it("a receipt is printed alone, and read fresh for a reprint", () => {
    const view = read("src/components/billing/ReceiptView.tsx")
    expect(view).toContain("print-root") // the shared print layer (src/lib/print.ts, globals.css) shows this element alone
    expect(view).toContain('<PrintButtons papers={["a4", "thermal"]}')
    expect(read("src/components/billing/RegistersTabs.tsx")).toContain("gcTime: 0")
  })
  it("the registers are server-paged (10) and keep search/filters out of patient data in the address bar", () => {
    const src = read("src/components/billing/RegistersTabs.tsx")
    expect(src).toContain("const PAGE_SIZE = 10")
    expect(src).not.toMatch(/url\.set\(\{[^}]*search/)
  })
  it("no money arithmetic or number conversion in any billing screen file: every figure is the server's string", () => {
    const dir = path.resolve(root, "src/components/billing")
    const files = readdirSync(dir).filter((f) => /\.(ts|tsx)$/.test(f))
    expect(files.length).toBeGreaterThanOrEqual(11)
    for (const f of files) {
      const code = read(`src/components/billing/${f}`).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
      expect(code, f).not.toMatch(/addMoney|subMoney|sumMoney|compareMoney|moneyFromNumber|parseFloat|Number\(|toFixed|\.reduce\(/)
    }
  })
})
