import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError } from "@/lib/api/client"
import { PATIENTS } from "@/data/patients"
import { ENDPOINTS } from "./endpoints"
import { NotConnectedError } from "./errors"
import { httpPatientsService } from "./http/patients"
import { mockPatientsService } from "./mock/patients"
import { findDuplicatePhone, legacyPatientId, pickerSearchTerm, toLegacyPatient, PICKER_MIN_CHARS } from "./patientHelpers"
import type { PatientInput, PatientRecord } from "./types"

// Frontend-only unit tests with controlled data. They verify the UI-facing contract of the mock adapter and
// that the real-backend adapter sends nothing while the contract is unconfirmed. None says anything about the
// real backend.

const snapshot = structuredClone(PATIENTS)
beforeEach(() => PATIENTS.splice(0, PATIENTS.length, ...structuredClone(snapshot)))
afterEach(() => {
  vi.unstubAllGlobals()
  for (const key of ["patients.list", "patients.get", "patients.create", "patients.update", "patients.delete"] as const) ENDPOINTS[key] = null
})

const input: PatientInput = {
  name: "Test Patient", fatherName: "Test Father", dob: "2000-01-15", gender: "Female", phone: "0300-0000001",
  address: "1 Test Street", city: "Rawalpindi", country: "Pakistan", bloodGroup: "O+", cnic: "",
  guardianRelation: "Self", panelId: null, status: "active",
}

describe("mock patients service", () => {
  it("lists records with string ids and the full total", async () => {
    const { items, total } = await mockPatientsService.list()
    expect(total).toBe(PATIENTS.length)
    expect(typeof items[0].id).toBe("string")
    expect(items[0].panelId === null || typeof items[0].panelId === "string").toBe(true)
  })

  it("searches by name, MR number and phone (case-insensitive)", async () => {
    const byName = await mockPatientsService.list({ search: "MUHAMMAD USMAN" })
    expect(byName.items.map((p) => p.name)).toContain("Muhammad Usman")
    const byMr = await mockPatientsService.list({ search: "mr-2024-0003" })
    expect(byMr.items).toHaveLength(1)
    const byPhone = await mockPatientsService.list({ search: PATIENTS[1].phone })
    expect(byPhone.items[0].id).toBe(String(PATIENTS[1].id))
    expect((await mockPatientsService.list({ search: "zzzz-no-match" })).total).toBe(0)
  })

  it("filters by status and combines it with search", async () => {
    const ipd = await mockPatientsService.list({ status: "ipd" })
    expect(ipd.items.length).toBeGreaterThan(0)
    expect(ipd.items.every((p) => p.status === "ipd")).toBe(true)
    const none = await mockPatientsService.list({ status: "ipd", search: "zzzz-no-match" })
    expect(none.total).toBe(0)
  })

  it("pages results and reports the unpaged total", async () => {
    const page2 = await mockPatientsService.list({ page: 2, pageSize: 8 })
    expect(page2.items).toHaveLength(8)
    expect(page2.items[0].id).toBe(String(PATIENTS[8].id))
    expect(page2.total).toBe(PATIENTS.length)
  })

  it("gets one patient and reports 404 for an unknown id", async () => {
    await expect(mockPatientsService.get(String(PATIENTS[0].id))).resolves.toMatchObject({ name: PATIENTS[0].name })
    await expect(mockPatientsService.get("nope")).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" })
    await expect(mockPatientsService.get("nope")).rejects.toBeInstanceOf(ApiError)
  })

  it("creates a patient: assigns id, MR number, age and registration date, and shares state with legacy readers", async () => {
    const before = PATIENTS.length
    const created = await mockPatientsService.create({ ...input, panelId: "2" })
    expect(PATIENTS).toHaveLength(before + 1)
    expect(created.id).toBe(String(PATIENTS.at(-1)!.id))
    expect(created.mrNo).toMatch(/^MR-\d{4}-\d{4}$/)
    expect(created.registrationDate).toBe(new Date().toISOString().slice(0, 10))
    expect(created.age).toBeGreaterThanOrEqual(0)
    expect(created.panelId).toBe("2")
    expect(PATIENTS.at(-1)!.panelId).toBe(2) // legacy readers still see a numeric panel id
  })

  it("updates in place, keeping MR number and registration date, and recomputes age", async () => {
    const target = PATIENTS[0]
    const updated = await mockPatientsService.update(String(target.id), { ...input, name: "Renamed", dob: "1990-05-05" })
    expect(updated).toMatchObject({ id: String(target.id), name: "Renamed", mrNo: target.mrNo, registrationDate: target.registrationDate })
    expect(PATIENTS[0].name).toBe("Renamed")
    expect(updated.age).toBe(PATIENTS[0].age)
    await expect(mockPatientsService.update("nope", input)).rejects.toMatchObject({ status: 404 })
  })

  it("removes a patient and reports 404 afterwards", async () => {
    const id = String(PATIENTS[0].id)
    await mockPatientsService.remove(id)
    expect(PATIENTS.some((p) => String(p.id) === id)).toBe(false)
    await expect(mockPatientsService.remove(id)).rejects.toMatchObject({ status: 404 })
  })
})

describe("http patients service while the contract is unconfirmed", () => {
  it("has no endpoint configured for any Patients operation", () => {
    for (const key of ["patients.list", "patients.get", "patients.create", "patients.update", "patients.delete"] as const) {
      expect(ENDPOINTS[key]).toBeNull()
    }
  })

  it("sends no request and reports 'awaiting the backend contract' for every operation", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const calls = [
      httpPatientsService.list({ search: "x" }),
      httpPatientsService.get("1"),
      httpPatientsService.create(input),
      httpPatientsService.update("1", input),
      httpPatientsService.remove("1"),
    ]
    for (const c of calls) await expect(c).rejects.toThrow(/awaiting the backend contract/)
    for (const c of calls) await expect(c).rejects.toBeInstanceOf(NotConnectedError)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("even with a path configured, sends nothing until the request/response mapping is implemented", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    ENDPOINTS["patients.list"] = { method: "GET", path: "/patients" } // hypothetical path, test-only
    ENDPOINTS["patients.create"] = { method: "POST", path: "/patients" }
    await expect(httpPatientsService.list({ search: "x" })).rejects.toThrow(/query parameters/)
    await expect(httpPatientsService.create(input)).rejects.toThrow(/request payload/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("does not read or guess a response when the mapping is pending", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ items: [{ id: "x" }], total: 1 }), { headers: { "content-type": "application/json" } })))
    ENDPOINTS["patients.get"] = { method: "GET", path: "/patients/:id" } // hypothetical path, test-only
    await expect(httpPatientsService.get("01ARZ3NDEKTSV4RRFFQ69G5FAV")).rejects.toThrow(/response mapping/)
  })
})

describe("legacy bridge", () => {
  const rec = (over: Partial<PatientRecord> = {}): PatientRecord => ({ ...toRecordLike(), ...over })
  function toRecordLike(): PatientRecord {
    const { id, panelId, ...rest } = PATIENTS[0]
    return { ...rest, id: String(id), panelId: panelId === null ? null : String(panelId) }
  }

  it("recognises numeric ids only; a ULID has no legacy equivalent", () => {
    expect(legacyPatientId({ id: "12" })).toBe(12)
    expect(legacyPatientId({ id: "01ARZ3NDEKTSV4RRFFQ69G5FAV" })).toBeNull()
    expect(legacyPatientId({ id: "12abc" })).toBeNull()
    expect(legacyPatientId({ id: "" })).toBeNull()
  })

  it("converts a legacy-compatible record and refuses anything else instead of producing NaN", () => {
    expect(toLegacyPatient(rec({ id: "7", panelId: "3" }))).toMatchObject({ id: 7, panelId: 3 })
    expect(toLegacyPatient(rec({ id: "7", panelId: null })).panelId).toBeNull()
    expect(() => toLegacyPatient(rec({ id: "01ARZ3NDEKTSV4RRFFQ69G5FAV" }))).toThrow(/legacy patient ids/)
  })

  it("never turns a non-canonical id into a number (no '007' -> 7, no '1e3' -> 1000, no NaN panel id)", () => {
    for (const id of ["007", "1e3", " 7", "7 ", "-1", "9007199254740993"]) expect(legacyPatientId({ id })).toBeNull()
    expect(() => toLegacyPatient(rec({ id: "7", panelId: "01ARZ3NDEKTSV4RRFFQ69G5FAV" }))).toThrow(/legacy patient ids/)
    expect(() => toLegacyPatient(rec({ id: "7", panelId: "007" }))).toThrow(/legacy patient ids/)
  })
})

describe("patient picker behaviour", () => {
  it("searches only once the query is long enough, trimming whitespace", () => {
    expect(PICKER_MIN_CHARS).toBe(2)
    expect(pickerSearchTerm("")).toBeNull()
    expect(pickerSearchTerm(" a ")).toBeNull()
    expect(pickerSearchTerm("  ab ")).toBe("ab")
  })

  it("returns a bounded list through the service, using the shared mock data", async () => {
    const { items } = await mockPatientsService.list({ search: "03", pageSize: 6 })
    expect(items.length).toBeLessThanOrEqual(6)
    expect(items.length).toBeGreaterThan(0)
  })
})

describe("duplicate phone check", () => {
  it("finds another patient with the same phone and ignores the patient being edited", async () => {
    const { items } = await mockPatientsService.list()
    const a = items[0]
    expect(findDuplicatePhone(items, a.phone)?.id).toBe(a.id)
    expect(findDuplicatePhone(items, a.phone, a.id)).toBeUndefined()
    expect(findDuplicatePhone(items, "0300-9999999")).toBeUndefined()
  })
})
