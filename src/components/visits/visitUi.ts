import type { ClinicalDiagnosis, DiagnosisInput, PrescriptionLine, PrescriptionLineInput, VisitDetail, VisitListOptions, VisitStatus, VisitSummary, VisitType, VitalsReading } from "@/lib/services"

// Pure helpers for the encounter ("visit") screens (unit-tested). The API sends NO `allowedActions` for an encounter (unlike an appointment), so the
// buttons are derived here from the visit's type, status and archived flag AND the user's permissions (handoff 5 and 8.5). Anything the rules still
// let through that the server refuses (ENCOUNTER_RECORD_STARTED, ENCOUNTER_NOT_OPEN, ...) is explained with the backend's own message.

export const STATUS_LABEL: Record<VisitStatus, string> = { open: "Open", closed: "Closed", discharged: "Discharged", cancelled: "Cancelled" }
export const TYPE_LABEL: Record<VisitType, string> = { opd: "OPD", ipd: "IPD" }
export const CONDITION_LABEL: Record<string, string> = {
  recovered: "Recovered", improved: "Improved", stable: "Stable", left_against_medical_advice: "Left against medical advice", expired: "Expired",
}

export type VisitAction = "correct_check_in" | "record_vitals" | "edit_record" | "close" | "cancel" | "transfer" | "discharge" | "add_note" | "reopen" | "archive" | "restore"

export const ACTION_LABEL: Record<VisitAction, string> = {
  correct_check_in: "Correct check-in", record_vitals: "Record vitals", edit_record: "Clinical record", close: "Close visit", cancel: "Cancel visit", transfer: "Transfer bed",
  discharge: "Discharge", add_note: "Add note", reopen: "Reopen", archive: "Archive", restore: "Restore",
}

type Can = (permission: string) => boolean

/** One button on a visit: shown for a user who may do it; OFF with the reason while the visit's state forbids it (handoff 5: hide what the user can never do, disable what they cannot do right now). */
export type VisitActionState = { action: VisitAction; enabled: boolean; reason: string | null }

const WHY_NOT: Record<Exclude<VisitStatus, "open">, string> = {
  closed: "This visit is already closed. An administrator can reopen it.",
  discharged: "The patient has already been discharged. An administrator can reopen the admission.",
  cancelled: "This visit was cancelled.",
}

/**
 * Every action the user has the permission for, on a visit of this type, with whether the visit's state allows it right now. A permission the user lacks
 * and an action that can never apply to this kind of visit (closing an admission, transferring an OPD visit, an inpatient action with the department
 * off) are left out altogether. Archive and Restore are one toggle. The order is fixed.
 */
export function visitActionStates(v: Pick<VisitDetail, "type" | "status" | "archived">, can: Can, ipdOn: boolean): VisitActionState[] {
  const ipd = v.type === "ipd"
  const live = !v.archived && v.status === "open"
  const stateReason = v.archived ? "This visit is archived. Restore it first." : v.status === "open" ? null : WHY_NOT[v.status]
  const out: VisitActionState[] = []
  const add = (action: VisitAction, allowed: boolean, enabled: boolean, reason: string | null) => { if (allowed) out.push({ action, enabled, reason: enabled ? null : reason }) }
  add("correct_check_in", can("encounters.check_in") || can("ipd.admit") || can("encounters.correct"), live, stateReason)
  add("record_vitals", can("encounters.record_vitals"), live, stateReason)
  add("edit_record", can("encounters.write"), live, stateReason ? "The record is read-only. " + stateReason : null)
  add("close", !ipd && can("encounters.write"), live, stateReason)
  add("transfer", ipd && ipdOn && can("ipd.write"), live, stateReason)
  add("discharge", ipd && ipdOn && can("ipd.discharge"), live, stateReason)
  add("add_note", ipd && can("encounters.write"), live, stateReason)
  add("cancel", can("encounters.check_in") || can("ipd.admit") || can("encounters.write"), live, stateReason)
  const ended = !v.archived && (v.status === "closed" || v.status === "discharged")
  add("reopen", can("encounters.correct"), ended, v.archived ? stateReason : "Only a closed or discharged visit can be reopened.")
  if (v.archived) add("restore", can("encounters.archive"), true, null)
  else add("archive", can("encounters.archive"), true, null)
  return out
}

/** The actions that can be done right now: the enabled subset of `visitActionStates`. */
export function visitActions(v: Pick<VisitDetail, "type" | "status" | "archived">, can: Can, ipdOn: boolean): VisitAction[] {
  return visitActionStates(v, can, ipdOn).filter((s) => s.enabled).map((s) => s.action)
}

/** `details.missing` of a 422 CLINICAL_RECORD_INCOMPLETE as readable words. */
export function missingLabels(details: unknown): string[] {
  const missing = details && typeof details === "object" && !Array.isArray(details) ? (details as Record<string, unknown>).missing : undefined
  if (!Array.isArray(missing)) return []
  return missing.filter((m): m is string => typeof m === "string").map((m) => {
    const words = m.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").trim().toLowerCase()
    return words === "primary diagnosis" ? "a primary diagnosis" : words
  })
}

/** "120/80 mmHg", "72 bpm", "98.6 °F" ... only what was measured. */
export function vitalsSummary(v: Pick<VitalsReading, "bpSystolic" | "bpDiastolic" | "pulse" | "temperatureF" | "weightKg" | "heightCm" | "spo2" | "rbs" | "bmi">): string[] {
  const out: string[] = []
  if (v.bpSystolic !== null && v.bpDiastolic !== null) out.push(`${v.bpSystolic}/${v.bpDiastolic} mmHg`)
  else if (v.bpSystolic !== null) out.push(`${v.bpSystolic}/? mmHg`)
  else if (v.bpDiastolic !== null) out.push(`?/${v.bpDiastolic} mmHg`)
  if (v.pulse !== null) out.push(`${v.pulse} bpm`)
  if (v.temperatureF !== null) out.push(`${v.temperatureF} °F`)
  if (v.spo2 !== null) out.push(`SpO₂ ${v.spo2}%`)
  if (v.weightKg !== null) out.push(`${v.weightKg} kg`)
  if (v.heightCm !== null) out.push(`${v.heightCm} cm`)
  if (v.bmi !== null) out.push(`BMI ${v.bmi}`)
  if (v.rbs !== null) out.push(`RBS ${v.rbs} mg/dL`)
  return out
}

/** The token as shown in the queue ("#7"), or a dash when the visit has none (an admission). */
export const tokenLabel = (v: Pick<VisitSummary, "tokenNo">): string => (v.tokenNo === null ? "—" : `#${v.tokenNo}`)

// ── Diagnoses: the screen's rows <-> the API's diagnoses ──

export interface DiagnosisRow { key: string; icdCodeId?: string; code?: string; text: string; isPrimary: boolean }
let rowKey = 0
export const newKey = (): string => `r${++rowKey}`

export function diagnosisRowsOf(list: readonly ClinicalDiagnosis[]): DiagnosisRow[] {
  return list.map((d) => ({ key: newKey(), icdCodeId: d.icdCode?.id, code: d.icdCode?.code, text: d.text, isPrimary: d.isPrimary }))
}
/**
 * Rows to the API's { icdCodeId?, text?, isPrimary }. A coded row sends the code only (the server holds its name); a free-text row sends its text.
 * Blank rows are dropped. The exactly-one-primary rule is kept by addDiagnosis / removeDiagnosis / withPrimary below, and checked again before sending.
 */
export function diagnosisInputsOf(rows: readonly DiagnosisRow[]): DiagnosisInput[] {
  const kept = rows.filter((r) => r.icdCodeId || r.text.trim())
  return kept.map((r) => (r.icdCodeId ? { icdCodeId: r.icdCodeId, isPrimary: r.isPrimary } : { text: r.text.trim(), isPrimary: r.isPrimary }))
}
/** Adds a row; the first row of a list is the primary diagnosis. */
export function addDiagnosis(rows: readonly DiagnosisRow[], row: Omit<DiagnosisRow, "key" | "isPrimary">): DiagnosisRow[] {
  return [...rows, { ...row, key: newKey(), isPrimary: rows.length === 0 }]
}
/** Removes a row; if it was the primary one, the first remaining row becomes primary. */
export function removeDiagnosis(rows: readonly DiagnosisRow[], key: string): DiagnosisRow[] {
  const left = rows.filter((r) => r.key !== key)
  return left.length > 0 && !left.some((r) => r.isPrimary) ? left.map((r, i) => ({ ...r, isPrimary: i === 0 })) : left
}
/** Marks exactly one row primary (the chosen one). */
export function withPrimary(rows: readonly DiagnosisRow[], key: string): DiagnosisRow[] {
  return rows.map((r) => ({ ...r, isPrimary: r.key === key }))
}

// ── Prescription: the screen's rows <-> the API's lines ──

export interface RxRow { key: string; id?: string; medicineId?: string; medicineText: string; dose: string; route: string; frequency: string; duration: string; quantity: string; instructions: string }
export const emptyRx = (): RxRow => ({ key: newKey(), medicineText: "", dose: "", route: "", frequency: "", duration: "", quantity: "", instructions: "" })
export function rxRowsOf(lines: readonly PrescriptionLine[]): RxRow[] {
  return lines.map((l) => ({
    key: newKey(), id: l.id, medicineId: l.medicineId ?? undefined, medicineText: l.medicineText, dose: l.dose ?? "", route: l.route ?? "", frequency: l.frequency ?? "", duration: l.duration ?? "",
    quantity: l.quantity === null ? "" : String(l.quantity), instructions: l.instructions ?? "",
  }))
}
/**
 * Rows to the API's lines. An existing line keeps its `id` (a line without one is new; a line left out is removed). A NEW row with no medicine name
 * and nothing else is just an empty row and is dropped; an existing line the user blanked is kept, so the server (or the validation) answers for it.
 */
export function rxInputsOf(rows: readonly RxRow[]): PrescriptionLineInput[] {
  const kept = rows.filter((r) => r.id || r.medicineId || r.medicineText.trim() || r.dose.trim() || r.frequency.trim() || r.duration.trim() || r.instructions.trim() || r.quantity.trim())
  return kept.map((r) => {
    const out: PrescriptionLineInput = {}
    if (r.id) out.id = r.id
    if (r.medicineId) out.medicineId = r.medicineId
    if (r.medicineText.trim()) out.medicineText = r.medicineText
    for (const k of ["dose", "route", "frequency", "duration", "instructions"] as const) if (r[k].trim()) out[k] = r[k]
    if (r.quantity.trim()) out.quantity = Number(r.quantity)
    return out
  })
}

// ── The list screen's tabs ──

export const TABS = ["queue", "all", "pending", "admitted", "beds"] as const
export type Tab = (typeof TABS)[number]
export const TAB_LABEL: Record<Tab, string> = { queue: "Today's queue", all: "All visits", pending: "To finish", admitted: "Admitted", beds: "Bed board" }

/** The request each tab stands for (handoff 8.5): a doctor's queue is today's OPEN visits in token order; "to finish" is the doctor's pending list. */
export function tabQuery(tab: Tab, today: string, f: { doctorId?: string; type?: VisitType; status?: VisitStatus; from?: string; to?: string; archived: boolean }): Omit<VisitListOptions, "page" | "pageSize" | "search" | "signal"> {
  if (tab === "queue") return { dateFrom: today, dateTo: today, status: "open", sort: "tokenNo:asc", doctorId: f.doctorId, type: f.type }
  if (tab === "pending") return { pending: true, doctorId: f.doctorId }
  if (tab === "admitted") return { admitted: true, type: "ipd", status: "open" }
  return { type: f.type, status: f.status, doctorId: f.doctorId, dateFrom: f.from, dateTo: f.to, includeArchived: f.archived || undefined }
}
