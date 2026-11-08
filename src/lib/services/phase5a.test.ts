import { afterEach, describe, expect, it, vi } from "vitest"
import { setAccessToken } from "@/lib/api/client"
import { ENDPOINTS, HANDOFF_ONLY_ROUTE_KEYS } from "./endpoints"
import { NotConnectedError } from "./errors"
import { parseCurrentUser, parseGuardianRelationList, parseOrganisationList, parsePatient, parsePatientList, patientCreatePayload, patientListQuery, patientUpdatePayload, organisationPayload, guardianRelationPayload } from "./http/mappers"
import { httpPatientsService } from "./http/patients"
import { httpGuardianRelationsService, httpOrganisationsService } from "./http/reference"
import { operation, schemaOf, spec, validate } from "./http/specValidate"
import { authService } from "./identity"
import type { PatientInput, PatientRecord } from "./types"

// Phase 5A: identity parser, patients, organisations (panels) and guardian relations, connected to docs/openapi.json.
// Every fixture and every request body below is validated AGAINST THE SPECIFICATION first, so the mapper is checked against
// the contract and not against the author's memory of it. None of this contacts a real backend.

afterEach(() => { vi.unstubAllGlobals(); setAccessToken(null) })

const PATIENT_ID = "01HZXAAAAAAAAAAAAAAAAAAAAA"
const PANEL_ID = "01HZXBBBBBBBBBBBBBBBBBBBBB"
const PANEL2_ID = "01HZXCCCCCCCCCCCCCCCCCCCCC"
const REL_ID = "01HZXDDDDDDDDDDDDDDDDDDDDD"
const NOW = "2026-11-07T10:00:00.000Z"

const listItem = (over: Record<string, unknown> = {}) => ({
  id: PATIENT_ID, mrNo: "MR-2026-0042", name: "Ayesha Khan", fatherName: "Imran Khan", gender: "female", dob: "1990-05-17", dobEstimated: false,
  phone: "+92 300 1234567", cnic: "35201-1234567-1", city: "Rawalpindi", registrationDate: "2026-01-10",
  primaryPanel: { id: PANEL_ID, name: "State Life" }, admitted: false, lastVisitDate: "2026-10-30", balance: null, deceasedOn: null, archived: false, ...over,
})
const coverage = (panelId: string, priority: "primary" | "secondary") => ({
  panel: { id: panelId, name: "P", type: "insurance", active: true, discountPct: "0.00", billingMode: "patient_pays" },
  priority, memberNo: null, principalMemberName: null, principalRelation: null, validFrom: null, validTo: null, benefitsApply: true,
})
const detail = (over: Record<string, unknown> = {}) => ({
  id: PATIENT_ID, mrNo: "MR-2026-0042", name: "Ayesha Khan", fatherName: "Imran Khan", gender: "female", dob: "1990-05-17", dobEstimated: false,
  phone: "+92 300 1234567", cnic: "35201-1234567-1", city: "Rawalpindi", registrationDate: "2026-01-10", admitted: false, lastVisitDate: null,
  deceasedOn: null, archived: false, medicalRecordNo: null, emergencyContact: null, email: "a@example.com", address: "House 4", area: null,
  country: "Pakistan", bloodGroup: "O+", guardianRelation: { id: REL_ID, name: "Husband" }, guardianName: "Imran", referredBy: null, remarks: null,
  photoUrl: null, coverages: [coverage(PANEL_ID, "primary"), coverage(PANEL2_ID, "secondary")], archivedAt: null, createdAt: NOW, updatedAt: NOW, ...over,
})
const page = (data: unknown[], total = data.length) => ({ data, meta: { page: 1, perPage: 10, total, totalPages: 1 } })
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

const LENIENT = { lenientStringArrays: true } as const
/** The form input that stands for a loaded record, with some fields changed. */
const inputOf = (base: PatientRecord, over: Partial<PatientInput> = {}): PatientInput => {
  const { id, mrNo, age, registrationDate, dobEstimated, deceasedOn, archived, admitted, lastVisitDate, balance, primaryPanelName, ...rest } = base
  void id; void mrNo; void age; void registrationDate; void dobEstimated; void deceasedOn; void archived; void admitted; void lastVisitDate; void balance; void primaryPanelName
  return { ...rest, ...over }
}
const input = (over: Partial<PatientInput> = {}): PatientInput => ({
  name: " Ayesha Khan ", fatherName: "Imran Khan", dob: "1990-05-17", gender: "Female", phone: "+92 300 1234567", email: "a@example.com", address: "House 4",
  city: "Rawalpindi", country: "Pakistan", bloodGroup: "O+", cnic: "35201-1234567-1", guardianRelation: "Husband", guardianName: "Imran", panelId: PANEL_ID,
  status: "active", ...over,
})

describe("fixtures are what the specification says (so the tests below mean something)", () => {
  it("patient list item, detail, panel and guardian relation fixtures validate against their schemas", () => {
    expect(validate(page([listItem()]), schemaOf("PatientPageDto_Output"))).toEqual([])
    expect(validate(detail(), schemaOf("PatientDetailDto_Output"), LENIENT)).toEqual([])
    expect(validate(page([{ id: PANEL_ID, name: "State Life", type: "insurance", contactPerson: null, phone: null, commissionPct: "2.50", discountPct: "0.00", billingMode: "patient_pays", active: true, createdAt: NOW }]), schemaOf("PanelPageDto_Output"))).toEqual([])
    expect(validate(page([{ id: REL_ID, name: "Husband", remarks: null, active: true, createdAt: NOW }]), schemaOf("GuardianRelationPageDto_Output"))).toEqual([])
  })
  it("the validator really rejects bad data (a negative control)", () => {
    expect(validate(listItem({ gender: "F" }), schemaOf("PatientPageDto_Output").properties ? ((schemaOf("PatientPageDto_Output").properties as Record<string, { items: Record<string, unknown> }>).data.items) : {})).not.toEqual([])
    expect(validate(detail({ dob: "17/05/1990" }), schemaOf("PatientDetailDto_Output"), LENIENT)).not.toEqual([])
    expect(validate(detail({ fatherName: 5 }), schemaOf("PatientDetailDto_Output"), LENIENT)).not.toEqual([])
  })
})

describe("GET /patients query", () => {
  it("only uses parameters the spec documents for GET /patients, and maps the status filter", () => {
    const documented = new Set(operation("get", "/api/v1/patients").parameters!.map((p) => p.name))
    for (const status of [undefined, "active", "ipd"] as const) {
      const q = patientListQuery({ search: "ali", status, page: 2, pageSize: 10 })
      for (const k of Object.keys(q)) expect(documented.has(k), `${k} is not a documented query parameter`).toBe(true)
    }
    expect(patientListQuery({ search: "ali", page: 2, pageSize: 10 })).toEqual({ page: 2, perPage: 10, search: "ali", admitted: undefined })
    expect(patientListQuery({ status: "ipd" }).admitted).toBe(true)
    expect(patientListQuery({ status: "active" }).admitted).toBe(false)
  })
  it("refuses a page size above the documented maximum of 100 and the unsupported 'Inactive' filter", () => {
    expect(() => patientListQuery({ pageSize: 101 })).toThrow(RangeError)
    expect(() => patientListQuery({ pageSize: 0 })).toThrow(RangeError)
    expect(() => patientListQuery({ page: 0 })).toThrow(RangeError)
    expect(() => patientListQuery({ status: "inactive" })).toThrow(NotConnectedError)
  })
})

describe("patient responses", () => {
  it("maps a list item to the UI record", () => {
    const { items, total } = parsePatientList(page([listItem(), listItem({ id: "01HZXEEEEEEEEEEEEEEEEEEEEE", admitted: true, primaryPanel: null, archived: false })], 37))
    expect(total).toBe(37)
    expect(items[0]).toMatchObject({ id: PATIENT_ID, mrNo: "MR-2026-0042", name: "Ayesha Khan", gender: "Female", dob: "1990-05-17", panelId: PANEL_ID, status: "active", city: "Rawalpindi", cnic: "35201-1234567-1", fatherName: "Imran Khan" })
    expect(items[0].age).toBeGreaterThanOrEqual(35)
    expect(items[1]).toMatchObject({ panelId: null, status: "ipd" }) // no primary panel = self-pay
  })
  it("maps a detail response: blood group, guardian relation name, primary coverage, version", () => {
    const p = parsePatient(detail())
    expect(p).toMatchObject({ bloodGroup: "O+", guardianRelation: "Husband", guardianName: "Imran", panelId: PANEL_ID, country: "Pakistan", email: "a@example.com", version: NOW, address: "House 4" })
    expect(parsePatient(detail({ coverages: [coverage(PANEL2_ID, "secondary")] })).panelId).toBeNull() // only a secondary panel: no primary
    expect(parsePatient(detail({ bloodGroup: null })).bloodGroup).toBe("Unknown")
    expect(parsePatient(detail({ guardianRelation: null })).guardianRelation).toBe("")
    expect(parsePatient(detail({ fatherName: null, cnic: null, city: null, address: null })).cnic).toBe("")
  })
  it("derives the status from archived / admitted (deceased is not a UI state)", () => {
    expect(parsePatient(detail({ archived: true })).status).toBe("inactive")
    expect(parsePatient(detail({ archived: true, admitted: true })).status).toBe("inactive")
    expect(parsePatient(detail({ admitted: true })).status).toBe("ipd")
    expect(parsePatient(detail({ deceasedOn: "2026-09-01" })).status).toBe("active")
  })
  it("rejects malformed data loudly instead of rendering blanks or NaN", () => {
    expect(() => parsePatient(detail({ id: "12" }))).toThrow(/id/)
    expect(() => parsePatient(detail({ dob: "17/05/1990" }))).toThrow(/dob/)
    expect(() => parsePatient(detail({ gender: "F" }))).toThrow(/gender/)
    expect(() => parsePatient(detail({ fatherName: 5 }))).toThrow(/fatherName/) // a number is never accepted (an array is tolerated: see phase1.test.ts)
    expect(() => parsePatient(detail({ archived: "no" }))).toThrow(/archived/)
    expect(() => parsePatient(null)).toThrow(TypeError)
    expect(() => parsePatientList({ data: [], meta: {} })).toThrow(/total/)
    expect(() => parsePatientList({ data: "x", meta: { total: 0 } })).toThrow(/data/)
    expect(() => parsePatientList(page([listItem({ primaryPanel: { id: "7", name: "x" } })]))).toThrow(/id/)
  })
})

describe("patient request bodies are valid CreatePatientDto / UpdatePatientDto", () => {
  it("create: validates against the spec, and drops what the DTO cannot carry", () => {
    const body = patientCreatePayload(input({ ssEmpNo: "E-1", photoUrl: "data:image/png;base64,AAAA", medicalRecordNo: "OLD-9" }))
    expect(validate(body, schemaOf("CreatePatientDto"))).toEqual([])
    expect(body).toMatchObject({ name: "Ayesha Khan", gender: "female", phone: "+92 300 1234567", guardianRelationText: "Husband", coverages: [{ panelId: PANEL_ID, priority: "primary" }], medicalRecordNo: "OLD-9" })
    for (const k of ["ssEmpNo", "photoUrl", "mrNo", "age", "registrationDate", "status", "version", "panelId", "guardianRelation"]) expect(body, k).not.toHaveProperty(k)
  })
  it("create: empty optional fields are omitted, 'Unknown' blood group is omitted, self-pay sends no coverage", () => {
    const body = patientCreatePayload(input({ fatherName: "", email: undefined, cnic: "", bloodGroup: "Unknown", guardianName: undefined, panelId: null }))
    expect(validate(body, schemaOf("CreatePatientDto"))).toEqual([])
    for (const k of ["fatherName", "email", "cnic", "bloodGroup", "guardianName", "coverages"]) expect(body, k).not.toHaveProperty(k)
  })
  it("create: never sends a legacy numeric organisation id", () => {
    expect(() => patientCreatePayload(input({ panelId: "3" }))).toThrow(/organisation id/)
  })
  it("update: validates against the spec; ONLY changed fields are sent, an emptied optional field as null, the version as expectedUpdatedAt", () => {
    const base = parsePatient(detail())
    const body = patientUpdatePayload(inputOf(base, { fatherName: "", email: undefined }), base)
    expect(validate(body, schemaOf("UpdatePatientDto"), LENIENT)).toEqual([])
    expect(body).toEqual({ fatherName: null, email: "", expectedUpdatedAt: NOW }) // email: "" to clear, never null or an array; nothing else is sent
  })
  it("update: an unchanged form sends nothing at all", () => {
    const base = parsePatient(detail())
    expect(patientUpdatePayload(inputOf(base), base)).toEqual({})
  })
  it("update: a changed coverage sends the WHOLE set back, member details included; [] means self-pay", () => {
    const base = parsePatient(detail({ coverages: [{ ...coverage(PANEL_ID, "primary"), memberNo: "M-1", validFrom: "2026-01-01" }, coverage(PANEL2_ID, "secondary")] }))
    const keepPrimary = base.coverages!.find((c) => c.priority === "primary")!
    // dropping the secondary: the primary goes back with its member details, the secondary is gone
    const dropped = patientUpdatePayload(inputOf(base, { coverages: [keepPrimary] }), base)
    expect(dropped.coverages).toEqual([{ panelId: PANEL_ID, priority: "primary", memberNo: "M-1", validFrom: "2026-01-01" }])
    // clearing everything: [] (self-pay)
    const cleared = patientUpdatePayload(inputOf(base, { coverages: [], panelId: null }), base)
    expect(cleared.coverages).toEqual([])
    // an unchanged set is not sent
    expect(patientUpdatePayload(inputOf(base, { coverages: base.coverages }), base)).not.toHaveProperty("coverages")
    for (const b of [dropped, cleared]) expect(validate(b, schemaOf("UpdatePatientDto"), LENIENT)).toEqual([])
  })
})

describe("HTTP patients adapter: exact requests", () => {
  const calls: { method: string; url: string; body: unknown }[] = []
  function stub(responses: Array<Response | ((url: string, init: RequestInit) => Response)>) {
    calls.length = 0
    let i = 0
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ method: init.method as string, url, body: init.body ? JSON.parse(init.body as string) : undefined })
      const r = responses[Math.min(i++, responses.length - 1)]
      return typeof r === "function" ? r(url, init) : r.clone()
    }))
  }

  it("list: GET /api/v1/patients with page, perPage, search and the status mapping", async () => {
    stub([json(page([listItem()], 1))])
    const res = await httpPatientsService.list({ search: " ali ", status: "ipd", page: 3, pageSize: 10 })
    expect(calls).toHaveLength(1)
    expect(calls[0].method).toBe("GET")
    expect(calls[0].url).toBe("/api/v1/patients?page=3&perPage=10&search=ali&admitted=true")
    expect(res.total).toBe(1)
  })
  it("list with the 'Inactive' filter sends NO request", async () => {
    stub([json(page([]))])
    await expect(httpPatientsService.list({ status: "inactive" })).rejects.toBeInstanceOf(NotConnectedError)
    expect(calls).toHaveLength(0)
  })
  it("get: GET /api/v1/patients/{id}; an id that is not a ULID is still just URL-encoded (the server answers)", async () => {
    stub([json(detail())])
    expect((await httpPatientsService.get(PATIENT_ID)).bloodGroup).toBe("O+")
    expect(calls[0]).toMatchObject({ method: "GET", url: `/api/v1/patients/${PATIENT_ID}` })
  })
  it("create: exactly ONE POST /api/v1/patients; an inactive status is NOT turned into an archive call (archive is its own action)", async () => {
    stub([json(detail(), 201)])
    await httpPatientsService.create(input())
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual(["POST /api/v1/patients"])
    stub([json(detail(), 201)])
    const saved = await httpPatientsService.create(input({ status: "inactive" }))
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual(["POST /api/v1/patients"])
    expect(saved.status).toBe("active")
  })
  it("update: ONE PATCH with only the changed fields and the version; no read first, nothing else", async () => {
    stub([json(detail({ name: "Ayesha K" }))])
    const base = parsePatient(detail())
    await httpPatientsService.update(PATIENT_ID, inputOf(base, { name: "Ayesha K" }), base)
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([`PATCH /api/v1/patients/${PATIENT_ID}`])
    expect(calls[0].body).toEqual({ name: "Ayesha K", expectedUpdatedAt: NOW })
  })
  it("update: nothing changed sends NO request; an edit without the loaded record is refused", async () => {
    stub([json(detail())])
    const base = parsePatient(detail())
    expect(await httpPatientsService.update(PATIENT_ID, inputOf(base), base)).toBe(base)
    expect(calls).toHaveLength(0)
    await expect(httpPatientsService.update(PATIENT_ID, inputOf(base))).rejects.toBeInstanceOf(TypeError)
    expect(calls).toHaveLength(0)
  })
  it("update never archives or restores as a side effect (those are separate actions with their own permission)", async () => {
    stub([json(detail({ name: "Ayesha K" }))])
    const base = parsePatient(detail())
    await httpPatientsService.update(PATIENT_ID, inputOf(base, { name: "Ayesha K", status: "inactive" }), base)
    expect(calls.map((c) => c.url)).toEqual([`/api/v1/patients/${PATIENT_ID}`])
  })
  it("remove: archive (POST /patients/{id}/archive), not a delete", async () => {
    stub([json(detail({ archived: true }))])
    await httpPatientsService.remove(PATIENT_ID)
    expect(calls).toEqual([{ method: "POST", url: `/api/v1/patients/${PATIENT_ID}/archive`, body: undefined }])
  })
  it("a backend error keeps its code and request id", async () => {
    stub([json({ statusCode: 409, code: "POSSIBLE_DUPLICATE", message: "Possible duplicate", details: { matches: [] }, requestId: "req-1", path: "/api/v1/patients", timestamp: NOW }, 409)])
    await expect(httpPatientsService.create(input())).rejects.toMatchObject({ status: 409, code: "POSSIBLE_DUPLICATE", requestId: "req-1" })
  })
})

describe("organisations (panels) and guardian relations", () => {
  const panel = { id: PANEL_ID, name: "State Life", type: "insurance", contactPerson: null, phone: "0511234567", commissionPct: "2.50", discountPct: "0.00", billingMode: "patient_pays", active: true, createdAt: NOW }
  it("maps panels (type, null contact, decimal-string commission)", () => {
    expect(parseOrganisationList(page([panel, { ...panel, id: PANEL2_ID, type: "government", commissionPct: null, active: false }], 2)).items).toEqual([
      { id: PANEL_ID, name: "State Life", type: "Insurance", contactPerson: "", phone: "0511234567", commissionPct: 2.5, discountPct: 0, billingMode: "patient_pays", active: true },
      { id: PANEL2_ID, name: "State Life", type: "Government", contactPerson: "", phone: "0511234567", commissionPct: 0, discountPct: 0, billingMode: "patient_pays", active: false },
    ])
    expect(() => parseOrganisationList(page([{ ...panel, commissionPct: 2.5 }]))).toThrow(/commissionPct/) // numbers are rejected: decimals travel as strings
    expect(() => parseOrganisationList(page([{ ...panel, type: "Insurance" }]))).toThrow(/type/)
  })
  it("maps guardian relations", () => {
    expect(parseGuardianRelationList(page([{ id: REL_ID, name: "Husband", remarks: null, active: true, createdAt: NOW }])).items).toEqual([{ id: REL_ID, name: "Husband", remarks: undefined, active: true }])
  })
  it("create bodies validate against CreatePanelDto / CreateGuardianRelationDto; inactive creation is refused, not faked", () => {
    const p = organisationPayload({ name: " State Life ", type: "Insurance", contactPerson: "", phone: "0511234567", commissionPct: 2.5, active: true })
    expect(validate(p, schemaOf("CreatePanelDto"))).toEqual([])
    expect(p).toEqual({ name: "State Life", type: "insurance", commissionPct: "2.5", phone: "0511234567" })
    expect(() => organisationPayload({ name: "x1", type: "Other", contactPerson: "", phone: "", commissionPct: 0, active: false })).toThrow(NotConnectedError)
    expect(() => organisationPayload({ name: "x1", type: "Other", contactPerson: "", phone: "", commissionPct: -1, active: true })).toThrow(RangeError)
    const g = guardianRelationPayload({ name: " Husband ", remarks: "", active: true })
    expect(validate(g, schemaOf("CreateGuardianRelationDto"))).toEqual([])
    expect(g).toEqual({ name: "Husband" })
    expect(() => guardianRelationPayload({ name: "Husband", active: false })).toThrow(NotConnectedError)
  })
  it("adapters send GET /panels and /guardian-relations (page, perPage) and POST to create", async () => {
    const seen: string[] = []
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      seen.push(`${init.method} ${url}`)
      if (init.method === "POST") return json(url.includes("panels") ? panel : { id: REL_ID, name: "Husband", remarks: null, active: true, createdAt: NOW }, 201)
      return json(url.includes("panels") ? page([panel]) : page([{ id: REL_ID, name: "Husband", remarks: null, active: true, createdAt: NOW }]))
    }))
    await httpOrganisationsService.list({ page: 1, pageSize: 100 })
    await httpOrganisationsService.create({ name: "State Life", type: "Insurance", contactPerson: "", phone: "", commissionPct: 0, active: true })
    await httpGuardianRelationsService.list({ page: 2, pageSize: 100 })
    await httpGuardianRelationsService.create({ name: "Husband", active: true })
    expect(seen).toEqual(["GET /api/v1/panels?page=1&perPage=100", "POST /api/v1/panels", "GET /api/v1/guardian-relations?page=2&perPage=100", "POST /api/v1/guardian-relations"])
  })
})

describe("GET /auth/me", () => {
  it("parses the permission list from AuthUserDto and is validated against the spec", async () => {
    const me = { id: PATIENT_ID, username: "reception1", email: null, name: "Sara", role: "receptionist", isPlatform: false, mustChangePassword: false, permissions: ["patients.read", "patients.write"], hospital: null, primaryLocationId: null }
    expect(validate(me, schemaOf("AuthUserDto_Output"), LENIENT)).toEqual([])
    expect(parseCurrentUser(me)).toEqual({ permissions: ["patients.read", "patients.write"] })
    vi.stubGlobal("fetch", vi.fn(async () => json(me)))
    setAccessToken("tok")
    expect(await authService.me()).toEqual({ permissions: ["patients.read", "patients.write"] })
  })
  it("rejects a response without a usable permission list, so permissions stay unknown (grant nothing)", () => {
    for (const raw of [{}, null, "x", { permissions: "patients.read" }, { permissions: [1] }]) expect(() => parseCurrentUser(raw)).toThrow(TypeError)
  })
})

describe("the endpoint table", () => {
  it("has exactly the connected keys switched on (Phase 5A + Clinic Settings)", () => {
    const on = Object.entries(ENDPOINTS).filter(([, e]) => e !== null).map(([k]) => k).sort()
    expect(on).toEqual(["account.panel", "account.patient", "accountsApi.bankBalances", "accountsApi.bankStatement", "accountsApi.bankTxCreate", "accountsApi.bankTxGet", "accountsApi.bankTxVoid", "accountsApi.drawerGet", "accountsApi.drawerSet", "accountsApi.expenseCreate", "accountsApi.expenseGet", "accountsApi.expenseUpdate", "accountsApi.expenseVoid", "accountsApi.expenses", "advances.record", "appointments.book", "appointments.cancel", "appointments.confirm", "appointments.get", "appointments.list", "appointments.noShow", "appointments.reschedule", "auth.me", "bankAccounts.create", "bankAccounts.deactivate", "bankAccounts.list", "bankAccounts.reactivate", "bankAccounts.update", "beds.maintenance", "beds.occupancy", "charges.list", "charges.void", "credit.apply", "creditNotes.record", "doctors.list", "ecgTests.create", "ecgTests.deactivate", "ecgTests.list", "ecgTests.reactivate", "ecgTests.update", "expenseCategories.create", "expenseCategories.list", "expenseCategories.reactivate", "expenseCategories.remove", "expenseCategories.update", "guardianRelations.create", "guardianRelations.deactivate", "guardianRelations.get", "guardianRelations.list", "guardianRelations.reactivate", "guardianRelations.update", "icd.list", "imagingApi.addTests", "imagingApi.amend", "imagingApi.archive", "imagingApi.cancelTest", "imagingApi.create", "imagingApi.deliver", "imagingApi.get", "imagingApi.list", "imagingApi.perform", "imagingApi.report", "imagingApi.restore", "imagingApi.sign", "imagingApi.writeReport", "invoices.addCharges", "invoices.create", "invoices.discount", "invoices.forEncounter", "invoices.get", "invoices.list", "invoices.void", "itemHistory.list", "labApi.addTests", "labApi.amend", "labApi.archive", "labApi.cancelTest", "labApi.collect", "labApi.create", "labApi.deliver", "labApi.enterResult", "labApi.get", "labApi.list", "labApi.reject", "labApi.remarks", "labApi.report", "labApi.restore", "labApi.testDefinition", "labApi.verify", "labTests.create", "labTests.deactivate", "labTests.list", "labTests.reactivate", "labTests.update", "organisations.create", "organisations.deactivate", "organisations.get", "organisations.list", "organisations.reactivate", "organisations.update", "patients.create", "patients.delete", "patients.duplicates", "patients.get", "patients.list", "patients.recordDeath", "patients.restore", "patients.revokeDeath", "patients.update", "paymentsRegister.get", "paymentsRegister.list", "paymentsRegister.record", "pharmacyApi.adjust", "pharmacyApi.create", "pharmacyApi.deactivate", "pharmacyApi.dispense", "pharmacyApi.dispenseGet", "pharmacyApi.dispenses", "pharmacyApi.get", "pharmacyApi.list", "pharmacyApi.movements", "pharmacyApi.prescription", "pharmacyApi.reactivate", "pharmacyApi.receive", "pharmacyApi.return", "pharmacyApi.slip", "pharmacyApi.update", "pharmacyApi.writeOff", "refunds.record", "reportsApi.cashFlow", "reportsApi.collections", "reportsApi.dailySummary", "reportsApi.dashboard", "reportsApi.demographics", "reportsApi.expenses", "reportsApi.financialSummary", "reportsApi.lab", "reportsApi.opd", "reportsApi.outstanding", "reportsApi.outstandingPatients", "reportsApi.pharmacy", "reportsApi.prescriptions", "reportsApi.revenue", "reportsApi.revenueDaily", "schedule.get", "schedule.set", "serviceCatalog.create", "serviceCatalog.deactivate", "serviceCatalog.list", "serviceCatalog.reactivate", "serviceCatalog.update", "settings.moduleDisable", "settings.moduleEnable", "settings.update", "slots.list", "usersAdmin.create", "usersAdmin.deactivate", "usersAdmin.doctorProfile", "usersAdmin.list", "usersAdmin.reactivate", "usersAdmin.resetPassword", "usersAdmin.signOutEverywhere", "usersAdmin.update", "visits.addNote", "visits.admit", "visits.archive", "visits.cancel", "visits.checkInOpd", "visits.close", "visits.correctCheckIn", "visits.discharge", "visits.forPatient", "visits.get", "visits.list", "visits.notes", "visits.recordVitals", "visits.reopen", "visits.restore", "visits.saveClinicalRecord", "visits.transfer", "visits.vitals", "wardsAdmin.bedAdd", "wardsAdmin.bedDeactivate", "wardsAdmin.bedReactivate", "wardsAdmin.bedUpdate", "wardsAdmin.create", "wardsAdmin.deactivate", "wardsAdmin.get", "wardsAdmin.list", "wardsAdmin.reactivate", "wardsAdmin.update"])
  })
  it("every switched-on route exists in docs/openapi.json with the same method", () => {
    for (const [key, e] of Object.entries(ENDPOINTS)) {
      if (!e || (HANDOFF_ONLY_ROUTE_KEYS as readonly string[]).includes(key)) continue // routes only, named by the handoff but not in the spec (see endpoints.ts)
      const specPath = "/api/v1" + e.path.replace(/:([A-Za-z]+)/g, "{$1}")
      // a route openapi.json lacks may be defined by the PROPOSED contract (docs/openapi.draft.json)
      const known = (() => { try { operation(e.method, specPath); return true } catch { return false } })() || (() => { try { return !!spec("draft").paths[specPath]?.[e.method.toLowerCase()] } catch { return false } })()
      expect(known, `${key} -> ${e.method} ${specPath}`).toBe(true)
    }
  })
})
