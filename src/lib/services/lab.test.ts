import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ECG_ULTRASOUND_TESTS } from "@/data/ecgUltrasound"
import { LAB_ORDERS } from "@/data/lab"
import { LAB_TESTS } from "@/data/labTests"
import { ENDPOINTS } from "./endpoints"
import { NotConnectedError } from "./errors"
import { httpEcgUltrasoundTestsService, httpLabOrdersService, httpLabTestsService } from "./http/lab"
import { labOrdersService, labTestsService } from "./index"
import {
  LAB_FILTERS, flagFor, isLegalLabTransition, labFilterStatus, labLineTotal, labOrderTotals,
} from "./labHelpers"
import { mockEcgUltrasoundTestsService, mockLabOrdersService, mockLabTestsService } from "./mock/lab"
import { loadShared } from "./reference/cache"
import type { LabOrderInput, LabOrderRecord } from "./types"

// Frontend-only unit tests with controlled data. They verify the UI-facing contract of the mock adapters and that
// the real-backend adapters send nothing while the contract is unconfirmed. None of them says anything about the
// real backend. (Screen rendering — loading, error, empty — is verified in a browser, not here.)

const ULID = "01ARZ3NDEKTSV4RRFFQ69G5FAV"
const KEYS = [
  "labTests.list", "labTests.create", "labTests.update", "ecgTests.list", "ecgTests.create", "ecgTests.update",
  "labOrders.list", "labOrders.get", "labOrders.create", "labOrders.transition", "labOrders.enterResults",
] as const
const testsSnapshot = structuredClone(LAB_TESTS)
const ecgSnapshot = structuredClone(ECG_ULTRASOUND_TESTS)
const ordersSnapshot = structuredClone(LAB_ORDERS)
beforeEach(() => {
  LAB_TESTS.splice(0, LAB_TESTS.length, ...structuredClone(testsSnapshot))
  ECG_ULTRASOUND_TESTS.splice(0, ECG_ULTRASOUND_TESTS.length, ...structuredClone(ecgSnapshot))
  LAB_ORDERS.splice(0, LAB_ORDERS.length, ...structuredClone(ordersSnapshot))
})
afterEach(() => {
  vi.unstubAllGlobals()
  for (const k of KEYS) ENDPOINTS[k] = null
})

const newOrder: LabOrderInput = {
  patientId: "2", doctorId: "2", priority: "Urgent", sampleType: "Blood", clinicalNotes: "fever",
  tests: [
    { testId: "1", discountPct: 0, gstPct: 0, includedInPackage: false }, // CBC (parameters)
    { testId: "3", discountPct: 10, gstPct: 0, includedInPackage: false }, // Urine Routine (single result)
    { testId: "13", discountPct: 0, gstPct: 0, includedInPackage: true }, // ECG (narrative, package)
  ],
  flatDiscount: 50, paymentMode: "Cash",
}
const created = () => mockLabOrdersService.create(newOrder)

describe("contract-pending behaviour (API mode)", () => {
  it("has no endpoint configured for any catalog or order operation", () => {
    for (const k of KEYS) expect(ENDPOINTS[k], k).toBeNull()
  })

  it("sends no request and reports 'awaiting the backend contract' for every operation", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const calls = [
      httpLabTestsService.list({ search: "x" }),
      httpLabTestsService.create({ code: "C", name: "N", category: "Haematology", rate: 1, turnaroundHours: 1 }),
      httpLabTestsService.update("1", { code: "C", name: "N", category: "Haematology", rate: 1, turnaroundHours: 1 }),
      httpEcgUltrasoundTestsService.list(),
      httpEcgUltrasoundTestsService.create({ code: "C", name: "N", fee: 1, active: true }),
      httpEcgUltrasoundTestsService.update("1", { code: "C", name: "N", fee: 1, active: true }),
      httpLabOrdersService.list({ status: "Pending" }),
      httpLabOrdersService.get("1"),
      httpLabOrdersService.create(newOrder),
      httpLabOrdersService.transition("1", "Collected"),
      httpLabOrdersService.enterResults("1", { tests: [], markComplete: true }),
    ]
    for (const c of calls) await expect(c).rejects.toBeInstanceOf(NotConnectedError)
    for (const c of calls) await expect(c).rejects.toThrow(/awaiting the backend contract/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("even with paths configured, sends nothing until the request/response mapping is implemented", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ items: [], total: 0 }), { headers: { "content-type": "application/json" } }))
    vi.stubGlobal("fetch", fetchMock)
    // hypothetical paths, test-only
    ENDPOINTS["labOrders.list"] = { method: "GET", path: "/lab-orders" }
    ENDPOINTS["labOrders.create"] = { method: "POST", path: "/lab-orders" }
    ENDPOINTS["labOrders.transition"] = { method: "POST", path: "/lab-orders/:id/status" }
    ENDPOINTS["labOrders.enterResults"] = { method: "POST", path: "/lab-orders/:id/results" }
    ENDPOINTS["labTests.list"] = { method: "GET", path: "/lab-tests" }
    await expect(httpLabOrdersService.list()).rejects.toThrow(/query parameters/)
    await expect(httpLabOrdersService.create(newOrder)).rejects.toThrow(/request payload/)
    await expect(httpLabOrdersService.transition("1", "Collected")).rejects.toThrow(/request payload/)
    await expect(httpLabOrdersService.enterResults("1", { tests: [], markComplete: false })).rejects.toThrow(/request payload/)
    await expect(httpLabTestsService.list()).rejects.toThrow(/query parameters/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("does not read or guess a response while the mapping is pending", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id: ULID, labNo: "X" }), { headers: { "content-type": "application/json" } })))
    ENDPOINTS["labOrders.get"] = { method: "GET", path: "/lab-orders/:id" } // hypothetical path, test-only
    await expect(httpLabOrdersService.get(ULID)).rejects.toThrow(/response mapping/)
  })

  it("the HTTP adapters can never fall back to demo data: they import nothing from src/data or the mock adapters", () => {
    const dir = join(__dirname, "http")
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
      const source = readFileSync(join(dir, file), "utf8")
      expect(source, file).not.toMatch(/from\s+["'][^"']*(\/data\/|\/mock\/)/)
    }
  })
})

describe("mock lab test catalog (T1)", () => {
  it("lists string-id records with the full total, and filters by category and search", async () => {
    const all = await mockLabTestsService.list()
    expect(all.total).toBe(LAB_TESTS.length)
    expect(typeof all.items[0].id).toBe("string")
    const bio = await mockLabTestsService.list({ category: "Biochemistry" })
    expect(bio.items.length).toBeGreaterThan(0)
    expect(bio.items.every((t) => t.category === "Biochemistry")).toBe(true)
    expect((await mockLabTestsService.list({ search: "cbc" })).items.map((t) => t.code)).toContain("CBC")
    expect((await mockLabTestsService.list({ search: "complete blood" })).items.map((t) => t.code)).toContain("CBC")
    expect((await mockLabTestsService.list({ search: "zzzz-no-match" })).total).toBe(0)
  })

  it("keeps documented catalog shape: parameters with normal range, or a narrative flag", async () => {
    const { items } = await mockLabTestsService.list()
    const cbc = items.find((t) => t.code === "CBC")!
    expect(cbc.parameters?.[0]).toMatchObject({ parameter: "Haemoglobin", unit: "g/dL", normalLow: 12, normalHigh: 16 })
    expect(items.find((t) => t.code === "ECG")!.narrative).toBe(true)
  })

  it("pages", async () => {
    const page = await mockLabTestsService.list({ page: 2, pageSize: 6 })
    expect(page.items).toHaveLength(6)
    expect(page.total).toBe(LAB_TESTS.length)
    expect(page.items[0].id).toBe(String(LAB_TESTS[6].id))
  })

  it("creates and updates in the shared array, with the original defaults", async () => {
    const t = await mockLabTestsService.create({ code: " NEW ", name: " New Test ", category: "Serology", rate: 450, turnaroundHours: 5 })
    expect(t).toMatchObject({ code: "NEW", name: "New Test", unit: "-", normalRange: "-", rate: 450 })
    expect(LAB_TESTS.at(-1)).toMatchObject({ id: Number(t.id), code: "NEW" })
    const u = await mockLabTestsService.update(t.id, { code: "NEW", name: "Renamed", category: "Haematology", rate: 500, turnaroundHours: 2 })
    expect(u).toMatchObject({ name: "Renamed", category: "Haematology", rate: 500 })
    expect(LAB_TESTS.at(-1)!.name).toBe("Renamed")
  })

  it("update keeps the parameters/narrative of the test (the screen can't edit them)", async () => {
    const cbc = LAB_TESTS.find((t) => t.code === "CBC")!
    const u = await mockLabTestsService.update(String(cbc.id), { code: "CBC", name: "CBC v2", category: "Haematology", rate: 700, turnaroundHours: 3 })
    expect(u.parameters).toHaveLength(6)
  })

  it("validates required fields and reports 404 for an unknown id", async () => {
    await expect(mockLabTestsService.create({ code: " ", name: "", category: "Serology", rate: 1, turnaroundHours: 1 })).rejects.toMatchObject({
      status: 400, body: { details: [{ path: "code" }, { path: "name" }] },
    })
    await expect(mockLabTestsService.update(ULID, { code: "A", name: "B", category: "Serology", rate: 1, turnaroundHours: 1 })).rejects.toMatchObject({ status: 404 })
  })
})

describe("mock ECG / ultrasound catalog (T1)", () => {
  it("lists, creates (active), updates and toggles active", async () => {
    const all = await mockEcgUltrasoundTestsService.list()
    expect(all.total).toBe(ECG_ULTRASOUND_TESTS.length)
    const t = await mockEcgUltrasoundTestsService.create({ code: "X-1", name: "New Scan", fee: 900, remarks: "r", active: true })
    expect(t).toMatchObject({ active: true, fee: 900 })
    const off = await mockEcgUltrasoundTestsService.update(t.id, { code: "X-1", name: "New Scan", fee: 900, remarks: "r", active: false })
    expect(off.active).toBe(false)
    expect(ECG_ULTRASOUND_TESTS.at(-1)!.active).toBe(false)
    expect((await mockEcgUltrasoundTestsService.list({ search: "new scan" })).total).toBe(1)
  })

  it("validates and reports 404", async () => {
    await expect(mockEcgUltrasoundTestsService.create({ code: "", name: " ", fee: 0, active: true })).rejects.toMatchObject({ status: 400 })
    await expect(mockEcgUltrasoundTestsService.update("nope", { code: "A", name: "B", fee: 1, active: true })).rejects.toMatchObject({ status: 404 })
  })
})

describe("mock lab orders (T2): list and get", () => {
  it("returns string ids, newest first, with the full total", async () => {
    const { items, total } = await mockLabOrdersService.list()
    expect(total).toBe(LAB_ORDERS.length)
    expect(items.every((o) => typeof o.id === "string" && typeof o.patientId === "string" && o.tests.every((t) => typeof t.testId === "string"))).toBe(true)
    const times = items.map((o) => new Date(o.date).getTime())
    expect(times).toEqual([...times].sort((a, b) => b - a))
  })

  it("filters by status and patient, searches, and pages", async () => {
    const pending = await mockLabOrdersService.list({ status: "Pending" })
    expect(pending.items.length).toBeGreaterThan(0)
    expect(pending.items.every((o) => o.status === "Pending")).toBe(true)
    const target = LAB_ORDERS[0]
    expect((await mockLabOrdersService.list({ patientId: String(target.patientId) })).items.every((o) => o.patientId === String(target.patientId))).toBe(true)
    expect((await mockLabOrdersService.list({ search: target.labNo.toLowerCase() })).items.map((o) => o.labNo)).toContain(target.labNo)
    expect((await mockLabOrdersService.list({ search: "zzzz-no-match" })).total).toBe(0)
    const page = await mockLabOrdersService.list({ page: 2, pageSize: 3 })
    expect(page.items.length).toBeLessThanOrEqual(3)
    expect(page.total).toBe(LAB_ORDERS.length)
  })

  it("gets one order and reports 404 for unknown ids (a ULID included)", async () => {
    await expect(mockLabOrdersService.get(String(LAB_ORDERS[0].id))).resolves.toMatchObject({ labNo: LAB_ORDERS[0].labNo })
    for (const id of ["nope", ULID, "99999"]) await expect(mockLabOrdersService.get(id)).rejects.toMatchObject({ status: 404 })
  })
})

describe("mock lab orders (T2): create", () => {
  it("creates a Pending order with server-style fields and shares state with legacy readers", async () => {
    const before = LAB_ORDERS.length
    const o = await created()
    expect(LAB_ORDERS).toHaveLength(before + 1)
    expect(o.id).toBe(String(LAB_ORDERS.at(-1)!.id))
    expect(o.labNo).toMatch(/^LB-\d{4}-\d{4}$/)
    expect(o.sampleId).toMatch(/^SMP-/)
    expect(o).toMatchObject({ status: "Pending", priority: "Urgent", patientId: "2", doctorId: "2", encounterId: null, paymentStatus: "paid", discount: 50 })
    expect(LAB_ORDERS.at(-1)).toMatchObject({ patientId: 2, doctorId: 2, tests: [{ testId: 1 }, { testId: 3 }, { testId: 13 }] })
    expect(o.tests.map((t) => t.testId)).toEqual(["1", "3", "13"])
  })

  it("totals with per-test discount, package and flat discount; credit is unpaid", async () => {
    const o = await created()
    expect(o.total).toBe(600 + 400 * 0.9 + 0 - 50) // CBC + Urine(-10%) + ECG(package) - flat 50
    const credit = await mockLabOrdersService.create({ ...newOrder, paymentMode: "On Account" })
    expect(credit.paymentStatus).toBe("unpaid")
  })

  it("links an existing encounter, and rejects an unknown one", async () => {
    const enc = LAB_ORDERS.find((o) => o.encounterId !== null)!.encounterId!
    expect((await mockLabOrdersService.create({ ...newOrder, encounterId: String(enc) })).encounterId).toBe(String(enc))
    await expect(mockLabOrdersService.create({ ...newOrder, encounterId: "99999" })).rejects.toMatchObject({ status: 400, body: { details: [{ path: "encounterId" }] } })
  })

  it("never coerces a non-numeric id: it rejects and stores nothing", async () => {
    const before = LAB_ORDERS.length
    await expect(mockLabOrdersService.create({ ...newOrder, patientId: ULID })).rejects.toMatchObject({ status: 400, body: { details: [{ path: "patientId" }] } })
    await expect(mockLabOrdersService.create({ ...newOrder, doctorId: "007" })).rejects.toMatchObject({ status: 400, body: { details: [{ path: "doctorId" }] } })
    await expect(mockLabOrdersService.create({ ...newOrder, encounterId: ULID })).rejects.toMatchObject({ status: 400 })
    await expect(mockLabOrdersService.create({ ...newOrder, tests: [{ testId: ULID, discountPct: 0, gstPct: 0, includedInPackage: false }] })).rejects.toMatchObject({ status: 400 })
    await expect(mockLabOrdersService.create({ ...newOrder, tests: [{ testId: "99999", discountPct: 0, gstPct: 0, includedInPackage: false }] })).rejects.toMatchObject({ status: 400 })
    await expect(mockLabOrdersService.create({ ...newOrder, tests: [] })).rejects.toMatchObject({ status: 400 })
    expect(LAB_ORDERS).toHaveLength(before)
  })
})

describe("mock lab orders (T2): status workflow", () => {
  it("walks Pending → Collected → In Progress, then results complete it, then Delivered", async () => {
    const o = await created()
    expect((await mockLabOrdersService.transition(o.id, "Collected")).status).toBe("Collected")
    expect((await mockLabOrdersService.transition(o.id, "In Progress")).status).toBe("In Progress")
    expect((await mockLabOrdersService.enterResults(o.id, { tests: [], markComplete: true })).status).toBe("Completed")
    expect((await mockLabOrdersService.transition(o.id, "Delivered")).status).toBe("Delivered")
  })

  it("refuses illegal moves with a conflict and an unknown order with 404", async () => {
    const o = await created()
    await expect(mockLabOrdersService.transition(o.id, "Delivered")).rejects.toMatchObject({ status: 409 })
    await expect(mockLabOrdersService.transition(o.id, "In Progress")).rejects.toMatchObject({ status: 409 })
    await expect(mockLabOrdersService.transition(o.id, "Pending")).rejects.toMatchObject({ status: 409 })
    await expect(mockLabOrdersService.transition(ULID, "Collected")).rejects.toMatchObject({ status: 404 })
    expect(LAB_ORDERS.at(-1)!.status).toBe("Pending")
  })
})

describe("mock lab orders (T2): result entry", () => {
  const withResults = async (): Promise<LabOrderRecord> => {
    const o = await created()
    await mockLabOrdersService.transition(o.id, "Collected")
    return mockLabOrdersService.enterResults(o.id, {
      tests: [
        { testId: "1", results: [{ parameter: "Haemoglobin", result: "18.5" }, { parameter: "TLC", result: "3.0" }, { parameter: "Platelets", result: "250" }] },
        { testId: "3", results: [{ parameter: "Urine Routine Examination", result: "Clear" }] },
        { testId: "13", narrativeResult: "Normal sinus rhythm." },
      ],
      pathologistRemarks: "Repeat in a week", performedBy: "Lab Tech", verifiedBy: "Dr. Check", markComplete: false,
    })
  }

  it("flags parameter values against the normal ranges (server-style auto-flagging) and merges unspecified ones", async () => {
    const r = (await withResults()).tests[0].results!
    const flag = (p: string) => r.find((x) => x.parameter === p)!
    expect(flag("Haemoglobin")).toMatchObject({ result: "18.5", unit: "g/dL", normalRange: "12–16", flag: "High" })
    expect(flag("TLC").flag).toBe("Low")
    expect(flag("Platelets").flag).toBe("Normal")
    expect(flag("Neutrophils %")).toMatchObject({ result: "", flag: "" }) // nothing typed → no flag
  })

  it("stores narrative reports, single results (always Normal, as before), remarks and who performed/verified", async () => {
    const o = await withResults()
    expect(o.tests[2].narrativeResult).toBe("Normal sinus rhythm.")
    expect(o.tests[1].results).toEqual([{ parameter: "Urine Routine Examination", result: "Clear", unit: "-", normalRange: "-", flag: "Normal" }])
    expect(o).toMatchObject({ pathologistRemarks: "Repeat in a week", performedBy: "Lab Tech", verifiedBy: "Dr. Check" })
  })

  it("only marks complete when asked, keeps earlier values on a later save, and reports 404", async () => {
    const o = await withResults()
    expect(o.status).toBe("Collected")
    const again = await mockLabOrdersService.enterResults(o.id, { tests: [{ testId: "1", results: [{ parameter: "Haemoglobin", result: "14" }] }], markComplete: true })
    expect(again.status).toBe("Completed")
    expect(again.pathologistRemarks).toBe("Repeat in a week")
    expect(again.tests[0].results!.find((x) => x.parameter === "Haemoglobin")!.flag).toBe("Normal")
    await expect(mockLabOrdersService.enterResults(ULID, { tests: [], markComplete: false })).rejects.toMatchObject({ status: 404 })
  })
})

describe("lab helpers", () => {
  it("flagFor matches the original rule, with inclusive bounds and no flag for NaN", () => {
    expect(flagFor(16, 12, 16)).toBe("Normal")
    expect(flagFor(12, 12, 16)).toBe("Normal")
    expect(flagFor(16.1, 12, 16)).toBe("High")
    expect(flagFor(11.9, 12, 16)).toBe("Low")
    expect(flagFor(NaN, 12, 16)).toBe("")
  })

  it("line and order totals reproduce the form's arithmetic", () => {
    expect(labLineTotal(1000, { discountPct: 10, gstPct: 5, includedInPackage: false })).toBeCloseTo(945)
    expect(labLineTotal(1000, { discountPct: 10, gstPct: 5, includedInPackage: true })).toBe(0)
    expect(labLineTotal(1000, { discountPct: 0, gstPct: 0 })).toBe(1000)
    expect(labOrderTotals([{ rate: 600, discountPct: 0, gstPct: 0 }, { rate: 400, discountPct: 10, gstPct: 0 }], 50)).toEqual({ grossTotal: 960, total: 910 })
    expect(labOrderTotals([{ rate: 100, discountPct: 0, gstPct: 0 }], 500).total).toBe(0)
  })

  it("only the documented forward moves are legal transitions", () => {
    expect(isLegalLabTransition("Pending", "Collected")).toBe(true)
    expect(isLegalLabTransition("Collected", "In Progress")).toBe(true)
    expect(isLegalLabTransition("Completed", "Delivered")).toBe(true)
    for (const [from, to] of [["Pending", "Delivered"], ["Collected", "Pending"], ["In Progress", "Completed"], ["Delivered", "Completed"], ["Pending", "Pending"]] as const) {
      expect(isLegalLabTransition(from, to), `${from}→${to}`).toBe(false)
    }
  })

  it("maps the list chips to a status filter", () => {
    expect(LAB_FILTERS[0]).toBe("All")
    expect(labFilterStatus("All")).toBeUndefined()
    expect(labFilterStatus("In Progress")).toBe("In Progress")
  })
})

describe("shared cache invalidation", () => {
  it("successful lab mutations drop cached orders / catalog data; failed ones do not", async () => {
    const orderLoader = vi.fn(async () => "o")
    const catalogLoader = vi.fn(async () => "c")
    const warm = async () => {
      await loadShared("labOrder:1", orderLoader, 60_000)
      await loadShared("labTests", catalogLoader, 60_000)
    }
    await warm()
    await expect(labOrdersService.create({ ...newOrder, patientId: ULID })).rejects.toBeDefined()
    await warm()
    expect([orderLoader.mock.calls.length, catalogLoader.mock.calls.length]).toEqual([1, 1])
    const o = await labOrdersService.create(newOrder)
    await warm()
    expect([orderLoader.mock.calls.length, catalogLoader.mock.calls.length]).toEqual([2, 1])
    await labOrdersService.transition(o.id, "Collected")
    await warm()
    expect(orderLoader.mock.calls.length).toBe(3)
    await labTestsService.create({ code: "Z", name: "Z", category: "Serology", rate: 1, turnaroundHours: 1 })
    await warm()
    expect(catalogLoader.mock.calls.length).toBe(2)
  })
})
