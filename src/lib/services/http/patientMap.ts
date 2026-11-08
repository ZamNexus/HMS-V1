import { isApiError, type QueryParams } from "@/lib/api/client"
import type { Schemas } from "@/lib/api/contract"
import { isUlid } from "@/lib/api/convert"
import { NotConnectedError } from "../errors"
import { ageParts, localToday } from "../patientFormat"
import type { DuplicateMatch, PatientCoverage, PatientInput, PatientListOptions, PatientRecord } from "../types"
import { asObj, optDate, optDecimalString, optStr, pageQuery, parsePage, reqBool, reqDate, reqEnum, reqStr, reqUlid, type Obj } from "./wire"
import type { ListResult } from "../types"

// Patients (handoff 8.3; docs/openapi.json PatientPageDto / PatientDetailDto / CreatePatientDto / UpdatePatientDto / DuplicateCheckDto / RecordDeathDto).
// Conventions: ids are ULIDs; dates stay YYYY-MM-DD text; money (the list `balance`) stays exact text; malformed data throws, never renders as blank.

const GENDER_FROM_WIRE = { male: "Male", female: "Female", other: "Other" } as const
const GENDER_TO_WIRE = { Male: "male", Female: "female", Other: "other" } as const
const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// ── Limits the contract states (docs/openapi.json CreatePatientDto) ──
export const PATIENT_LIMITS = {
  fatherName: 120, address: 300, area: 120, city: 80, referredBy: 120, guardianName: 120, guardianRelationText: 60, medicalRecordNo: 60, remarks: 500,
  phoneMin: 4, phoneMax: 30, memberNo: 60, principalMemberName: 120, principalRelation: 60, search: 100,
} as const
export const PHONE_RE = /^\+?[\d\s()./-]+$/
export const CNIC_RE = /^\d{5}-?\d{7}-?\d$/

// ── GET /patients ──

/**
 * GET /patients query. `search` matches name, MR number, phone or CNIC on the server (never put it in the address bar). The demo's status
 * filter has no 1:1 field: "ipd" -> admitted=true, "active" -> admitted=false. "inactive" (= archived) cannot be asked for alone: the API has
 * includeArchived, which returns live and archived patients together, so the screen offers that instead and this refuses the old filter.
 * No `sort` is sent: the server's default is registrationDate:desc and the handoff lists no other value.
 */
export function patientListQuery(params: Pick<PatientListOptions, "search" | "status" | "page" | "pageSize" | "gender" | "panelId" | "selfPay" | "registeredFrom" | "registeredTo" | "includeArchived">): QueryParams {
  if (params.status === "inactive") throw new NotConnectedError("patients.list filter \"Inactive\" (the API has includeArchived, not an archived-only filter)")
  const search = params.search?.trim()
  if (search && search.length > PATIENT_LIMITS.search) throw new RangeError(`The search text can be at most ${PATIENT_LIMITS.search} characters.`)
  if (params.panelId !== undefined && !isUlid(params.panelId)) throw new TypeError("The organisation id is not a valid backend id.")
  for (const d of [params.registeredFrom, params.registeredTo]) if (d !== undefined && !DATE_RE.test(d)) throw new TypeError("Registration dates must be YYYY-MM-DD.")
  return {
    ...pageQuery(params.page, params.pageSize),
    search: search || undefined,
    admitted: params.status === "ipd" ? true : params.status === "active" ? false : undefined,
    gender: params.gender ? GENDER_TO_WIRE[params.gender] : undefined,
    panelId: params.panelId,
    selfPay: params.selfPay,
    registeredFrom: params.registeredFrom,
    registeredTo: params.registeredTo,
    includeArchived: params.includeArchived ? true : undefined,
  }
}

// ── Reading a patient ──

function coverageOf(raw: unknown, what: string): PatientCoverage {
  const c = asObj(raw, what)
  const panel = asObj(c.panel, `${what}.panel`)
  return {
    panelId: reqUlid(panel, "id", `${what}.panel`),
    panelName: reqStr(panel, "name", `${what}.panel`),
    priority: reqEnum(c, "priority", what, ["primary", "secondary"]),
    memberNo: optStr(c, "memberNo", what) ?? "",
    principalMemberName: optStr(c, "principalMemberName", what) ?? "",
    principalRelation: optStr(c, "principalRelation", what) ?? "",
    validFrom: optDate(c, "validFrom", what) ?? "",
    validTo: optDate(c, "validTo", what) ?? "",
    benefitsApply: typeof c.benefitsApply === "boolean" ? c.benefitsApply : undefined,
  }
}

function patientCore(o: Obj, what: string, dto: string): PatientRecord {
  const archived = reqBool(o, "archived", what)
  const admitted = reqBool(o, "admitted", what)
  const dob = reqDate(o, "dob", what)
  const deceasedOn = optDate(o, "deceasedOn", what) ?? null
  const listPanel = o.primaryPanel === null || o.primaryPanel === undefined ? undefined : asObj(o.primaryPanel, `${what}.primaryPanel`)
  const coverages = Array.isArray(o.coverages) ? o.coverages.map((c, i) => coverageOf(c, `${what}.coverages[${i}]`)) : undefined
  const primary = coverages?.find((c) => c.priority === "primary")
  const guardian = o.guardianRelation === null || o.guardianRelation === undefined ? undefined : asObj(o.guardianRelation, `${what}.guardianRelation`)
  let balance: string | null | undefined
  if ("balance" in o) balance = o.balance === null ? null : (optDecimalString(o, "balance", what, dto) ?? null)
  const lastVisit = optDate(o, "lastVisitDate", what)
  return {
    id: reqUlid(o, "id", what),
    mrNo: reqStr(o, "mrNo", what),
    name: reqStr(o, "name", what),
    fatherName: optStr(o, "fatherName", what, dto) ?? "",
    dob,
    // The legacy screens read `age`; the browser's date is the best a mapper has. Phase 5 screens show formatPatientAge(…, hospital today) instead.
    age: ageParts(dob, localToday())?.years ?? 0,
    gender: GENDER_FROM_WIRE[reqEnum(o, "gender", what, ["male", "female", "other"])],
    phone: reqStr(o, "phone", what),
    emergencyContact: optStr(o, "emergencyContact", what, dto),
    email: optStr(o, "email", what, dto),
    address: optStr(o, "address", what, dto) ?? "",
    area: optStr(o, "area", what, dto),
    city: optStr(o, "city", what, dto) ?? "",
    country: optStr(o, "country", what, dto),
    // The list DTO has no blood group or guardian relation (only the detail DTO does): the list shows nothing for them.
    bloodGroup: o.bloodGroup === null || o.bloodGroup === undefined || o.bloodGroup === "" ? "Unknown" : reqEnum(o, "bloodGroup", what, BLOOD_GROUPS),
    cnic: optStr(o, "cnic", what, dto) ?? "",
    guardianRelation: guardian ? reqStr(guardian, "name", `${what}.guardianRelation`) : "",
    // a relation typed as free text (guardianRelationText) comes back as { id: null, name }: the patient is still readable, there is just no catalogue entry
    guardianRelationId: guardian && guardian.id !== null ? reqUlid(guardian, "id", `${what}.guardianRelation`) : null,
    guardianName: optStr(o, "guardianName", what, dto),
    // The demo model has ONE panel: the primary one. The list carries `primaryPanel`; the detail carries `coverages`.
    panelId: listPanel ? reqUlid(listPanel, "id", `${what}.primaryPanel`) : (primary?.panelId ?? null),
    primaryPanelName: listPanel ? reqStr(listPanel, "name", `${what}.primaryPanel`) : primary?.panelName,
    coverages,
    referredBy: optStr(o, "referredBy", what, dto),
    remarks: optStr(o, "remarks", what, dto),
    medicalRecordNo: optStr(o, "medicalRecordNo", what, dto),
    // archived -> "inactive" ("What the screens call Inactive or Delete"); admitted -> "ipd". A death is shown through `deceasedOn`.
    status: archived ? "inactive" : admitted ? "ipd" : "active",
    registrationDate: reqDate(o, "registrationDate", what),
    photoUrl: optStr(o, "photoUrl", what, dto),
    version: o.updatedAt === undefined ? undefined : reqStr(o, "updatedAt", what),
    dobEstimated: typeof o.dobEstimated === "boolean" ? o.dobEstimated : undefined,
    deceasedOn,
    archived,
    admitted,
    lastVisitDate: lastVisit ?? null,
    balance,
  }
}

export function parsePatientList(raw: unknown): ListResult<PatientRecord> {
  return parsePage(raw, "patients", (item) => patientCore(asObj(item, "patients[]"), "patients[]", "PatientPageDto_Output"))
}
export function parsePatient(raw: unknown): PatientRecord {
  return patientCore(asObj(raw, "patient"), "patient", "PatientDetailDto_Output")
}

// ── GET /patients/duplicates and the 409 POSSIBLE_DUPLICATE answer ──

export function duplicateQuery(params: { phone?: string; cnic?: string }): QueryParams | null {
  const phone = params.phone?.trim()
  const cnic = params.cnic?.trim()
  const out: QueryParams = {}
  if (phone && phone.length >= PATIENT_LIMITS.phoneMin && phone.length <= PATIENT_LIMITS.phoneMax && PHONE_RE.test(phone)) out.phone = phone
  if (cnic && CNIC_RE.test(cnic)) out.cnic = cnic
  return Object.keys(out).length === 0 ? null : out // nothing checkable yet: no request
}

function matchOf(raw: unknown, what: string): DuplicateMatch {
  const m = asObj(raw, what)
  return {
    id: reqUlid(m, "id", what),
    mrNo: reqStr(m, "mrNo", what),
    name: reqStr(m, "name", what),
    fatherName: optStr(m, "fatherName", what) ?? "",
    gender: GENDER_FROM_WIRE[reqEnum(m, "gender", what, ["male", "female", "other"])],
    dob: reqDate(m, "dob", what),
    phone: reqStr(m, "phone", what),
    cnic: optStr(m, "cnic", what) ?? "",
    deceasedOn: optDate(m, "deceasedOn", what) ?? null,
    archived: reqBool(m, "archived", what),
    matchedOn: Array.isArray(m.matchedOn) ? m.matchedOn.filter((v): v is string => typeof v === "string") : [],
  }
}

export function parseDuplicateMatches(raw: unknown): DuplicateMatch[] {
  const o = asObj(raw, "duplicate check")
  if (!Array.isArray(o.matches)) throw new TypeError("Unexpected response: duplicate check.matches is not an array.")
  return o.matches.map((m, i) => matchOf(m, `duplicate check.matches[${i}]`))
}

/** The matches of a `409 POSSIBLE_DUPLICATE` answer (`details.matches`), or null when the error is another one or the details are unreadable. */
export function duplicateMatchesOf(err: unknown): DuplicateMatch[] | null {
  if (!isApiError(err) || err.status !== 409 || err.code !== "POSSIBLE_DUPLICATE") return null
  const details = err.body?.details
  if (!details || typeof details !== "object" || Array.isArray(details)) return null
  try {
    return parseDuplicateMatches({ matches: (details as Obj).matches })
  } catch {
    return null
  }
}

// ── POST /patients ──

const trimmed = (v: string | undefined | null): string | undefined => {
  const t = v?.trim()
  return t ? t : undefined
}

function checkLimits(input: PatientInput): void {
  const tooLong = (v: string | undefined, max: number, label: string) => {
    if (v !== undefined && v.trim().length > max) throw new RangeError(`${label} can be at most ${max} characters.`)
  }
  tooLong(input.fatherName, PATIENT_LIMITS.fatherName, "Father/husband name")
  tooLong(input.address, PATIENT_LIMITS.address, "Address")
  tooLong(input.area, PATIENT_LIMITS.area, "Area")
  tooLong(input.city, PATIENT_LIMITS.city, "City")
  tooLong(input.referredBy, PATIENT_LIMITS.referredBy, "Referred by")
  tooLong(input.guardianName, PATIENT_LIMITS.guardianName, "Guardian name")
  tooLong(input.medicalRecordNo, PATIENT_LIMITS.medicalRecordNo, "Medical record number")
  tooLong(input.remarks, PATIENT_LIMITS.remarks, "Remarks")
  const phone = input.phone.trim()
  if (phone.length < PATIENT_LIMITS.phoneMin || phone.length > PATIENT_LIMITS.phoneMax || !PHONE_RE.test(phone)) throw new RangeError("The phone number needs 4 to 30 digits, spaces or + ( ) . / -.")
  const cnic = trimmed(input.cnic)
  if (cnic !== undefined && !CNIC_RE.test(cnic)) throw new RangeError("The CNIC must be 13 digits, for example 12345-1234567-1.")
  const emergency = trimmed(input.emergencyContact)
  if (emergency !== undefined && (emergency.length < PATIENT_LIMITS.phoneMin || emergency.length > PATIENT_LIMITS.phoneMax || !PHONE_RE.test(emergency))) throw new RangeError("The emergency contact needs 4 to 30 digits, spaces or + ( ) . / -.")
}

function coverageBody(c: PatientCoverage): NonNullable<Schemas["CreatePatientDto"]["coverages"]>[number] {
  if (!isUlid(c.panelId)) throw new TypeError("The organisation id is not a valid backend id.")
  const out: NonNullable<Schemas["CreatePatientDto"]["coverages"]>[number] = { panelId: c.panelId, priority: c.priority }
  const put = (k: "memberNo" | "principalMemberName" | "principalRelation" | "validFrom" | "validTo", v: string) => { const t = trimmed(v); if (t !== undefined) out[k] = t }
  put("memberNo", c.memberNo)
  put("principalMemberName", c.principalMemberName)
  put("principalRelation", c.principalRelation)
  put("validFrom", c.validFrom)
  put("validTo", c.validTo)
  return out
}

/** The whole coverage set the input stands for: its `coverages`, or the single primary `panelId` of the older form. */
export function coverageSetOf(input: Pick<PatientInput, "coverages" | "panelId">): PatientCoverage[] {
  const set = input.coverages ?? (input.panelId ? [{ panelId: input.panelId, priority: "primary" as const, memberNo: "", principalMemberName: "", principalRelation: "", validFrom: "", validTo: "" }] : [])
  const primaries = set.filter((c) => c.priority === "primary").length
  const secondaries = set.filter((c) => c.priority === "secondary").length
  if (primaries > 1 || secondaries > 1) throw new RangeError("A patient can have at most one primary and one secondary organisation.")
  if (secondaries === 1 && primaries === 0) throw new RangeError("Choose the primary organisation before a secondary one.")
  if (set.length === 2 && set[0].panelId === set[1].panelId) throw new RangeError("The primary and secondary organisation must be different.")
  return set
}

export type CreatePatientBody = Schemas["CreatePatientDto"]

/**
 * POST /patients body. Exactly one of `dob` and `estimatedAge`. Not sent, on purpose: `photoUrl` (a browser data URL; the DTO has no such field
 * and file storage is not built), `ssEmpNo` (no such field), the MR number, the registration date and the age (the server issues or derives them).
 * A catalogued guardian relation travels as `guardianRelationId`; the free-text form is used only when no catalogue entry was chosen.
 */
export function patientCreatePayload(input: PatientInput): CreatePatientBody {
  const gender = GENDER_TO_WIRE[input.gender]
  if (!gender) throw new TypeError("Unsupported gender value.")
  const name = input.name.trim()
  if (name.length < 2) throw new RangeError("The name needs at least 2 characters.")
  const dob = trimmed(input.dob)
  const age = input.estimatedAge ?? null
  if ((dob === undefined) === (age === null)) throw new RangeError("Give the date of birth or an estimated age, not both and not neither.")
  if (dob !== undefined && !DATE_RE.test(dob)) throw new TypeError("The date of birth must be YYYY-MM-DD.")
  if (age !== null && (!Number.isInteger(age.value) || age.value < 0 || (age.unit !== "years" && age.unit !== "months"))) throw new RangeError("The estimated age must be a whole number of years or months.")
  checkLimits(input)
  const body: CreatePatientBody = { name, gender, phone: input.phone.trim() }
  const put = <K extends keyof CreatePatientBody>(k: K, v: CreatePatientBody[K] | undefined) => { if (v !== undefined) body[k] = v }
  if (dob !== undefined) body.dob = dob
  if (age !== null) body.estimatedAge = { value: age.value, unit: age.unit }
  put("fatherName", trimmed(input.fatherName))
  put("cnic", trimmed(input.cnic))
  put("emergencyContact", trimmed(input.emergencyContact))
  put("email", trimmed(input.email))
  put("address", trimmed(input.address))
  put("area", trimmed(input.area))
  put("city", trimmed(input.city))
  put("country", trimmed(input.country))
  if (input.bloodGroup !== "Unknown") body.bloodGroup = input.bloodGroup
  const relationText = trimmed(input.guardianRelation)
  if (input.guardianRelationId) {
    if (!isUlid(input.guardianRelationId)) throw new TypeError("The guardian relation id is not a valid backend id.")
    body.guardianRelationId = input.guardianRelationId
  } else if (relationText !== undefined && relationText !== "Self") {
    if (relationText.length > PATIENT_LIMITS.guardianRelationText) throw new RangeError("The relation can be at most 60 characters.")
    body.guardianRelationText = relationText
  }
  put("guardianName", trimmed(input.guardianName))
  put("referredBy", trimmed(input.referredBy))
  put("remarks", trimmed(input.remarks))
  put("medicalRecordNo", trimmed(input.medicalRecordNo))
  const set = coverageSetOf(input)
  if (set.length > 0) body.coverages = set.map(coverageBody)
  if (input.acknowledgeDuplicates === true) body.acknowledgeDuplicates = true
  return body
}

// ── PATCH /patients/{id}: only what changed ──

/**
 * UpdatePatientDto, except that email and country are plain text here: the JSON types both as "array of string" (a spec bug, recorded in
 * docs/SPEC_BUGS_FOR_BACKEND.md) and a plain string (or "" to clear) is what the API's own description says it takes.
 */
export type UpdatePatientBody = Omit<Schemas["UpdatePatientDto"], "email" | "country"> & { email?: string; country?: string }

const sameText = (a: string | undefined | null, b: string | undefined | null) => (a ?? "").trim() === (b ?? "").trim()

function coverageKey(c: PatientCoverage): string {
  return [c.priority, c.panelId, c.memberNo.trim(), c.principalMemberName.trim(), c.principalRelation.trim(), c.validFrom.trim(), c.validTo.trim()].join("|")
}
const coverageSetKey = (set: readonly PatientCoverage[]) => [...set].map(coverageKey).sort().join("\n")

/**
 * The PATCH body: ONLY the fields that differ from `base` (the record the form was loaded with), plus `expectedUpdatedAt` = its version so the
 * server refuses an edit of a record someone else saved since. An emptied optional field is sent as null (`email` and `country` as ""). Sending
 * `coverages` REPLACES the whole set (`[]` = self-pay), so when the coverage differs the full objects are sent back, member details included.
 * Returns {} when nothing differs: the caller sends nothing.
 */
export function patientUpdatePayload(input: PatientInput, base: PatientRecord): UpdatePatientBody {
  const gender = GENDER_TO_WIRE[input.gender]
  if (!gender) throw new TypeError("Unsupported gender value.")
  checkLimits(input)
  const body: UpdatePatientBody = {}
  const clearable = <K extends "fatherName" | "cnic" | "emergencyContact" | "address" | "area" | "city" | "guardianName" | "referredBy" | "remarks" | "medicalRecordNo">(k: K, was: string | undefined) => {
    const now = input[k] as string | undefined
    if (!sameText(now, was)) (body as Record<string, unknown>)[k] = trimmed(now) ?? null
  }
  if (!sameText(input.name, base.name)) {
    if (input.name.trim().length < 2) throw new RangeError("The name needs at least 2 characters.")
    body.name = input.name.trim()
  }
  if (gender !== GENDER_TO_WIRE[base.gender]) body.gender = gender
  if (!sameText(input.phone, base.phone)) body.phone = input.phone.trim()
  clearable("fatherName", base.fatherName)
  clearable("cnic", base.cnic)
  clearable("emergencyContact", base.emergencyContact)
  clearable("address", base.address)
  clearable("area", base.area)
  clearable("city", base.city)
  clearable("guardianName", base.guardianName)
  clearable("referredBy", base.referredBy)
  clearable("remarks", base.remarks)
  clearable("medicalRecordNo", base.medicalRecordNo)
  // email / country: the spec types them as arrays (a spec bug): never send null or an array, a plain string or "" to clear
  if (!sameText(input.email, base.email)) body.email = trimmed(input.email) ?? ""
  if (!sameText(input.country, base.country)) body.country = trimmed(input.country) ?? ""
  if (input.bloodGroup !== base.bloodGroup) body.bloodGroup = input.bloodGroup === "Unknown" ? null : input.bloodGroup
  // date of birth or an estimated age (never both)
  if (input.estimatedAge) body.estimatedAge = { value: input.estimatedAge.value, unit: input.estimatedAge.unit }
  else if (trimmed(input.dob) && input.dob.trim() !== base.dob) body.dob = input.dob.trim()
  // guardian relation: the catalogue id when one was chosen, otherwise free text
  // (the form passes the id of the catalogue entry it chose, or the record's own id while the name is unchanged)
  const nextRelationId = input.guardianRelationId ?? null
  const baseRelationId = base.guardianRelationId ?? null
  const nextRelationText = trimmed(input.guardianRelation)
  if (nextRelationId !== null) {
    if (!isUlid(nextRelationId)) throw new TypeError("The guardian relation id is not a valid backend id.")
    if (nextRelationId !== baseRelationId) body.guardianRelationId = nextRelationId
  } else if (nextRelationText !== undefined && nextRelationText !== "Self") {
    if (nextRelationText.length > PATIENT_LIMITS.guardianRelationText) throw new RangeError("The relation can be at most 60 characters.")
    if (!sameText(nextRelationText, base.guardianRelation)) body.guardianRelationText = nextRelationText
  } else if (baseRelationId !== null) {
    body.guardianRelationId = null // "none" was chosen: clear the relation
  }
  const nextSet = coverageSetOf(input)
  const wasSet = base.coverages ?? (base.panelId ? [{ panelId: base.panelId, priority: "primary" as const, memberNo: "", principalMemberName: "", principalRelation: "", validFrom: "", validTo: "" }] : [])
  if (coverageSetKey(nextSet) !== coverageSetKey(wasSet)) body.coverages = nextSet.map(coverageBody)
  if (Object.keys(body).length > 0 && base.version) body.expectedUpdatedAt = base.version
  return body
}

/** True when `patientUpdatePayload` would send anything. */
export function patientHasChanges(input: PatientInput, base: PatientRecord): boolean {
  return Object.keys(patientUpdatePayload(input, base)).length > 0
}

// ── POST /patients/{id}/record-death ──

export type RecordDeathBody = Schemas["RecordDeathDto"]
export function recordDeathPayload(deceasedOn: string, today?: string): RecordDeathBody {
  const d = deceasedOn.trim()
  if (!DATE_RE.test(d) || Number.isNaN(Date.parse(d))) throw new TypeError("The date of death must be YYYY-MM-DD.")
  if (today !== undefined && d > today) throw new RangeError("The date of death cannot be in the future.")
  return { deceasedOn: d }
}
