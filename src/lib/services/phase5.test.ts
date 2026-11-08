import { readFileSync } from "node:fs"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ApiError, setAccessToken } from "@/lib/api/client"
import { NO_PANEL, coverageProblem, coveragesOf, draftsOf, emptyDraft } from "@/components/patients/coverageDrafts"
import { apiPatientSchema, patientSchema } from "@/components/patients/patientSchema"
import { ENDPOINTS } from "./endpoints"
import { httpPatientsService } from "./http/patients"
import {
  duplicateMatchesOf, duplicateQuery, parseDuplicateMatches, parsePatient, parsePatientList, patientCreatePayload, patientHasChanges, patientListQuery, patientUpdatePayload, recordDeathPayload,
} from "./http/patientMap"
import { operation, schemaOf, validate } from "./http/specValidate"
import { ageParts, formatCnic, formatPatientAge, formatPhone } from "./patientFormat"
import type { PatientInput, PatientRecord } from "./types"

// Phase 5 (patients, handoff 8.3): list filters, estimated age, coverages, duplicates, edit with changed fields only, archive/restore, death.
// Every fixture and request body is validated AGAINST docs/openapi.json first. Nothing here contacts a backend.

afterEach(() => { vi.unstubAllGlobals(); setAccessToken(null) })

const ID = "01HZXAAAAAAAAAAAAAAAAAAAAA"
const OTHER = "01HZXEEEEEEEEEEEEEEEEEEEEE"
const P1 = "01HZXBBBBBBBBBBBBBBBBBBBBB"
const P2 = "01HZXCCCCCCCCCCCCCCCCCCCCC"
const REL = "01HZXDDDDDDDDDDDDDDDDDDDDD"
const NOW = "2026-11-07T10:00:00.000Z"
const root = process.cwd()
const read = (rel: string) => readFileSync(path.resolve(root, rel), "utf8")
const LENIENT = { lenientStringArrays: true } as const

const cov = (panelId: string, priority: "primary" | "secondary", over: Record<string, unknown> = {}) => ({
  panel: { id: panelId, name: panelId === P1 ? "State Life" : "EFU", type: "insurance", active: true, discountPct: "0.00", billingMode: "patient_pays" },
  priority, memberNo: null, principalMemberName: null, principalRelation: null, validFrom: null, validTo: null, benefitsApply: true, ...over,
})
const detail = (over: Record<string, unknown> = {}) => ({
  id: ID, mrNo: "MR-2026-0042", name: "Ayesha Khan", fatherName: "Imran Khan", gender: "female", dob: "1990-05-17", dobEstimated: false, phone: "+923001234567",
  cnic: "3520112345671", city: "Rawalpindi", registrationDate: "2026-01-10", admitted: false, lastVisitDate: "2026-10-30", deceasedOn: null, archived: false,
  medicalRecordNo: null, emergencyContact: null, email: "a@example.com", address: "House 4", area: null, country: "Pakistan", bloodGroup: "O+",
  guardianRelation: { id: REL, name: "Husband" }, guardianName: "Imran", referredBy: null, remarks: null, photoUrl: null,
  coverages: [cov(P1, "primary", { memberNo: "M-77", principalMemberName: "Imran Khan", principalRelation: "Husband", validFrom: "2026-01-01", validTo: "2026-12-31" }), cov(P2, "secondary")],
  archivedAt: null, createdAt: NOW, updatedAt: NOW, ...over,
})
const listItem = (over: Record<string, unknown> = {}) => ({
  id: ID, mrNo: "MR-2026-0042", name: "Ayesha Khan", fatherName: "Imran Khan", gender: "female", dob: "1990-05-17", dobEstimated: false, phone: "+923001234567",
  cnic: "3520112345671", city: "Rawalpindi", registrationDate: "2026-01-10", primaryPanel: { id: P1, name: "State Life" }, admitted: false, lastVisitDate: "2026-10-30",
  balance: null, deceasedOn: null, archived: false, ...over,
})
const page = (data: unknown[], total = data.length) => ({ data, meta: { page: 1, perPage: 10, total, totalPages: 1 } })
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
const errorBody = (statusCode: number, code: string, message: string, details?: unknown) => ({ statusCode, code, message, requestId: "req-1", path: "/api/v1/patients", timestamp: NOW, details })

const inputOf = (base: PatientRecord, over: Partial<PatientInput> = {}): PatientInput => {
  const { id, mrNo, age, registrationDate, dobEstimated, deceasedOn, archived, admitted, lastVisitDate, balance, primaryPanelName, ...rest } = base
  void id; void mrNo; void age; void registrationDate; void dobEstimated; void deceasedOn; void archived; void admitted; void lastVisitDate; void balance; void primaryPanelName
  return { ...rest, ...over }
}
const newInput = (over: Partial<PatientInput> = {}): PatientInput => ({
  name: "Ayesha Khan", fatherName: "Imran", dob: "1990-05-17", gender: "Female", phone: "0300-1234567", address: "House 4", city: "Rawalpindi", bloodGroup: "O+",
  cnic: "35201-1234567-1", guardianRelation: "", panelId: null, status: "active", ...over,
})

function stub(responses: Array<Response | ((url: string, init: RequestInit) => Response)>) {
  const calls: { method: string; url: string; body: unknown; signal: boolean }[] = []
  let i = 0
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ method: init.method as string, url, body: init.body ? JSON.parse(init.body as string) : undefined, signal: !!init.signal })
    const r = responses[Math.min(i++, responses.length - 1)]
    return typeof r === "function" ? r(url, init) : r.clone()
  }))
  return calls
}

describe("age on the hospital's calendar, never the browser's", () => {
  it("whole years, months and days between two calendar dates, with leap days and month ends", () => {
    expect(ageParts("1990-05-17", "2026-11-07")).toEqual({ years: 36, months: 5, days: 13323 })
    expect(ageParts("1990-05-17", "2026-05-16")?.years).toBe(35) // the day before the birthday
    expect(ageParts("1990-05-17", "2026-05-17")?.years).toBe(36)
    expect(ageParts("2024-02-29", "2025-02-28")).toMatchObject({ years: 0, months: 11 })
    expect(ageParts("2026-01-31", "2026-02-28")).toMatchObject({ years: 0, months: 0 })
    expect(ageParts("2026-12-01", "2026-11-07")).toBeNull() // born after "today"
    expect(ageParts("not a date", "2026-11-07")).toBeNull()
  })
  it("shows years, months or days, '~' for an estimated date of birth, and counts to the date of death", () => {
    const today = "2026-11-07"
    expect(formatPatientAge({ dob: "1990-05-17" }, today)).toBe("36 yrs")
    expect(formatPatientAge({ dob: "2025-05-17" }, today)).toBe("1 yr")
    expect(formatPatientAge({ dob: "2026-03-01" }, today)).toBe("8 mo")
    expect(formatPatientAge({ dob: "2026-11-02" }, today)).toBe("5 days")
    expect(formatPatientAge({ dob: "2026-11-06" }, today)).toBe("1 day")
    expect(formatPatientAge({ dob: "1981-11-07", dobEstimated: true }, today)).toBe("~45 yrs")
    expect(formatPatientAge({ dob: "1990-05-17", deceasedOn: "2020-05-16" }, today)).toBe("29 yrs") // age at death
    expect(formatPatientAge({ dob: "2030-01-01" }, today)).toBe("—")
  })
  it("the new patient screens never read the browser clock for an age", () => {
    for (const f of ["src/lib/services/patientFormat.ts", "src/lib/services/http/patientMap.ts"]) {
      const code = read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
      expect(code, f).not.toMatch(/differenceInYears|differenceInMonths/)
    }
    expect(read("src/app/(dashboard)/patients/[id]/page.tsx")).toContain("formatPatientAge(patient, today)")
    expect(read("src/app/(dashboard)/patients/page.tsx")).toContain("formatPatientAge(p, today)")
    expect(read("src/components/shared/PatientPicker.tsx")).toContain("formatPatientAge(")
  })
  it("phone is shown from E.164 as 03XX-XXXXXXX and a CNIC with its dashes; anything else as stored", () => {
    expect(formatPhone("+923001234567")).toBe("0300-1234567")
    expect(formatPhone("03001234567")).toBe("0300-1234567")
    expect(formatPhone("0300-1234567")).toBe("0300-1234567")
    expect(formatPhone("+442071234567")).toBe("+442071234567")
    expect(formatPhone("051-1234567")).toBe("051-1234567")
    expect(formatPhone(null)).toBe("")
    expect(formatCnic("3520112345671")).toBe("35201-1234567-1")
    expect(formatCnic("35201-1234567-1")).toBe("35201-1234567-1")
    expect(formatCnic("12345")).toBe("12345")
  })
})

describe("GET /patients: the filters the handoff lists", () => {
  it("sends only parameters the spec documents; booleans and dates are exact; no sort is invented", () => {
    const documented = new Set(operation("get", "/api/v1/patients").parameters!.map((p) => p.name))
    const q = patientListQuery({ search: " ali ", page: 2, pageSize: 10, gender: "Female", panelId: P1, selfPay: false, registeredFrom: "2026-01-01", registeredTo: "2026-06-30", includeArchived: true, status: "ipd" })
    for (const k of Object.keys(q)) expect(documented.has(k), `${k} is not a documented query parameter`).toBe(true)
    expect(q).toMatchObject({ page: 2, perPage: 10, search: "ali", gender: "female", panelId: P1, selfPay: false, registeredFrom: "2026-01-01", registeredTo: "2026-06-30", includeArchived: true, admitted: true })
    expect(q).not.toHaveProperty("sort")
  })
  it("Self-pay only and With archived reach the wire as the documented values", async () => {
    const calls = stub([json(page([]))])
    await httpPatientsService.list({ selfPay: true, includeArchived: true, page: 1, pageSize: 10 })
    expect(calls[0].url).toBe("/api/v1/patients?page=1&perPage=10&selfPay=true&includeArchived=true")
    expect(calls[0].signal).toBe(true) // the previous request can be aborted
  })
  it("refuses what the contract cannot take before any request: long search, bad organisation id, bad dates, page size above 100", () => {
    expect(() => patientListQuery({ search: "x".repeat(101) })).toThrow(RangeError)
    expect(() => patientListQuery({ panelId: "3" })).toThrow(TypeError)
    expect(() => patientListQuery({ registeredFrom: "01/01/2026" })).toThrow(TypeError)
    expect(() => patientListQuery({ pageSize: 101 })).toThrow(RangeError)
  })
})

describe("reading a patient", () => {
  it("fixtures validate against the spec", () => {
    expect(validate(page([listItem()]), schemaOf("PatientPageDto_Output"))).toEqual([])
    expect(validate(detail(), schemaOf("PatientDetailDto_Output"), LENIENT)).toEqual([])
  })
  it("a list row: organisation name, last visit, archived/deceased/estimated flags, and the balance (null without billing.read)", () => {
    const rows = parsePatientList(page([
      listItem(), listItem({ id: OTHER, primaryPanel: null, balance: "1500.00", deceasedOn: "2026-09-01", archived: true, dobEstimated: true, lastVisitDate: null }),
    ])).items
    expect(rows[0]).toMatchObject({ primaryPanelName: "State Life", lastVisitDate: "2026-10-30", balance: null, deceasedOn: null, archived: false, dobEstimated: false })
    expect(rows[1]).toMatchObject({ panelId: null, balance: "1500.00", deceasedOn: "2026-09-01", archived: true, dobEstimated: true, lastVisitDate: null, status: "inactive" })
    expect(rows[0].bloodGroup).toBe("Unknown") // the list answer has no blood group: nothing is invented
    expect(rows[0].guardianRelation).toBe("")
  })
  it("money stays exact text and a number is refused", () => {
    expect(parsePatientList(page([listItem({ balance: "-250.50" })])).items[0].balance).toBe("-250.50")
    expect(() => parsePatientList(page([listItem({ balance: 1500 })]))).toThrow(/balance/)
  })
  it("a detail: every coverage with its member details and benefitsApply, the guardian relation id, the version", () => {
    const p = parsePatient(detail())
    expect(p.coverages).toEqual([
      { panelId: P1, panelName: "State Life", priority: "primary", memberNo: "M-77", principalMemberName: "Imran Khan", principalRelation: "Husband", validFrom: "2026-01-01", validTo: "2026-12-31", benefitsApply: true },
      { panelId: P2, panelName: "EFU", priority: "secondary", memberNo: "", principalMemberName: "", principalRelation: "", validFrom: "", validTo: "", benefitsApply: true },
    ])
    expect(p).toMatchObject({ panelId: P1, primaryPanelName: "State Life", guardianRelation: "Husband", guardianRelationId: REL, version: NOW, deceasedOn: null, archived: false })
    expect(parsePatient(detail({ coverages: [] })).coverages).toEqual([]) // [] = self-pay
    expect(() => parsePatient(detail({ coverages: [cov(P1, "tertiary" as never)] }))).toThrow(/priority/)
    expect(() => parsePatient(detail({ deceasedOn: "yesterday" }))).toThrow(/deceasedOn/)
  })
})

describe("register: POST /patients body", () => {
  it("exactly one of date of birth and estimated age; the estimated age validates against the contract", () => {
    expect(() => patientCreatePayload(newInput({ dob: "" }))).toThrow(RangeError) // neither
    expect(() => patientCreatePayload(newInput({ estimatedAge: { value: 45, unit: "years" } }))).toThrow(RangeError) // both
    const body = patientCreatePayload(newInput({ dob: "", estimatedAge: { value: 45, unit: "years" } }))
    expect(body).toMatchObject({ estimatedAge: { value: 45, unit: "years" } })
    expect(body).not.toHaveProperty("dob")
    expect(validate(body, schemaOf("CreatePatientDto"))).toEqual([])
    expect(validate(patientCreatePayload(newInput({ dob: "", estimatedAge: { value: 8, unit: "months" } })), schemaOf("CreatePatientDto"))).toEqual([])
    expect(() => patientCreatePayload(newInput({ dob: "", estimatedAge: { value: -1, unit: "years" } }))).toThrow(RangeError)
    expect(() => patientCreatePayload(newInput({ dob: "", estimatedAge: { value: 4.5, unit: "years" } }))).toThrow(RangeError)
  })
  it("primary AND secondary coverage with member details validate against the spec; self-pay sends no coverage", () => {
    const body = patientCreatePayload(newInput({
      coverages: [
        { panelId: P1, priority: "primary", memberNo: " M-77 ", principalMemberName: "Imran Khan", principalRelation: "Husband", validFrom: "2026-01-01", validTo: "2026-12-31" },
        { panelId: P2, priority: "secondary", memberNo: "", principalMemberName: "", principalRelation: "", validFrom: "", validTo: "" },
      ],
    }))
    expect(body.coverages).toEqual([
      { panelId: P1, priority: "primary", memberNo: "M-77", principalMemberName: "Imran Khan", principalRelation: "Husband", validFrom: "2026-01-01", validTo: "2026-12-31" },
      { panelId: P2, priority: "secondary" },
    ])
    expect(validate(body, schemaOf("CreatePatientDto"))).toEqual([])
    expect(patientCreatePayload(newInput())).not.toHaveProperty("coverages")
  })
  it("refuses a bad coverage set before any request: two primaries, a secondary alone, the same organisation twice, a legacy id", () => {
    const c = (panelId: string, priority: "primary" | "secondary") => ({ panelId, priority, memberNo: "", principalMemberName: "", principalRelation: "", validFrom: "", validTo: "" })
    expect(() => patientCreatePayload(newInput({ coverages: [c(P1, "primary"), c(P2, "primary")] }))).toThrow(/at most one primary/)
    expect(() => patientCreatePayload(newInput({ coverages: [c(P2, "secondary")] }))).toThrow(/primary organisation/)
    expect(() => patientCreatePayload(newInput({ coverages: [c(P1, "primary"), c(P1, "secondary")] }))).toThrow(/different/)
    expect(() => patientCreatePayload(newInput({ coverages: [c("3", "primary")] }))).toThrow(/organisation id/)
  })
  it("a catalogued guardian relation travels as its id; 'Self' and an empty relation send nothing; free text only when no entry was chosen", () => {
    expect(patientCreatePayload(newInput({ guardianRelation: "Husband", guardianRelationId: REL }))).toMatchObject({ guardianRelationId: REL })
    expect(patientCreatePayload(newInput({ guardianRelation: "Husband", guardianRelationId: REL }))).not.toHaveProperty("guardianRelationText")
    for (const none of ["", "Self"]) {
      const b = patientCreatePayload(newInput({ guardianRelation: none }))
      expect(b).not.toHaveProperty("guardianRelationId")
      expect(b).not.toHaveProperty("guardianRelationText")
    }
    expect(patientCreatePayload(newInput({ guardianRelation: "Uncle" }))).toMatchObject({ guardianRelationText: "Uncle" })
    expect(() => patientCreatePayload(newInput({ guardianRelation: "x".repeat(61) }))).toThrow(RangeError)
  })
  it("the contract's limits and patterns are enforced before sending (the demo's 03XX phone format is not)", () => {
    expect(patientCreatePayload(newInput({ phone: "+92 300 1234567" })).phone).toBe("+92 300 1234567")
    expect(() => patientCreatePayload(newInput({ phone: "abc" }))).toThrow(RangeError)
    expect(() => patientCreatePayload(newInput({ phone: "123" }))).toThrow(RangeError)
    expect(() => patientCreatePayload(newInput({ cnic: "12345" }))).toThrow(RangeError)
    expect(() => patientCreatePayload(newInput({ emergencyContact: "x" }))).toThrow(RangeError)
    expect(() => patientCreatePayload(newInput({ address: "x".repeat(301) }))).toThrow(RangeError)
    expect(() => patientCreatePayload(newInput({ city: "x".repeat(81) }))).toThrow(RangeError)
    expect(() => patientCreatePayload(newInput({ name: "A" }))).toThrow(RangeError)
  })
  it("the MR number, registration date, age, photo and SS/Emp number are never sent; acknowledgeDuplicates only when confirmed", () => {
    const body = patientCreatePayload(newInput({ ssEmpNo: "E-1", photoUrl: "data:image/png;base64,AAAA" }))
    for (const k of ["mrNo", "registrationDate", "age", "photoUrl", "ssEmpNo", "status", "version"]) expect(body, k).not.toHaveProperty(k)
    expect(body).not.toHaveProperty("acknowledgeDuplicates")
    expect(patientCreatePayload(newInput({ acknowledgeDuplicates: false }))).not.toHaveProperty("acknowledgeDuplicates")
    const confirmed = patientCreatePayload(newInput({ acknowledgeDuplicates: true }))
    expect(confirmed.acknowledgeDuplicates).toBe(true)
    expect(validate(confirmed, schemaOf("CreatePatientDto"))).toEqual([])
  })
})

describe("edit: PATCH /patients/{id} sends the changed fields only", () => {
  const base = parsePatient(detail())
  it("one changed field sends only that field and the version; validates against the spec", () => {
    const body = patientUpdatePayload(inputOf(base, { phone: "0300 7654321" }), base)
    expect(body).toEqual({ phone: "0300 7654321", expectedUpdatedAt: NOW })
    expect(validate(body, schemaOf("UpdatePatientDto"), LENIENT)).toEqual([])
    expect(patientHasChanges(inputOf(base), base)).toBe(false)
    expect(patientHasChanges(inputOf(base, { remarks: "VIP" }), base)).toBe(true)
  })
  it("a stored phone in E.164 that the user did not touch is not sent again", () => {
    expect(base.phone).toBe("+923001234567")
    expect(patientUpdatePayload(inputOf(base, { name: "Ayesha K" }), base)).not.toHaveProperty("phone")
  })
  it("an estimated age is sent as estimatedAge and never together with dob; a new exact date of birth as dob", () => {
    const est = patientUpdatePayload(inputOf(base, { estimatedAge: { value: 46, unit: "years" } }), base)
    expect(est).toMatchObject({ estimatedAge: { value: 46, unit: "years" }, expectedUpdatedAt: NOW })
    expect(est).not.toHaveProperty("dob")
    expect(patientUpdatePayload(inputOf(base, { dob: "1991-01-01" }), base)).toMatchObject({ dob: "1991-01-01" })
    expect(patientUpdatePayload(inputOf(base, { dob: base.dob }), base)).not.toHaveProperty("dob")
    expect(validate(est, schemaOf("UpdatePatientDto"), LENIENT)).toEqual([])
  })
  it("guardian relation: a new catalogue entry by id, unchanged sends nothing, 'none' clears it", () => {
    expect(patientUpdatePayload(inputOf(base, { guardianRelation: "Wife", guardianRelationId: OTHER }), base)).toMatchObject({ guardianRelationId: OTHER })
    expect(patientUpdatePayload(inputOf(base), base)).not.toHaveProperty("guardianRelationId")
    const cleared = patientUpdatePayload(inputOf(base, { guardianRelation: "", guardianRelationId: null, guardianName: undefined }), base)
    expect(cleared).toMatchObject({ guardianRelationId: null, guardianName: null })
    expect(validate(cleared, schemaOf("UpdatePatientDto"), LENIENT)).toEqual([])
  })
  it("adding a secondary organisation sends the whole set with the primary's member details intact", () => {
    const keep = base.coverages!.filter((c) => c.priority === "primary")
    const body = patientUpdatePayload(inputOf(base, { coverages: [...keep, { panelId: OTHER, priority: "secondary", memberNo: "S-1", principalMemberName: "", principalRelation: "", validFrom: "", validTo: "" }] }), base)
    expect(body.coverages).toEqual([
      { panelId: P1, priority: "primary", memberNo: "M-77", principalMemberName: "Imran Khan", principalRelation: "Husband", validFrom: "2026-01-01", validTo: "2026-12-31" },
      { panelId: OTHER, priority: "secondary", memberNo: "S-1" },
    ])
  })
  it("a concurrent change: the version of the form is sent, the answer 409 PATIENT_CHANGED is surfaced with its code, and the edit is sent once", async () => {
    const calls = stub([json(errorBody(409, "PATIENT_CHANGED", "Someone saved this patient."), 409)])
    const err = await httpPatientsService.update(ID, inputOf(base, { name: "Ayesha K" }), base).then(() => null, (e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ status: 409, code: "PATIENT_CHANGED" })
    expect(calls).toHaveLength(1)
    expect(calls[0].body).toMatchObject({ name: "Ayesha K", expectedUpdatedAt: NOW })
  })
  it("an archived patient: 422 PATIENT_ARCHIVED is surfaced, not retried", async () => {
    const calls = stub([json(errorBody(422, "PATIENT_ARCHIVED", "Restore the patient first."), 422)])
    await expect(httpPatientsService.update(ID, inputOf(base, { name: "Z Z" }), base)).rejects.toMatchObject({ status: 422, code: "PATIENT_ARCHIVED" })
    expect(calls).toHaveLength(1)
  })
})

describe("duplicates: GET /patients/duplicates and 409 POSSIBLE_DUPLICATE", () => {
  const match = (over: Record<string, unknown> = {}) => ({ id: OTHER, mrNo: "MR-2025-0007", name: "Ayesha K", fatherName: null, gender: "female", dob: "1990-05-17", phone: "+923001234567", cnic: null, deceasedOn: null, archived: false, matchedOn: ["phone"], ...over })
  it("the fixture validates; a match reads archived/deceased and what it matched on", () => {
    const body = { matches: [match(), match({ archived: true, deceasedOn: "2025-01-01", matchedOn: ["phone", "cnic"], cnic: "3520112345671" })] }
    expect(validate(body, schemaOf("DuplicateCheckDto_Output"))).toEqual([])
    const [a, b] = parseDuplicateMatches(body)
    expect(a).toMatchObject({ id: OTHER, fatherName: "", cnic: "", archived: false, deceasedOn: null, matchedOn: ["phone"] })
    expect(b).toMatchObject({ archived: true, deceasedOn: "2025-01-01", matchedOn: ["phone", "cnic"], cnic: "3520112345671" })
    expect(() => parseDuplicateMatches({ matches: [match({ id: "9" })] })).toThrow(/id/)
    expect(() => parseDuplicateMatches({})).toThrow(/matches/)
  })
  it("the check is only requested for a usable phone or CNIC, with the documented parameters", async () => {
    expect(duplicateQuery({ phone: "abc" })).toBeNull()
    expect(duplicateQuery({ phone: "123" })).toBeNull()
    expect(duplicateQuery({ cnic: "12345" })).toBeNull()
    expect(duplicateQuery({ phone: " 0300-1234567 ", cnic: "35201-1234567-1" })).toEqual({ phone: "0300-1234567", cnic: "35201-1234567-1" })
    const documented = new Set(operation("get", "/api/v1/patients/duplicates").parameters!.map((p) => p.name))
    for (const k of Object.keys(duplicateQuery({ phone: "0300-1234567", cnic: "35201-1234567-1" })!)) expect(documented.has(k)).toBe(true)
    const calls = stub([json({ matches: [match()] })])
    expect(await httpPatientsService.duplicates({ phone: "" })).toEqual([])
    expect(calls).toHaveLength(0) // nothing to check: no request
    const found = await httpPatientsService.duplicates({ phone: "0300-1234567", signal: new AbortController().signal })
    expect(found).toHaveLength(1)
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ method: "GET", url: "/api/v1/patients/duplicates?phone=0300-1234567", signal: true })
  })
  it("a 409 POSSIBLE_DUPLICATE carries details.matches; other errors and unreadable details give null", () => {
    const err = (status: number, code: string, details: unknown) => new ApiError({ status, code, message: "m", body: errorBody(status, code, "m", details) as never })
    expect(duplicateMatchesOf(err(409, "POSSIBLE_DUPLICATE", { matches: [match()] }))).toHaveLength(1)
    expect(duplicateMatchesOf(err(409, "PATIENT_CHANGED", { matches: [match()] }))).toBeNull()
    expect(duplicateMatchesOf(err(422, "POSSIBLE_DUPLICATE", { matches: [match()] }))).toBeNull()
    expect(duplicateMatchesOf(err(409, "POSSIBLE_DUPLICATE", [match()]))).toBeNull()
    expect(duplicateMatchesOf(err(409, "POSSIBLE_DUPLICATE", { matches: "x" }))).toBeNull()
    expect(duplicateMatchesOf(new Error("x"))).toBeNull()
  })
  it("register anyway sends exactly ONE more POST, with acknowledgeDuplicates: true; the first refusal is never re-sent by the client", async () => {
    const refusal = json(errorBody(409, "POSSIBLE_DUPLICATE", "Possible duplicate", { matches: [match()] }), 409)
    const calls = stub([refusal, json(detail(), 201)])
    const first = await httpPatientsService.create(newInput()).then(() => null, (e: unknown) => e)
    expect(duplicateMatchesOf(first)).toHaveLength(1)
    expect(calls).toHaveLength(1)
    expect(calls[0].body).not.toHaveProperty("acknowledgeDuplicates")
    await httpPatientsService.create(newInput({ acknowledgeDuplicates: true }))
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual(["POST /api/v1/patients", "POST /api/v1/patients"])
    expect(calls[1].body).toMatchObject({ acknowledgeDuplicates: true })
  })
})

describe("record and revoke death", () => {
  it("the body validates against RecordDeathDto; a future or malformed date is refused before any request", () => {
    expect(validate(recordDeathPayload("2026-11-01", "2026-11-07"), schemaOf("RecordDeathDto"))).toEqual([])
    expect(() => recordDeathPayload("2026-11-08", "2026-11-07")).toThrow(RangeError)
    expect(() => recordDeathPayload("07/11/2026")).toThrow(TypeError)
    expect(() => recordDeathPayload("")).toThrow(TypeError)
  })
  it("POST record-death sends the date once; revoke-death sends no body; both read the patient back", async () => {
    const calls = stub([json(detail({ deceasedOn: "2026-11-01" })), json(detail())])
    const dead = await httpPatientsService.recordDeath(ID, "2026-11-01")
    expect(dead.deceasedOn).toBe("2026-11-01")
    const alive = await httpPatientsService.revokeDeath(ID)
    expect(alive.deceasedOn).toBeNull()
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([`POST /api/v1/patients/${ID}/record-death`, `POST /api/v1/patients/${ID}/revoke-death`])
    expect(calls[0].body).toEqual({ deceasedOn: "2026-11-01" })
    expect(calls[1].body).toBeUndefined()
  })
  it("an admitted patient: 422 PATIENT_ADMITTED is surfaced and not retried", async () => {
    const calls = stub([json(errorBody(422, "PATIENT_ADMITTED", "Discharge the patient as expired instead."), 422)])
    await expect(httpPatientsService.recordDeath(ID, "2026-11-01")).rejects.toMatchObject({ status: 422, code: "PATIENT_ADMITTED" })
    expect(calls).toHaveLength(1)
  })
  it("archive and restore are their own calls, one request each", async () => {
    const calls = stub([json(detail({ archived: true })), json(detail())])
    await httpPatientsService.remove(ID)
    await httpPatientsService.restore(ID)
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([`POST /api/v1/patients/${ID}/archive`, `POST /api/v1/patients/${ID}/restore`])
  })
})

describe("the form's coverage helpers", () => {
  it("two slots round-trip the record's coverages; a record with only the older single panelId is its primary", () => {
    const p = parsePatient(detail())
    // what comes back is what would be SENT, so the read-only panel name and benefitsApply are not part of it
    expect(coveragesOf(draftsOf(p))).toEqual(p.coverages!.map(({ panelName, benefitsApply, ...sent }) => { void panelName; void benefitsApply; return sent }))
    expect(coveragesOf(draftsOf({ panelId: P1 }))).toMatchObject([{ panelId: P1, priority: "primary" }])
    expect(coveragesOf(draftsOf(null))).toEqual([])
  })
  it("a secondary without a primary is dropped; problems are named", () => {
    const d = draftsOf(null)
    expect(coveragesOf({ ...d, secondary: { ...emptyDraft(), panelId: P2 } })).toEqual([])
    expect(coverageProblem({ ...d, secondary: { ...emptyDraft(), panelId: P2 } })).toMatch(/primary/)
    expect(coverageProblem({ primary: { ...emptyDraft(), panelId: P1 }, secondary: { ...emptyDraft(), panelId: P1 } })).toMatch(/different/)
    expect(coverageProblem({ primary: { ...emptyDraft(), panelId: P1, validFrom: "2026-05-01", validTo: "2026-01-01" }, secondary: emptyDraft() })).toMatch(/valid from/)
    expect(coverageProblem({ primary: { ...emptyDraft(), panelId: P1 }, secondary: { ...emptyDraft(), panelId: P2 } })).toBeNull()
    expect(NO_PANEL).toBe("none")
  })
})

describe("form validation follows the contract against the API, the demo keeps its own", () => {
  const ok = { name: "Ayesha Khan", gender: "Female", bloodGroup: "O+", phone: "+92 300 1234567" }
  it("the API schema takes the contract's phone and CNIC patterns and limits", () => {
    expect(apiPatientSchema.safeParse(ok).success).toBe(true)
    expect(apiPatientSchema.safeParse({ ...ok, phone: "abc" }).success).toBe(false)
    expect(apiPatientSchema.safeParse({ ...ok, phone: "12" }).success).toBe(false)
    expect(apiPatientSchema.safeParse({ ...ok, cnic: "35201-1234567-1" }).success).toBe(true)
    expect(apiPatientSchema.safeParse({ ...ok, cnic: "123" }).success).toBe(false)
    expect(apiPatientSchema.safeParse({ ...ok, emergencyContact: "+92 51 1234567" }).success).toBe(true)
    expect(apiPatientSchema.safeParse({ ...ok, remarks: "x".repeat(501) }).success).toBe(false)
    expect(apiPatientSchema.safeParse({ ...ok, address: "x".repeat(301) }).success).toBe(false)
    expect(apiPatientSchema.safeParse({ ...ok, dob: undefined }).success).toBe(true) // the form checks "date of birth or estimated age" itself
  })
  it("the demo schema is unchanged: it still wants 03XX-XXXXXXX and a date of birth", () => {
    expect(patientSchema.safeParse({ ...ok, dob: "1990-05-17" }).success).toBe(false)
    expect(patientSchema.safeParse({ ...ok, dob: "1990-05-17", phone: "0300-1234567" }).success).toBe(true)
  })
})

describe("the screens", () => {
  it("endpoint table: duplicates, record-death and revoke-death are the handoff's routes", () => {
    expect(ENDPOINTS["patients.duplicates"]).toEqual({ method: "GET", path: "/patients/duplicates" })
    expect(ENDPOINTS["patients.recordDeath"]).toEqual({ method: "POST", path: "/patients/:id/record-death" })
    expect(ENDPOINTS["patients.revokeDeath"]).toEqual({ method: "POST", path: "/patients/:id/revoke-death" })
  })
  it("the list: server-side search (300 ms, 2 characters), filters in the address bar but never the search text, buttons by permission", () => {
    const src = read("src/app/(dashboard)/patients/page.tsx")
    expect(src).toContain("useDebouncedSearch()")
    expect(src).toContain('const URL_KEYS = ["page", "view", "gender", "panel", "from", "to"] as const')
    expect(src).not.toMatch(/url\.set\(\{[^}]*search/)
    expect(src).toContain('can("patients.write")')
    expect(src).toContain('can("billing.read")') // the balance column
    expect(src).toContain("placeholderData: keepPreviousData")
    expect(src).not.toMatch(/useResource\(/)
    expect(src).toContain("React.Suspense") // useSearchParams needs a boundary
  })
  it("the picker uses the shared picker hook: perPage 6, 300 ms, 2 characters, previous request aborted", () => {
    const src = read("src/components/shared/PatientPicker.tsx")
    expect(src).toContain("usePickerOptions(")
    expect(src).not.toMatch(/setTimeout|useResource\(/)
  })
  it("the form: no predicted MR number against the API, estimated age, coverages, only changed fields, ticket buttons by permission, no photo or SS/Emp number", () => {
    const src = read("src/components/patients/PatientForm.tsx")
    expect(src).toContain('"Assigned on registration"')
    expect(src).toContain("<CoverageFields")
    expect(src).toContain("patientsService.update(base.id, input, base)")
    expect(src).toContain("duplicateMatchesOf(err)")
    // only what the user touched is taken from the form, so "Load latest" can never send an old value over someone else's change
    expect(src).toContain("isEdit && base && !dirty[k]")
    expect(src).toContain("coverageTouched")
    expect(src).toContain("setBase(fresh)")
    expect(src).toContain("acknowledgeDuplicates: true")
    // Save & OPD/IPD ticket register the patient and then open the check-in / admission screen (Phase 7); each needs its own permission
    expect(src).toContain('(isApi && !can("encounters.check_in"))')
    expect(src).toContain('can("ipd.admit")')
    expect(src).toContain("/encounters/new?patientId=")
    expect(src).toMatch(/\{!isApi && \(\s*<div className="md:col-span-2 lg:col-span-3 pb-2">\s*<PhotoUpload/)
    expect(src).not.toMatch(/Only the FIRST load shows the skeleton[\s\S]*if \(loading \|\| !data\)/)
  })
  it("the profile: lifecycle actions by permission, no new visit for a deceased or archived patient", () => {
    const src = read("src/app/(dashboard)/patients/[id]/page.tsx")
    expect(src).toContain("<PatientLifecycleActions")
    expect(src).toContain('can("patients.write")')
    expect(src).toContain("{!deceased && !archived && (")
    const life = read("src/components/patients/PatientLifecycleActions.tsx")
    expect(life).toContain('can("patients.record_death")')
    expect(life).toContain('can("patients.archive")')
  })
})
