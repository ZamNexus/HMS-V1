import { spawnSync } from "node:child_process"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { patientCreatePayload, patientUpdatePayload } from "@/lib/services/http/mappers"
import type { PatientInput, PatientRecord } from "@/lib/services/types"
import type { RequestBodyOf, Schemas, SuccessResponseOf } from "./contract"

// The generated contract (src/lib/api/schema.d.ts) is the only source of field names. These checks fail the TYPE CHECK (npm run typecheck)
// when a connected mapper reads or sends a field the contract does not have: `satisfies readonly (keyof X)[]` rejects an unknown name.

// Fields the patient mappers send on create / update (src/lib/services/http/mappers.ts)
const PATIENT_CREATE_FIELDS = [
  "name", "gender", "phone", "fatherName", "dob", "cnic", "emergencyContact", "email", "address", "area", "city", "country", "bloodGroup",
  "guardianRelationText", "guardianName", "referredBy", "remarks", "medicalRecordNo", "coverages",
] as const satisfies readonly (keyof Schemas["CreatePatientDto"])[]
const PATIENT_UPDATE_FIELDS = [
  "name", "gender", "phone", "fatherName", "dob", "cnic", "emergencyContact", "email", "address", "area", "city", "country", "bloodGroup",
  "guardianRelationText", "guardianName", "referredBy", "remarks", "medicalRecordNo", "coverages", "expectedUpdatedAt",
] as const satisfies readonly (keyof Schemas["UpdatePatientDto"])[]
// Fields the patient detail reader uses
const PATIENT_DETAIL_FIELDS = [
  "id", "mrNo", "name", "fatherName", "gender", "dob", "phone", "emergencyContact", "email", "address", "area", "city", "country", "bloodGroup",
  "cnic", "guardianRelation", "guardianName", "referredBy", "remarks", "medicalRecordNo", "admitted", "archived", "registrationDate", "photoUrl",
  "updatedAt", "coverages",
] as const satisfies readonly (keyof Schemas["PatientDetailDto_Output"])[]
const PATIENT_LIST_FIELDS = [
  "id", "mrNo", "name", "phone", "gender", "dob", "registrationDate", "admitted", "archived", "primaryPanel",
] as const satisfies readonly (keyof Schemas["PatientPageDto_Output"]["data"][number])[]
const PANEL_FIELDS = ["id", "name", "type", "contactPerson", "phone", "commissionPct", "active"] as const satisfies readonly (keyof Schemas["PanelResponseDto_Output"])[]
const PANEL_CREATE_FIELDS = ["name", "type", "commissionPct", "contactPerson", "phone"] as const satisfies readonly (keyof Schemas["CreatePanelDto"])[]
const RELATION_FIELDS = ["id", "name", "remarks", "active"] as const satisfies readonly (keyof Schemas["GuardianRelationResponseDto_Output"])[]
const RELATION_CREATE_FIELDS = ["name", "remarks"] as const satisfies readonly (keyof Schemas["CreateGuardianRelationDto"])[]
const ME_FIELDS = ["permissions", "role"] as const satisfies readonly (keyof Schemas["AuthUserDto_Output"])[]
// The error envelope the client reads (hand-written in types.ts; every field it names must exist in the contract)
const ERROR_FIELDS = ["statusCode", "code", "message", "details", "requestId", "path", "timestamp"] as const satisfies readonly (keyof Schemas["ErrorResponse"])[]

// The helper types resolve to real shapes (never "never")
type _CreateBody = RequestBodyOf<"PatientsController_create">
type _PanelCreated = SuccessResponseOf<"PanelsController_create">
const _typed: { body: _CreateBody extends never ? false : true; panel: _PanelCreated extends never ? false : true } = { body: true, panel: true }

describe("generated contract", () => {
  it("lists the fields the connected mappers use (checked by tsc; this proves the constants are not empty)", () => {
    for (const list of [PATIENT_CREATE_FIELDS, PATIENT_UPDATE_FIELDS, PATIENT_DETAIL_FIELDS, PATIENT_LIST_FIELDS, PANEL_FIELDS, PANEL_CREATE_FIELDS, RELATION_FIELDS, RELATION_CREATE_FIELDS, ME_FIELDS]) {
      expect(list.length).toBeGreaterThan(0)
      expect(new Set(list).size).toBe(list.length)
    }
    expect(_typed.body && _typed.panel).toBe(true)
  })

  it("the mappers send only fields the contract has: the REAL output of patientCreatePayload / patientUpdatePayload is a subset of the contract's fields", () => {
    const full: PatientInput = {
      name: "Ayesha Khan", fatherName: "Imran Khan", dob: "1990-05-17", gender: "Female", phone: "0300-1234567", email: "a@example.com", address: "House 4", area: "F-7", city: "Rawalpindi",
      country: "Pakistan", bloodGroup: "O+", cnic: "35201-1234567-1", guardianRelation: "Husband", guardianName: "Imran", panelId: "01HZX00000000000000000000A", status: "active",
      emergencyContact: "0300-7654321", referredBy: "Dr X", remarks: "r", medicalRecordNo: "M1", version: "2026-11-07T10:00:00.000Z", ssEmpNo: "E-1", photoUrl: "x",
    } as PatientInput
    const created = Object.keys(patientCreatePayload(full))
    // a record that differs in every field, so the update body carries (almost) every field it can
    const blank = { id: "01HZX00000000000000000000B", mrNo: "MR-2026-0001", age: 1, registrationDate: "2026-01-01", name: "Other", fatherName: "", dob: "1980-01-01", gender: "Male", phone: "1111", address: "", city: "", bloodGroup: "Unknown", cnic: "", guardianRelation: "", panelId: null, status: "active", version: "2026-11-07T10:00:00.000Z" } as PatientRecord
    const updated = Object.keys(patientUpdatePayload(full, blank))
    expect(created.length).toBeGreaterThan(10)
    expect(updated.length).toBeGreaterThan(10)
    for (const k of created) expect(PATIENT_CREATE_FIELDS as readonly string[], `create sends "${k}"`).toContain(k)
    for (const k of updated) expect(PATIENT_UPDATE_FIELDS as readonly string[], `update sends "${k}"`).toContain(k)
    // fields the form collects but the contract has no place for are never sent
    for (const k of ["ssEmpNo", "photoUrl", "status", "panelId", "version"]) { expect(created).not.toContain(k); expect(updated).not.toContain(k) }
  })

  it("the hand-written error envelope only names fields the contract has", () => {
    expect(ERROR_FIELDS.length).toBe(7)
  })

  it("schema.d.ts is exactly what is generated from docs/openapi.json (npm run types:check)", () => {
    const run = spawnSync(process.execPath, [path.resolve(process.cwd(), "scripts/check-types-drift.mjs")], { encoding: "utf8" })
    expect(run.stderr).toBe("")
    expect(run.status).toBe(0)
  }, 30_000)
})
