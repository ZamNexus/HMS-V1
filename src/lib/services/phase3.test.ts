import { afterEach, describe, expect, it, vi } from "vitest"
import { ApiError, setAccessToken } from "@/lib/api/client"
import { classifyCreateError } from "./createOutcome"
import { NotConnectedError } from "./errors"
import { guardianRelationUpdatePayload, organisationPayload, organisationUpdatePayload, parseOrganisation, parseOrganisationList } from "./http/mappers"
import { httpGuardianRelationsService, httpOrganisationsService } from "./http/reference"
import { schemaOf, validate } from "./http/specValidate"
import { resetSpecMismatchWarnings } from "./http/wire"
import { mockGuardianRelationsService, mockOrganisationsService } from "./mock/reference"
import { GUARDIAN_RELATIONS } from "@/data/guardianRelations"
import { PANELS } from "@/data/organisations"

// Phase 3, chunks S3 (panels) and S4 (guardian relations): get / update / deactivate / reactivate, request bodies typed by the generated
// contract and validated against docs/openapi.json. A stubbed fetch only: nothing here contacts a real backend.

const PANEL_ID = "01HZXBBBBBBBBBBBBBBBBBBBBB"
const REL_ID = "01HZXDDDDDDDDDDDDDDDDDDDDD"
const NOW = "2026-11-07T10:00:00.000Z"
const panel = (over: Record<string, unknown> = {}) => ({ id: PANEL_ID, name: "State Life", type: "insurance", contactPerson: "Mr Rafiq", phone: "0511111111", commissionPct: "2.50", discountPct: "5.00", billingMode: "panel_billed", active: true, createdAt: NOW, ...over })
const relation = (over: Record<string, unknown> = {}) => ({ id: REL_ID, name: "Husband", remarks: "note", active: true, createdAt: NOW, ...over })
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
const apiError = (status: number, code: string, details?: unknown) => json({ statusCode: status, code, message: `m ${code}`, requestId: "req-3", path: "/x", timestamp: NOW, details }, status)

function stubFetch(respond: (call: { method: string; url: string }) => Response | Promise<Response>) {
  const calls: { method: string; url: string; body: unknown }[] = []
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    const call = { method: init.method as string, url, body: init.body ? JSON.parse(init.body as string) : undefined }
    calls.push(call)
    return respond(call)
  }))
  return calls
}
afterEach(() => { vi.unstubAllGlobals(); setAccessToken(null); resetSpecMismatchWarnings() })
const check = (value: unknown, schema: string) => validate(value, schemaOf(schema))

import type { PatientRecord } from "./types"

describe("S3: panel reader and request bodies", () => {
  it("reads discountPct and billingMode too", () => {
    expect(parseOrganisation(panel())).toMatchObject({ id: PANEL_ID, commissionPct: 2.5, discountPct: 5, billingMode: "panel_billed", active: true })
    expect(() => parseOrganisation(panel({ billingMode: "somebody" }))).toThrow(/billingMode/)
    expect(() => parseOrganisation(panel({ billingMode: undefined }))).toThrow(/billingMode/)
  })

  it("a list page keeps both active and inactive panels", () => {
    const res = parseOrganisationList({ data: [panel(), panel({ id: "01HZXEEEEEEEEEEEEEEEEEEEEE", active: false })], meta: { page: 1, perPage: 100, total: 2, totalPages: 1 } })
    expect(res.items.map((p) => p.active)).toEqual([true, false])
  })

  it("create body: valid against CreatePanelDto, percentages as decimal strings, inactive refused", () => {
    const body = organisationPayload({ name: " State Life ", type: "Insurance", contactPerson: "", phone: "0511111111", commissionPct: 2.5, discountPct: 5, billingMode: "panel_billed", active: true })
    expect(body).toEqual({ name: "State Life", type: "insurance", commissionPct: "2.5", phone: "0511111111", discountPct: "5", billingMode: "panel_billed" })
    expect(check(body, "CreatePanelDto")).toEqual([])
    expect(() => organisationPayload({ name: "x", type: "Insurance", contactPerson: "", phone: "", commissionPct: 0, active: false })).toThrow(NotConnectedError)
    expect(() => organisationPayload({ name: "xx", type: "Insurance", contactPerson: "", phone: "", commissionPct: -1, active: true })).toThrow(RangeError)
  })

  it("update body carries ONLY what changed, clears with '', and is valid against UpdatePanelDto", () => {
    expect(organisationUpdatePayload({ discountPct: 7.5 })).toEqual({ discountPct: "7.5" })
    expect(organisationUpdatePayload({ contactPerson: "  ", phone: "" })).toEqual({ contactPerson: "", phone: "" })
    const full = organisationUpdatePayload({ name: " New ", type: "Government", contactPerson: "A", phone: "1", commissionPct: 0, discountPct: 0, billingMode: "patient_pays" })
    expect(full).toEqual({ name: "New", type: "government", contactPerson: "A", phone: "1", commissionPct: "0", discountPct: "0", billingMode: "patient_pays" })
    expect(check(full, "UpdatePanelDto")).toEqual([])
    expect(() => organisationUpdatePayload({})).toThrow(RangeError) // nothing to send
    expect(() => organisationUpdatePayload({ discountPct: -2 })).toThrow(RangeError)
  })
})

describe("S3: panels through the HTTP service", () => {
  it("update = PATCH /panels/{id} with the changed fields only; the answer is read", async () => {
    const calls = stubFetch(() => json(panel({ discountPct: "7.50" })))
    const saved = await httpOrganisationsService.update(PANEL_ID, { discountPct: 7.5 })
    expect(calls).toEqual([{ method: "PATCH", url: `/api/v1/panels/${PANEL_ID}`, body: { discountPct: "7.5" } }])
    expect(saved.discountPct).toBe(7.5)
  })

  it("deactivate and reactivate are POST /panels/{id}/deactivate and /reactivate", async () => {
    const calls = stubFetch((c) => json(panel({ active: c.url.endsWith("/reactivate") })))
    expect((await httpOrganisationsService.setActive(PANEL_ID, false)).active).toBe(false)
    expect((await httpOrganisationsService.setActive(PANEL_ID, true)).active).toBe(true)
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([`POST /api/v1/panels/${PANEL_ID}/deactivate`, `POST /api/v1/panels/${PANEL_ID}/reactivate`])
  })

  it("get is GET /panels/{id}", async () => {
    const calls = stubFetch(() => json(panel()))
    await httpOrganisationsService.get(PANEL_ID)
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([`GET /api/v1/panels/${PANEL_ID}`])
  })

  it("a failed update is sent ONCE (never re-sent), and a 409 name clash keeps its code for the 'show the existing panel' offer", async () => {
    const calls = stubFetch(() => apiError(409, "PANEL_NAME_TAKEN"))
    const err = await httpOrganisationsService.update(PANEL_ID, { name: "State Life" }).then(() => null, (e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(calls).toHaveLength(1)
    expect(classifyCreateError(err)).toMatchObject({ kind: "failed", code: "PANEL_NAME_TAKEN", heading: "That organisation name is already used", requestId: "req-3" })
  })

  it("a 500 on update is not retried either", async () => {
    const calls = stubFetch(() => apiError(500, "INTERNAL_ERROR"))
    await httpOrganisationsService.update(PANEL_ID, { phone: "1" }).catch(() => {})
    await httpOrganisationsService.setActive(PANEL_ID, false).catch(() => {})
    expect(calls).toHaveLength(2)
  })

  it("an unusable id never produces a request", async () => {
    const calls = stubFetch(() => json(panel()))
    await expect(httpOrganisationsService.update(PANEL_ID, {})).rejects.toBeInstanceOf(RangeError)
    expect(calls).toHaveLength(0)
  })
})

describe("S4: guardian relations", () => {
  it("update body: only what changed; '' clears the remarks; valid against UpdateGuardianRelationDto", () => {
    expect(guardianRelationUpdatePayload({ name: " Wife " })).toEqual({ name: "Wife" })
    expect(guardianRelationUpdatePayload({ remarks: "" })).toEqual({ remarks: "" })
    expect(check(guardianRelationUpdatePayload({ name: "Wife", remarks: "r" }), "UpdateGuardianRelationDto")).toEqual([])
    expect(() => guardianRelationUpdatePayload({})).toThrow(RangeError)
  })

  it("HTTP: PATCH, deactivate, reactivate and get hit the documented routes; a 409 keeps its code", async () => {
    const calls = stubFetch((c) => (c.method === "PATCH" ? apiError(409, "GUARDIAN_RELATION_TAKEN") : json(relation({ active: c.url.endsWith("/reactivate") }))))
    const err = await httpGuardianRelationsService.update(REL_ID, { name: "Wife" }).then(() => null, (e: unknown) => e)
    expect(classifyCreateError(err)).toMatchObject({ code: "GUARDIAN_RELATION_TAKEN" })
    await httpGuardianRelationsService.setActive(REL_ID, false)
    await httpGuardianRelationsService.setActive(REL_ID, true)
    await httpGuardianRelationsService.get(REL_ID)
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      `PATCH /api/v1/guardian-relations/${REL_ID}`, `POST /api/v1/guardian-relations/${REL_ID}/deactivate`, `POST /api/v1/guardian-relations/${REL_ID}/reactivate`, `GET /api/v1/guardian-relations/${REL_ID}`,
    ])
  })
})

describe("mock adapters follow the same rules (mock mode behaves like the backend)", () => {
  it("panels: update changes only what is given, names stay unique, nothing is deleted", async () => {
    const before = PANELS.length
    const created = await mockOrganisationsService.create({ name: "ZZ-TEST Panel", type: "Other", contactPerson: "", phone: "", commissionPct: 1, active: true })
    expect(created).toMatchObject({ discountPct: 0, billingMode: "patient_pays" })
    await expect(mockOrganisationsService.create({ name: "zz-test panel", type: "Other", contactPerson: "", phone: "", commissionPct: 0, active: true })).rejects.toMatchObject({ code: "PANEL_NAME_TAKEN" })
    const updated = await mockOrganisationsService.update(created.id, { discountPct: 10 })
    expect(updated).toMatchObject({ name: "ZZ-TEST Panel", commissionPct: 1, discountPct: 10 })
    await expect(mockOrganisationsService.update(created.id, { name: PANELS[0].name })).rejects.toMatchObject({ code: "PANEL_NAME_TAKEN" })
    expect((await mockOrganisationsService.setActive(created.id, false)).active).toBe(false)
    expect((await mockOrganisationsService.get(created.id)).active).toBe(false)
    expect(PANELS.length).toBe(before + 1) // deactivated, not deleted
    await expect(mockOrganisationsService.get("999999")).rejects.toMatchObject({ status: 404 })
    PANELS.pop() // leave the demo data as it was
  })

  it("relations: update, uniqueness (GUARDIAN_RELATION_TAKEN), deactivate", async () => {
    const created = await mockGuardianRelationsService.create({ name: "ZZ-TEST Relation", active: true })
    await expect(mockGuardianRelationsService.create({ name: "zz-test relation", active: true })).rejects.toMatchObject({ code: "GUARDIAN_RELATION_TAKEN" })
    expect(await mockGuardianRelationsService.update(created.id, { remarks: "r" })).toMatchObject({ name: "ZZ-TEST Relation", remarks: "r" })
    await expect(mockGuardianRelationsService.update(created.id, { name: "Self" })).rejects.toMatchObject({ code: "GUARDIAN_RELATION_TAKEN" })
    expect((await mockGuardianRelationsService.setActive(created.id, false)).active).toBe(false)
    GUARDIAN_RELATIONS.pop()
  })
})

describe("H1: request bodies are typed by the generated contract", () => {
  it("the same builders feed the contract: bodies built from a real form are valid against the schema (negative control: a wrong field is rejected)", async () => {
    const { patientCreatePayload, patientUpdatePayload } = await import("./http/mappers")
    const input = { name: "Ayesha Khan", fatherName: "Imran", dob: "1990-05-17", gender: "Female", phone: "0300-1234567", email: "a@example.com", address: "House 4", city: "Rawalpindi", country: "Pakistan", bloodGroup: "O+", cnic: "35201-1234567-1", guardianRelation: "Husband", guardianName: "Imran", panelId: PANEL_ID, status: "active", ssEmpNo: "", photoUrl: "" } as never
    expect(check(patientCreatePayload(input), "CreatePatientDto")).toEqual([])
    // email and country are typed as arrays in the JSON (spec bug); the builder sends the plain text the API description asks for
    const blank = { id: "01HZX00000000000000000000B", mrNo: "MR-2026-0001", age: 1, registrationDate: "2026-01-01", name: "Other", fatherName: "", dob: "1980-01-01", gender: "Male", phone: "1111", address: "", city: "", bloodGroup: "Unknown", cnic: "", guardianRelation: "", panelId: null, status: "active", version: "2026-11-07T10:00:00.000Z" } as PatientRecord
    expect(validate(patientUpdatePayload(input, blank), schemaOf("UpdatePatientDto"), { lenientStringArrays: true })).toEqual([])
    expect(check({ ...patientCreatePayload(input), notAField: 1 }, "CreatePatientDto").length).toBeGreaterThan(0)
  })
})
