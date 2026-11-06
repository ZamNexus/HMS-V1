import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { format } from "date-fns"
import { ENCOUNTERS } from "@/data/encounters"
import { WARDS } from "@/data/wards"
import { ENDPOINTS } from "./endpoints"
import { encounterFilterOptions, encounterTotals } from "./encounterHelpers"
import { NotConnectedError } from "./errors"
import { httpEncountersService, httpWardsService } from "./http/encounters"
import { encountersService } from "./index"
import { mockEncountersService, mockWardsService } from "./mock/encounters"
import { mockPatientsService } from "./mock/patients"
import { loadShared } from "./reference/cache"
import { legacyNumericId } from "./reference/refId"
import type { DischargeInput, EncounterInput } from "./types"

// Frontend-only unit tests with controlled data. They verify the UI-facing contract of the mock adapter and
// that the real-backend adapter sends nothing while the contract is unconfirmed. None says anything about the
// real backend. (Hook/screen rendering — loading, error, empty — is verified in a browser, not here.)

const ULID = "01ARZ3NDEKTSV4RRFFQ69G5FAV"
const KEYS = ["encounters.list", "encounters.get", "encounters.create", "encounters.discharge", "wards.list"] as const
const encSnapshot = structuredClone(ENCOUNTERS)
const wardSnapshot = structuredClone(WARDS)
beforeEach(() => {
  ENCOUNTERS.splice(0, ENCOUNTERS.length, ...structuredClone(encSnapshot))
  WARDS.splice(0, WARDS.length, ...structuredClone(wardSnapshot))
})
afterEach(() => {
  vi.unstubAllGlobals()
  for (const k of KEYS) ENDPOINTS[k] = null
})

const baseInput: EncounterInput = {
  patientId: "2", doctorId: "2", type: "OPD", priority: "Normal", chiefComplaint: "Cough", diagnosis: "Cold",
  vitals: { bp: "", pulse: "", temp: "", weight: "", spo2: "", rbs: "" }, prescription: [],
  fee: 800, discount: 0, discountType: "flat", paymentStatus: "paid", paymentMode: "Cash",
}
const discharge: DischargeInput = { dischargeDate: "2026-01-02", dischargeDiagnosis: "Recovered well", dischargeSummary: "Fine", conditionOnDischarge: "Recovered" }
const openIpd = () => ENCOUNTERS.find((e) => e.type === "IPD" && e.status === "open" && e.ward && e.bedNo)!

describe("contract-pending behaviour (API mode)", () => {
  it("has no endpoint configured for any Encounters or wards operation", () => {
    for (const k of KEYS) expect(ENDPOINTS[k], k).toBeNull()
  })

  it("sends no request and reports 'awaiting the backend contract' for every operation", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const calls = [
      httpEncountersService.list({ search: "x" }),
      httpEncountersService.get("1"),
      httpEncountersService.create(baseInput),
      httpEncountersService.discharge("1", discharge),
      httpWardsService.list(),
    ]
    for (const c of calls) await expect(c).rejects.toThrow(/awaiting the backend contract/)
    for (const c of calls) await expect(c).rejects.toBeInstanceOf(NotConnectedError)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("even with paths configured, sends nothing until the request/response mapping is implemented", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ items: [], total: 0 }), { headers: { "content-type": "application/json" } }))
    vi.stubGlobal("fetch", fetchMock)
    // hypothetical paths, test-only
    ENDPOINTS["encounters.list"] = { method: "GET", path: "/encounters" }
    ENDPOINTS["encounters.create"] = { method: "POST", path: "/encounters" }
    ENDPOINTS["encounters.discharge"] = { method: "POST", path: "/encounters/:id/discharge" }
    ENDPOINTS["wards.list"] = { method: "GET", path: "/wards" }
    await expect(httpEncountersService.list()).rejects.toThrow(/query parameters/)
    await expect(httpEncountersService.create(baseInput)).rejects.toThrow(/request payload/)
    await expect(httpEncountersService.discharge("1", discharge)).rejects.toThrow(/request payload/)
    await expect(httpWardsService.list()).rejects.toThrow(/query parameters/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("does not read or guess a response while the mapping is pending", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id: ULID, encId: "X" }), { headers: { "content-type": "application/json" } })))
    ENDPOINTS["encounters.get"] = { method: "GET", path: "/encounters/:id" } // hypothetical path, test-only
    await expect(httpEncountersService.get(ULID)).rejects.toThrow(/response mapping/)
  })
})

describe("mock encounters service: list", () => {
  it("returns string ids, newest first, with the full total", async () => {
    const { items, total } = await mockEncountersService.list()
    expect(total).toBe(ENCOUNTERS.length)
    expect(items.every((e) => typeof e.id === "string" && typeof e.patientId === "string" && typeof e.doctorId === "string")).toBe(true)
    const times = items.map((e) => new Date(e.date).getTime())
    expect(times).toEqual([...times].sort((a, b) => b - a))
  })

  it("filters by type, patient, and an inclusive date range", async () => {
    const ipd = await mockEncountersService.list({ type: "IPD" })
    expect(ipd.items.length).toBeGreaterThan(0)
    expect(ipd.items.every((e) => e.type === "IPD")).toBe(true)

    const target = ENCOUNTERS[0]
    const byPatient = await mockEncountersService.list({ patientId: String(target.patientId) })
    expect(byPatient.items.every((e) => e.patientId === String(target.patientId))).toBe(true)

    const day = format(new Date(target.date), "yyyy-MM-dd")
    const onDay = await mockEncountersService.list({ dateFrom: day, dateTo: day })
    expect(onDay.items.map((e) => e.id)).toContain(String(target.id))
    expect((await mockEncountersService.list({ dateFrom: "2999-01-01" })).total).toBe(0)
  })

  it("searches by patient name, encounter id and MR number", async () => {
    const [patient] = (await mockPatientsService.list({ pageSize: 1000 })).items.filter((p) => ENCOUNTERS.some((e) => String(e.patientId) === p.id))
    expect((await mockEncountersService.list({ search: patient.name.toUpperCase() })).items.length).toBeGreaterThan(0)
    expect((await mockEncountersService.list({ search: patient.mrNo })).items.length).toBeGreaterThan(0)
    expect((await mockEncountersService.list({ search: ENCOUNTERS[0].encId.toLowerCase() })).items.map((e) => e.encId)).toContain(ENCOUNTERS[0].encId)
    expect((await mockEncountersService.list({ search: "zzzz-no-match" })).total).toBe(0)
  })

  it("pages and reports the unpaged total", async () => {
    const page = await mockEncountersService.list({ page: 2, pageSize: 3 })
    expect(page.items.length).toBeLessThanOrEqual(3)
    expect(page.total).toBe(ENCOUNTERS.length)
    const all = (await mockEncountersService.list()).items
    expect(page.items[0].id).toBe(all[3].id)
  })

  it("gets one encounter and reports 404 for an unknown id (a ULID included)", async () => {
    await expect(mockEncountersService.get(String(ENCOUNTERS[0].id))).resolves.toMatchObject({ encId: ENCOUNTERS[0].encId })
    for (const id of ["nope", ULID, "99999"]) await expect(mockEncountersService.get(id)).rejects.toMatchObject({ status: 404 })
  })
})

describe("mock encounters service: create", () => {
  it("creates an OPD encounter with server-style fields and shares state with legacy readers", async () => {
    const before = ENCOUNTERS.length
    const created = await mockEncountersService.create({ ...baseInput, tokenNo: 7, discount: 100 })
    expect(ENCOUNTERS).toHaveLength(before + 1)
    expect(created.id).toBe(String(ENCOUNTERS.at(-1)!.id))
    expect(created.encId).toMatch(/^OPD-\d{4}-\d{4}$/)
    expect(created).toMatchObject({ status: "open", patientId: "2", doctorId: "2", tokenNo: 7, netTotal: 700, balance: 0, amountReceived: 700 })
    expect(ENCOUNTERS.at(-1)).toMatchObject({ patientId: 2, doctorId: 2 }) // legacy readers still see numeric ids
    expect(ENCOUNTERS.at(-1)!.ward).toBeUndefined()
  })

  it("never coerces a non-numeric patient or doctor id: it rejects and stores nothing", async () => {
    const before = ENCOUNTERS.length
    await expect(mockEncountersService.create({ ...baseInput, patientId: ULID })).rejects.toMatchObject({ status: 400, body: { details: [{ path: "patientId" }] } })
    await expect(mockEncountersService.create({ ...baseInput, doctorId: "007" })).rejects.toMatchObject({ status: 400, body: { details: [{ path: "doctorId" }] } })
    expect(ENCOUNTERS).toHaveLength(before)
  })

  it("admits an IPD patient to an available bed and occupies it", async () => {
    const ward = WARDS.find((w) => w.beds.some((b) => b.status === "available"))!
    const bed = ward.beds.find((b) => b.status === "available")!
    const created = await mockEncountersService.create({ ...baseInput, type: "IPD", wardId: String(ward.id), bedNo: bed.bedNo, admissionType: "Emergency" })
    expect(created).toMatchObject({ type: "IPD", ward: ward.name, wardId: String(ward.id), bedNo: bed.bedNo, admissionType: "Emergency" })
    expect(bed).toMatchObject({ status: "occupied", patientId: 2 })
    const wards = (await mockWardsService.list()).items
    expect(wards.find((w) => w.id === String(ward.id))!.beds.find((b) => b.bedNo === bed.bedNo)).toMatchObject({ status: "occupied", patientId: "2" })
  })

  it("refuses an unavailable or unknown bed or ward, leaving everything unchanged", async () => {
    const ward = WARDS.find((w) => w.beds.some((b) => b.status === "occupied"))!
    const occupied = ward.beds.find((b) => b.status === "occupied")!
    const before = ENCOUNTERS.length
    await expect(mockEncountersService.create({ ...baseInput, type: "IPD", wardId: String(ward.id), bedNo: occupied.bedNo })).rejects.toMatchObject({ status: 409 })
    await expect(mockEncountersService.create({ ...baseInput, type: "IPD", wardId: String(ward.id), bedNo: "NOPE-99" })).rejects.toMatchObject({ status: 400 })
    await expect(mockEncountersService.create({ ...baseInput, type: "IPD", wardId: ULID })).rejects.toMatchObject({ status: 400 })
    expect(ENCOUNTERS).toHaveLength(before)
    expect(occupied.status).toBe("occupied")
  })

  it("an IPD encounter with no ward chosen is still accepted, as the wizard always allowed", async () => {
    const created = await mockEncountersService.create({ ...baseInput, type: "IPD" })
    expect(created.type).toBe("IPD")
    expect(created.encId).toMatch(/^IPD-/)
  })
})

describe("mock encounters service: discharge (mock mode)", () => {
  it("discharges an open IPD encounter, records the summary and frees its bed", async () => {
    const enc = openIpd()
    const bed = WARDS.find((w) => w.name === enc.ward)!.beds.find((b) => b.bedNo === enc.bedNo)!
    bed.status = "occupied"
    const result = await mockEncountersService.discharge(String(enc.id), discharge)
    expect(result.bedReleased).toBe(true)
    expect(result.encounter).toMatchObject({
      status: "discharged", dischargeDate: "2026-01-02", dischargeDiagnosis: "Recovered well", dischargeSummary: "Fine", conditionOnDischarge: "Recovered",
    })
    expect(ENCOUNTERS.find((e) => e.id === enc.id)!.status).toBe("discharged")
    expect(bed).toMatchObject({ status: "available", patientId: null, since: null })
  })

  it("refuses to discharge twice or an unknown encounter", async () => {
    const enc = openIpd()
    await mockEncountersService.discharge(String(enc.id), discharge)
    await expect(mockEncountersService.discharge(String(enc.id), discharge)).rejects.toMatchObject({ status: 409 })
    await expect(mockEncountersService.discharge("nope", discharge)).rejects.toMatchObject({ status: 404 })
    await expect(mockEncountersService.discharge(ULID, discharge)).rejects.toMatchObject({ status: 404 })
  })

  it("reports bedReleased=false when the encounter had no bed to release", async () => {
    const created = await mockEncountersService.create({ ...baseInput, type: "IPD" })
    expect((await mockEncountersService.discharge(created.id, discharge)).bedReleased).toBe(false)
  })
})

describe("wards (mock)", () => {
  it("maps wards and beds to string-id records with live bed status", async () => {
    const { items, total } = await mockWardsService.list()
    expect(total).toBe(WARDS.length)
    expect(items[0]).toMatchObject({ id: String(WARDS[0].id), name: WARDS[0].name, type: WARDS[0].type })
    expect(items[0].beds[0]).toMatchObject({ bedNo: WARDS[0].beds[0].bedNo, status: WARDS[0].beds[0].status })
  })
})

describe("id handling", () => {
  it("only canonical integer ids have a legacy numeric form (drives the mock-only bill summary)", async () => {
    const { items } = await mockEncountersService.list()
    expect(legacyNumericId(items[0].id)).toBe(Number(items[0].id))
    expect(legacyNumericId(ULID)).toBeNull()
    expect(legacyNumericId("007")).toBeNull()
  })
})

describe("shared cache invalidation", () => {
  it("a successful create or discharge drops cached encounter and ward data; a failed one does not", async () => {
    const encLoader = vi.fn(async () => "e")
    const wardLoader = vi.fn(async () => "w")
    const warm = async () => {
      await loadShared("encounter:1", encLoader, 60_000)
      await loadShared("wards", wardLoader, 60_000)
    }
    await warm()
    await expect(encountersService.create({ ...baseInput, patientId: ULID })).rejects.toBeDefined()
    await warm()
    expect([encLoader.mock.calls.length, wardLoader.mock.calls.length]).toEqual([1, 1])

    await encountersService.create(baseInput)
    await warm()
    expect([encLoader.mock.calls.length, wardLoader.mock.calls.length]).toEqual([2, 2])

    await encountersService.discharge(String(openIpd().id), discharge)
    await warm()
    expect([encLoader.mock.calls.length, wardLoader.mock.calls.length]).toEqual([3, 3])
  })
})

describe("encounterTotals", () => {
  it.each([
    ["flat discount, paid", { fee: 1000, discountType: "flat", discount: 100, paymentStatus: "paid" }, { netTotal: 900, amountReceived: 900, balance: 0 }],
    ["percent discount, unpaid", { fee: 1000, discountType: "percent", discount: 10, paymentStatus: "unpaid", amountReceived: 500 }, { netTotal: 900, amountReceived: 0, balance: 900 }],
    ["partial payment", { fee: 1000, discountType: "flat", discount: 0, paymentStatus: "partial", amountReceived: 400 }, { netTotal: 1000, amountReceived: 400, balance: 600 }],
    ["discount larger than fee never goes negative", { fee: 100, discountType: "flat", discount: 500, paymentStatus: "paid" }, { netTotal: 0, amountReceived: 0, balance: 0 }],
    ["overpaid partial has no negative balance", { fee: 100, discountType: "flat", discount: 0, paymentStatus: "partial", amountReceived: 300 }, { netTotal: 100, amountReceived: 300, balance: 0 }],
  ] as const)("%s", (_name, input, expected) => {
    expect(encounterTotals({ ...input })).toEqual(expected)
  })
})

describe("encounterFilterOptions", () => {
  const wed = new Date(2024, 7, 21, 15, 30) // Wed 21 Aug 2024
  it("maps the quick filters to service options", () => {
    expect(encounterFilterOptions("All", wed)).toEqual({})
    expect(encounterFilterOptions("OPD", wed)).toEqual({ type: "OPD" })
    expect(encounterFilterOptions("IPD", wed)).toEqual({ type: "IPD" })
    expect(encounterFilterOptions("Today", wed)).toEqual({ dateFrom: "2024-08-21", dateTo: "2024-08-21" })
    expect(encounterFilterOptions("This Week", wed)).toEqual({ dateFrom: "2024-08-18", dateTo: "2024-08-24" }) // Sun–Sat, like isThisWeek
  })
})
