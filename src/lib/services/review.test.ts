import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { ApiError } from "@/lib/api/client"
import { createSingleFlight } from "@/lib/singleFlight"
import { dateInZone } from "@/lib/session/hospital"
import { NAV_RULES } from "@/lib/session/permissions"
import { labTabQuery } from "@/components/diagnostics/dxUi"
import { REGISTER_FILTER_KEYS, clearedRegisterFilters } from "@/components/reportsApi/rpUi"
import { writeOutcomeUnknown } from "./createOutcome"
import { parsePatient } from "./http/patientMap"
import { formatMoneyString, moneySymbol, setMoneyCurrency } from "./moneyMath"
import { schemaOf, validate } from "./http/specValidate"

// Regression tests for the findings of the fresh-eyes review of Phases 5 to 11 (2026-11-08). Each one pins a defect the reviewers found and that is now fixed.

const root = process.cwd()
const read = (rel: string) => readFileSync(path.resolve(root, rel), "utf8")
const U = "01HZXAAAAAAAAAAAAAAAAAAAAA"

describe("a patient whose guardian relation was typed as free text can be read (review: patients #1)", () => {
  const detail = (guardianRelation: unknown) => ({
    id: U, mrNo: "MR-2026-0042", name: "Ayesha Khan", fatherName: "Imran Khan", gender: "female", dob: "1990-05-17", dobEstimated: false, phone: "+92 300 1234567", cnic: null, city: "Rawalpindi",
    registrationDate: "2026-01-10", admitted: false, lastVisitDate: null, deceasedOn: null, archived: false, medicalRecordNo: null, emergencyContact: null, email: null, address: null, area: null,
    country: "Pakistan", bloodGroup: "O+", guardianRelation, guardianName: "Imran", referredBy: null, remarks: null, photoUrl: null, coverages: [], archivedAt: null, createdAt: "2026-11-07T10:00:00.000Z", updatedAt: "2026-11-07T10:00:00.000Z",
  })
  it("the specification allows { id: null, name } and the fixture validates", () => {
    expect(validate(detail({ id: null, name: "Sister-in-law" }), schemaOf("PatientDetailDto_Output"), { lenientStringArrays: true })).toEqual([])
  })
  it("is read with the relation's name and no catalogue id; a catalogued relation keeps its id; none stays empty", () => {
    expect(parsePatient(detail({ id: null, name: "Sister-in-law" }))).toMatchObject({ guardianRelation: "Sister-in-law", guardianRelationId: null })
    expect(parsePatient(detail({ id: U, name: "Husband" }))).toMatchObject({ guardianRelation: "Husband", guardianRelationId: U })
    expect(parsePatient(detail(null))).toMatchObject({ guardianRelation: "", guardianRelationId: null })
  })
  it("still refuses an id that is neither null nor a valid id", () => {
    expect(() => parsePatient(detail({ id: "nope", name: "Husband" }))).toThrow(/id/)
  })
})

describe("a write that got no usable answer is never sent again from the same form (review: money #3, clinical #2)", () => {
  const err = (status: number, code: string) => new ApiError({ status, code, message: code })
  const unknown = () => err(0, "NETWORK_ERROR")
  it("recognises the cases where the server may have saved it", () => {
    expect(writeOutcomeUnknown(unknown())).toBe(true)
    expect(writeOutcomeUnknown(err(502, "BAD_GATEWAY"))).toBe(true)
    expect(writeOutcomeUnknown(err(422, "OVERPAYMENT"))).toBe(false)
  })
  it("after an unknown outcome the single flight stays busy for good: a second click is ignored and the action is not run again", async () => {
    const flight = createSingleFlight({ holdOnError: writeOutcomeUnknown })
    let sent = 0
    await expect(flight(async () => { sent++; throw unknown() })).rejects.toBeInstanceOf(ApiError)
    expect(flight.isBlocked()).toBe(true)
    expect(await flight(async () => { sent++; return "again" })).toBeUndefined()
    expect(sent).toBe(1)
  })
  it("a refusal from the server (the write definitely did not happen) releases the form for a second try", async () => {
    const flight = createSingleFlight({ holdOnError: writeOutcomeUnknown })
    await expect(flight(async () => { throw err(422, "OVERPAYMENT") })).rejects.toBeInstanceOf(ApiError)
    expect(flight.isBlocked()).toBe(false)
    expect(await flight(async () => "second try")).toBe("second try")
  })
  it("the submit guard and the billing confirm dialog use it", () => {
    expect(read("src/lib/useSubmitGuard.ts")).toContain("holdOnError: writeOutcomeUnknown")
    expect(read("src/components/billing/BillingActionDialog.tsx")).toContain("disabled={pending || blocked || !canConfirm}")
    expect(read("src/components/pharmacy/DispenseScreen.tsx")).toContain("disabled={!ready || pending || blocked}")
  })
})

describe("every state-changing write reads its answer through createAndParse (review: money #1, clinical #3, patients #1)", () => {
  it("no adapter parses the answer of a non-GET call inline", () => {
    const ep = read("src/lib/services/endpoints.ts")
    const method: Record<string, string> = {}
    for (const m of ep.matchAll(/^\s*"([A-Za-z.]+)": \{ method: "(GET|POST|PUT|PATCH|DELETE)"/gm)) method[m[1]] = m[2]
    const dir = path.resolve(root, "src/lib/services/http")
    const bad: string[] = []
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".ts") || f === "call.ts") continue
      const code = readFileSync(path.join(dir, f), "utf8")
      for (const m of code.matchAll(/([A-Za-z_]\w*)\(await callEndpoint<unknown>\(\s*(`[^`]*`|"[^"]+"|[^,]+)/g)) {
        const keys = [...m[2].matchAll(/"([A-Za-z.]+)"/g)].map((x) => x[1])
        if (keys.some((k) => method[k] && method[k] !== "GET")) bad.push(`${f}: ${m[1]}(${m[2].slice(0, 40)})`)
      }
    }
    // password reset hands out a temporary password the user must be shown, and its parse is inline on purpose
    expect(bad.filter((b) => !/resetPassword/.test(b))).toEqual([])
  })
})

describe("the hospital's currency in money text (review: money #6, patients #11)", () => {
  it("is Rs. for the rupee and the demo, and the hospital's code for any other currency", () => {
    setMoneyCurrency("PKR")
    expect(formatMoneyString("1500.00")).toBe("Rs. 1,500")
    setMoneyCurrency("AED")
    expect(moneySymbol()).toBe("AED")
    expect(formatMoneyString("1500.50")).toBe("AED 1,500.50")
    expect(formatMoneyString("-20.00")).toBe("AED -20")
    setMoneyCurrency(null)
    expect(formatMoneyString("5.00")).toBe("Rs. 5")
  })
})

describe("the pharmacist can pay for dispensed medicines without billing.read (review: money #2)", () => {
  it("the bill is opened only by billing.read; billing.collect_payment alone gets a payment dialog that needs no invoice read", () => {
    const screen = read("src/components/pharmacy/DispenseScreen.tsx")
    const history = read("src/components/pharmacy/DispenseHistoryTab.tsx")
    for (const src of [screen, history]) {
      expect(src).toContain('!can("billing.read") && can("billing.collect_payment")')
      expect(src).toContain("<PayBill")
      expect(src).not.toContain('can("billing.read") || can("billing.collect_payment")')
    }
    const pay = read("src/components/pharmacy/PayBill.tsx")
    expect(pay).toContain("<PaymentDialog")
    expect(pay).toContain("<ReceiptDialog")
  })
})

describe("the dispense screen never carries one patient's prescription links to another (review: money #4)", () => {
  const src = read("src/components/pharmacy/DispenseScreen.tsx")
  it("changing the patient, the visit or the mode drops the prescription lines, and the next dispense starts with nobody picked", () => {
    expect(src).toContain("const dropRxLinks = ")
    expect(src).toContain("dropRxLinks(); setEncounterId(\"\")")
    expect(src).toContain("if (rx && rx.encounter.id !== id) dropRxLinks()")
    expect(src).toMatch(/const reset = \(\) => \{[^}]*setPicked\(null\)/)
  })
  it("a counter sale sends no prescription link and a chosen visit is sent even without Load Rx", () => {
    expect(src).toContain("delete c.prescriptionLineId")
    expect(src).toContain("encounterId: rx ? rx.encounter.id : (encounterId || undefined)")
  })
})

describe("the hospital's day rolls over while a desk stays signed in (review: patients #2, clinical #6)", () => {
  it("reads the calendar day in the hospital's zone, not the browser's", () => {
    // 19:30 UTC on 30 Nov is already 00:30 on 1 Dec in Karachi (UTC+5), but still 30 Nov in London
    const instant = new Date("2026-11-30T19:30:00.000Z")
    expect(dateInZone(instant, "Asia/Karachi")).toBe("2026-12-01")
    expect(dateInZone(instant, "Europe/London")).toBe("2026-11-30")
    expect(dateInZone(new Date("2026-12-31T20:00:00.000Z"), "Asia/Karachi")).toBe("2027-01-01")
    expect(dateInZone(new Date("2028-02-28T19:00:00.000Z"), "Asia/Karachi")).toBe("2028-02-29")
  })
  it("the app shell re-reads the settings once the hospital's day is later than the one it holds", () => {
    const shell = read("src/components/layout/AppShell.tsx")
    expect(shell).toContain("dateInZone(new Date(), settings.timezone) > settings.today")
    expect(shell).toContain("reload()")
  })
})

describe("what a user cannot do is not offered, and every list can be reached by keyboard (review: patients #3 #4 #6, money #5, clinical #5)", () => {
  it("adding a relation or an organisation needs catalogs.write", () => {
    expect((read("src/components/patients/PatientForm.tsx").match(/can\("catalogs\.write"\) && <Button/g) ?? []).length).toBe(2)
    expect(read("src/components/patients/CoverageFields.tsx")).toContain('which === "primary" && can("catalogs.write")')
  })
  it("Appointments has a menu entry that needs appointments.read", () => {
    expect(NAV_RULES.appointments).toEqual({ any: ["appointments.read"] })
    expect(read("src/components/layout/Sidebar.tsx")).toContain('to: "/appointments"')
  })
  it("the first cell of every clickable row is a real button, so Tab and Enter reach it", () => {
    for (const f of ["src/components/billing/InvoicesTab.tsx", "src/components/billing/RegistersTabs.tsx", "src/components/pharmacy/DispenseHistoryTab.tsx", "src/components/visits/VisitsScreen.tsx",
      "src/components/diagnostics/LabOrdersScreen.tsx", "src/components/diagnostics/ImagingOrdersScreen.tsx", "src/components/appointments/AppointmentsScreen.tsx"]) {
      expect(read(f), f).toMatch(/<button type="button"[^>]*onClick=\{\(e\) => \{ e\.stopPropagation\(\); (onOpen\(\)|setOpenId\()/)
    }
  })
  it("a pager stays when a later page is empty, so the user can get back", () => {
    for (const f of ["src/components/billing/InvoicesTab.tsx", "src/components/billing/RegistersTabs.tsx", "src/components/diagnostics/LabOrdersScreen.tsx", "src/components/appointments/AppointmentsScreen.tsx", "src/components/visits/VisitsScreen.tsx", "src/components/pharmacy/MedicinesTab.tsx"]) {
      expect(read(f), f).toContain("(items.length > 0 || page > 1)")
    }
  })
})

describe("the clinical record and its dialogs do not lose what was typed (review: clinical #1 #4 #7)", () => {
  it("the tabs that hold forms stay mounted when another tab is shown", () => {
    const src = read("src/components/visits/VisitDetailScreen.tsx")
    for (const tab of ["vitals", "record", "notes"]) expect(src, tab).toMatch(new RegExp('<TabsContent value="' + tab + '" forceMount'))
    expect(src).toContain("data-[state=inactive]:hidden")
  })
  it("closing a visit with an unsaved clinical record is refused with the reason, and the form reports its unsaved state", () => {
    expect(read("src/components/visits/VisitDialogs.tsx")).toContain("canConfirm={!unsaved}")
    expect(read("src/components/visits/VisitDetailScreen.tsx")).toContain("unsaved={recordDirty}")
    expect(read("src/components/visits/ClinicalRecordForm.tsx")).toContain("onDirty?.(dirty)")
  })
  it("the action dialogs ignore a click outside (Esc and Cancel still close) and lock after a write with no answer", () => {
    for (const f of ["src/components/visits/ActionDialog.tsx", "src/components/billing/BillingActionDialog.tsx"]) {
      expect(read(f), f).toContain("onInteractOutside={(e) => e.preventDefault()}")
      expect(read(f), f).toContain("blocked")
    }
  })
  it("a parameter test whose definition cannot be read never turns into a free-text box", () => {
    const src = read("src/components/diagnostics/LabDialogs.tsx")
    expect(src).toContain("const defFailed = ")
    expect(src).toContain("!loading && !defFailed")
  })
})

describe("the lab Bench shows both views of the handoff, and registers do not leak filters between tabs (review: clinical #10, patients #9)", () => {
  it("Bench = collected, then in progress", () => {
    expect(labTabQuery("bench")).toEqual({ status: "collected" })
    expect(labTabQuery("bench", "in_progress")).toEqual({ status: "in_progress" })
  })
  it("switching a report, tab or view clears every register filter", () => {
    const cleared = clearedRegisterFilters()
    expect(Object.keys(cleared).sort()).toEqual([...REGISTER_FILTER_KEYS].sort())
    expect(Object.values(cleared).every((v) => v === undefined)).toBe(true)
    expect(read("src/components/reportsApi/ReportsApiHub.tsx")).toContain("...clearedRegisterFilters()")
    expect(read("src/components/reportsApi/StatsApiHub.tsx")).toContain("...clearedRegisterFilters()")
  })
})

describe("smaller review items", () => {
  it("the dashboard stock alert in API mode asks the server for low and out-of-stock rows instead of reading the whole catalogue", () => {
    const banner = read("src/components/dashboard/LowStockBanner.tsx")
    expect(banner).toContain('level: "low"')
    expect(banner).toContain('level: "out_of_stock"')
    expect(read("src/app/(dashboard)/dashboard/page.tsx")).toContain('useMedicines(dataSource !== "api" &&')
  })
  it("visit writes also refresh the ward occupancy and the bill", () => {
    const idx = read("src/lib/services/index.ts")
    expect(idx).toContain('invalidatingService(visitsBase, "wardsAdmin", VISIT_WARD_WRITES)')
    expect(idx).toContain('["invoice", "invoices", "account", "charges"] as const).reduce<VisitsService>')
  })
  it("date-only values are never read through new Date(string)", () => {
    expect(read("src/app/(dashboard)/patients/[id]/page.tsx")).not.toContain("new Date(patient.registrationDate)")
    expect(read("src/components/dashboard/DashboardListsApi.tsx")).not.toContain("new Date(p.registrationDate)")
    expect(read("src/components/patients/PatientForm.tsx")).not.toContain("new Date().toISOString().slice(0, 10)")
  })
  it("the order form drops a visit link that came with a different patient", () => {
    expect(read("src/components/diagnostics/OrderForm.tsx")).toContain("(!presetPatient || patient?.id === presetPatient)")
  })
})
