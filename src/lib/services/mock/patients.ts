import { differenceInYears } from "date-fns"
import { PATIENTS, nextMrNo } from "@/data/patients"
import type { Patient } from "@/types"
import { paginate } from "../listing"
import type { PatientInput, PatientRecord, PatientsService } from "../types"
import { mockApiError } from "./mockError"

// Mutates the shared PATIENTS array in place: the many modules that still read it directly
// (encounters, billing, lab, imaging, pharmacy, reports) keep seeing the same records.

function toRecord(p: Patient): PatientRecord {
  const { id, panelId, ...rest } = p
  return { ...rest, id: String(id), panelId: panelId === null ? null : String(panelId) }
}

function fromInput(id: number, base: Pick<Patient, "mrNo" | "registrationDate">, input: PatientInput): Patient {
  return {
    ...input,
    id,
    mrNo: base.mrNo,
    registrationDate: base.registrationDate,
    age: Math.max(0, differenceInYears(new Date(), new Date(input.dob))),
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
    const matches = PATIENTS.filter((p) => !opts.status || p.status === opts.status).filter(
      (p) => !q || p.name.toLowerCase().includes(q) || p.mrNo.toLowerCase().includes(q) || p.phone.includes(q)
    )
    return { items: paginate(matches, opts.page, opts.pageSize).map(toRecord), total: matches.length }
  },

  async get(id) {
    return toRecord(PATIENTS[find(id)])
  },

  async create(input) {
    const id = Math.max(0, ...PATIENTS.map((p) => p.id)) + 1
    const patient = fromInput(id, { mrNo: nextMrNo(), registrationDate: new Date().toISOString().slice(0, 10) }, input)
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
}
