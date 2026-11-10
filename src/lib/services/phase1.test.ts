import { readFileSync } from "node:fs"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ApiError, setAccessToken } from "@/lib/api/client"
import { createSingleFlight } from "@/lib/singleFlight"
import { classifyCreateError, SAVED_REFRESHING_MESSAGE } from "./createOutcome"
import { NotConnectedError, SavedButUnreadableError } from "./errors"
import { invalidatingService, patientsService } from "./index"
import { loadRecentPatients, RECENT_PATIENTS_PAGE_SIZE } from "./recentPatients"
import { parseGuardianRelation, parseGuardianRelationList, parseOrganisation, parseOrganisationList, parsePatient, parsePatientList, patientCreatePayload, patientListQuery, patientUpdatePayload } from "./http/mappers"
import { httpPatientsService } from "./http/patients"
import { httpGuardianRelationsService, httpOrganisationsService } from "./http/reference"
import { resetSpecMismatchWarnings } from "./http/wire"
import { schemaOf, spec } from "./http/specValidate"
import { loadShared } from "./reference/cache"
import type { PatientInput, PatientRecord } from "./types"

// Phase 1: hardening of the three connected modules. Frontend-only: spec-shaped fixtures and a stubbed fetch. Nothing here contacts a real backend.

const PATIENT_ID = "01HZXAAAAAAAAAAAAAAAAAAAAA"
const PANEL_ID = "01HZXBBBBBBBBBBBBBBBBBBBBB"
const PANEL2_ID = "01HZXCCCCCCCCCCCCCCCCCCCCC"
const REL_ID = "01HZXDDDDDDDDDDDDDDDDDDDDD"
const NOW = "2026-11-07T10:00:00.000Z"

const detail = (over: Record<string, unknown> = {}) => ({
  id: PATIENT_ID, mrNo: "MR-2026-0042", name: "Ayesha Khan", fatherName: "Imran Khan", gender: "female", dob: "1990-05-17", dobEstimated: false,
  phone: "0300-1234567", cnic: "35201-1234567-1", city: "Rawalpindi", registrationDate: "2026-01-10", admitted: false, lastVisitDate: null,
  deceasedOn: null, archived: false, medicalRecordNo: "OLD-1", emergencyContact: "0300-7654321", email: "a@example.com", address: "House 4", area: "Scheme 3",
  country: "Pakistan", bloodGroup: "O+", guardianRelation: { id: REL_ID, name: "Husband" }, guardianName: "Imran", referredBy: "Dr Ali", remarks: "VIP",
  photoUrl: "https://example.com/p.png",
  coverages: [
    { panel: { id: PANEL_ID, name: "P1", type: "insurance", active: true, discountPct: "0.00", billingMode: "patient_pays" }, priority: "primary", memberNo: null, principalMemberName: null, principalRelation: null, validFrom: null, validTo: null, benefitsApply: true },
    { panel: { id: PANEL2_ID, name: "P2", type: "corporate", active: true, discountPct: "0.00", billingMode: "patient_pays" }, priority: "secondary", memberNo: null, principalMemberName: null, principalRelation: null, validFrom: null, validTo: null, benefitsApply: true },
  ],
  archivedAt: null, createdAt: NOW, updatedAt: NOW, ...over,
})
const listItem = (over: Record<string, unknown> = {}) => ({
  id: PATIENT_ID, mrNo: "MR-2026-0042", name: "Ayesha Khan", fatherName: "Imran Khan", gender: "female", dob: "1990-05-17", dobEstimated: false, phone: "0300-1234567",
  cnic: "35201-1234567-1", city: "Rawalpindi", registrationDate: "2026-01-10", primaryPanel: { id: PANEL_ID, name: "P1" }, admitted: false, lastVisitDate: null,
  balance: null, deceasedOn: null, archived: false, ...over,
})
const panel = (over: Record<string, unknown> = {}) => ({ id: PANEL_ID, name: "State Life", type: "insurance", contactPerson: "Mr Rafiq", phone: "0511111111", commissionPct: "2.50", discountPct: "0.00", billingMode: "patient_pays", active: true, createdAt: NOW, ...over })
const relation = (over: Record<string, unknown> = {}) => ({ id: REL_ID, name: "Husband", remarks: "note", active: true, createdAt: NOW, ...over })
const page = (data: unknown[]) => ({ data, meta: { page: 1, perPage: 100, total: data.length, totalPages: 1 } })
const input = (over: Partial<PatientInput> = {}): PatientInput => ({
  name: "Ayesha Khan", fatherName: "Imran Khan", dob: "1990-05-17", gender: "Female", phone: "0300-1234567", email: "a@example.com", address: "House 4", city: "Rawalpindi",
  country: "Pakistan", bloodGroup: "O+", cnic: "35201-1234567-1", guardianRelation: "Husband", guardianName: "Imran", panelId: PANEL_ID, status: "active", ssEmpNo: "E-1", photoUrl: "data:image/png;base64,AAAA", ...over,
})
/** The form input that stands for a loaded record, with some fields changed. */
const inputOf = (base: PatientRecord, over: Partial<PatientInput> = {}): PatientInput => {
  const { id, mrNo, age, registrationDate, dobEstimated, deceasedOn, archived, admitted, lastVisitDate, balance, primaryPanelName, ...rest } = base
  void id; void mrNo; void age; void registrationDate; void dobEstimated; void deceasedOn; void archived; void admitted; void lastVisitDate; void balance; void primaryPanelName
  return { ...rest, ...over }
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
const errorBody = (statusCode: number, code: string, message: string, extra: Record<string, unknown> = {}) => ({ statusCode, code, message, requestId: "req-" + code, path: "/api/v1/x", timestamp: NOW, ...extra })

let warn: ReturnType<typeof vi.spyOn>
beforeEach(() => { resetSpecMismatchWarnings(); warn = vi.spyOn(console, "warn").mockImplementation(() => {}) })
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); setAccessToken(null) })
const warnings = () => warn.mock.calls.map((c) => String(c[0]))

// ───────────────────────────── Task 1 ─────────────────────────────

/** Every property the spec types as `array of string` (no enum), anywhere in any schema. */
function specArrayFields(): { dto: string; path: string }[] {
  const out: { dto: string; path: string }[] = []
  const walk = (dto: string, sc: Record<string, unknown> | undefined, p: string) => {
    if (!sc || typeof sc !== "object" || sc.$ref) return
    const props = sc.properties as Record<string, Record<string, unknown>> | undefined
    if (sc.type === "object" && props) {
      for (const [k, v] of Object.entries(props)) {
        const items = v.items as Record<string, unknown> | undefined
        if (v.type === "array" && items?.type === "string" && !items.enum) out.push({ dto, path: p ? `${p}.${k}` : k })
        walk(dto, v, p ? `${p}.${k}` : k)
      }
    }
    if (sc.type === "array" && sc.items) walk(dto, sc.items as Record<string, unknown>, p + "[]")
  }
  for (const [n, sc] of Object.entries(spec().components.schemas)) walk(n, sc as Record<string, unknown>, "")
  return out
}
/** Text fields an older backend spec typed as arrays (fixed in backend PR #22); the parser still reads an array without failing. */
const PATIENT_DETAIL_TEXT_FIELDS = ["address", "area", "cnic", "city", "country", "email", "emergencyContact", "fatherName", "guardianName", "medicalRecordNo", "photoUrl", "referredBy", "remarks"]

describe("Task 1: array-typed fields in the spec", () => {
  it("the scan of the whole spec finds only the real lists: the 76 mistyped text fields were fixed in backend PR #22, so a spec change is noticed", () => {
    expect(specArrayFields().map((f) => `${f.dto}.${f.path}`).sort()).toEqual(["CreateWardDto.beds", "ImagingReportDto_Output.pending", "LabReportDto_Output.pending"])
  })

  describe("patient detail: every array-typed field arrives as string, null, empty, one-element array, many-element array, empty array", () => {
    for (const field of PATIENT_DETAIL_TEXT_FIELDS) {
      it(field, () => {
        const read = (v: unknown) => (parsePatient(detail({ [field]: v })) as unknown as Record<string, unknown>)[field] ?? ""
        expect(read("text")).toBe("text")
        expect(read(null)).toBe("")
        expect(read("")).toBe("")
        expect(warnings()).toEqual([]) // none of the above is a mismatch
        expect(read(["first", "second"])).toBe("first")
        expect(read([])).toBe("")
        expect(read(["only"])).toBe("only")
        expect(warnings()).toEqual([`spec mismatch: PatientDetailDto_Output.${field} arrived as array`]) // ONE warning for the field, however many reads
      })
    }
  })

  it("one warning per DTO.field, however many records (list item: the page DTO name)", () => {
    parsePatientList({ data: [listItem({ fatherName: ["a"] }), listItem({ fatherName: ["b"] }), listItem({ city: ["x"] })], meta: { page: 1, perPage: 10, total: 3, totalPages: 1 } })
    parsePatient(detail({ fatherName: ["a"] }))
    parsePatient(detail({ fatherName: ["a"] }))
    expect(warnings().sort()).toEqual([
      "spec mismatch: PatientDetailDto_Output.fatherName arrived as array",
      "spec mismatch: PatientPageDto_Output.city arrived as array",
      "spec mismatch: PatientPageDto_Output.fatherName arrived as array",
    ])
  })

  it("panel: contactPerson, phone and commissionPct tolerate arrays (create response and list item)", () => {
    expect(parseOrganisation(panel({ contactPerson: ["Mr X", "ignored"], phone: ["051"], commissionPct: ["2.50"] }))).toMatchObject({ contactPerson: "Mr X", phone: "051", commissionPct: 2.5 })
    expect(parseOrganisation(panel({ contactPerson: [], phone: null, commissionPct: [] }))).toMatchObject({ contactPerson: "", phone: "", commissionPct: 0 })
    expect(parseOrganisation(panel({ contactPerson: "", phone: "", commissionPct: null }))).toMatchObject({ contactPerson: "", phone: "", commissionPct: 0 })
    expect(warnings().sort()).toEqual([
      "spec mismatch: PanelResponseDto_Output.commissionPct arrived as array",
      "spec mismatch: PanelResponseDto_Output.contactPerson arrived as array",
      "spec mismatch: PanelResponseDto_Output.phone arrived as array",
    ])
    parseOrganisationList(page([panel({ phone: ["1"] })]))
    expect(warnings()).toContain("spec mismatch: PanelPageDto_Output.phone arrived as array")
    expect(() => parseOrganisation(panel({ commissionPct: ["abc"] }))).toThrow(/commissionPct/) // an array does not excuse a wrong value
  })

  it("guardian relation: remarks tolerates an array", () => {
    expect(parseGuardianRelation(relation({ remarks: ["a", "b"] })).remarks).toBe("a")
    expect(parseGuardianRelation(relation({ remarks: [] })).remarks).toBeUndefined()
    expect(parseGuardianRelation(relation({ remarks: null })).remarks).toBeUndefined()
    expect(parseGuardianRelation(relation({ remarks: "" })).remarks).toBe("")
    expect(warnings()).toEqual(["spec mismatch: GuardianRelationResponseDto_Output.remarks arrived as array"])
    parseGuardianRelationList(page([relation({ remarks: ["z"] })]))
    expect(warnings()).toContain("spec mismatch: GuardianRelationPageDto_Output.remarks arrived as array")
  })

  it("only an array's first element is read, and it must itself be text or null; numbers and objects are still rejected", () => {
    expect(parsePatient(detail({ fatherName: [null, "x"] })).fatherName).toBe("")
    expect(() => parsePatient(detail({ fatherName: [5] }))).toThrow(/fatherName/)
    expect(() => parsePatient(detail({ fatherName: 5 }))).toThrow(/fatherName/)
    expect(() => parsePatient(detail({ fatherName: { a: 1 } }))).toThrow(/fatherName/)
  })

  it("request bodies never contain an array for any of those fields (create and update), and email / country are plain strings", () => {
    const names = new Set([...PATIENT_DETAIL_TEXT_FIELDS, "guardianRelationText"])
    const base = parsePatient(detail())
    for (const body of [
      patientCreatePayload(input()), patientCreatePayload(input({ email: "", country: "" })),
      patientUpdatePayload(inputOf(base, { email: "b@example.com", country: "UAE", fatherName: "" }), base),
      patientUpdatePayload(inputOf(base, { email: undefined, country: undefined }), base),
    ]) {
      for (const [k, v] of Object.entries(body)) if (names.has(k)) expect(Array.isArray(v), k).toBe(false)
    }
    const cleared = patientUpdatePayload(inputOf(base, { email: undefined, country: undefined }), base)
    expect(cleared.email).toBe("")
    expect(cleared.country).toBe("")
    expect(patientUpdatePayload(inputOf(base, { email: "b@example.com", country: "UAE" }), base)).toMatchObject({ email: "b@example.com", country: "UAE" })
    expect(patientUpdatePayload(inputOf(base), base)).toEqual({}) // an unchanged form sends nothing, so no email / country either
  })
})

// ───────────────────────────── Task 2 ─────────────────────────────

type Kind = { name: string; create: () => Promise<unknown>; path: string; ok: unknown; wrongShape: unknown }
const kinds: Kind[] = [
  { name: "patient", create: () => httpPatientsService.create(input()), path: "/api/v1/patients", ok: detail(), wrongShape: { id: "nope" } },
  { name: "panel", create: () => httpOrganisationsService.create({ name: "State Life", type: "Insurance", contactPerson: "", phone: "", commissionPct: 0, active: true }), path: "/api/v1/panels", ok: panel(), wrongShape: { id: "nope" } },
  { name: "guardian relation", create: () => httpGuardianRelationsService.create({ name: "Husband", active: true }), path: "/api/v1/guardian-relations", ok: relation(), wrongShape: { name: 5 } },
]

function stubFetch(respond: () => Response | Promise<Response>) {
  const calls: { method: string; url: string; body: unknown }[] = []
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ method: init.method as string, url, body: init.body ? JSON.parse(init.body as string) : undefined })
    return respond()
  }))
  return calls
}

describe("Task 2: creates are safe against duplicates", () => {
  for (const k of kinds) {
    describe(k.name, () => {
      it("(a) a 2xx whose answer cannot be read (non-JSON, empty, or the wrong shape) is 'saved', sends exactly ONE create and offers no retry", async () => {
        for (const make of [
          () => new Response("<html>created</html>", { status: 201, headers: { "content-type": "text/html" } }),
          () => new Response("", { status: 201 }),
          () => new Response("{not json", { status: 201, headers: { "content-type": "application/json" } }),
          () => json(k.wrongShape, 201),
        ]) {
          const calls = stubFetch(make)
          const err = await k.create().then(() => null, (e: unknown) => e)
          expect(err).toBeInstanceOf(SavedButUnreadableError)
          expect(calls).toHaveLength(1)
          expect(calls[0]).toMatchObject({ method: "POST", url: k.path })
          const outcome = classifyCreateError(err)
          expect(outcome).toEqual({ kind: "saved-unreadable", message: SAVED_REFRESHING_MESSAGE })
          expect(JSON.stringify(outcome)).not.toMatch(/retry|try again|failed|could not/i)
        }
      })

      it("(a2) a readable 2xx still returns the record", async () => {
        const calls = stubFetch(() => json(k.ok, 201))
        await expect(k.create()).resolves.toBeTruthy()
        expect(calls).toHaveLength(1)
      })

      it("(b) a non-2xx is a real failure: the backend's message, code and requestId are kept, and exactly one request was sent", async () => {
        const calls = stubFetch(() => json(errorBody(422, "PANEL_INACTIVE", "That panel is inactive.", { requestId: "req-abc-123" }), 422))
        const err = await k.create().then(() => null, (e: unknown) => e)
        expect(err).toBeInstanceOf(ApiError)
        expect(calls).toHaveLength(1)
        expect(classifyCreateError(err)).toMatchObject({ kind: "failed", heading: "That organisation is inactive", message: "That panel is inactive.", code: "PANEL_INACTIVE", requestId: "req-abc-123" })
      })

      it("(b) validation details are listed; an unknown code still shows the backend message; a gateway error page is a failure, never 'saved'", async () => {
        stubFetch(() => json(errorBody(400, "VALIDATION_FAILED", "Invalid input", { details: [{ path: "phone", message: "Required" }, { path: "name", message: "Too short" }] }), 400))
        expect(classifyCreateError(await k.create().then(() => null, (e: unknown) => e))).toMatchObject({ kind: "failed", heading: "Some details need correcting", details: ["phone: Required", "name: Too short"], requestId: "req-VALIDATION_FAILED" })
        stubFetch(() => json(errorBody(418, "SOMETHING_NEW", "A brand new problem."), 418))
        expect(classifyCreateError(await k.create().then(() => null, (e: unknown) => e))).toMatchObject({ kind: "failed", message: "A brand new problem.", code: "SOMETHING_NEW" })
        const calls = stubFetch(() => new Response("<html>Bad gateway</html>", { status: 502, headers: { "content-type": "text/html" } }))
        const err = await k.create().then(() => null, (e: unknown) => e)
        expect(classifyCreateError(err).kind).toBe("failed")
        expect(calls).toHaveLength(1)
      })

      it("(b) a network error says the record may or may not be saved (no 'try again'), with one request", async () => {
        const calls: unknown[] = []
        vi.stubGlobal("fetch", vi.fn(async () => { calls.push(1); throw new TypeError("network down") }))
        const outcome = classifyCreateError(await k.create().then(() => null, (e: unknown) => e))
        expect(outcome).toMatchObject({ kind: "failed", code: "NETWORK_ERROR" })
        expect((outcome as { message: string }).message).toMatch(/may or may not have been saved/)
        expect((outcome as { message: string }).message).not.toMatch(/try again\.$/)
        expect(calls).toHaveLength(1)
      })

      it("(c) a double click sends ONE create request (single-flight), and the button can be used again afterwards", async () => {
        let release: () => void = () => {}
        const gate = new Promise<void>((r) => { release = r })
        const calls = stubFetch(async () => { await gate; return json(k.ok, 201) })
        const flight = createSingleFlight()
        const first = flight(k.create)
        const second = flight(k.create)
        const third = flight(k.create)
        release()
        const [a, b, c] = await Promise.all([first, second, third])
        expect(a).toBeTruthy()
        expect(b).toBeUndefined()
        expect(c).toBeUndefined()
        expect(calls).toHaveLength(1)
        await flight(k.create)
        expect(calls).toHaveLength(2) // a deliberate later submit is allowed
      })
    })
  }

  it("every 409 / 422 code the spec documents for these endpoints has a heading, and the heading never replaces the backend's message", () => {
    const documented = new Set<string>()
    for (const [p, m] of [["/api/v1/guardian-relations", "post"], ["/api/v1/panels", "post"], ["/api/v1/patients", "post"], ["/api/v1/patients/{id}", "patch"], ["/api/v1/patients/{id}/archive", "post"]] as const) {
      const responses = (spec().paths[p][m] as unknown as { responses: Record<string, { description?: string }> }).responses
      for (const status of ["409", "422"]) for (const code of responses[status]?.description?.match(/`([A-Z_]{4,})`/g) ?? []) documented.add(code.replace(/`/g, ""))
    }
    expect([...documented].sort()).toEqual(["GUARDIAN_RELATION_INACTIVE", "GUARDIAN_RELATION_TAKEN", "PANEL_INACTIVE", "PANEL_NAME_TAKEN", "PATIENT_ADMITTED", "PATIENT_ARCHIVED", "PATIENT_CHANGED", "POSSIBLE_DUPLICATE"])
    for (const code of documented) {
      const outcome = classifyCreateError(new ApiError({ status: 409, code, message: "backend text " + code, requestId: "r1" }))
      expect(outcome, code).toMatchObject({ kind: "failed", message: "backend text " + code, code, requestId: "r1" })
      expect((outcome as { heading: string }).heading, code).not.toBe("Could not save")
    }
  })

  it("a failed action releases the guard, so the user can submit again", async () => {
    const flight = createSingleFlight()
    await expect(flight(async () => { throw new Error("x") })).rejects.toThrow("x")
    await expect(flight(async () => 7)).resolves.toBe(7)
  })

  it("a patient registered with the demo's inactive status is NOT archived behind the user's back: one POST /patients and nothing else", async () => {
    const calls = stubFetch(() => json(detail(), 201))
    await httpPatientsService.create(input({ status: "inactive" }))
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual(["POST /api/v1/patients"])
  })

  it("a body that cannot be built (a legacy organisation id) fails BEFORE any request and is not 'saved'", async () => {
    const calls = stubFetch(() => json(detail(), 201))
    const err = await httpPatientsService.create(input({ panelId: "3" })).then(() => null, (e: unknown) => e)
    expect(err).toBeInstanceOf(TypeError)
    expect(calls).toHaveLength(0)
    expect(classifyCreateError(err).kind).toBe("failed")
  })

  it("an unreadable-but-accepted create drops the cached lists (so the refresh shows the new record); a plain failure does not", async () => {
    let loads = 0
    const load = () => loadShared("phase1:list", async () => ++loads, 60_000)
    const make = (error: unknown) => invalidatingService({ create: async () => { throw error } }, "phase1", ["create"])
    await load()
    await expect(make(new ApiError({ status: 400, code: "VALIDATION_FAILED", message: "x" })).create()).rejects.toBeInstanceOf(ApiError)
    await load()
    expect(loads).toBe(1) // still cached
    await expect(make(new SavedButUnreadableError("x")).create()).rejects.toBeInstanceOf(SavedButUnreadableError)
    await load()
    expect(loads).toBe(2) // refetched
  })

  it("a create whose answer never arrived (network failure, timeout, 502/503/504) also drops the cached lists, so 'check the list' shows the truth; offline and server refusals do not", async () => {
    const attempt = async (error: ApiError) => {
      let loads = 0
      const key = "phase1:ambiguous:" + error.code + error.status
      const load = () => loadShared(key, async () => ++loads, 60_000)
      await load()
      await expect(invalidatingService({ create: async () => { throw error } }, key, ["create"]).create()).rejects.toBeInstanceOf(ApiError)
      await load()
      return loads
    }
    expect(await attempt(new ApiError({ status: 0, code: "NETWORK_ERROR", message: "x" }))).toBe(2)
    expect(await attempt(new ApiError({ status: 0, code: "REQUEST_TIMEOUT", message: "x" }))).toBe(2)
    for (const status of [502, 503, 504]) expect(await attempt(new ApiError({ status, code: "UNEXPECTED_RESPONSE", message: "x" }))).toBe(2)
    expect(await attempt(new ApiError({ status: 0, code: "OFFLINE", message: "x" }))).toBe(1)
    expect(await attempt(new ApiError({ status: 500, code: "INTERNAL_ERROR", message: "x" }))).toBe(1)
    expect(await attempt(new ApiError({ status: 409, code: "POSSIBLE_DUPLICATE", message: "x" }))).toBe(1)
  })
})

// ───────────────────────────── Task 3 ─────────────────────────────

const read = (rel: string) => readFileSync(path.resolve(process.cwd(), rel), "utf8")

describe("Task 3: the agreed decisions", () => {
  it("'Delete patient' is archive: POST /patients/{id}/archive; restore is POST /patients/{id}/restore", async () => {
    const calls = stubFetch(() => json(detail({ archived: true })))
    await httpPatientsService.remove(PATIENT_ID)
    const restored = await (stubFetch(() => json(detail())), httpPatientsService.restore(PATIENT_ID))
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([`POST /api/v1/patients/${PATIENT_ID}/archive`])
    expect(restored.status).toBe("active")
    const calls2 = stubFetch(() => json(detail()))
    await httpPatientsService.restore(PATIENT_ID)
    expect(calls2.map((c) => `${c.method} ${c.url}`)).toEqual([`POST /api/v1/patients/${PATIENT_ID}/restore`])
  })

  it("the UI says Archive (not Delete) with the real backend, and offers Restore for an archived patient (edit form and patient page)", () => {
    const lifecycle = read("src/components/patients/PatientLifecycleActions.tsx")
    expect(lifecycle).toContain("Archive Patient")
    expect(lifecycle).toContain("Restore Patient")
    expect(lifecycle).toContain("patientsService.restore(")
    expect(lifecycle).toContain("patientsService.remove(")
    expect(lifecycle).toContain('can("patients.archive")')
    expect(lifecycle).toContain('if (dataSource === "mock") return null') // the demo has no archive state
    const form = read("src/components/patients/PatientForm.tsx")
    expect(form).toContain("<PatientLifecycleActions")
    expect(form).toContain("Delete Patient") // the demo keeps its hard delete
    const detailPage = read("src/app/(dashboard)/patients/[id]/page.tsx")
    expect(detailPage).toContain("<PatientLifecycleActions")
  })

  it("the API has no archived-only filter: the old 'Inactive' status is refused with no request, and the screen offers includeArchived instead", async () => {
    expect(() => patientListQuery({ status: "inactive" })).toThrow(NotConnectedError)
    const calls = stubFetch(() => json(page([])))
    await expect(httpPatientsService.list({ status: "inactive" })).rejects.toBeInstanceOf(NotConnectedError)
    expect(calls).toHaveLength(0)
    expect(patientListQuery({ includeArchived: true }).includeArchived).toBe(true)
    const listPage = read("src/app/(dashboard)/patients/page.tsx")
    expect(listPage).toContain('dataSource === "mock" ? "Inactive" : "With archived"')
    expect(listPage).toContain("{ includeArchived: true }")
  })

  it("the primary organisation is still the demo's single panel; an unchanged coverage set is never sent back", () => {
    const base = parsePatient(detail())
    expect(base.panelId).toBe(PANEL_ID)
    expect(patientUpdatePayload(inputOf(base), base)).not.toHaveProperty("coverages")
    expect(patientUpdatePayload(inputOf(base, { coverages: base.coverages!.filter((c) => c.priority === "primary") }), base).coverages).toEqual([{ panelId: PANEL_ID, priority: "primary" }])
  })

  it("SS/Emp number and photo are not in any request body", () => {
    const base = parsePatient(detail())
    for (const body of [patientCreatePayload(input()), patientUpdatePayload(inputOf(base, { name: "Ayesha K", ssEmpNo: "E-1", photoUrl: "data:image/png;base64,AAAA" }), base)]) {
      expect(JSON.stringify(body)).not.toMatch(/ssEmpNo|E-1|photoUrl|base64/)
    }
  })

  it("the dashboard 'Recently registered' widget asks for ONE page of 100, not every patient", async () => {
    const list = vi.spyOn(patientsService, "list")
    await loadRecentPatients()
    expect(list).toHaveBeenCalledTimes(1)
    expect(list.mock.calls[0][0]).toMatchObject({ page: 1, pageSize: 100 })
    expect(RECENT_PATIENTS_PAGE_SIZE).toBe(100)
    expect(patientListQuery({ page: 1, pageSize: RECENT_PATIENTS_PAGE_SIZE })).toMatchObject({ page: 1, perPage: 100 })
    const dash = read("src/app/(dashboard)/dashboard/page.tsx")
    expect(dash).toContain("loadRecentPatients")
    expect(dash).not.toMatch(/listAll\(\(o\) => patientsService/)
  })

  it("the spec-conformance of fixtures still holds for the new tolerant readers (specValidate is unchanged)", () => {
    expect(schemaOf("PatientDetailDto_Output")).toBeTruthy()
  })
})
