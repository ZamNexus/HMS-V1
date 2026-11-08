import { PATIENTS, nextMrNo } from "@/data/patients"
import type { Patient } from "@/types"
import { ageParts, localToday } from "../patientFormat"
import { paginate } from "../listing"
import type { DuplicateMatch, PatientInput, PatientRecord, PatientsService } from "../types"
import { mockApiError } from "./mockError"

// Mutates the shared PATIENTS array in place: the many modules that still read it directly
// (encounters, billing, lab, imaging, pharmacy, reports) keep seeing the same records.
// Demo only. A death is kept as an extra `deceasedOn` property on the demo record.

type DemoPatient = Patient & { deceasedOn?: string | null }

function toRecord(p: DemoPatient): PatientRecord {
  const { id, panelId, ...rest } = p
  return { ...rest, id: String(id), panelId: panelId === null ? null : String(panelId) }
}

function fromInput(id: number, base: Pick<Patient, "mrNo" | "registrationDate">, rawInput: PatientInput): Patient {
  // API-only fields of the input never reach the demo record
  const { version, estimatedAge, acknowledgeDuplicates, coverages, guardianRelationId, ...input } = rawInput
  void version; void estimatedAge; void acknowledgeDuplicates; void coverages; void guardianRelationId
  return {
    ...input,
    id,
    mrNo: base.mrNo,
    registrationDate: base.registrationDate,
    age: ageParts(input.dob, localToday())?.years ?? 0,
    panelId: input.panelId === null ? null : Number(input.panelId),
  }
}

function find(id: string): number {
  const idx = PATIENTS.findIndex((p) => String(p.id) === id)
  if (idx < 0) throw mockApiError(404, "NOT_FOUND", "Patient not found")
  return idx
}

export const mockPatientsService: PatientsService = {
  async list(opts = {}) {
    const q = opts.search?.trim().toLowerCase()
    const matches = PATIENTS.filter((p) => !opts.status || p.status === opts.status)
      .filter((p) => !opts.gender || p.gender === opts.gender)
      .filter((p) => opts.panelId === undefined || String(p.panelId) === opts.panelId)
      .filter((p) => opts.selfPay === undefined || (opts.selfPay ? p.panelId === null : p.panelId !== null))
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.mrNo.toLowerCase().includes(q) || p.phone.includes(q))
    return { items: paginate(matches, opts.page, opts.pageSize).map(toRecord), total: matches.length }
  },

  async get(id) {
    return toRecord(PATIENTS[find(id)])
  },

  async create(input) {
    const id = Math.max(0, ...PATIENTS.map((p) => p.id)) + 1
    const patient = fromInput(id, { mrNo: nextMrNo(), registrationDate: localToday() }, input)
    PATIENTS.push(patient)
    return toRecord(patient)
  },

  async update(id, input) {
    const idx = find(id)
    const current = PATIENTS[idx]
    PATIENTS[idx] = fromInput(current.id, current, input)
    return toRecord(PATIENTS[idx])
  },

  async remove(id) {
    PATIENTS.splice(find(id), 1)
  },

  async restore(id) {
    const idx = find(id)
    PATIENTS[idx] = { ...PATIENTS[idx], status: "active" }
    return toRecord(PATIENTS[idx])
  },

  async duplicates({ phone, cnic }) {
    const p = phone?.trim()
    const c = cnic?.trim()
    if (!p && !c) return []
    return PATIENTS.filter((x) => (p && x.phone === p) || (c && x.cnic === c)).map((x): DuplicateMatch => ({
      id: String(x.id), mrNo: x.mrNo, name: x.name, fatherName: x.fatherName, gender: x.gender, dob: x.dob, phone: x.phone, cnic: x.cnic,
      deceasedOn: (x as DemoPatient).deceasedOn ?? null, archived: x.status === "inactive",
      matchedOn: [...(p && x.phone === p ? ["phone"] : []), ...(c && x.cnic === c ? ["cnic"] : [])],
    }))
  },

  async recordDeath(id, deceasedOn) {
    const idx = find(id)
    if (PATIENTS[idx].status === "ipd") throw mockApiError(422, "PATIENT_ADMITTED", "The patient is admitted: discharge the patient as expired instead.")
    PATIENTS[idx] = { ...PATIENTS[idx], deceasedOn } as DemoPatient
    return toRecord(PATIENTS[idx])
  },

  async revokeDeath(id) {
    const idx = find(id)
    PATIENTS[idx] = { ...PATIENTS[idx], deceasedOn: null } as DemoPatient
    return toRecord(PATIENTS[idx])
  },
}
