import type { QueryParams } from "@/lib/api/client"
import type { Schemas } from "@/lib/api/contract"
import { isUlid } from "@/lib/api/convert"
import type { MoneyString } from "@/lib/api/types"
import type {
  DxAmendInput, DxCharge, DxFlag, DxFulfillment, DxImagingAmendment, DxImagingOrder, DxImagingOrderAction, DxImagingPrint, DxImagingReport, DxImagingTest, DxImagingTestAction, DxLabAmendment, DxLabOrder,
  DxLabOrderAction, DxLabPrint, DxLabTest, DxLabTestAction, DxListOptions, DxModality, DxOrderInput, DxPerson, DxPrintHospital, DxPrintPatient, DxPriority, DxResult, DxResultInput, DxResultParameter,
  DxSpecimen, DxSpecimenAction, DxSpecimenType, DxStatus, DxTestLine, DxTestStatus, ImagingApiService, ImagingOrderListOptionsApi, ImagingOrderRow, LabApiService, LabOrderListOptionsApi, LabOrderRow, ListResult,
} from "../types"
import { discountBody } from "./billing"
import { callEndpoint, createAndParse } from "./call"
import { parseLabTest } from "./labTests"
import { asObj, optStr, pageQuery, parsePage, reqBool, reqEnum, reqInt, reqStr, reqUlid, type Obj } from "./wire"

// Laboratory and imaging orders (handoff 8.7 and 8.8; docs/openapi.json LabOrder*Dto / ImagingOrder*Dto / LabReportDto / ImagingReportDto). The server computes
// `allowedActions` at the order, specimen and test level for the signed-in user and the record's state, and the screens show exactly those. Every write is ONE
// request (no idempotency keys). Dates are ISO instants and nothing here is a JS Date.

export const DX_STATUSES: readonly DxStatus[] = ["pending", "collected", "in_progress", "completed", "delivered", "cancelled"]
export const DX_PRIORITIES: readonly DxPriority[] = ["routine", "urgent"]
export const DX_FULFILLMENTS: readonly DxFulfillment[] = ["internal", "external_referral"]
export const DX_TEST_STATUSES: readonly DxTestStatus[] = ["ordered", "entered", "verified", "cancelled", "performed"]
export const DX_FLAGS = ["normal", "high", "low", "critical"] as const
export const DX_SPECIMEN_TYPES: readonly DxSpecimenType[] = ["EDTA whole blood", "Serum", "Citrate plasma", "Fluoride plasma", "Heparin plasma", "Urine", "Stool", "Swab", "Sputum", "CSF", "Other body fluid"]
export const DX_MODALITIES: readonly DxModality[] = ["X-Ray", "Ultrasound", "Doppler", "Echocardiography", "ECG", "CT", "MRI", "Other"]
const LAB_ORDER_ACTIONS: readonly DxLabOrderAction[] = ["add_test", "deliver", "write_remarks", "archive", "restore"]
const SPECIMEN_ACTIONS: readonly DxSpecimenAction[] = ["collect", "reject"]
const LAB_TEST_ACTIONS: readonly DxLabTestAction[] = ["cancel", "enter_result", "verify", "amend"]
const IMAGING_ORDER_ACTIONS: readonly DxImagingOrderAction[] = ["add_test", "deliver", "archive", "restore"]
const IMAGING_TEST_ACTIONS: readonly DxImagingTestAction[] = ["cancel", "perform", "write_report", "sign", "amend"]
const SPECIMEN_STATUSES = ["pending", "collected", "rejected"] as const
const GENDERS = ["male", "female", "other"] as const
export const DX_LIMITS = {
  search: 100, referringDoctor: 120, clinicalNotes: 1000, referredTo: 160, tests: 30, reason: { min: 3, max: 500 }, remarks: 2000,
  parameters: 60, parameterKey: 32, parameterValue: 60, narrative: 5000, reportNarrative: 10000,
} as const
const SORT_RE = /^[A-Za-z]+:(asc|desc)$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const DECIMAL_RE = /^-?\d+(\.\d+)?$/

// ── Reading ──

const instant = (o: Obj, key: string, what: string): string => {
  const v = reqStr(o, key, what)
  if (Number.isNaN(Date.parse(v))) throw new TypeError(`Unexpected response: ${what}.${key} is not a date-time.`)
  return v
}
const optInstant = (o: Obj, key: string, what: string): string | null => (o[key] === null || o[key] === undefined ? null : instant(o, key, what))
/** A single nullable text. The spec types several of these "array of string" (a spec bug, like elsewhere): a string, null or a one-element array is accepted. */
const text = (o: Obj, key: string, what: string, dto: string): string | null => optStr(o, key, what, dto) ?? null
const nullableStr = (o: Obj, key: string, what: string): string | null => (o[key] === null || o[key] === undefined ? null : reqStr(o, key, what))
const money = (o: Obj, key: string, what: string): MoneyString => {
  const v = o[key]
  if (typeof v !== "string" || !DECIMAL_RE.test(v)) throw new TypeError(`Unexpected response: ${what}.${key} is not a decimal string.`)
  return v as MoneyString
}
const person = (raw: unknown, what: string): DxPerson => { const o = asObj(raw, what); return { id: reqUlid(o, "id", what), name: reqStr(o, "name", what) } }
const optPerson = (raw: unknown, what: string): DxPerson | null => (raw === null || raw === undefined ? null : person(raw, what))
const patientRef = (raw: unknown, what: string) => { const o = asObj(raw, what); return { id: reqUlid(o, "id", what), mrNo: reqStr(o, "mrNo", what), name: reqStr(o, "name", what) } }
const visitRef = (raw: unknown, what: string) => { if (raw === null || raw === undefined) return null; const o = asObj(raw, what); return { id: reqUlid(o, "id", what), encId: reqStr(o, "encId", what) } }
/** An unknown action from a newer backend is ignored, never shown. */
function actionsOf<T extends string>(raw: unknown, allowed: readonly T[], what: string): T[] {
  if (!Array.isArray(raw)) throw new TypeError(`Unexpected response: ${what}.allowedActions is not an array.`)
  return raw.filter((a): a is T => typeof a === "string" && (allowed as readonly string[]).includes(a))
}
function flagOf(o: Obj, what: string): DxFlag {
  if (o.flag === null || o.flag === undefined) return null
  return reqEnum(o, "flag", what, DX_FLAGS)
}
function chargeOf(raw: unknown, what: string): DxCharge | null {
  if (raw === null || raw === undefined) return null
  const o = asObj(raw, what)
  return { id: reqUlid(o, "id", what), invoiceId: reqUlid(o, "invoiceId", what), total: money(o, "total", what), received: money(o, "received", what), paid: reqBool(o, "paid", what) }
}
function parameterOf(raw: unknown, what: string): Omit<DxResultParameter, "key"> {
  const o = asObj(raw, what)
  return { name: reqStr(o, "name", what), unit: nullableStr(o, "unit", what), value: reqStr(o, "value", what), flag: flagOf(o, what), normalRange: nullableStr(o, "normalRange", what) }
}
function resultOf(raw: unknown, what: string): DxResult | null {
  if (raw === null || raw === undefined) return null
  const o = asObj(raw, what)
  if (!Array.isArray(o.parameters)) throw new TypeError(`Unexpected response: ${what}.parameters is not an array.`)
  return {
    version: reqInt(o, "version", what), parameters: o.parameters.map((p, i) => ({ ...parameterOf(p, `${what}.parameters[${i}]`), key: reqStr(asObj(p, `${what}.parameters[${i}]`), "key", `${what}.parameters[${i}]`) })),
    narrative: nullableStr(o, "narrative", what), enteredBy: person(o.enteredBy, `${what}.enteredBy`), enteredAt: instant(o, "enteredAt", what), verifiedBy: optPerson(o.verifiedBy, `${what}.verifiedBy`), verifiedAt: optInstant(o, "verifiedAt", what),
  }
}
function previousOf(raw: unknown, what: string) {
  const o = asObj(raw, what)
  if (!Array.isArray(o.parameters)) throw new TypeError(`Unexpected response: ${what}.parameters is not an array.`)
  return { parameters: o.parameters.map((p, i) => parameterOf(p, `${what}.parameters[${i}]`)), narrative: nullableStr(o, "narrative", what) }
}
function listOf<T>(raw: unknown, what: string, item: (x: unknown, w: string) => T): T[] {
  if (!Array.isArray(raw)) throw new TypeError(`Unexpected response: ${what} is not an array.`)
  return raw.map((x, i) => item(x, `${what}[${i}]`))
}

export function parseLabOrderRow(raw: unknown, what = "lab order"): LabOrderRow {
  const o = asObj(raw, what)
  return {
    id: reqUlid(o, "id", what), orderNo: reqStr(o, "orderNo", what), status: reqEnum(o, "status", what, DX_STATUSES), priority: reqEnum(o, "priority", what, DX_PRIORITIES), fulfillment: reqEnum(o, "fulfillment", what, DX_FULFILLMENTS),
    orderedAt: instant(o, "orderedAt", what), patient: patientRef(o.patient, `${what}.patient`), encounter: visitRef(o.encounter, `${what}.encounter`), referringDoctor: reqStr(o, "referringDoctor", what),
    tests: listOf(o.tests, `${what}.tests`, (t, w) => { const to = asObj(t, w); return { name: reqStr(to, "name", w), status: reqEnum(to, "status", w, DX_TEST_STATUSES) } }),
    toCollect: reqInt(o, "toCollect", what), hasCritical: reqBool(o, "hasCritical", what), archived: reqBool(o, "archived", what),
  }
}
export function parseLabOrderList(raw: unknown): ListResult<LabOrderRow> {
  return parsePage(raw, "lab orders", (item) => parseLabOrderRow(item, "lab orders[]"))
}
export function parseImagingOrderRow(raw: unknown, what = "imaging order"): ImagingOrderRow {
  const o = asObj(raw, what)
  return {
    id: reqUlid(o, "id", what), orderNo: reqStr(o, "orderNo", what), status: reqEnum(o, "status", what, DX_STATUSES), priority: reqEnum(o, "priority", what, DX_PRIORITIES), fulfillment: reqEnum(o, "fulfillment", what, DX_FULFILLMENTS),
    orderedAt: instant(o, "orderedAt", what), patient: patientRef(o.patient, `${what}.patient`), encounter: visitRef(o.encounter, `${what}.encounter`), referringDoctor: reqStr(o, "referringDoctor", what),
    tests: listOf(o.tests, `${what}.tests`, (t, w) => { const to = asObj(t, w); return { name: reqStr(to, "name", w), modality: reqEnum(to, "modality", w, DX_MODALITIES), status: reqEnum(to, "status", w, DX_TEST_STATUSES) } }),
    toPerform: reqInt(o, "toPerform", what), toReport: reqInt(o, "toReport", what), archived: reqBool(o, "archived", what),
  }
}
export function parseImagingOrderList(raw: unknown): ListResult<ImagingOrderRow> {
  return parsePage(raw, "imaging orders", (item) => parseImagingOrderRow(item, "imaging orders[]"))
}

function specimenOf(raw: unknown, what: string): DxSpecimen {
  const o = asObj(raw, what)
  return {
    id: reqUlid(o, "id", what), specimenNo: reqStr(o, "specimenNo", what), specimenType: reqEnum(o, "specimenType", what, DX_SPECIMEN_TYPES), status: reqEnum(o, "status", what, SPECIMEN_STATUSES),
    collectedAt: optInstant(o, "collectedAt", what), collectedBy: optPerson(o.collectedBy, `${what}.collectedBy`), rejectedAt: optInstant(o, "rejectedAt", what), rejectedReason: nullableStr(o, "rejectedReason", what),
    replacesSpecimenId: nullableStr(o, "replacesSpecimenId", what), allowedActions: actionsOf(o.allowedActions, SPECIMEN_ACTIONS, what),
  }
}
function labTestOf(raw: unknown, what: string): DxLabTest {
  const o = asObj(raw, what)
  return {
    id: reqUlid(o, "id", what), testId: reqUlid(o, "testId", what), name: reqStr(o, "name", what), rate: money(o, "rate", what), specimenId: nullableStr(o, "specimenId", what), status: reqEnum(o, "status", what, DX_TEST_STATUSES),
    result: resultOf(o.result, `${what}.result`),
    amendments: listOf(o.amendments, `${what}.amendments`, (a, w): DxLabAmendment => { const ao = asObj(a, w); return { version: reqInt(ao, "version", w), reason: reqStr(ao, "reason", w), amendedBy: person(ao.amendedBy, `${w}.amendedBy`), amendedAt: instant(ao, "amendedAt", w), previous: previousOf(ao.previous, `${w}.previous`) } }),
    charge: chargeOf(o.charge, `${what}.charge`), cancelledAt: optInstant(o, "cancelledAt", what), cancelledReason: nullableStr(o, "cancelledReason", what), allowedActions: actionsOf(o.allowedActions, LAB_TEST_ACTIONS, what),
  }
}
export function parseLabOrder(raw: unknown, what = "lab order"): DxLabOrder {
  const o = asObj(raw, what)
  const p = asObj(o.patient, `${what}.patient`)
  const dto = "LabOrderResponseDto_Output"
  return {
    id: reqUlid(o, "id", what), orderNo: reqStr(o, "orderNo", what), status: reqEnum(o, "status", what, DX_STATUSES), priority: reqEnum(o, "priority", what, DX_PRIORITIES), fulfillment: reqEnum(o, "fulfillment", what, DX_FULFILLMENTS),
    referredTo: text(o, "referredTo", what, dto), patient: { ...patientRef(p, `${what}.patient`), gender: reqEnum(p, "gender", `${what}.patient`, GENDERS) }, encounter: visitRef(o.encounter, `${what}.encounter`), doctor: optPerson(o.doctor, `${what}.doctor`),
    referringDoctorText: text(o, "referringDoctorText", what, dto), clinicalNotes: text(o, "clinicalNotes", what, dto), pathologistRemarks: text(o, "pathologistRemarks", what, dto), orderedAt: instant(o, "orderedAt", what),
    deliveredAt: optInstant(o, "deliveredAt", what), deliveredBy: optPerson(o.deliveredBy, `${what}.deliveredBy`), archived: reqBool(o, "archived", what),
    specimens: listOf(o.specimens, `${what}.specimens`, specimenOf), tests: listOf(o.tests, `${what}.tests`, labTestOf), allowedActions: actionsOf(o.allowedActions, LAB_ORDER_ACTIONS, what),
  }
}

function imagingTestOf(raw: unknown, what: string): DxImagingTest {
  const o = asObj(raw, what)
  const report = o.report === null || o.report === undefined ? null : (() => {
    const r = asObj(o.report, `${what}.report`)
    return { version: reqInt(r, "version", `${what}.report`), narrative: reqStr(r, "narrative", `${what}.report`), writtenBy: person(r.writtenBy, `${what}.report.writtenBy`), writtenAt: instant(r, "writtenAt", `${what}.report`), signedBy: optPerson(r.signedBy, `${what}.report.signedBy`), signedAt: optInstant(r, "signedAt", `${what}.report`) } satisfies DxImagingReport
  })()
  return {
    id: reqUlid(o, "id", what), testId: reqUlid(o, "testId", what), name: reqStr(o, "name", what), modality: reqEnum(o, "modality", what, DX_MODALITIES), rate: money(o, "rate", what), status: reqEnum(o, "status", what, DX_TEST_STATUSES),
    reportRequired: reqBool(o, "reportRequired", what), performedBy: optPerson(o.performedBy, `${what}.performedBy`), performedAt: optInstant(o, "performedAt", what), report, reportTemplate: nullableStr(o, "reportTemplate", what),
    amendments: listOf(o.amendments, `${what}.amendments`, (a, w): DxImagingAmendment => { const ao = asObj(a, w); return { version: reqInt(ao, "version", w), reason: reqStr(ao, "reason", w), amendedBy: person(ao.amendedBy, `${w}.amendedBy`), amendedAt: instant(ao, "amendedAt", w), previousNarrative: nullableStr(ao, "previousNarrative", w) } }),
    charge: chargeOf(o.charge, `${what}.charge`), cancelledAt: optInstant(o, "cancelledAt", what), cancelledReason: nullableStr(o, "cancelledReason", what), allowedActions: actionsOf(o.allowedActions, IMAGING_TEST_ACTIONS, what),
  }
}
export function parseImagingOrder(raw: unknown, what = "imaging order"): DxImagingOrder {
  const o = asObj(raw, what)
  const p = asObj(o.patient, `${what}.patient`)
  const dto = "ImagingOrderResponseDto_Output"
  return {
    id: reqUlid(o, "id", what), orderNo: reqStr(o, "orderNo", what), status: reqEnum(o, "status", what, DX_STATUSES), priority: reqEnum(o, "priority", what, DX_PRIORITIES), fulfillment: reqEnum(o, "fulfillment", what, DX_FULFILLMENTS),
    referredTo: text(o, "referredTo", what, dto), patient: { ...patientRef(p, `${what}.patient`), gender: reqEnum(p, "gender", `${what}.patient`, GENDERS) }, encounter: visitRef(o.encounter, `${what}.encounter`), doctor: optPerson(o.doctor, `${what}.doctor`),
    referringDoctorText: text(o, "referringDoctorText", what, dto), clinicalNotes: text(o, "clinicalNotes", what, dto), orderedAt: instant(o, "orderedAt", what), deliveredAt: optInstant(o, "deliveredAt", what),
    deliveredBy: optPerson(o.deliveredBy, `${what}.deliveredBy`), archived: reqBool(o, "archived", what), tests: listOf(o.tests, `${what}.tests`, imagingTestOf), allowedActions: actionsOf(o.allowedActions, IMAGING_ORDER_ACTIONS, what),
  }
}

function hospitalOf(raw: unknown, what: string): DxPrintHospital {
  const o = asObj(raw, what)
  return { name: reqStr(o, "name", what), address: nullableStr(o, "address", what), phone: nullableStr(o, "phone", what), email: nullableStr(o, "email", what), printHeader: nullableStr(o, "printHeader", what) }
}
function printPatientOf(raw: unknown, what: string): DxPrintPatient {
  const o = asObj(raw, what)
  return { mrNo: reqStr(o, "mrNo", what), name: reqStr(o, "name", what), gender: reqEnum(o, "gender", what, GENDERS), dateOfBirth: reqStr(o, "dateOfBirth", what), dateOfBirthEstimated: reqBool(o, "dateOfBirthEstimated", what) }
}
const strings = (raw: unknown, what: string): string[] => listOf(raw, what, (s, w) => { if (typeof s !== "string") throw new TypeError(`Unexpected response: ${w} is not a string.`); return s })
export function parseLabPrint(raw: unknown, what = "lab report"): DxLabPrint {
  const o = asObj(raw, what)
  const dto = "LabReportDto_Output"
  return {
    hospital: hospitalOf(o.hospital, `${what}.hospital`), orderNo: reqStr(o, "orderNo", what), priority: reqEnum(o, "priority", what, DX_PRIORITIES), orderedAt: instant(o, "orderedAt", what), deliveredAt: optInstant(o, "deliveredAt", what),
    patient: printPatientOf(o.patient, `${what}.patient`), encounterNo: text(o, "encounterNo", what, dto), referringDoctor: reqStr(o, "referringDoctor", what), clinicalNotes: text(o, "clinicalNotes", what, dto), pathologistRemarks: text(o, "pathologistRemarks", what, dto),
    specimens: listOf(o.specimens, `${what}.specimens`, (s, w) => { const so = asObj(s, w); return { specimenNo: reqStr(so, "specimenNo", w), specimenType: reqEnum(so, "specimenType", w, DX_SPECIMEN_TYPES), collectedAt: instant(so, "collectedAt", w) } }),
    tests: listOf(o.tests, `${what}.tests`, (t, w) => {
      const to = asObj(t, w)
      if (!Array.isArray(to.parameters)) throw new TypeError(`Unexpected response: ${w}.parameters is not an array.`)
      return {
        name: reqStr(to, "name", w), amended: reqBool(to, "amended", w),
        amendments: listOf(to.amendments, `${w}.amendments`, (a, aw) => { const ao = asObj(a, aw); return { version: reqInt(ao, "version", aw), reason: reqStr(ao, "reason", aw), amendedAt: instant(ao, "amendedAt", aw), previous: previousOf(ao.previous, `${aw}.previous`) } }),
        parameters: to.parameters.map((p, i) => parameterOf(p, `${w}.parameters[${i}]`)), narrative: nullableStr(to, "narrative", w), enteredBy: reqStr(to, "enteredBy", w), verifiedBy: reqStr(to, "verifiedBy", w), verifiedAt: instant(to, "verifiedAt", w),
      }
    }),
    pending: strings(o.pending, `${what}.pending`), complete: reqBool(o, "complete", what),
  }
}
export function parseImagingPrint(raw: unknown, what = "imaging report"): DxImagingPrint {
  const o = asObj(raw, what)
  const dto = "ImagingReportDto_Output"
  return {
    hospital: hospitalOf(o.hospital, `${what}.hospital`), orderNo: reqStr(o, "orderNo", what), priority: reqEnum(o, "priority", what, DX_PRIORITIES), orderedAt: instant(o, "orderedAt", what), deliveredAt: optInstant(o, "deliveredAt", what),
    patient: printPatientOf(o.patient, `${what}.patient`), encounterNo: text(o, "encounterNo", what, dto), referringDoctor: reqStr(o, "referringDoctor", what), clinicalNotes: text(o, "clinicalNotes", what, dto),
    reports: listOf(o.reports, `${what}.reports`, (r, w) => {
      const ro = asObj(r, w)
      return {
        name: reqStr(ro, "name", w), modality: reqEnum(ro, "modality", w, DX_MODALITIES), narrative: reqStr(ro, "narrative", w), amended: reqBool(ro, "amended", w),
        amendments: listOf(ro.amendments, `${w}.amendments`, (a, aw) => { const ao = asObj(a, aw); return { version: reqInt(ao, "version", aw), reason: reqStr(ao, "reason", aw), amendedAt: instant(ao, "amendedAt", aw), previousNarrative: nullableStr(ao, "previousNarrative", aw) } }),
        performedBy: nullableStr(ro, "performedBy", w), performedAt: optInstant(ro, "performedAt", w), signedBy: reqStr(ro, "signedBy", w), signedAt: instant(ro, "signedAt", w),
      }
    }),
    unreported: listOf(o.unreported, `${what}.unreported`, (u, w) => { const uo = asObj(u, w); return { name: reqStr(uo, "name", w), modality: reqEnum(uo, "modality", w, DX_MODALITIES), performedBy: reqStr(uo, "performedBy", w), performedAt: instant(uo, "performedAt", w) } }),
    pending: strings(o.pending, `${what}.pending`), complete: reqBool(o, "complete", what),
  }
}

// ── Writing the request ──

const needUlid = (value: string, label: string): string => {
  if (!isUlid(value)) throw new RangeError(`The ${label} is not valid.`)
  return value
}
function reasonText(text: string): string {
  const t = (text ?? "").trim()
  if (t.length < DX_LIMITS.reason.min || t.length > DX_LIMITS.reason.max) throw new RangeError(`The reason is ${DX_LIMITS.reason.min} to ${DX_LIMITS.reason.max} characters.`)
  return t
}
function testLines(lines: DxTestLine[]): Schemas["CreateLabOrderDto"]["tests"] {
  if (!Array.isArray(lines) || lines.length === 0) throw new RangeError("Choose at least one test.")
  if (lines.length > DX_LIMITS.tests) throw new RangeError(`At most ${DX_LIMITS.tests} tests at a time.`)
  const seen = new Set<string>()
  return lines.map((l) => {
    const testId = needUlid(l.testId, "test")
    if (seen.has(testId)) throw new RangeError("A test is listed twice.")
    seen.add(testId)
    const line: Schemas["CreateLabOrderDto"]["tests"][number] = { testId }
    if (l.discount) line.discount = discountBody(l.discount)
    return line
  })
}
/** POST /lab-orders and POST /imaging-orders share one body. The ordering doctor is a user OR an outside doctor's name, never both. */
export function orderPayload(input: DxOrderInput): Schemas["CreateLabOrderDto"] {
  const body: Schemas["CreateLabOrderDto"] = { patientId: needUlid(input.patientId, "patient"), priority: reqPriority(input.priority), tests: testLines(input.tests) }
  if (input.encounterId) body.encounterId = needUlid(input.encounterId, "visit")
  const doctorText = input.referringDoctorText?.trim()
  if (input.doctorId && doctorText) throw new RangeError("Choose the doctor or type an outside doctor's name, not both.")
  if (input.doctorId) body.doctorId = needUlid(input.doctorId, "doctor")
  if (doctorText) {
    if (doctorText.length > DX_LIMITS.referringDoctor) throw new RangeError(`The outside doctor's name is at most ${DX_LIMITS.referringDoctor} characters.`)
    body.referringDoctorText = doctorText
  }
  const notes = input.clinicalNotes?.trim()
  if (notes) {
    if (notes.length > DX_LIMITS.clinicalNotes) throw new RangeError(`The clinical notes are at most ${DX_LIMITS.clinicalNotes} characters.`)
    body.clinicalNotes = notes
  }
  const referredTo = input.referredTo?.trim()
  if (referredTo) {
    if (referredTo.length > DX_LIMITS.referredTo) throw new RangeError(`"Referred to" is at most ${DX_LIMITS.referredTo} characters.`)
    body.referredTo = referredTo
  }
  return body
}
function reqPriority(p: string): DxPriority {
  if (!DX_PRIORITIES.includes(p as DxPriority)) throw new RangeError("The priority is routine or urgent.")
  return p as DxPriority
}
export function addTestsPayload(lines: DxTestLine[]): Schemas["AddLabTestsDto"] {
  return { tests: testLines(lines) }
}
export function reasonPayload(reason: string): { reason: string } {
  return { reason: reasonText(reason) }
}
/** PUT .../result: parameters (by key) OR a narrative, never both and never neither. */
export function resultPayload(input: DxResultInput): Schemas["EnterResultDto"] {
  const hasParams = !!input.parameters && input.parameters.length > 0
  const narrative = input.narrative?.trim()
  if (hasParams === !!narrative) throw new RangeError("Enter the parameter values or a narrative result, not both and not neither.")
  if (narrative) {
    if (narrative.length > DX_LIMITS.narrative) throw new RangeError(`The narrative is at most ${DX_LIMITS.narrative} characters.`)
    return { narrative }
  }
  return { parameters: parameterList(input.parameters ?? []) }
}
function parameterList(list: { key: string; value: string }[]): { key: string; value: string }[] {
  if (list.length > DX_LIMITS.parameters) throw new RangeError(`At most ${DX_LIMITS.parameters} parameters.`)
  const seen = new Set<string>()
  return list.map((p) => {
    const key = (p.key ?? "").trim(), value = (p.value ?? "").trim()
    if (!key || key.length > DX_LIMITS.parameterKey) throw new RangeError("A parameter key is missing or too long.")
    if (!value || value.length > DX_LIMITS.parameterValue) throw new RangeError(`The value of "${key}" is 1 to ${DX_LIMITS.parameterValue} characters.`)
    if (seen.has(key)) throw new RangeError(`"${key}" is listed twice.`)
    seen.add(key)
    return { key, value }
  })
}
export function amendLabPayload(input: DxAmendInput): Schemas["AmendResultDto"] {
  return { ...resultPayload(input), reason: reasonText(input.reason) }
}
export function remarksPayload(remarks: string | null): Schemas["LabRemarksDto"] {
  const t = remarks?.trim()
  if (!t) return { pathologistRemarks: null }
  if (t.length > DX_LIMITS.remarks) throw new RangeError(`The remarks are at most ${DX_LIMITS.remarks} characters.`)
  return { pathologistRemarks: t }
}
function reportNarrative(text: string): string {
  const t = (text ?? "").trim()
  if (!t) throw new RangeError("The report cannot be empty.")
  if (t.length > DX_LIMITS.reportNarrative) throw new RangeError(`The report is at most ${DX_LIMITS.reportNarrative} characters.`)
  return t
}
export function imagingReportPayload(narrative: string): Schemas["WriteImagingReportDto"] {
  return { narrative: reportNarrative(narrative) }
}
export function imagingAmendPayload(narrative: string, reason: string): Schemas["AmendImagingReportDto"] {
  return { narrative: reportNarrative(narrative), reason: reasonText(reason) }
}

function listQuery(options: DxListOptions, q: QueryParams): void {
  const search = options.search?.trim()
  if (search) {
    if (search.length > DX_LIMITS.search) throw new RangeError(`The search is at most ${DX_LIMITS.search} characters.`)
    q.search = search
  }
  if (options.status) { if (!DX_STATUSES.includes(options.status)) throw new RangeError("The status is not valid."); q.status = options.status }
  if (options.priority) { reqPriority(options.priority); q.priority = options.priority }
  if (options.fulfillment) { if (!DX_FULFILLMENTS.includes(options.fulfillment)) throw new RangeError("The fulfilment is not valid."); q.fulfillment = options.fulfillment }
  if (options.patientId) q.patientId = needUlid(options.patientId, "patient")
  if (options.encounterId) q.encounterId = needUlid(options.encounterId, "visit")
  if (options.doctorId) q.doctorId = needUlid(options.doctorId, "doctor")
  for (const key of ["dateFrom", "dateTo"] as const) {
    const v = options[key]
    if (v) { if (!DATE_RE.test(v)) throw new RangeError("Dates are YYYY-MM-DD."); q[key] = v }
  }
  if (options.dateFrom && options.dateTo && options.dateFrom > options.dateTo) throw new RangeError("The start date is after the end date.")
  if (options.includeArchived) q.includeArchived = true
  if (options.sort) { if (!SORT_RE.test(options.sort)) throw new RangeError("The sort is not valid."); q.sort = options.sort }
}
export function labListQuery(options: LabOrderListOptionsApi = {}): QueryParams {
  const q: QueryParams = { ...pageQuery(options.page, options.pageSize) }
  listQuery(options, q)
  if (options.toCollect) q.toCollect = true
  return q
}
export function imagingListQuery(options: ImagingOrderListOptionsApi = {}): QueryParams {
  const q: QueryParams = { ...pageQuery(options.page, options.pageSize) }
  listQuery(options, q)
  if (options.modality) { if (!DX_MODALITIES.includes(options.modality)) throw new RangeError("The modality is not valid."); q.modality = options.modality }
  if (options.toPerform) q.toPerform = true
  if (options.toReport) q.toReport = true
  return q
}

// ── Services: every write is ONE request ──

const idParam = (id: string) => ({ id: needUlid(id, "order") })
const testParams = (id: string, testId: string) => ({ id: needUlid(id, "order"), testId: needUlid(testId, "test") })

export const httpLabApiService: LabApiService = {
  async list(options, signal) { return parseLabOrderList(await callEndpoint<unknown>("labApi.list", { query: () => labListQuery(options), signal })) },
  async get(id, signal) { return parseLabOrder(await callEndpoint<unknown>("labApi.get", { params: idParam(id), signal })) },
  create(input) { return createAndParse("labApi.create", { body: () => orderPayload(input) }, (raw) => parseLabOrder(raw), "lab order") },
  addTests(orderId, tests) { return createAndParse("labApi.addTests", { params: idParam(orderId), body: () => addTestsPayload(tests) }, (raw) => parseLabOrder(raw), "tests") },
  async cancelTest(orderId, testId, reason) { return createAndParse("labApi.cancelTest", { params: testParams(orderId, testId), body: () => reasonPayload(reason) }, (raw) => parseLabOrder(raw), "change") },
  async collect(orderId, specimenId) { return createAndParse("labApi.collect", { params: { id: needUlid(orderId, "order"), specimenId: needUlid(specimenId, "specimen") } }, (raw) => parseLabOrder(raw), "change") },
  async reject(orderId, specimenId, reason) { return createAndParse("labApi.reject", { params: { id: needUlid(orderId, "order"), specimenId: needUlid(specimenId, "specimen") }, body: () => reasonPayload(reason) }, (raw) => parseLabOrder(raw), "change") },
  async enterResult(orderId, testId, input) { return createAndParse("labApi.enterResult", { params: testParams(orderId, testId), body: () => resultPayload(input) }, (raw) => parseLabOrder(raw), "change") },
  async verify(orderId, testId) { return createAndParse("labApi.verify", { params: testParams(orderId, testId) }, (raw) => parseLabOrder(raw), "change") },
  async amend(orderId, testId, input) { return createAndParse("labApi.amend", { params: testParams(orderId, testId), body: () => amendLabPayload(input) }, (raw) => parseLabOrder(raw), "change") },
  async writeRemarks(orderId, remarks) { return createAndParse("labApi.remarks", { params: idParam(orderId), body: () => remarksPayload(remarks) }, (raw) => parseLabOrder(raw), "change") },
  async deliver(orderId) { return createAndParse("labApi.deliver", { params: idParam(orderId) }, (raw) => parseLabOrder(raw), "change") },
  async report(orderId, signal) { return parseLabPrint(await callEndpoint<unknown>("labApi.report", { params: idParam(orderId), signal })) },
  async archive(orderId, reason) { return createAndParse("labApi.archive", { params: idParam(orderId), body: () => reasonPayload(reason) }, (raw) => parseLabOrder(raw), "change") },
  async restore(orderId) { return createAndParse("labApi.restore", { params: idParam(orderId) }, (raw) => parseLabOrder(raw), "change") },
  async testDefinition(testId, signal) { return parseLabTest(await callEndpoint<unknown>("labApi.testDefinition", { params: idParam(testId), signal })) },
}

export const httpImagingApiService: ImagingApiService = {
  async list(options, signal) { return parseImagingOrderList(await callEndpoint<unknown>("imagingApi.list", { query: () => imagingListQuery(options), signal })) },
  async get(id, signal) { return parseImagingOrder(await callEndpoint<unknown>("imagingApi.get", { params: idParam(id), signal })) },
  create(input) { return createAndParse("imagingApi.create", { body: () => orderPayload(input) }, (raw) => parseImagingOrder(raw), "imaging order") },
  addTests(orderId, tests) { return createAndParse("imagingApi.addTests", { params: idParam(orderId), body: () => addTestsPayload(tests) }, (raw) => parseImagingOrder(raw), "tests") },
  async cancelTest(orderId, testId, reason) { return createAndParse("imagingApi.cancelTest", { params: testParams(orderId, testId), body: () => reasonPayload(reason) }, (raw) => parseImagingOrder(raw), "change") },
  async perform(orderId, testId) { return createAndParse("imagingApi.perform", { params: testParams(orderId, testId) }, (raw) => parseImagingOrder(raw), "change") },
  async writeReport(orderId, testId, narrative) { return createAndParse("imagingApi.writeReport", { params: testParams(orderId, testId), body: () => imagingReportPayload(narrative) }, (raw) => parseImagingOrder(raw), "change") },
  async sign(orderId, testId) { return createAndParse("imagingApi.sign", { params: testParams(orderId, testId) }, (raw) => parseImagingOrder(raw), "change") },
  async amend(orderId, testId, narrative, reason) { return createAndParse("imagingApi.amend", { params: testParams(orderId, testId), body: () => imagingAmendPayload(narrative, reason) }, (raw) => parseImagingOrder(raw), "change") },
  async deliver(orderId) { return createAndParse("imagingApi.deliver", { params: idParam(orderId) }, (raw) => parseImagingOrder(raw), "change") },
  async report(orderId, signal) { return parseImagingPrint(await callEndpoint<unknown>("imagingApi.report", { params: idParam(orderId), signal })) },
  async archive(orderId, reason) { return createAndParse("imagingApi.archive", { params: idParam(orderId), body: () => reasonPayload(reason) }, (raw) => parseImagingOrder(raw), "change") },
  async restore(orderId) { return createAndParse("imagingApi.restore", { params: idParam(orderId) }, (raw) => parseImagingOrder(raw), "change") },
}
