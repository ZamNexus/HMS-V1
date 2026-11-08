import { afterEach, describe, expect, it, vi } from "vitest"
import { ApiError, setAccessToken } from "@/lib/api/client"
import { ENDPOINTS } from "./endpoints"
import { NotConnectedError } from "./errors"
import { classifyCreateError } from "./createOutcome"
import { hospitalInstant, hospitalWallClock } from "./hospitalTime"
import {
  checkInPayload, admitPayload, clinicalRecordPayload, correctionPayload, dischargePayload, httpBedBoardService, httpVisitsService, notePayload, parseBedBoard, parseNoteList, parseVisitDetail, parseVisitList,
  parseVitalsReading, patientVisitsQuery, reasonPayload, transferPayload, visitListQuery, vitalsPayload,
} from "./http/visits"
import { mockBedBoardService, mockVisitsService } from "./mock/visits"
import { operation, schemaOf, validate } from "./http/specValidate"
import { resetSpecMismatchWarnings } from "./http/wire"

// Phase 7 service layer (handoff 8.5): the API-shaped encounter model, its parts and the bed board. Fixtures and request bodies are validated AGAINST
// docs/openapi.json first. Nothing here contacts a backend.

afterEach(() => { vi.unstubAllGlobals(); setAccessToken(null); resetSpecMismatchWarnings() })

const E = "01HZXAAAAAAAAAAAAAAAAAAAAA"
const PAT = "01HZXBBBBBBBBBBBBBBBBBBBBB"
const DOC = "01HZXCCCCCCCCCCCCCCCCCCCCC"
const BED = "01HZXDDDDDDDDDDDDDDDDDDDDD"
const WARD = "01HZXEEEEEEEEEEEEEEEEEEEEE"
const USER = "01HZXFFFFFFFFFFFFFFFFFFFFF"
const ICD = "01HZXGGGGGGGGGGGGGGGGGGGGG"
const LINE = "01HZXHHHHHHHHHHHHHHHHHHHHH"
const NOW = "2026-11-07T10:00:00.000Z"
const LENIENT = { lenientStringArrays: true } as const

const patient = { id: PAT, mrNo: "MR-2026-0042", name: "Ayesha Khan", gender: "female", dob: "1990-05-17", dobEstimated: false, deceasedOn: null }
const summary = (over: Record<string, unknown> = {}) => ({
  id: E, encId: "OPD-2026-0012", type: "opd", status: "open", startedAt: NOW, date: "2026-11-07", tokenNo: 7, priority: "normal", patient, doctor: { id: DOC, name: "Dr Imran" },
  appointment: null, bed: null, primaryDiagnosis: null, pending: false, archived: false, ...over,
})
const vitals = (over: Record<string, unknown> = {}) => ({ id: LINE, recordedAt: NOW, recordedBy: { id: USER, name: "Nurse Sana" }, bpSystolic: 120, bpDiastolic: 80, pulse: 72, temperatureF: 98.6, weightKg: 70, heightCm: 170, spo2: 98, rbs: null, bmi: 24.2, ...over })
const diag = (over: Record<string, unknown> = {}) => ({ id: LINE, icdCode: { id: ICD, code: "J06.9" }, text: "Acute upper respiratory infection", isPrimary: true, ...over })
const clinical = (over: Record<string, unknown> = {}) => ({
  chiefComplaint: "Fever", historyOfIllness: null, examinationFindings: null, clinicalNotes: null, generalInstructions: null, followUpDate: null, diagnoses: [diag()],
  prescription: [{ id: LINE, medicineId: null, medicineText: "Paracetamol 500 mg", dose: "1 tab", route: null, frequency: "TDS", duration: "3 days", quantity: 9, instructions: null }],
  latestVitals: vitals(), recordComplete: true, discharge: null, ...over,
})
const detail = (over: Record<string, unknown> = {}) => ({
  ...summary(), admissionType: null, advisedBy: null, referredBy: null, reason: "Fever for 2 days", closedAt: null, dischargedAt: null, cancelledAt: null, cancelReason: null, archivedAt: null,
  bedHistory: [], clinical: clinical(), createdAt: NOW, updatedAt: NOW, ...over,
})
const page = (data: unknown[], total = data.length) => ({ data, meta: { page: 1, perPage: 10, total, totalPages: 1 } })
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
const errorBody = (statusCode: number, code: string, message: string, details?: unknown) => ({ statusCode, code, message, requestId: "req-1", path: "/api/v1/encounters", timestamp: NOW, details })
function stub(responses: Array<Response>) {
  const calls: { method: string; url: string; body: unknown }[] = []
  let i = 0
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ method: init.method as string, url, body: init.body ? JSON.parse(init.body as string) : undefined })
    return responses[Math.min(i++, responses.length - 1)].clone()
  }))
  return calls
}

describe("fixtures are what the specification says", () => {
  it("a list page, a detail (with and without the clinical record), vitals, notes and the bed board validate against their schemas", () => {
    expect(validate(page([summary(), summary({ type: "ipd", bed: { id: BED, bedNo: "A-01", wardName: "General" }, appointment: { id: PAT, appointmentNo: "APT-2026-0001" } })]), schemaOf("EncounterPageDto_Output"), LENIENT)).toEqual([])
    expect(validate(detail(), schemaOf("EncounterDetailDto_Output"), LENIENT)).toEqual([])
    expect(validate(detail({ clinical: null }), schemaOf("EncounterDetailDto_Output"), LENIENT)).toEqual([])
    expect(validate(page([vitals()]), schemaOf("VitalsPageDto_Output"), LENIENT)).toEqual([])
    expect(validate(page([{ id: LINE, note: "Ward round: stable.", writtenAt: NOW, author: { id: USER, name: "Dr Imran" } }]), schemaOf("ProgressNotePageDto_Output"))).toEqual([])
    expect(validate({ wards: [{ id: WARD, name: "General", type: "general", dailyRate: "1500.00", beds: [{ id: BED, bedNo: "A-01", state: "available", occupant: null }] }] }, schemaOf("OccupancyDto_Output"))).toEqual([])
  })
})

describe("reading visits", () => {
  it("a list row: the day, token, priority, patient, doctor, appointment, bed, pending and archived flags", () => {
    const res = parseVisitList(page([summary({ pending: true, primaryDiagnosis: "Flu", appointment: { id: PAT, appointmentNo: "APT-2026-0001" } }), summary({ type: "ipd", tokenNo: null, bed: { id: BED, bedNo: "A-01", wardName: "General" } })], 31))
    expect(res.total).toBe(31)
    expect(res.items[0]).toMatchObject({ id: E, encId: "OPD-2026-0012", type: "opd", status: "open", date: "2026-11-07", tokenNo: 7, priority: "normal", pending: true, primaryDiagnosis: "Flu", appointment: { appointmentNo: "APT-2026-0001" } })
    expect(res.items[0].patient).toEqual({ id: PAT, mrNo: "MR-2026-0042", name: "Ayesha Khan", gender: "Female", dob: "1990-05-17", dobEstimated: false, deceasedOn: null })
    expect(res.items[1]).toMatchObject({ type: "ipd", tokenNo: null, bed: { bedNo: "A-01", wardName: "General" } })
  })
  it("a detail with the doctor's record: diagnoses with their ICD code, prescription lines with their ids, the latest vitals, completeness", () => {
    const d = parseVisitDetail(detail())
    expect(d.updatedAt).toBe(NOW)
    expect(d.clinical).toMatchObject({ chiefComplaint: "Fever", recordComplete: true, followUpDate: null })
    expect(d.clinical!.diagnoses[0]).toEqual({ id: LINE, icdCode: { id: ICD, code: "J06.9" }, text: "Acute upper respiratory infection", isPrimary: true })
    expect(d.clinical!.prescription[0]).toMatchObject({ id: LINE, medicineId: null, medicineText: "Paracetamol 500 mg", quantity: 9, route: null })
    expect(d.clinical!.latestVitals).toMatchObject({ bpSystolic: 120, bmi: 24.2, recordedBy: { name: "Nurse Sana" } })
  })
  it("the front desk gets clinical: null and the screen must not invent a record", () => {
    expect(parseVisitDetail(detail({ clinical: null })).clinical).toBeNull()
  })
  it("an admission: bed history, the admission type, a discharge block", () => {
    const d = parseVisitDetail(detail({
      type: "ipd", status: "discharged", admissionType: "emergency", dischargedAt: NOW, bed: null,
      bedHistory: [{ bedId: BED, bedNo: "A-01", wardId: WARD, wardName: "General", assignedAt: NOW, releasedAt: NOW }],
      clinical: clinical({ discharge: { summary: "Recovered well", condition: "recovered", followUpInstructions: null, diagnoses: [diag()] } }),
    }))
    expect(d).toMatchObject({ type: "ipd", status: "discharged", admissionType: "emergency", bed: null })
    expect(d.bedHistory[0]).toMatchObject({ bedNo: "A-01", wardName: "General", releasedAt: NOW })
    expect(d.clinical!.discharge).toMatchObject({ condition: "recovered", summary: "Recovered well" })
  })
  it("the spec types some single texts as arrays in the detail answer: a string, null or a one-element array is accepted (and warned about once)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const d = parseVisitDetail(detail({ reason: ["Fever"], advisedBy: [], referredBy: null, primaryDiagnosis: ["Flu"], admissionType: "" }))
    expect(d).toMatchObject({ reason: "Fever", advisedBy: null, referredBy: null, primaryDiagnosis: "Flu", admissionType: null })
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
  it("rejects malformed data loudly instead of rendering blanks", () => {
    expect(() => parseVisitDetail(detail({ id: "7" }))).toThrow(/id/)
    expect(() => parseVisitDetail(detail({ type: "emergency" }))).toThrow(/type/)
    expect(() => parseVisitDetail(detail({ status: "done" }))).toThrow(/status/)
    expect(() => parseVisitDetail(detail({ date: "07/11/2026" }))).toThrow(/date/)
    expect(() => parseVisitDetail(detail({ startedAt: "soon" }))).toThrow(/startedAt/)
    expect(() => parseVisitDetail(detail({ tokenNo: 1.5 }))).toThrow(/tokenNo/)
    expect(() => parseVisitDetail(detail({ bedHistory: "none" }))).toThrow(/bedHistory/)
    expect(() => parseVisitDetail(detail({ admissionType: "walk-in" }))).toThrow(/admissionType/)
    expect(() => parseVisitDetail(detail({ clinical: clinical({ diagnoses: "x" }) }))).toThrow(/diagnoses/)
    expect(() => parseVisitDetail(detail({ clinical: clinical({ recordComplete: "yes" }) }))).toThrow(/recordComplete/)
    expect(() => parseVisitList(page([summary({ patient: null })]))).toThrow(/patient/)
  })
  it("vitals: whole numbers stay whole, decimals stay exact, null stays null; the POST answer's array typing is tolerated", () => {
    expect(parseVitalsReading(vitals(), "vitals")).toMatchObject({ bpSystolic: 120, temperatureF: 98.6, rbs: null, bmi: 24.2 })
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    expect(parseVitalsReading(vitals({ temperatureF: [98.6], weightKg: [70], heightCm: [], bmi: [24.2] }), "vitals", "VitalsResponseDto_Output")).toMatchObject({ temperatureF: 98.6, weightKg: 70, heightCm: null, bmi: 24.2 })
    warn.mockRestore()
    expect(() => parseVitalsReading(vitals({ pulse: 72.5 }), "vitals")).toThrow(/pulse/)
    expect(() => parseVitalsReading(vitals({ temperatureF: "98.6" }), "vitals")).toThrow(/temperatureF/)
  })
  it("notes and the bed board", () => {
    expect(parseNoteList(page([{ id: LINE, note: "Stable.", writtenAt: NOW, author: { id: USER, name: "Dr Imran" } }], 1)).items[0]).toMatchObject({ note: "Stable.", author: { name: "Dr Imran" } })
    const board = parseBedBoard({ wards: [{ id: WARD, name: "General", type: "general", dailyRate: "1500.00", beds: [
      { id: BED, bedNo: "A-01", state: "occupied", occupant: { encounterId: E, encId: "IPD-2026-0003", since: NOW, patient: { id: PAT, mrNo: "MR-2026-0042", name: "Ayesha Khan" } } },
      { id: LINE, bedNo: "A-02", state: "available", occupant: null }, { id: USER, bedNo: "A-03", state: "maintenance", occupant: null },
    ] }] })
    expect(board[0].beds.map((b) => b.state)).toEqual(["occupied", "available", "maintenance"])
    expect(board[0].beds[0].occupant).toMatchObject({ encId: "IPD-2026-0003", patient: { name: "Ayesha Khan" } })
    // a bed that says occupied without a patient (or the reverse) is a contract break, not something to render
    expect(() => parseBedBoard({ wards: [{ id: WARD, name: "G", type: "general", dailyRate: "1.00", beds: [{ id: BED, bedNo: "A-01", state: "occupied", occupant: null }] }] })).toThrow(/occupant/)
    expect(() => parseBedBoard({ wards: [{ id: WARD, name: "G", type: "general", dailyRate: "1.00", beds: [{ id: BED, bedNo: "A-01", state: "available", occupant: { encounterId: E, encId: "x", since: NOW, patient: { id: PAT, mrNo: "m", name: "n" } } }] }] })).toThrow(/occupant/)
  })
})

describe("list requests", () => {
  it("send only documented parameters; false booleans are kept; the doctor's queue sorts by token", () => {
    const documented = new Set(operation("get", "/api/v1/encounters").parameters!.map((p) => p.name))
    const q = visitListQuery({ page: 2, pageSize: 10, search: " ayesha ", type: "opd", status: "open", doctorId: DOC, dateFrom: "2026-11-07", dateTo: "2026-11-07", admitted: false, pending: true, includeArchived: true, patientId: PAT, sort: "tokenNo:asc" })
    for (const k of Object.keys(q)) expect(documented.has(k), `${k} is not a documented query parameter`).toBe(true)
    expect(q).toMatchObject({ page: 2, perPage: 10, search: "ayesha", type: "opd", status: "open", doctorId: DOC, admitted: false, pending: true, includeArchived: true, sort: "tokenNo:asc" })
    expect(visitListQuery({})).not.toHaveProperty("includeArchived", true)
    const patientDocumented = new Set(operation("get", "/api/v1/patients/{id}/encounters").parameters!.map((p) => p.name))
    for (const k of Object.keys(patientVisitsQuery({ page: 1, pageSize: 10, type: "ipd", status: "closed", includeArchived: true }))) expect(patientDocumented.has(k), k).toBe(true)
  })
  it("refuses what the contract cannot take before any request", () => {
    expect(() => visitListQuery({ pageSize: 101 })).toThrow(RangeError)
    expect(() => visitListQuery({ search: "x".repeat(101) })).toThrow(RangeError)
    expect(() => visitListQuery({ doctorId: "3" })).toThrow(TypeError)
    expect(() => visitListQuery({ dateFrom: "07-11" })).toThrow(TypeError)
    expect(() => visitListQuery({ status: "done" as never })).toThrow(TypeError)
    expect(() => visitListQuery({ type: "er" as never })).toThrow(TypeError)
    expect(() => visitListQuery({ sort: "tokenNo; drop" })).toThrow(TypeError)
  })
  it("booleans reach the wire as true / false text, including false", async () => {
    const calls = stub([json(page([]))])
    await httpVisitsService.list({ admitted: false, pending: true, page: 1, pageSize: 10 })
    expect(calls[0].url).toBe("/api/v1/encounters?page=1&perPage=10&admitted=false&pending=true")
  })
})

describe("request bodies validate against the contract", () => {
  it("OPD check-in: ids, priority, free text, an optional appointment; empty text is left out; nothing else", () => {
    const body = checkInPayload({ patientId: PAT, doctorId: DOC, priority: "urgent", advisedBy: " Dr Ali ", referredBy: "", reason: "Fever", appointmentId: E, startedAt: "2026-11-06T04:30:00.000Z" })
    expect(body).toEqual({ patientId: PAT, doctorId: DOC, priority: "urgent", advisedBy: "Dr Ali", reason: "Fever", appointmentId: E, startedAt: "2026-11-06T04:30:00.000Z" })
    expect(validate(body, schemaOf("CheckInDto"))).toEqual([])
    expect(checkInPayload({ patientId: PAT, doctorId: DOC })).toEqual({ patientId: PAT, doctorId: DOC })
    expect(() => checkInPayload({ patientId: "1", doctorId: DOC })).toThrow(TypeError)
    expect(() => checkInPayload({ patientId: PAT, doctorId: DOC, priority: "high" as never })).toThrow(TypeError)
    expect(() => checkInPayload({ patientId: PAT, doctorId: DOC, reason: "x".repeat(501) })).toThrow(RangeError)
    expect(() => checkInPayload({ patientId: PAT, doctorId: DOC, startedAt: "yesterday" })).toThrow(TypeError)
    expect(() => checkInPayload({ patientId: PAT, doctorId: DOC, appointmentId: "no" })).toThrow(TypeError)
  })
  it("admission: a bed from the board and an admission type; never an appointment", () => {
    const body = admitPayload({ patientId: PAT, doctorId: DOC, bedId: BED, admissionType: "emergency", reason: "Chest pain" })
    expect(body).toEqual({ patientId: PAT, doctorId: DOC, bedId: BED, admissionType: "emergency", reason: "Chest pain" })
    expect(validate(body, schemaOf("AdmitDto"))).toEqual([])
    expect(() => admitPayload({ patientId: PAT, doctorId: DOC, bedId: BED, admissionType: "walk-in" as never })).toThrow(TypeError)
    expect(() => admitPayload({ patientId: PAT, doctorId: DOC, bedId: "A-01", admissionType: "planned" })).toThrow(TypeError)
  })
  it("check-in correction: only what changes, null clears, the loaded version is always sent", () => {
    const body = correctionPayload({ priority: "urgent", advisedBy: null, reason: " new reason " }, NOW)
    expect(body).toEqual({ priority: "urgent", advisedBy: null, reason: "new reason", expectedUpdatedAt: NOW })
    expect(validate(body, schemaOf("UpdateCheckInDto"))).toEqual([])
    expect(() => correctionPayload({}, NOW)).toThrow(/Nothing to change/)
    expect(() => correctionPayload({ priority: "urgent" }, "old")).toThrow(TypeError)
  })
  it("vitals: at least one measurement, each inside the contract's range, the top pressure above the bottom one", () => {
    const body = vitalsPayload({ bpSystolic: 120, bpDiastolic: 80, pulse: 72, temperatureF: 98.6, weightKg: 70.5, heightCm: 170, spo2: 98, rbs: 110, recordedAt: NOW })
    expect(validate(body, schemaOf("VitalsReadingDto"))).toEqual([])
    expect(vitalsPayload({ pulse: 60 })).toEqual({ pulse: 60 })
    expect(() => vitalsPayload({})).toThrow(/at least one/i)
    expect(() => vitalsPayload({ pulse: 19 })).toThrow(RangeError)
    expect(() => vitalsPayload({ pulse: 72.5 })).toThrow(RangeError) // whole numbers only
    expect(() => vitalsPayload({ temperatureF: 120 })).toThrow(RangeError)
    expect(() => vitalsPayload({ spo2: 101 })).toThrow(RangeError)
    expect(() => vitalsPayload({ weightKg: 0.2 })).toThrow(RangeError)
    expect(() => vitalsPayload({ bpSystolic: 80, bpDiastolic: 90 })).toThrow(/higher/)
    expect(() => vitalsPayload({ pulse: Number.NaN })).toThrow(RangeError)
  })
  it("clinical record: saved whole; cleared text is null; every line keeps its id; exactly one primary diagnosis", () => {
    const body = clinicalRecordPayload({
      chiefComplaint: " Fever ", historyOfIllness: "", examinationFindings: null, clinicalNotes: undefined, generalInstructions: "Rest", followUpDate: "2026-11-14",
      diagnoses: [{ icdCodeId: ICD, isPrimary: true }, { text: "Dehydration", isPrimary: false }],
      prescription: [{ id: LINE, medicineText: "Paracetamol 500 mg", dose: "1 tab", frequency: "TDS", quantity: 9 }, { medicineText: "ORS", instructions: " after each loose stool " }],
    }, NOW)
    expect(body).toEqual({
      chiefComplaint: "Fever", historyOfIllness: null, examinationFindings: null, clinicalNotes: null, generalInstructions: "Rest", followUpDate: "2026-11-14",
      diagnoses: [{ icdCodeId: ICD, isPrimary: true }, { text: "Dehydration", isPrimary: false }],
      prescription: [{ id: LINE, medicineText: "Paracetamol 500 mg", dose: "1 tab", frequency: "TDS", quantity: 9 }, { medicineText: "ORS", instructions: "after each loose stool" }],
      expectedUpdatedAt: NOW,
    })
    expect(validate(body, schemaOf("ClinicalRecordDto"))).toEqual([])
    expect(validate(clinicalRecordPayload({ diagnoses: [], prescription: [] }, NOW), schemaOf("ClinicalRecordDto"))).toEqual([]) // an empty record is allowed
    expect(() => clinicalRecordPayload({ diagnoses: [{ text: "A", isPrimary: false }, { text: "B", isPrimary: false }], prescription: [] }, NOW)).toThrow(/exactly one/)
    expect(() => clinicalRecordPayload({ diagnoses: [{ text: "A", isPrimary: true }, { text: "B", isPrimary: true }], prescription: [] }, NOW)).toThrow(/exactly one/)
    expect(() => clinicalRecordPayload({ diagnoses: [{ isPrimary: true }], prescription: [] }, NOW)).toThrow(/code or some text/)
    expect(() => clinicalRecordPayload({ diagnoses: [], prescription: [{ dose: "1 tab" }] }, NOW)).toThrow(/name the medicine/)
    expect(() => clinicalRecordPayload({ diagnoses: [], prescription: [{ medicineText: "X", quantity: 0 }] }, NOW)).toThrow(RangeError)
    expect(() => clinicalRecordPayload({ diagnoses: [], prescription: [{ medicineText: "X", quantity: 1.5 }] }, NOW)).toThrow(RangeError)
    expect(() => clinicalRecordPayload({ chiefComplaint: "x".repeat(1001), diagnoses: [], prescription: [] }, NOW)).toThrow(RangeError)
    expect(() => clinicalRecordPayload({ diagnoses: [], prescription: [{ id: "bad", medicineText: "X" }] }, NOW)).toThrow(TypeError)
    expect(() => clinicalRecordPayload({ diagnoses: [], prescription: Array.from({ length: 51 }, () => ({ medicineText: "X" })) }, NOW)).toThrow(RangeError)
    expect(() => clinicalRecordPayload({ followUpDate: "next week", diagnoses: [], prescription: [] }, NOW)).toThrow(TypeError)
    expect(() => clinicalRecordPayload({ diagnoses: [], prescription: [] }, "old")).toThrow(TypeError)
  })
  it("discharge: at least one diagnosis with exactly one primary, a condition from the list; 'expired' is a valid condition", () => {
    const body = dischargePayload({ diagnoses: [{ icdCodeId: ICD, isPrimary: true }], conditionOnDischarge: "recovered", dischargeSummary: " Recovered well ", followUpDate: "2026-11-20", followUpInstructions: "Review in a week", dischargedAt: NOW })
    expect(body).toEqual({ diagnoses: [{ icdCodeId: ICD, isPrimary: true }], conditionOnDischarge: "recovered", dischargeSummary: "Recovered well", followUpDate: "2026-11-20", followUpInstructions: "Review in a week", dischargedAt: NOW })
    expect(validate(body, schemaOf("DischargeDto"))).toEqual([])
    expect(validate(dischargePayload({ diagnoses: [{ text: "Sepsis", isPrimary: true }], conditionOnDischarge: "expired" }), schemaOf("DischargeDto"))).toEqual([])
    expect(() => dischargePayload({ diagnoses: [], conditionOnDischarge: "stable" })).toThrow(/at least 1/)
    expect(() => dischargePayload({ diagnoses: [{ text: "A", isPrimary: false }], conditionOnDischarge: "stable" })).toThrow(/exactly one/)
    expect(() => dischargePayload({ diagnoses: [{ text: "A", isPrimary: true }], conditionOnDischarge: "fine" as never })).toThrow(TypeError)
    expect(() => dischargePayload({ diagnoses: [{ text: "A", isPrimary: true }], conditionOnDischarge: "stable", dischargeSummary: "x".repeat(20001) })).toThrow(RangeError)
  })
  it("cancel / reopen reason, progress note, transfer and bed maintenance bodies", () => {
    expect(reasonPayload("  Patient left  ")).toEqual({ reason: "Patient left" })
    expect(validate(reasonPayload("Patient left"), schemaOf("ReasonDto"))).toEqual([])
    expect(() => reasonPayload("no")).toThrow(RangeError)
    expect(() => reasonPayload("x".repeat(301))).toThrow(RangeError)
    expect(notePayload("  Stable overnight.  ")).toEqual({ note: "Stable overnight." })
    expect(validate(notePayload("Stable overnight."), schemaOf("ProgressNoteDto"))).toEqual([])
    expect(() => notePayload("   ")).toThrow(RangeError)
    expect(() => notePayload("x".repeat(10001))).toThrow(RangeError)
    expect(validate(transferPayload(BED), schemaOf("TransferDto"))).toEqual([])
    expect(() => transferPayload("A-02")).toThrow(TypeError)
    expect(validate({ underMaintenance: true }, schemaOf("BedMaintenanceDto"))).toEqual([])
  })
})

describe("HTTP adapters: exact requests", () => {
  it("check-in: ONE POST /encounters/opd; 422 PATIENT_ADMITTED / DOCTOR_UNAVAILABLE / PATIENT_DECEASED keep their codes and are not re-sent", async () => {
    for (const [status, code] of [[422, "PATIENT_ADMITTED"], [422, "DOCTOR_UNAVAILABLE"], [422, "PATIENT_DECEASED"], [422, "PATIENT_ARCHIVED"], [409, "APPOINTMENT_CHANGED"], [422, "APPOINTMENT_NOT_TODAY"]] as const) {
      const calls = stub([json(errorBody(status, code, "refused"), status)])
      await expect(httpVisitsService.checkInOpd({ patientId: PAT, doctorId: DOC })).rejects.toMatchObject({ status, code })
      expect(calls).toHaveLength(1)
      expect(calls[0]).toMatchObject({ method: "POST", url: "/api/v1/encounters/opd" })
    }
  })
  it("a check-in whose answer cannot be read is 'saved': the visit exists, so it is never sent again", async () => {
    const calls = stub([new Response("<html>ok</html>", { status: 201, headers: { "content-type": "text/html" } })])
    const err = await httpVisitsService.checkInOpd({ patientId: PAT, doctorId: DOC }).then(() => null, (e: unknown) => e)
    expect(classifyCreateError(err).kind).toBe("saved-unreadable")
    expect(calls).toHaveLength(1)
  })
  it("every part of the visit is its own call with the documented method and path", async () => {
    const calls = stub([
      json(detail(), 201), json(detail(), 201), json(detail()), json(page([vitals()])), json(vitals(), 201), json(detail()), json(detail()), json(page([{ id: LINE, note: "n", writtenAt: NOW, author: { id: USER, name: "D" } }])),
      json({ id: LINE, note: "n", writtenAt: NOW, author: { id: USER, name: "D" } }, 201), json(detail()), json(detail()), json(detail()), json(detail()), json(detail()), json(detail()),
    ])
    await httpVisitsService.checkInOpd({ patientId: PAT, doctorId: DOC })
    await httpVisitsService.admit({ patientId: PAT, doctorId: DOC, bedId: BED, admissionType: "planned" })
    await httpVisitsService.correctCheckIn(E, { priority: "urgent" }, NOW)
    await httpVisitsService.vitals(E)
    await httpVisitsService.recordVitals(E, { pulse: 70 })
    await httpVisitsService.saveClinicalRecord(E, { diagnoses: [], prescription: [] }, NOW)
    await httpVisitsService.close(E)
    await httpVisitsService.notes(E)
    await httpVisitsService.addNote(E, "Stable")
    await httpVisitsService.transfer(E, BED)
    await httpVisitsService.discharge(E, { diagnoses: [{ text: "A", isPrimary: true }], conditionOnDischarge: "stable" })
    await httpVisitsService.cancel(E, "Left early")
    await httpVisitsService.reopen(E, "Entered wrongly")
    await httpVisitsService.archive(E)
    await httpVisitsService.restore(E)
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      "POST /api/v1/encounters/opd", "POST /api/v1/encounters/ipd", `PATCH /api/v1/encounters/${E}/check-in`, `GET /api/v1/encounters/${E}/vitals?page=1&perPage=100`, `POST /api/v1/encounters/${E}/vitals`,
      `PUT /api/v1/encounters/${E}/clinical-record`, `POST /api/v1/encounters/${E}/close`, `GET /api/v1/encounters/${E}/progress-notes?page=1&perPage=100`, `POST /api/v1/encounters/${E}/progress-notes`,
      `POST /api/v1/encounters/${E}/transfer`, `POST /api/v1/encounters/${E}/discharge`, `POST /api/v1/encounters/${E}/cancel`, `POST /api/v1/encounters/${E}/reopen`,
      `POST /api/v1/encounters/${E}/archive`, `POST /api/v1/encounters/${E}/restore`,
    ])
    expect(calls[2].body).toEqual({ priority: "urgent", expectedUpdatedAt: NOW })
    expect(calls[6].body).toBeUndefined() // close has no body
    expect(calls[9].body).toEqual({ bedId: BED })
  })
  it("reading: GET /encounters/{id} and a patient's visits", async () => {
    const calls = stub([json(detail()), json(page([summary()], 1))])
    expect((await httpVisitsService.get(E)).encId).toBe("OPD-2026-0012")
    expect((await httpVisitsService.forPatient(PAT, { page: 1, pageSize: 10, includeArchived: true })).total).toBe(1)
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([`GET /api/v1/encounters/${E}`, `GET /api/v1/patients/${PAT}/encounters?page=1&perPage=10&includeArchived=true`])
  })
  it("a concurrent change is surfaced with its code and the save is sent once (ENCOUNTER_CHANGED, CLINICAL_RECORD_INCOMPLETE with details.missing)", async () => {
    const calls = stub([json(errorBody(409, "ENCOUNTER_CHANGED", "Someone saved first."), 409)])
    await expect(httpVisitsService.saveClinicalRecord(E, { diagnoses: [], prescription: [] }, NOW)).rejects.toMatchObject({ status: 409, code: "ENCOUNTER_CHANGED" })
    expect(calls).toHaveLength(1)
    stub([json(errorBody(422, "CLINICAL_RECORD_INCOMPLETE", "The record is incomplete.", { missing: ["chiefComplaint", "primaryDiagnosis"] }), 422)])
    const err = await httpVisitsService.close(E).then(() => null, (e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).body?.details).toEqual({ missing: ["chiefComplaint", "primaryDiagnosis"] })
  })
  it("the bed board: GET /wards/occupancy and POST /beds/{id}/maintenance { underMaintenance }", async () => {
    const calls = stub([json({ wards: [] }), json({ id: BED, bedNo: "A-01", state: "maintenance", active: true, wardId: WARD })])
    expect(await httpBedBoardService.occupancy()).toEqual([])
    await httpBedBoardService.setMaintenance(BED, true)
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual(["GET /api/v1/wards/occupancy", `POST /api/v1/beds/${BED}/maintenance`])
    expect(calls[1].body).toEqual({ underMaintenance: true })
  })
})

describe("hospital time", () => {
  it("a date and a time on the hospital's clock become an exact instant, whatever the browser's zone", () => {
    expect(hospitalInstant("2026-11-07", "09:30", "Asia/Karachi")).toBe("2026-11-07T04:30:00.000Z")
    expect(hospitalInstant("2026-11-07", "00:15", "Asia/Karachi")).toBe("2026-11-06T19:15:00.000Z")
    expect(hospitalInstant("2026-01-15", "12:00", "America/New_York")).toBe("2026-01-15T17:00:00.000Z") // winter
    expect(hospitalInstant("2026-07-15", "12:00", "America/New_York")).toBe("2026-07-15T16:00:00.000Z") // summer
    expect(hospitalInstant("2026-11-07", "25:00", "Asia/Karachi")).toBeNull()
    expect(hospitalInstant("07-11-2026", "09:30", "Asia/Karachi")).toBeNull()
    expect(hospitalInstant("2026-11-07", "09:30", "Not/AZone")).toBeNull()
  })
  it("and back to the wall clock", () => {
    expect(hospitalWallClock("2026-11-07T04:30:00.000Z", "Asia/Karachi")).toEqual({ date: "2026-11-07", time: "09:30" })
    expect(hospitalWallClock("2026-11-06T19:15:00.000Z", "Asia/Karachi")).toEqual({ date: "2026-11-07", time: "00:15" })
    expect(hospitalWallClock("garbage", "Asia/Karachi")).toBeNull()
  })
})

describe("wiring", () => {
  it("endpoint table: the handoff's routes", () => {
    expect(ENDPOINTS["visits.list"]).toEqual({ method: "GET", path: "/encounters" })
    expect(ENDPOINTS["visits.checkInOpd"]).toEqual({ method: "POST", path: "/encounters/opd" })
    expect(ENDPOINTS["visits.admit"]).toEqual({ method: "POST", path: "/encounters/ipd" })
    expect(ENDPOINTS["visits.correctCheckIn"]).toEqual({ method: "PATCH", path: "/encounters/:id/check-in" })
    expect(ENDPOINTS["visits.saveClinicalRecord"]).toEqual({ method: "PUT", path: "/encounters/:id/clinical-record" })
    expect(ENDPOINTS["visits.forPatient"]).toEqual({ method: "GET", path: "/patients/:id/encounters" })
    expect(ENDPOINTS["beds.occupancy"]).toEqual({ method: "GET", path: "/wards/occupancy" })
    expect(ENDPOINTS["beds.maintenance"]).toEqual({ method: "POST", path: "/beds/:id/maintenance" })
    // the prototype's single-record keys stay unset
    expect(ENDPOINTS["encounters.list"]).toBeNull()
    expect(ENDPOINTS["encounters.create"]).toBeNull()
  })
  it("the demo keeps its own encounter screens: the API-shaped services say so instead of inventing data", async () => {
    await expect(mockVisitsService.list()).rejects.toBeInstanceOf(NotConnectedError)
    await expect(mockVisitsService.checkInOpd({ patientId: PAT, doctorId: DOC })).rejects.toBeInstanceOf(NotConnectedError)
    await expect(mockBedBoardService.occupancy()).rejects.toBeInstanceOf(NotConnectedError)
  })
})
