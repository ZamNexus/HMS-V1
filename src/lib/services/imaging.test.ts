import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { IMAGING_ORDERS } from "@/data/imaging"
import { LAB_ORDERS } from "@/data/lab"
import { LAB_TESTS } from "@/data/labTests"
import { ENDPOINTS } from "./endpoints"
import { NotConnectedError } from "./errors"
import { httpImagingOrdersService } from "./http/imaging"
import {
  IMAGING_CATEGORIES, IMAGING_FILTERS, imagingFilterStatus, isImagingTest, isLegalImagingTransition,
} from "./imagingHelpers"
import { imagingOrdersService, labOrdersService, labTestsService } from "./index"
import { mockImagingOrdersService } from "./mock/imaging"
import { mockLabTestsService } from "./mock/lab"
import { loadShared } from "./reference/cache"
import type { ImagingOrderInput } from "./types"

// Frontend-only unit tests with controlled data. They verify the UI-facing contract of the mock adapter and that the
// real-backend adapter sends nothing while the contract is unconfirmed. None of them says anything about the real
// backend. (Screen rendering — loading, error, empty — is verified in a browser, not here.)

const ULID = "01ARZ3NDEKTSV4RRFFQ69G5FAV"
const KEYS = ["imagingOrders.list", "imagingOrders.get", "imagingOrders.create", "imagingOrders.transition", "imagingOrders.enterReport"] as const
const ordersSnapshot = structuredClone(IMAGING_ORDERS)
const labOrdersSnapshot = structuredClone(LAB_ORDERS)
const testsSnapshot = structuredClone(LAB_TESTS)
beforeEach(() => {
  IMAGING_ORDERS.splice(0, IMAGING_ORDERS.length, ...structuredClone(ordersSnapshot))
  LAB_ORDERS.splice(0, LAB_ORDERS.length, ...structuredClone(labOrdersSnapshot))
  LAB_TESTS.splice(0, LAB_TESTS.length, ...structuredClone(testsSnapshot))
})
afterEach(() => {
  vi.unstubAllGlobals()
  for (const k of KEYS) ENDPOINTS[k] = null
})

const line = (testId: string, extra: Partial<ImagingOrderInput["tests"][number]> = {}) => ({ testId, discountPct: 0, gstPct: 0, includedInPackage: false, ...extra })
const newOrder: ImagingOrderInput = {
  patientId: "2", doctorId: "2",
  tests: [line("14"), line("15", { discountPct: 10 }), line("13", { includedInPackage: true })], // X-Ray, USG (-10%), ECG (package)
  flatDiscount: 50, paymentMode: "Cash", notes: "r/o fracture",
}
const created = () => mockImagingOrdersService.create(newOrder)

describe("contract-pending behaviour (API mode)", () => {
  it("has no endpoint configured for any imaging operation", () => {
    for (const k of KEYS) expect(ENDPOINTS[k], k).toBeNull()
  })

  it("sends no request and reports 'awaiting the backend contract' for every operation", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const calls = [
      httpImagingOrdersService.list({ status: "Pending" }),
      httpImagingOrdersService.get("1"),
      httpImagingOrdersService.create(newOrder),
      httpImagingOrdersService.transition("1", "In Progress"),
      httpImagingOrdersService.enterReport("1", { tests: [{ testId: "14", narrativeResult: "Normal." }] }),
    ]
    for (const c of calls) await expect(c).rejects.toBeInstanceOf(NotConnectedError)
    for (const c of calls) await expect(c).rejects.toThrow(/awaiting the backend contract/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("even with paths configured, sends nothing until the request/response mapping is implemented", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ items: [], total: 0 }), { headers: { "content-type": "application/json" } }))
    vi.stubGlobal("fetch", fetchMock)
    // hypothetical paths, test-only
    ENDPOINTS["imagingOrders.list"] = { method: "GET", path: "/imaging-orders" }
    ENDPOINTS["imagingOrders.create"] = { method: "POST", path: "/imaging-orders" }
    ENDPOINTS["imagingOrders.transition"] = { method: "POST", path: "/imaging-orders/:id/status" }
    ENDPOINTS["imagingOrders.enterReport"] = { method: "POST", path: "/imaging-orders/:id/report" }
    await expect(httpImagingOrdersService.list()).rejects.toThrow(/query parameters/)
    await expect(httpImagingOrdersService.create(newOrder)).rejects.toThrow(/request payload/)
    await expect(httpImagingOrdersService.transition("1", "In Progress")).rejects.toThrow(/request payload/)
    await expect(httpImagingOrdersService.enterReport("1", { tests: [] })).rejects.toThrow(/request payload/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("does not read or guess a response while the mapping is pending", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id: ULID, xrNo: "X" }), { headers: { "content-type": "application/json" } })))
    ENDPOINTS["imagingOrders.get"] = { method: "GET", path: "/imaging-orders/:id" } // hypothetical path, test-only
    await expect(httpImagingOrdersService.get(ULID)).rejects.toThrow(/response mapping/)
  })

  it("the HTTP adapters can never fall back to demo data: they import nothing from src/data or the mock adapters", () => {
    const dir = join(__dirname, "http")
    const files = readdirSync(dir).filter((f) => f.endsWith(".ts"))
    expect(files).toContain("imaging.ts")
    for (const file of files) {
      const source = readFileSync(join(dir, file), "utf8")
      expect(source, file).not.toMatch(/from\s+["'][^"']*(\/data\/|\/mock\/)/)
    }
  })
})

describe("mock imaging orders: list and get", () => {
  it("returns string ids, newest first, with the full total", async () => {
    const { items, total } = await mockImagingOrdersService.list()
    expect(total).toBe(IMAGING_ORDERS.length)
    expect(items.every((o) => typeof o.id === "string" && typeof o.patientId === "string" && o.tests.every((t) => typeof t.testId === "string"))).toBe(true)
    const times = items.map((o) => new Date(o.date).getTime())
    expect(times).toEqual([...times].sort((a, b) => b - a))
  })

  it("filters by status and patient, searches by order number, and pages", async () => {
    const pending = await mockImagingOrdersService.list({ status: "Pending" })
    expect(pending.items.length).toBeGreaterThan(0)
    expect(pending.items.every((o) => o.status === "Pending")).toBe(true)
    const target = IMAGING_ORDERS[0]
    expect((await mockImagingOrdersService.list({ patientId: String(target.patientId) })).items.every((o) => o.patientId === String(target.patientId))).toBe(true)
    expect((await mockImagingOrdersService.list({ search: target.xrNo.toLowerCase() })).items.map((o) => o.xrNo)).toContain(target.xrNo)
    expect((await mockImagingOrdersService.list({ search: "zzzz-no-match" })).total).toBe(0)
    const page = await mockImagingOrdersService.list({ page: 2, pageSize: 3 })
    expect(page.items).toHaveLength(IMAGING_ORDERS.length - 3)
    expect(page.total).toBe(IMAGING_ORDERS.length)
  })

  it("gets one order and reports 404 for unknown ids (a ULID included)", async () => {
    await expect(mockImagingOrdersService.get(String(IMAGING_ORDERS[0].id))).resolves.toMatchObject({ xrNo: IMAGING_ORDERS[0].xrNo })
    for (const id of ["nope", ULID, "99999"]) await expect(mockImagingOrdersService.get(id)).rejects.toMatchObject({ status: 404 })
  })
})

describe("mock imaging orders: create", () => {
  it("creates a Pending order with server-style fields and shares state with legacy readers", async () => {
    const before = IMAGING_ORDERS.length
    const o = await created()
    expect(IMAGING_ORDERS).toHaveLength(before + 1)
    expect(o.id).toBe(String(IMAGING_ORDERS.at(-1)!.id))
    expect(o.xrNo).toMatch(/^XRY-\d{4}-\d{4}$/)
    expect(o).toMatchObject({ status: "Pending", patientId: "2", doctorId: "2", encounterId: null, paymentMode: "Cash", discount: 50 })
    expect(IMAGING_ORDERS.at(-1)).toMatchObject({ patientId: 2, doctorId: 2, encounterId: null, tests: [{ testId: 14 }, { testId: 15 }, { testId: 13 }] })
    expect(o.tests.map((t) => t.testId)).toEqual(["14", "15", "13"])
    expect(o.tests[0]).toMatchObject({ testName: "X-Ray Chest", charges: 800, remarks: "r/o fracture" })
  })

  it("numbers orders from its own sequence and does not touch laboratory orders", async () => {
    const labBefore = JSON.stringify(LAB_ORDERS)
    const a = await created()
    const b = await created()
    expect(Number(b.xrNo.slice(-4))).toBe(Number(a.xrNo.slice(-4)) + 1)
    expect(JSON.stringify(LAB_ORDERS)).toBe(labBefore)
    expect((await labOrdersService.list()).items.some((o) => o.labNo.startsWith("XRY"))).toBe(false)
  })

  it("totals with per-test discount, package and flat discount", async () => {
    expect((await created()).total).toBe(800 + 2500 * 0.9 + 0 - 50)
    expect((await mockImagingOrdersService.create({ ...newOrder, flatDiscount: 99999 })).total).toBe(0)
  })

  it("links an existing encounter, and rejects an unknown one", async () => {
    const enc = IMAGING_ORDERS.find((o) => o.encounterId !== null)!.encounterId!
    expect((await mockImagingOrdersService.create({ ...newOrder, encounterId: String(enc) })).encounterId).toBe(String(enc))
    await expect(mockImagingOrdersService.create({ ...newOrder, encounterId: "99999" })).rejects.toMatchObject({ status: 400, body: { details: [{ path: "encounterId" }] } })
  })

  it("never coerces a non-numeric id: it rejects and stores nothing", async () => {
    const before = IMAGING_ORDERS.length
    await expect(mockImagingOrdersService.create({ ...newOrder, patientId: ULID })).rejects.toMatchObject({ status: 400, body: { details: [{ path: "patientId" }] } })
    await expect(mockImagingOrdersService.create({ ...newOrder, doctorId: "007" })).rejects.toMatchObject({ status: 400, body: { details: [{ path: "doctorId" }] } })
    await expect(mockImagingOrdersService.create({ ...newOrder, encounterId: ULID })).rejects.toMatchObject({ status: 400 })
    await expect(mockImagingOrdersService.create({ ...newOrder, tests: [line(ULID)] })).rejects.toMatchObject({ status: 400, body: { details: [{ path: "tests.0.testId" }] } })
    await expect(mockImagingOrdersService.create({ ...newOrder, tests: [line("99999")] })).rejects.toMatchObject({ status: 400 })
    await expect(mockImagingOrdersService.create({ ...newOrder, tests: [] })).rejects.toMatchObject({ status: 400, body: { details: [{ path: "tests" }] } })
    expect(IMAGING_ORDERS).toHaveLength(before)
  })
})

describe("mock imaging orders: status workflow", () => {
  it("walks Pending → In Progress → Completed → Delivered", async () => {
    const o = await created()
    expect((await mockImagingOrdersService.transition(o.id, "In Progress")).status).toBe("In Progress")
    expect((await mockImagingOrdersService.transition(o.id, "Completed")).status).toBe("Completed")
    expect((await mockImagingOrdersService.transition(o.id, "Delivered")).status).toBe("Delivered")
    expect(IMAGING_ORDERS.at(-1)!.status).toBe("Delivered")
  })

  it("refuses illegal moves with a conflict (Collected is never offered) and an unknown order with 404", async () => {
    const o = await created()
    for (const to of ["Collected", "Completed", "Delivered", "Pending"] as const) {
      await expect(mockImagingOrdersService.transition(o.id, to), to).rejects.toMatchObject({ status: 409 })
    }
    await expect(mockImagingOrdersService.transition(ULID, "In Progress")).rejects.toMatchObject({ status: 404 })
    expect(IMAGING_ORDERS.at(-1)!.status).toBe("Pending")
  })
})

describe("mock imaging orders: narrative report entry", () => {
  it("stores the narrative per test and leaves the others, the status and the totals alone", async () => {
    const o = await created()
    const r = await mockImagingOrdersService.enterReport(o.id, { tests: [{ testId: "14", narrativeResult: "  Lungs clear.  " }] })
    expect(r.tests.find((t) => t.testId === "14")!.narrativeResult).toBe("Lungs clear.")
    expect(r.tests.find((t) => t.testId === "15")!.narrativeResult).toBeUndefined()
    expect(r).toMatchObject({ status: "Pending", total: o.total })
    expect(IMAGING_ORDERS.at(-1)!.tests[0].narrativeResult).toBe("Lungs clear.")
  })

  it("rejects empty text and a test that is not on the order, and reports 404", async () => {
    const o = await created()
    await expect(mockImagingOrdersService.enterReport(o.id, { tests: [{ testId: "14", narrativeResult: "  " }] })).rejects.toMatchObject({ status: 400, body: { details: [{ path: "tests.0.narrativeResult" }] } })
    await expect(mockImagingOrdersService.enterReport(o.id, { tests: [{ testId: "1", narrativeResult: "x" }] })).rejects.toMatchObject({ status: 400, body: { details: [{ path: "tests.0.testId" }] } })
    await expect(mockImagingOrdersService.enterReport(ULID, { tests: [] })).rejects.toMatchObject({ status: 404 })
  })

  it("stores no reporting doctor or signature (that contract is not confirmed)", async () => {
    const o = await created()
    const r = await mockImagingOrdersService.enterReport(o.id, { tests: [{ testId: "14", narrativeResult: "Normal." }] })
    expect(Object.keys(r).sort()).toEqual(
      ["date", "discount", "doctorId", "encounterId", "id", "paymentMode", "patientId", "status", "tests", "total", "xrNo"].sort()
    )
  })
})

describe("imaging helpers", () => {
  it("only the screens' forward moves are legal (Collected is skipped, as in the UI)", () => {
    expect(isLegalImagingTransition("Pending", "In Progress")).toBe(true)
    expect(isLegalImagingTransition("In Progress", "Completed")).toBe(true)
    expect(isLegalImagingTransition("Completed", "Delivered")).toBe(true)
    for (const [from, to] of [["Pending", "Collected"], ["Pending", "Delivered"], ["In Progress", "Pending"], ["Delivered", "Completed"], ["Pending", "Pending"]] as const) {
      expect(isLegalImagingTransition(from, to), `${from}→${to}`).toBe(false)
    }
  })

  it("maps the list chips to a status filter (no Collected chip)", () => {
    expect([...IMAGING_FILTERS]).toEqual(["All", "Pending", "In Progress", "Completed", "Delivered"])
    expect(imagingFilterStatus("All")).toBeUndefined()
    expect(imagingFilterStatus("In Progress")).toBe("In Progress")
  })

  it("the imaging catalogue is the lab catalogue's Radiology and Cardiology tests", async () => {
    expect([...IMAGING_CATEGORIES]).toEqual(["Radiology", "Cardiology"])
    const all = (await mockLabTestsService.list()).items
    const imaging = all.filter(isImagingTest)
    expect(imaging.map((t) => t.code)).toEqual(expect.arrayContaining(["ECG", "XRAYCHEST", "USG"]))
    expect(imaging.every((t) => t.category === "Radiology" || t.category === "Cardiology")).toBe(true)
    expect(all.some((t) => t.category === "Haematology" && isImagingTest(t))).toBe(false)
  })

  it("a test registered through the shared catalogue service is available to imaging orders (no snapshot)", async () => {
    const t = await labTestsService.create({ code: "MRI1", name: "MRI Knee", category: "Radiology", rate: 9000, turnaroundHours: 24 })
    expect(isImagingTest(t)).toBe(true)
    const o = await mockImagingOrdersService.create({ ...newOrder, tests: [line(t.id)] })
    expect(o.tests[0]).toMatchObject({ testName: "MRI Knee", charges: 9000 })
  })
})

describe("shared cache invalidation", () => {
  it("successful imaging mutations drop cached orders; failed ones do not; lab caches are untouched", async () => {
    const orderLoader = vi.fn(async () => "o")
    const labLoader = vi.fn(async () => "l")
    const warm = async () => {
      await loadShared("imagingOrder:1", orderLoader, 60_000)
      await loadShared("labOrder:1", labLoader, 60_000)
    }
    await warm()
    await expect(imagingOrdersService.create({ ...newOrder, patientId: ULID })).rejects.toBeDefined()
    await warm()
    expect([orderLoader.mock.calls.length, labLoader.mock.calls.length]).toEqual([1, 1])
    const o = await imagingOrdersService.create(newOrder)
    await warm()
    expect([orderLoader.mock.calls.length, labLoader.mock.calls.length]).toEqual([2, 1])
    await imagingOrdersService.transition(o.id, "In Progress")
    await warm()
    expect(orderLoader.mock.calls.length).toBe(3)
    await imagingOrdersService.enterReport(o.id, { tests: [{ testId: "14", narrativeResult: "ok" }] })
    await warm()
    expect([orderLoader.mock.calls.length, labLoader.mock.calls.length]).toEqual([4, 1])
  })
})
