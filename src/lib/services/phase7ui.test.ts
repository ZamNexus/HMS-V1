import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import {
  ACTION_LABEL, addDiagnosis, diagnosisInputsOf, diagnosisRowsOf, emptyRx, missingLabels, removeDiagnosis, rxInputsOf, rxRowsOf, tabQuery, tokenLabel, visitActions, visitActionStates, vitalsSummary, withPrimary,
  type VisitAction,
} from "@/components/visits/visitUi"
import { clinicalRecordPayload, VISIT_LIMITS } from "./http/visits"
import type { ClinicalDiagnosis, PrescriptionLine, VisitStatus, VisitType } from "./types"

// Phase 7 screens: the rules that decide what is shown (the API sends no allowedActions for an encounter), the conversions between the screen's rows and
// the API's diagnoses and prescription lines, and the wiring of the screens. Pure logic is tested directly; the rest is checked in the source.

const root = process.cwd()
const read = (rel: string) => readFileSync(path.resolve(root, rel), "utf8")
const ICD = "01HZXGGGGGGGGGGGGGGGGGGGGG"
const LINE = "01HZXHHHHHHHHHHHHHHHHHHHHH"

const PERMISSIONS = ["encounters.check_in", "ipd.admit", "encounters.correct", "encounters.record_vitals", "encounters.write", "ipd.write", "ipd.discharge", "encounters.archive"] as const
const subsets = (): string[][] => {
  const out: string[][] = []
  for (let m = 0; m < 1 << PERMISSIONS.length; m++) out.push(PERMISSIONS.filter((_, i) => m & (1 << i)))
  return out
}

describe("which buttons a visit shows", () => {
  const can = (list: readonly string[]) => (p: string) => list.includes(p)
  const ALL = [...PERMISSIONS]

  it("an OPD visit that is open, with every permission: correct, vitals, record, close, cancel, archive — and nothing from the ward", () => {
    expect(visitActions({ type: "opd", status: "open", archived: false }, can(ALL), true)).toEqual(["correct_check_in", "record_vitals", "edit_record", "close", "cancel", "archive"])
  })
  it("an admission that is open, with every permission and the inpatient department on: no 'close', but transfer, discharge and notes", () => {
    expect(visitActions({ type: "ipd", status: "open", archived: false }, can(ALL), true)).toEqual(["correct_check_in", "record_vitals", "edit_record", "transfer", "discharge", "add_note", "cancel", "archive"])
  })
  it("with the inpatient department off, an admission cannot be transferred or discharged (the server answers MODULE_DISABLED), but its record and notes remain", () => {
    const a = visitActions({ type: "ipd", status: "open", archived: false }, can(ALL), false)
    expect(a).not.toContain("transfer")
    expect(a).not.toContain("discharge")
    expect(a).toContain("add_note")
  })
  it("a closed or discharged visit can be reopened by an administrator and archived; nothing else", () => {
    expect(visitActions({ type: "opd", status: "closed", archived: false }, can(ALL), true)).toEqual(["reopen", "archive"])
    expect(visitActions({ type: "ipd", status: "discharged", archived: false }, can(ALL), true)).toEqual(["reopen", "archive"])
    expect(visitActions({ type: "opd", status: "closed", archived: false }, can(["encounters.write"]), true)).toEqual([])
  })
  it("a cancelled visit can only be archived; an archived one only restored", () => {
    expect(visitActions({ type: "opd", status: "cancelled", archived: false }, can(ALL), true)).toEqual(["archive"])
    expect(visitActions({ type: "opd", status: "open", archived: true }, can(ALL), true)).toEqual(["restore"])
    expect(visitActions({ type: "ipd", status: "discharged", archived: true }, can(["encounters.write"]), true)).toEqual([])
  })
  it("the front desk (check-in only) can correct and cancel but sees no record, vitals or close", () => {
    expect(visitActions({ type: "opd", status: "open", archived: false }, can(["encounters.check_in"]), true)).toEqual(["correct_check_in", "cancel"])
  })
  it("handoff 5: an action the user may do but the visit's state forbids is shown OFF with the reason; one they may never do, or that never applies, is not shown", () => {
    // a doctor on a closed OPD visit: record, close and cancel are off with a reason, not gone
    const doctor = visitActionStates({ type: "opd", status: "closed", archived: false }, can(["encounters.write"]), true)
    expect(doctor.map((s) => [s.action, s.enabled])).toEqual([["edit_record", false], ["close", false], ["cancel", false]])
    expect(doctor.every((s) => typeof s.reason === "string" && s.reason.length > 10)).toBe(true)
    expect(doctor.find((s) => s.action === "close")?.reason).toMatch(/already closed/)
    // the administrator on an open visit: Reopen is off ("only a closed or discharged visit"), Archive is on
    const admin = visitActionStates({ type: "opd", status: "open", archived: false }, can(ALL), true)
    expect(admin.find((s) => s.action === "reopen")).toEqual({ action: "reopen", enabled: false, reason: "Only a closed or discharged visit can be reopened." })
    expect(admin.find((s) => s.action === "archive")).toEqual({ action: "archive", enabled: true, reason: null })
    // never applicable: an admission has no Close, an OPD visit has no ward actions, an inpatient action with the department off is not offered
    expect(visitActionStates({ type: "ipd", status: "open", archived: false }, can(ALL), true).some((s) => s.action === "close")).toBe(false)
    expect(visitActionStates({ type: "opd", status: "open", archived: false }, can(ALL), true).some((s) => ["transfer", "discharge", "add_note"].includes(s.action))).toBe(false)
    expect(visitActionStates({ type: "ipd", status: "open", archived: false }, can(ALL), false).some((s) => s.action === "transfer" || s.action === "discharge")).toBe(false)
    // archived: everything else is off with the reason, Restore is on
    const archived = visitActionStates({ type: "opd", status: "open", archived: true }, can(ALL), true)
    expect(archived.filter((s) => s.enabled).map((s) => s.action)).toEqual(["restore"])
    expect(archived.filter((s) => !s.enabled).every((s) => /archived/.test(s.reason ?? ""))).toBe(true)
  })
  it("property: every offered action is permitted; every OFF action has a reason and every ON action has none; ON ones are exactly visitActions", () => {
    const need: Record<VisitAction, string[]> = {
      correct_check_in: ["encounters.check_in", "ipd.admit", "encounters.correct"], record_vitals: ["encounters.record_vitals"], edit_record: ["encounters.write"], close: ["encounters.write"],
      cancel: ["encounters.check_in", "ipd.admit", "encounters.write"], transfer: ["ipd.write"], discharge: ["ipd.discharge"], add_note: ["encounters.write"], reopen: ["encounters.correct"],
      archive: ["encounters.archive"], restore: ["encounters.archive"],
    }
    for (const type of ["opd", "ipd"] as VisitType[]) for (const status of ["open", "closed", "discharged", "cancelled"] as VisitStatus[]) for (const archived of [false, true]) for (const ipdOn of [false, true]) for (const perms of subsets()) {
      const states = visitActionStates({ type, status, archived }, can(perms), ipdOn)
      const where = `${type}/${status}/${archived ? "archived" : "live"}/ipd=${ipdOn}/${perms.join(",")}`
      for (const s of states) {
        expect(need[s.action].some((p) => perms.includes(p)), `permission ${s.action} ${where}`).toBe(true)
        if (s.enabled) expect(s.reason, `${s.action} ${where}`).toBeNull()
        else expect(typeof s.reason === "string" && s.reason.length > 0, `reason ${s.action} ${where}`).toBe(true)
      }
      expect(states.filter((s) => s.enabled).map((s) => s.action), where).toEqual(visitActions({ type, status, archived }, can(perms), ipdOn))
      expect(new Set(states.map((s) => s.action)).size, "no action twice " + where).toBe(states.length)
    }
  })
  it("a nurse (vitals only) can record vitals and nothing else", () => {
    expect(visitActions({ type: "opd", status: "open", archived: false }, can(["encounters.record_vitals"]), true)).toEqual(["record_vitals"])
  })
  it("property: for every type, status, archived flag, module state and permission set, an action is shown only when its permission is held and its state allows it", () => {
    for (const type of ["opd", "ipd"] as VisitType[]) for (const status of ["open", "closed", "discharged", "cancelled"] as VisitStatus[]) for (const archived of [false, true]) for (const ipdOn of [false, true]) for (const perms of subsets()) {
      const shown = visitActions({ type, status, archived }, can(perms), ipdOn)
      const has = (a: VisitAction) => shown.includes(a)
      const where = `${type}/${status}/${archived ? "archived" : "live"}/ipd=${ipdOn}/${perms.join(",")}`
      if (archived) { expect(shown, where).toEqual(perms.includes("encounters.archive") ? ["restore"] : []); continue }
      expect(has("restore"), where).toBe(false)
      if (has("close")) expect(type === "opd" && status === "open" && perms.includes("encounters.write"), where).toBe(true)
      for (const a of ["transfer", "discharge", "add_note"] as const) if (has(a)) expect(type === "ipd" && status === "open", `${a} ${where}`).toBe(true)
      for (const a of ["transfer", "discharge"] as const) if (has(a)) expect(ipdOn, `${a} needs the department ${where}`).toBe(true)
      for (const a of ["correct_check_in", "record_vitals", "edit_record", "close", "cancel", "transfer", "discharge", "add_note"] as const) if (has(a)) expect(status, `${a} on a ${status} visit ${where}`).toBe("open")
      if (has("reopen")) expect(status === "closed" || status === "discharged", where).toBe(true)
      if (has("reopen")) expect(perms.includes("encounters.correct"), where).toBe(true)
      if (has("record_vitals")) expect(perms.includes("encounters.record_vitals"), where).toBe(true)
      if (has("edit_record")) expect(perms.includes("encounters.write"), where).toBe(true)
      if (has("discharge")) expect(perms.includes("ipd.discharge"), where).toBe(true)
      if (has("transfer")) expect(perms.includes("ipd.write"), where).toBe(true)
      if (has("archive")) expect(perms.includes("encounters.archive"), where).toBe(true)
      expect(new Set(shown).size, `no duplicates ${where}`).toBe(shown.length)
    }
  })
  it("every action has a label", () => {
    for (const a of ["correct_check_in", "record_vitals", "edit_record", "close", "cancel", "transfer", "discharge", "add_note", "reopen", "archive", "restore"] as VisitAction[]) expect(ACTION_LABEL[a]).toBeTruthy()
  })
})

describe("what each tab asks the server for (handoff 8.5)", () => {
  const f = { doctorId: undefined, type: undefined, status: undefined, from: undefined, to: undefined, archived: false }
  it("today's queue is today's OPEN visits in token order; 'to finish' is the pending list; 'admitted' is the open admissions", () => {
    expect(tabQuery("queue", "2026-11-07", f)).toMatchObject({ dateFrom: "2026-11-07", dateTo: "2026-11-07", status: "open", sort: "tokenNo:asc" })
    expect(tabQuery("queue", "2026-11-07", { ...f, doctorId: "D" })).toMatchObject({ doctorId: "D", sort: "tokenNo:asc" })
    expect(tabQuery("pending", "2026-11-07", f)).toEqual({ pending: true, doctorId: undefined })
    expect(tabQuery("admitted", "2026-11-07", f)).toEqual({ admitted: true, type: "ipd", status: "open" })
  })
  it("'all visits' sends only the filters the user chose; archived ones only when asked", () => {
    expect(tabQuery("all", "2026-11-07", f)).toMatchObject({ type: undefined, status: undefined, includeArchived: undefined })
    expect(tabQuery("all", "2026-11-07", { ...f, status: "closed", from: "2026-11-01", to: "2026-11-05", archived: true })).toMatchObject({ status: "closed", dateFrom: "2026-11-01", dateTo: "2026-11-05", includeArchived: true })
  })
})

describe("readable text", () => {
  it("a refused close lists what is missing in words", () => {
    expect(missingLabels({ missing: ["chiefComplaint", "primaryDiagnosis"] })).toEqual(["chief complaint", "a primary diagnosis"])
    expect(missingLabels({})).toEqual([])
    expect(missingLabels([1])).toEqual([])
    expect(missingLabels(undefined)).toEqual([])
    expect(missingLabels({ missing: ["examination_findings", 5] })).toEqual(["examination findings"])
  })
  it("vitals read as a short list of what was measured; nothing is invented", () => {
    expect(vitalsSummary({ bpSystolic: 120, bpDiastolic: 80, pulse: 72, temperatureF: 98.6, weightKg: 70, heightCm: 170, spo2: 98, rbs: null, bmi: 24.2 })).toEqual(["120/80 mmHg", "72 bpm", "98.6 °F", "SpO₂ 98%", "70 kg", "170 cm", "BMI 24.2"])
    expect(vitalsSummary({ bpSystolic: null, bpDiastolic: null, pulse: 60, temperatureF: null, weightKg: null, heightCm: null, spo2: null, rbs: 110, bmi: null })).toEqual(["60 bpm", "RBS 110 mg/dL"])
    expect(vitalsSummary({ bpSystolic: 120, bpDiastolic: null, pulse: null, temperatureF: null, weightKg: null, heightCm: null, spo2: null, rbs: null, bmi: null })).toEqual(["120/? mmHg"])
    expect(tokenLabel({ tokenNo: 7 })).toBe("#7")
    expect(tokenLabel({ tokenNo: null })).toBe("—")
  })
})

describe("diagnoses on the screen and on the wire", () => {
  const coded: ClinicalDiagnosis = { id: LINE, icdCode: { id: ICD, code: "J06.9" }, text: "Acute URI", isPrimary: true }
  it("the first diagnosis is primary; removing the primary promotes the next; choosing another primary leaves exactly one", () => {
    let rows = addDiagnosis([], { text: "Flu" })
    rows = addDiagnosis(rows, { text: "Dehydration" })
    rows = addDiagnosis(rows, { icdCodeId: ICD, code: "J06.9", text: "Acute URI" })
    expect(rows.map((r) => r.isPrimary)).toEqual([true, false, false])
    rows = withPrimary(rows, rows[2].key)
    expect(rows.map((r) => r.isPrimary)).toEqual([false, false, true])
    rows = removeDiagnosis(rows, rows[2].key)
    expect(rows.map((r) => r.isPrimary)).toEqual([true, false])
    expect(rows.filter((r) => r.isPrimary)).toHaveLength(1)
    expect(removeDiagnosis(rows, rows[1].key).filter((r) => r.isPrimary)).toHaveLength(1)
    expect(removeDiagnosis(removeDiagnosis(rows, rows[0].key), rows[1].key)).toEqual([])
  })
  it("a coded row sends the code only, a free-text row its text, and blank rows are dropped", () => {
    const rows = [...diagnosisRowsOf([coded]), ...addDiagnosis([], { text: "  Dehydration " }), ...addDiagnosis([], { text: "   " })].map((r, i) => ({ ...r, isPrimary: i === 0 }))
    expect(diagnosisInputsOf(rows)).toEqual([{ icdCodeId: ICD, isPrimary: true }, { text: "Dehydration", isPrimary: false }])
  })
  it("what the screen builds always passes the exactly-one-primary check of the request", () => {
    const rows = addDiagnosis(addDiagnosis([], { text: "A" }), { text: "B" })
    expect(() => clinicalRecordPayload({ diagnoses: diagnosisInputsOf(rows), prescription: [] }, "2026-11-07T10:00:00.000Z")).not.toThrow()
  })
})

describe("prescription rows on the screen and on the wire", () => {
  const line: PrescriptionLine = { id: LINE, medicineId: null, medicineText: "Paracetamol 500 mg", dose: "1 tab", route: null, frequency: "TDS", duration: "3 days", quantity: 9, instructions: null }
  it("an existing line comes back with its id; a new line has none; an untouched empty row is dropped", () => {
    const rows = [...rxRowsOf([line]), { ...emptyRx(), medicineText: "ORS" }, emptyRx()]
    expect(rxInputsOf(rows)).toEqual([{ id: LINE, medicineText: "Paracetamol 500 mg", dose: "1 tab", frequency: "TDS", duration: "3 days", quantity: 9 }, { medicineText: "ORS" }])
  })
  it("a line left out is simply absent (the server removes it); one the user blanked is kept so the server or the check answers for it", () => {
    expect(rxInputsOf([])).toEqual([])
    const blanked = rxRowsOf([line]).map((r) => ({ ...r, medicineText: "" }))
    const sent = rxInputsOf(blanked)
    expect(sent).toHaveLength(1)
    expect(sent[0].id).toBe(LINE)
    expect(() => clinicalRecordPayload({ diagnoses: [], prescription: sent }, "2026-11-07T10:00:00.000Z")).toThrow(/name the medicine/)
  })
  it("the limits are the contract's", () => {
    expect(VISIT_LIMITS.prescription).toBe(50)
    expect(VISIT_LIMITS.diagnoses).toBe(20)
  })
})

describe("the screens are wired as the handoff says", () => {
  it("the pages show the API screens only against the API; the demo keeps the prototype's", () => {
    expect(read("src/app/(dashboard)/encounters/page.tsx")).toContain('visitsDataSource === "api"')
    expect(read("src/app/(dashboard)/encounters/new/page.tsx")).toContain("<ApiCheckInScreen />")
    expect(read("src/app/(dashboard)/encounters/[id]/page.tsx")).toContain("<VisitDetailScreen id={id} />")
    expect(read("src/app/(dashboard)/encounters/[id]/page.tsx")).toContain("function MockEncounterDetailPage()")
    expect(read("src/app/(dashboard)/encounters/[id]/discharge/page.tsx")).toContain("router.replace(`/encounters/${id}`)")
  })
  it("the list is a worklist (15 s, polled), keeps filters in the address bar but never the search, and its queue sorts by token", () => {
    const src = read("src/components/visits/VisitsScreen.tsx")
    expect(src).toContain("...CACHE_CLASSES.worklist")
    expect(src).toContain('const URL_KEYS = ["tab", "page", "type", "status", "doctor", "from", "to", "archived"] as const')
    expect(src).not.toMatch(/url\.set\(\{[^}]*search/)
    expect(src).toContain("useDebouncedSearch()")
    expect(src).toContain("tabQuery(tab, today")
    expect(src).toContain("<BedBoard />")
  })
  it("the bed board is a worklist read by the board, the admission picker and the transfer dialog alike; only an available bed can be chosen", () => {
    expect(read("src/components/visits/useBedBoard.ts")).toContain("...CACHE_CLASSES.worklist")
    expect(read("src/components/visits/BedBoard.tsx")).toContain("useBedBoard()")
    expect(read("src/components/visits/BedPicker.tsx")).toContain("disabled={!free}")
    expect(read("src/components/visits/BedPicker.tsx")).toContain("useBedBoard()")
    expect(read("src/components/visits/BedBoard.tsx")).toContain('can("ipd.write")') // maintenance
  })
  it("the detail page re-reads the record when opened and gives the front desk no record", () => {
    const src = read("src/components/visits/VisitDetailScreen.tsx")
    expect(src).toContain("...CACHE_CLASSES.record")
    expect(src).toContain("v.clinical === null")
    expect(src).toContain("visitActionStates(v, can, ipdOn)")
  })
  it("the doctor's record keeps its long text through a session that ends, saves with the loaded version, and keeps what was typed on a conflict", () => {
    const src = read("src/components/visits/ClinicalRecordForm.tsx")
    expect((src.match(/useDraftState\(/g) ?? []).length).toBe(5)
    expect(src).toContain("visit.updatedAt")
    expect(src).toContain("isConflictChanged(err)")
    expect(src).toContain("onReload(typed())")
  })
  it("every state change goes through one dialog that sends a single request and explains a refusal", () => {
    const dlg = read("src/components/visits/ActionDialog.tsx")
    expect(dlg).toContain("useSubmitGuard()")
    expect(dlg).toContain("CLINICAL_RECORD_INCOMPLETE")
    expect(dlg).toContain("isConflictChanged(err)")
    const all = read("src/components/visits/VisitDialogs.tsx")
    for (const call of ["visitsService.close(", "visitsService.cancel(", "visitsService.reopen(", "visitsService.archive(", "visitsService.restore(", "visitsService.transfer(", "visitsService.discharge(", "visitsService.correctCheckIn("]) expect(all).toContain(call)
  })
  it("admission picks its bed from the live board and needs ipd.admit with the department on; OPD check-in needs encounters.check_in", () => {
    const src = read("src/components/visits/CheckInScreen.tsx")
    expect(src).toContain("<BedPicker")
    expect(src).toContain('can("ipd.admit")')
    expect(src).toContain('can("encounters.check_in")')
    expect(src).toContain("visitsService.checkInOpd(")
    expect(src).toContain("visitsService.admit(")
  })
  it("the patient's Visits tab and the appointment's Check in use the same service", () => {
    expect(read("src/components/visits/PatientVisitsTab.tsx")).toContain("visitsService.forPatient(")
    expect(read("src/app/(dashboard)/patients/[id]/page.tsx")).toContain("<PatientVisitsTab")
    expect(read("src/components/visits/CheckInFromAppointmentDialog.tsx")).toContain("appointmentId: appointment.id")
  })
})
