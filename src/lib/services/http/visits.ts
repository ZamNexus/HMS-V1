import type { QueryParams } from "@/lib/api/client"
import type { Schemas } from "@/lib/api/contract"
import { isUlid } from "@/lib/api/convert"
import type {
  AdmitInput, BedBoardService, BoardBed, BoardWard, CheckInCorrection, CheckInInput, ClinicalDiagnosis, ClinicalRecord, ClinicalRecordInput, DiagnosisInput, DischargeCondition,
  DischargeInfo, ListResult, PatientVisitsOptions, PrescriptionLine, PrescriptionLineInput, ProgressNote, VisitDetail, VisitDischargeInput, VisitListOptions, VisitSummary, VisitsService,
  VitalsInput, VitalsReading,
} from "../types"
import { callEndpoint, createAndParse } from "./call"
import { asObj, optDate, optStr, pageQuery, parsePage, reqBool, reqDate, reqEnum, reqInt, reqStr, reqUlid, warnSpecMismatch, type Obj } from "./wire"

// Encounters ("visits"), their parts and the bed board (handoff 8.5; docs/openapi.json EncounterPageDto / EncounterDetailDto / VitalsResponseDto /
// ProgressNoteResponseDto / ClinicalRecordDto / DischargeDto / OccupancyDto). Ids are ULIDs, dates YYYY-MM-DD and instants ISO-8601; nothing is a JS Date here.

export const VISIT_TYPES = ["opd", "ipd"] as const
export const VISIT_STATUSES = ["open", "closed", "discharged", "cancelled"] as const
export const DISCHARGE_CONDITIONS: readonly DischargeCondition[] = ["recovered", "improved", "stable", "left_against_medical_advice", "expired"]
export const VISIT_LIMITS = {
  advisedBy: 120, referredBy: 120, reason: 500, search: 100, cancelReason: { min: 3, max: 300 }, note: { min: 1, max: 10000 },
  chiefComplaint: 1000, historyOfIllness: 5000, examinationFindings: 5000, clinicalNotes: 5000, generalInstructions: 2000,
  diagnoses: 20, diagnosisText: 300, prescription: 50, medicineText: 200, lineText: 60, instructions: 300, quantity: { min: 1, max: 10000 },
  dischargeSummary: 20000, followUpInstructions: 2000,
} as const
/** The ranges the contract states for one vitals reading. */
export const VITALS_RANGES = {
  bpSystolic: { min: 40, max: 300, int: true }, bpDiastolic: { min: 20, max: 200, int: true }, pulse: { min: 20, max: 300, int: true }, temperatureF: { min: 85, max: 115, int: false },
  weightKg: { min: 0.3, max: 400, int: false }, heightCm: { min: 20, max: 275, int: false }, spo2: { min: 30, max: 100, int: true }, rbs: { min: 10, max: 1500, int: true },
} as const
const SORT_RE = /^[A-Za-z]+:(asc|desc)$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// ── Reading ──

const instantOf = (o: Obj, key: string, what: string): string => {
  const v = reqStr(o, key, what)
  if (Number.isNaN(Date.parse(v))) throw new TypeError(`Unexpected response: ${what}.${key} is not a date-time.`)
  return v
}
const optInstantOf = (o: Obj, key: string, what: string): string | null => (o[key] === null || o[key] === undefined ? null : instantOf(o, key, what))
/** The spec types a few single numbers "array of number" (a spec bug, like the single-text fields): a number, null or a one-element array is accepted. */
function numberOrNull(o: Obj, key: string, what: string, dto: string, integer: boolean): number | null {
  let v = o[key]
  if (Array.isArray(v)) { warnSpecMismatch(dto, key); v = v[0] }
  if (v === null || v === undefined) return null
  if (typeof v !== "number" || !Number.isFinite(v) || (integer && !Number.isInteger(v))) throw new TypeError(`Unexpected response: ${what}.${key} is not a ${integer ? "whole " : ""}number or null.`)
  return v
}
const personRef = (raw: unknown, what: string): { id: string; name: string } => {
  const o = asObj(raw, what)
  return { id: reqUlid(o, "id", what), name: reqStr(o, "name", what) }
}

function patientRef(raw: unknown, what: string): VisitSummary["patient"] {
  const o = asObj(raw, what)
  return {
    id: reqUlid(o, "id", what), mrNo: reqStr(o, "mrNo", what), name: reqStr(o, "name", what),
    gender: ({ male: "Male", female: "Female", other: "Other" } as const)[reqEnum(o, "gender", what, ["male", "female", "other"])],
    dob: reqDate(o, "dob", what), dobEstimated: reqBool(o, "dobEstimated", what), deceasedOn: optDate(o, "deceasedOn", what) ?? null,
  }
}

function summaryCore(o: Obj, what: string, dto: string): VisitSummary {
  const appt = o.appointment === null || o.appointment === undefined ? null : asObj(o.appointment, `${what}.appointment`)
  const bed = o.bed === null || o.bed === undefined ? null : asObj(o.bed, `${what}.bed`)
  return {
    id: reqUlid(o, "id", what), encId: reqStr(o, "encId", what),
    type: reqEnum(o, "type", what, VISIT_TYPES), status: reqEnum(o, "status", what, VISIT_STATUSES),
    startedAt: instantOf(o, "startedAt", what), date: reqDate(o, "date", what),
    tokenNo: o.tokenNo === null || o.tokenNo === undefined ? null : reqInt(o, "tokenNo", what),
    priority: reqEnum(o, "priority", what, ["normal", "urgent"]),
    patient: patientRef(o.patient, `${what}.patient`), doctor: personRef(o.doctor, `${what}.doctor`),
    appointment: appt ? { id: reqUlid(appt, "id", `${what}.appointment`), appointmentNo: reqStr(appt, "appointmentNo", `${what}.appointment`) } : null,
    bed: bed ? { id: reqUlid(bed, "id", `${what}.bed`), bedNo: reqStr(bed, "bedNo", `${what}.bed`), wardName: reqStr(bed, "wardName", `${what}.bed`) } : null,
    primaryDiagnosis: optStr(o, "primaryDiagnosis", what, dto) ?? null,
    pending: reqBool(o, "pending", what), archived: reqBool(o, "archived", what),
  }
}

export function parseVisitSummary(raw: unknown, what = "encounter", dto = "EncounterPageDto_Output"): VisitSummary {
  return summaryCore(asObj(raw, what), what, dto)
}
export function parseVisitList(raw: unknown): ListResult<VisitSummary> {
  return parsePage(raw, "encounters", (item) => parseVisitSummary(item, "encounters[]"))
}

export function parseVitalsReading(raw: unknown, what = "vitals", dto = "VitalsPageDto_Output"): VitalsReading {
  const o = asObj(raw, what)
  return {
    id: reqUlid(o, "id", what), recordedAt: instantOf(o, "recordedAt", what), recordedBy: personRef(o.recordedBy, `${what}.recordedBy`),
    bpSystolic: numberOrNull(o, "bpSystolic", what, dto, true), bpDiastolic: numberOrNull(o, "bpDiastolic", what, dto, true), pulse: numberOrNull(o, "pulse", what, dto, true),
    temperatureF: numberOrNull(o, "temperatureF", what, dto, false), weightKg: numberOrNull(o, "weightKg", what, dto, false), heightCm: numberOrNull(o, "heightCm", what, dto, false),
    spo2: numberOrNull(o, "spo2", what, dto, true), rbs: numberOrNull(o, "rbs", what, dto, true), bmi: numberOrNull(o, "bmi", what, dto, false),
  }
}
export function parseVitalsList(raw: unknown): ListResult<VitalsReading> {
  return parsePage(raw, "vitals", (item) => parseVitalsReading(item, "vitals[]"))
}

function diagnosisOf(raw: unknown, what: string): ClinicalDiagnosis {
  const o = asObj(raw, what)
  const icd = o.icdCode === null || o.icdCode === undefined ? null : asObj(o.icdCode, `${what}.icdCode`)
  return { id: reqUlid(o, "id", what), icdCode: icd ? { id: reqUlid(icd, "id", `${what}.icdCode`), code: reqStr(icd, "code", `${what}.icdCode`) } : null, text: reqStr(o, "text", what), isPrimary: reqBool(o, "isPrimary", what) }
}
function prescriptionOf(raw: unknown, what: string, dto: string): PrescriptionLine {
  const o = asObj(raw, what)
  return {
    id: reqUlid(o, "id", what), medicineId: o.medicineId === null || o.medicineId === undefined ? null : reqUlid(o, "medicineId", what), medicineText: reqStr(o, "medicineText", what),
    dose: optStr(o, "dose", what, dto) ?? null, route: optStr(o, "route", what, dto) ?? null, frequency: optStr(o, "frequency", what, dto) ?? null, duration: optStr(o, "duration", what, dto) ?? null,
    quantity: o.quantity === null || o.quantity === undefined ? null : reqInt(o, "quantity", what), instructions: optStr(o, "instructions", what, dto) ?? null,
  }
}
function clinicalOf(raw: unknown, what: string, dto: string): ClinicalRecord {
  const o = asObj(raw, what)
  if (!Array.isArray(o.diagnoses) || !Array.isArray(o.prescription)) throw new TypeError(`Unexpected response: ${what}.diagnoses or ${what}.prescription is not an array.`)
  const d = o.discharge === null || o.discharge === undefined ? null : asObj(o.discharge, `${what}.discharge`)
  let discharge: DischargeInfo | null = null
  if (d) {
    if (!Array.isArray(d.diagnoses)) throw new TypeError(`Unexpected response: ${what}.discharge.diagnoses is not an array.`)
    discharge = { summary: optStr(d, "summary", `${what}.discharge`, dto) ?? null, condition: reqEnum(d, "condition", `${what}.discharge`, DISCHARGE_CONDITIONS), followUpInstructions: optStr(d, "followUpInstructions", `${what}.discharge`, dto) ?? null, diagnoses: d.diagnoses.map((x, i) => diagnosisOf(x, `${what}.discharge.diagnoses[${i}]`)) }
  }
  return {
    chiefComplaint: optStr(o, "chiefComplaint", what, dto) ?? null, historyOfIllness: optStr(o, "historyOfIllness", what, dto) ?? null, examinationFindings: optStr(o, "examinationFindings", what, dto) ?? null,
    clinicalNotes: optStr(o, "clinicalNotes", what, dto) ?? null, generalInstructions: optStr(o, "generalInstructions", what, dto) ?? null, followUpDate: optDate(o, "followUpDate", what) ?? null,
    diagnoses: o.diagnoses.map((x, i) => diagnosisOf(x, `${what}.diagnoses[${i}]`)), prescription: o.prescription.map((x, i) => prescriptionOf(x, `${what}.prescription[${i}]`, dto)),
    latestVitals: o.latestVitals === null || o.latestVitals === undefined ? null : parseVitalsReading(o.latestVitals, `${what}.latestVitals`, dto),
    recordComplete: reqBool(o, "recordComplete", what), discharge,
  }
}

export function parseVisitDetail(raw: unknown): VisitDetail {
  const what = "encounter"
  const dto = "EncounterDetailDto_Output"
  const o = asObj(raw, what)
  if (!Array.isArray(o.bedHistory)) throw new TypeError(`Unexpected response: ${what}.bedHistory is not an array.`)
  const adm = optStr(o, "admissionType", what, dto)
  if (adm !== undefined && adm !== "" && adm !== "emergency" && adm !== "planned") throw new TypeError(`Unexpected response: ${what}.admissionType is not one of the documented values.`)
  return {
    ...summaryCore(o, what, dto),
    admissionType: adm === "emergency" || adm === "planned" ? adm : null,
    advisedBy: optStr(o, "advisedBy", what, dto) ?? null, referredBy: optStr(o, "referredBy", what, dto) ?? null, reason: optStr(o, "reason", what, dto) ?? null,
    closedAt: optInstantOf(o, "closedAt", what), dischargedAt: optInstantOf(o, "dischargedAt", what), cancelledAt: optInstantOf(o, "cancelledAt", what), cancelReason: optStr(o, "cancelReason", what, dto) ?? null,
    archivedAt: optInstantOf(o, "archivedAt", what),
    bedHistory: o.bedHistory.map((b, i) => {
      const w = `${what}.bedHistory[${i}]`
      const x = asObj(b, w)
      return { bedId: reqUlid(x, "bedId", w), bedNo: reqStr(x, "bedNo", w), wardId: reqUlid(x, "wardId", w), wardName: reqStr(x, "wardName", w), assignedAt: instantOf(x, "assignedAt", w), releasedAt: optInstantOf(x, "releasedAt", w) }
    }),
    clinical: o.clinical === null || o.clinical === undefined ? null : clinicalOf(o.clinical, `${what}.clinical`, dto),
    updatedAt: instantOf(o, "updatedAt", what), createdAt: instantOf(o, "createdAt", what),
  }
}

export function parseProgressNote(raw: unknown, what = "progress note"): ProgressNote {
  const o = asObj(raw, what)
  return { id: reqUlid(o, "id", what), note: reqStr(o, "note", what), writtenAt: instantOf(o, "writtenAt", what), author: personRef(o.author, `${what}.author`) }
}
export function parseNoteList(raw: unknown): ListResult<ProgressNote> {
  return parsePage(raw, "progress notes", (item) => parseProgressNote(item, "progress notes[]"))
}

export function parseBedBoard(raw: unknown): BoardWard[] {
  const o = asObj(raw, "occupancy")
  if (!Array.isArray(o.wards)) throw new TypeError("Unexpected response: occupancy.wards is not an array.")
  return o.wards.map((w, i): BoardWard => {
    const what = `occupancy.wards[${i}]`
    const x = asObj(w, what)
    if (!Array.isArray(x.beds)) throw new TypeError(`Unexpected response: ${what}.beds is not an array.`)
    return {
      id: reqUlid(x, "id", what), name: reqStr(x, "name", what), type: reqEnum(x, "type", what, ["general", "private", "icu", "children"]), dailyRate: reqStr(x, "dailyRate", what),
      beds: x.beds.map((b, j): BoardBed => {
        const bw = `${what}.beds[${j}]`
        const bed = asObj(b, bw)
        const occ = bed.occupant === null || bed.occupant === undefined ? null : asObj(bed.occupant, `${bw}.occupant`)
        const state = reqEnum(bed, "state", bw, ["available", "occupied", "maintenance"])
        if ((state === "occupied") !== (occ !== null)) throw new TypeError(`Unexpected response: ${bw} is ${state} but ${occ ? "has" : "has no"} an occupant.`)
        const pat = occ ? asObj(occ.patient, `${bw}.occupant.patient`) : null
        return {
          id: reqUlid(bed, "id", bw), bedNo: reqStr(bed, "bedNo", bw), state,
          occupant: occ && pat ? { encounterId: reqUlid(occ, "encounterId", `${bw}.occupant`), encId: reqStr(occ, "encId", `${bw}.occupant`), since: instantOf(occ, "since", `${bw}.occupant`), patient: { id: reqUlid(pat, "id", `${bw}.occupant.patient`), mrNo: reqStr(pat, "mrNo", `${bw}.occupant.patient`), name: reqStr(pat, "name", `${bw}.occupant.patient`) } } : null,
        }
      }),
    }
  })
}

// ── Requests ──

export function visitListQuery(p: Pick<VisitListOptions, "page" | "pageSize" | "search" | "type" | "status" | "doctorId" | "dateFrom" | "dateTo" | "admitted" | "pending" | "includeArchived" | "patientId" | "sort">): QueryParams {
  const search = p.search?.trim()
  if (search && search.length > VISIT_LIMITS.search) throw new RangeError("The search text can be at most 100 characters.")
  for (const d of [p.dateFrom, p.dateTo]) if (d !== undefined && !DATE_RE.test(d)) throw new TypeError("Dates must be YYYY-MM-DD.")
  for (const id of [p.doctorId, p.patientId]) if (id !== undefined && !isUlid(id)) throw new TypeError("The doctor or patient id is not a valid backend id.")
  if (p.type !== undefined && !VISIT_TYPES.includes(p.type)) throw new TypeError("Unknown visit type.")
  if (p.status !== undefined && !VISIT_STATUSES.includes(p.status)) throw new TypeError("Unknown visit status.")
  if (p.sort !== undefined && !SORT_RE.test(p.sort)) throw new TypeError("The sort must look like field:asc or field:desc.")
  return {
    ...pageQuery(p.page, p.pageSize), search: search || undefined, type: p.type, status: p.status, doctorId: p.doctorId, dateFrom: p.dateFrom, dateTo: p.dateTo,
    admitted: p.admitted === undefined ? undefined : p.admitted, pending: p.pending === undefined ? undefined : p.pending, includeArchived: p.includeArchived ? true : undefined, patientId: p.patientId, sort: p.sort,
  }
}
export function patientVisitsQuery(p: PatientVisitsOptions): QueryParams {
  if (p.type !== undefined && !VISIT_TYPES.includes(p.type)) throw new TypeError("Unknown visit type.")
  if (p.status !== undefined && !VISIT_STATUSES.includes(p.status)) throw new TypeError("Unknown visit status.")
  return { ...pageQuery(p.page, p.pageSize), type: p.type, status: p.status, includeArchived: p.includeArchived ? true : undefined }
}

const optText = (v: string | null | undefined, max: number, label: string): string | undefined => {
  const t = v?.trim()
  if (!t) return undefined
  if (t.length > max) throw new RangeError(`${label} can be at most ${max} characters.`)
  return t
}
const checkInstant = (v: string | undefined, label: string): string | undefined => {
  if (v === undefined) return undefined
  if (Number.isNaN(Date.parse(v)) || !/^\d{4}-\d{2}-\d{2}T/.test(v)) throw new TypeError(`${label} must be a date and time.`)
  return v
}
const needUlid = (id: string, label: string): string => {
  if (!isUlid(id)) throw new TypeError(`The ${label} id is not a valid backend id.`)
  return id
}

export type CheckInBody = Schemas["CheckInDto"]
/** POST /encounters/opd. Check-in charges the consultation on the server; with an appointmentId it also completes that appointment. */
export function checkInPayload(input: CheckInInput): CheckInBody {
  const body: CheckInBody = { patientId: needUlid(input.patientId, "patient"), doctorId: needUlid(input.doctorId, "doctor") }
  if (input.priority !== undefined) {
    if (input.priority !== "normal" && input.priority !== "urgent") throw new TypeError("Unknown priority.")
    body.priority = input.priority
  }
  const adv = optText(input.advisedBy, VISIT_LIMITS.advisedBy, "Advised by"); if (adv) body.advisedBy = adv
  const ref = optText(input.referredBy, VISIT_LIMITS.referredBy, "Referred by"); if (ref) body.referredBy = ref
  const reason = optText(input.reason, VISIT_LIMITS.reason, "The reason"); if (reason) body.reason = reason
  const at = checkInstant(input.startedAt, "The check-in time"); if (at) body.startedAt = at
  if (input.appointmentId !== undefined) body.appointmentId = needUlid(input.appointmentId, "appointment")
  return body
}

export type AdmitBody = Schemas["AdmitDto"]
/** POST /encounters/ipd: a bed chosen from the live bed board and an admission type. */
export function admitPayload(input: AdmitInput): AdmitBody {
  if (input.admissionType !== "emergency" && input.admissionType !== "planned") throw new TypeError("Choose emergency or planned.")
  const { appointmentId: _drop, ...rest } = checkInPayload({ ...input, appointmentId: undefined })
  void _drop
  return { ...rest, bedId: needUlid(input.bedId, "bed"), admissionType: input.admissionType }
}

export type CorrectionBody = Schemas["UpdateCheckInDto"]
/** PATCH /encounters/{id}/check-in: only what changes, with the version the screen loaded. `null` clears advisedBy, referredBy or the reason. */
export function correctionPayload(patch: CheckInCorrection, expectedUpdatedAt: string): CorrectionBody {
  const body: CorrectionBody = {}
  if (patch.doctorId !== undefined) body.doctorId = needUlid(patch.doctorId, "doctor")
  if (patch.priority !== undefined) {
    if (patch.priority !== "normal" && patch.priority !== "urgent") throw new TypeError("Unknown priority.")
    body.priority = patch.priority
  }
  for (const [k, max, label] of [["advisedBy", VISIT_LIMITS.advisedBy, "Advised by"], ["referredBy", VISIT_LIMITS.referredBy, "Referred by"], ["reason", VISIT_LIMITS.reason, "The reason"]] as const) {
    if (patch[k] === undefined) continue
    body[k] = patch[k] === null ? null : (optText(patch[k], max, label) ?? null)
  }
  const at = checkInstant(patch.startedAt, "The check-in time"); if (at) body.startedAt = at
  if (patch.admissionType !== undefined) {
    if (patch.admissionType !== "emergency" && patch.admissionType !== "planned") throw new TypeError("Choose emergency or planned.")
    body.admissionType = patch.admissionType
  }
  if (Object.keys(body).length === 0) throw new RangeError("Nothing to change.")
  body.expectedUpdatedAt = checkInstant(expectedUpdatedAt, "The loaded version")
  return body
}

export type VitalsBody = Schemas["VitalsReadingDto"]
/** POST /encounters/{id}/vitals: one reading. At least one number; every number inside the contract's range; the top pressure above the bottom one. */
export function vitalsPayload(input: VitalsInput): VitalsBody {
  const body: VitalsBody = {}
  let any = false
  for (const key of Object.keys(VITALS_RANGES) as Array<keyof typeof VITALS_RANGES>) {
    const v = input[key]
    if (v === undefined) continue
    const r = VITALS_RANGES[key]
    if (typeof v !== "number" || !Number.isFinite(v) || (r.int && !Number.isInteger(v)) || v < r.min || v > r.max) throw new RangeError(`${key} must be ${r.int ? "a whole number " : "a number "}from ${r.min} to ${r.max}.`)
    ;(body as Record<string, number>)[key] = v
    any = true
  }
  if (!any) throw new RangeError("Enter at least one measurement.")
  if (body.bpSystolic !== undefined && body.bpDiastolic !== undefined && body.bpSystolic <= body.bpDiastolic) throw new RangeError("The top blood pressure must be higher than the bottom one.")
  const at = checkInstant(input.recordedAt, "The time of the reading"); if (at) body.recordedAt = at
  return body
}

function diagnosesBody(list: readonly DiagnosisInput[], min: number, label: string): Array<{ icdCodeId?: string; text?: string; isPrimary: boolean }> {
  if (list.length < min) throw new RangeError(`${label}: add at least ${min}.`)
  if (list.length > VISIT_LIMITS.diagnoses) throw new RangeError(`${label}: at most ${VISIT_LIMITS.diagnoses}.`)
  if (list.length > 0 && list.filter((d) => d.isPrimary).length !== 1) throw new RangeError(`${label}: exactly one must be the primary diagnosis.`)
  return list.map((d) => {
    const text = optText(d.text, VISIT_LIMITS.diagnosisText, "A diagnosis")
    if (!d.icdCodeId && !text) throw new RangeError(`${label}: each needs an ICD-10 code or some text.`)
    const out: { icdCodeId?: string; text?: string; isPrimary: boolean } = { isPrimary: d.isPrimary }
    if (d.icdCodeId) out.icdCodeId = needUlid(d.icdCodeId, "diagnosis code")
    if (text) out.text = text
    return out
  })
}

function lineBody(l: PrescriptionLineInput, i: number): NonNullable<ClinicalBody["prescription"]>[number] {
  const out: NonNullable<ClinicalBody["prescription"]>[number] = {}
  if (l.id) out.id = needUlid(l.id, "prescription line")
  if (l.medicineId) out.medicineId = needUlid(l.medicineId, "medicine")
  const name = optText(l.medicineText, VISIT_LIMITS.medicineText, "The medicine name")
  if (!l.medicineId && !name) throw new RangeError(`Prescription line ${i + 1}: name the medicine.`)
  if (name) out.medicineText = name
  for (const k of ["dose", "route", "frequency", "duration"] as const) { const v = optText(l[k], VISIT_LIMITS.lineText, k); if (v) out[k] = v }
  const ins = optText(l.instructions, VISIT_LIMITS.instructions, "The instructions"); if (ins) out.instructions = ins
  if (l.quantity !== undefined) {
    const { min, max } = VISIT_LIMITS.quantity
    if (!Number.isInteger(l.quantity) || l.quantity < min || l.quantity > max) throw new RangeError(`Prescription line ${i + 1}: the quantity must be a whole number from ${min} to ${max}.`)
    out.quantity = l.quantity
  }
  return out
}

export type ClinicalBody = Schemas["ClinicalRecordDto"]
/**
 * PUT /encounters/{id}/clinical-record: the doctor's record, saved WHOLE. A cleared text field is sent as null. Exactly one diagnosis is primary
 * when there are any. Every existing prescription line is sent back with its id (a line without one is new, a line left out is removed).
 */
export function clinicalRecordPayload(input: ClinicalRecordInput, expectedUpdatedAt: string): ClinicalBody {
  if (input.prescription.length > VISIT_LIMITS.prescription) throw new RangeError(`At most ${VISIT_LIMITS.prescription} prescription lines.`)
  const text = (v: string | null | undefined, max: number, label: string): string | null => optText(v, max, label) ?? null
  const follow = input.followUpDate?.trim() || null
  if (follow !== null && !DATE_RE.test(follow)) throw new TypeError("The follow-up date must be YYYY-MM-DD.")
  return {
    chiefComplaint: text(input.chiefComplaint, VISIT_LIMITS.chiefComplaint, "The chief complaint"),
    historyOfIllness: text(input.historyOfIllness, VISIT_LIMITS.historyOfIllness, "The history"),
    examinationFindings: text(input.examinationFindings, VISIT_LIMITS.examinationFindings, "The examination findings"),
    clinicalNotes: text(input.clinicalNotes, VISIT_LIMITS.clinicalNotes, "The clinical notes"),
    generalInstructions: text(input.generalInstructions, VISIT_LIMITS.generalInstructions, "The general instructions"),
    followUpDate: follow,
    diagnoses: diagnosesBody(input.diagnoses, 0, "Diagnoses"),
    prescription: input.prescription.map(lineBody),
    expectedUpdatedAt: checkInstant(expectedUpdatedAt, "The loaded version"),
  }
}

export type DischargeBody = Schemas["DischargeDto"]
export function dischargePayload(input: VisitDischargeInput): DischargeBody {
  if (!DISCHARGE_CONDITIONS.includes(input.conditionOnDischarge)) throw new TypeError("Choose the condition on discharge.")
  const body: DischargeBody = { diagnoses: diagnosesBody(input.diagnoses, 1, "Discharge diagnoses"), conditionOnDischarge: input.conditionOnDischarge }
  const at = checkInstant(input.dischargedAt, "The discharge time"); if (at) body.dischargedAt = at
  const summary = optText(input.dischargeSummary, VISIT_LIMITS.dischargeSummary, "The discharge summary"); if (summary) body.dischargeSummary = summary
  const instr = optText(input.followUpInstructions, VISIT_LIMITS.followUpInstructions, "The follow-up instructions"); if (instr) body.followUpInstructions = instr
  if (input.followUpDate) {
    if (!DATE_RE.test(input.followUpDate)) throw new TypeError("The follow-up date must be YYYY-MM-DD.")
    body.followUpDate = input.followUpDate
  }
  return body
}

/** The reason for a cancel or a reopen: 3 to 300 characters. */
export function reasonPayload(reason: string): { reason: string } {
  const r = reason.trim()
  const { min, max } = VISIT_LIMITS.cancelReason
  if (r.length < min || r.length > max) throw new RangeError(`The reason needs ${min} to ${max} characters.`)
  return { reason: r }
}
export function notePayload(note: string): { note: string } {
  const n = note.trim()
  const { min, max } = VISIT_LIMITS.note
  if (n.length < min || n.length > max) throw new RangeError(`The note needs ${min} to ${max} characters.`)
  return { note: n }
}
export function transferPayload(bedId: string): { bedId: string } {
  return { bedId: needUlid(bedId, "bed") }
}

// ── Services ──

const idParam = (id: string) => ({ id })

export const httpVisitsService: VisitsService = {
  async list(opts = {}) {
    return parseVisitList(await callEndpoint<unknown>("visits.list", { query: () => visitListQuery(opts), signal: opts.signal }))
  },
  async get(id, signal) {
    return parseVisitDetail(await callEndpoint<unknown>("visits.get", { params: idParam(id), signal }))
  },
  async forPatient(patientId, opts = {}) {
    return parseVisitList(await callEndpoint<unknown>("visits.forPatient", { params: idParam(patientId), query: () => patientVisitsQuery(opts), signal: opts.signal }))
  },
  async checkInOpd(input) {
    // exactly ONE POST per call (it issues a number and a token and charges the consultation); an unreadable 2xx is "saved", never re-sent
    return createAndParse("visits.checkInOpd", { body: () => checkInPayload(input) }, parseVisitDetail, "check-in")
  },
  async admit(input) {
    return createAndParse("visits.admit", { body: () => admitPayload(input) }, parseVisitDetail, "admission")
  },
  async correctCheckIn(id, patch, expectedUpdatedAt) {
    return createAndParse("visits.correctCheckIn", { params: idParam(id), body: () => correctionPayload(patch, expectedUpdatedAt) }, (raw) => parseVisitDetail(raw), "change")
  },
  async vitals(id, signal) {
    return parseVitalsList(await callEndpoint<unknown>("visits.vitals", { params: idParam(id), query: () => pageQuery(1, 100), signal })).items
  },
  async recordVitals(id, input) {
    return createAndParse("visits.recordVitals", { params: idParam(id), body: () => vitalsPayload(input) }, (raw) => parseVitalsReading(raw, "vitals", "VitalsResponseDto_Output"), "vitals reading")
  },
  async saveClinicalRecord(id, input, expectedUpdatedAt) {
    return createAndParse("visits.saveClinicalRecord", { params: idParam(id), body: () => clinicalRecordPayload(input, expectedUpdatedAt) }, (raw) => parseVisitDetail(raw), "change")
  },
  async close(id) {
    return createAndParse("visits.close", { params: idParam(id) }, (raw) => parseVisitDetail(raw), "change")
  },
  async notes(id, signal) {
    return parseNoteList(await callEndpoint<unknown>("visits.notes", { params: idParam(id), query: () => pageQuery(1, 100), signal })).items
  },
  async addNote(id, note) {
    return createAndParse("visits.addNote", { params: idParam(id), body: () => notePayload(note) }, (raw) => parseProgressNote(raw), "progress note")
  },
  async transfer(id, bedId) {
    return createAndParse("visits.transfer", { params: idParam(id), body: () => transferPayload(bedId) }, (raw) => parseVisitDetail(raw), "change")
  },
  async discharge(id, input) {
    return createAndParse("visits.discharge", { params: idParam(id), body: () => dischargePayload(input) }, (raw) => parseVisitDetail(raw), "change")
  },
  async cancel(id, reason) {
    return createAndParse("visits.cancel", { params: idParam(id), body: () => reasonPayload(reason) }, (raw) => parseVisitDetail(raw), "change")
  },
  async reopen(id, reason) {
    return createAndParse("visits.reopen", { params: idParam(id), body: () => reasonPayload(reason) }, (raw) => parseVisitDetail(raw), "change")
  },
  async archive(id) {
    return createAndParse("visits.archive", { params: idParam(id) }, (raw) => parseVisitDetail(raw), "change")
  },
  async restore(id) {
    return createAndParse("visits.restore", { params: idParam(id) }, (raw) => parseVisitDetail(raw), "change")
  },
}

export const httpBedBoardService: BedBoardService = {
  async occupancy(signal) {
    return parseBedBoard(await callEndpoint<unknown>("beds.occupancy", { signal }))
  },
  async setMaintenance(bedId, underMaintenance) {
    await callEndpoint<unknown>("beds.maintenance", { params: idParam(bedId), body: () => ({ underMaintenance }) })
  },
}
