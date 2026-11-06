import { DOCTORS } from "@/data/doctors"
import type { Doctor } from "@/types"
import type { DoctorInput, DoctorRecord, DoctorsService } from "../types"
import { paginate } from "../listing"
import { mockApiError } from "./mockError"

// Mutates the shared DOCTORS array in place: other (not yet integrated) modules
// such as encounters and billing still read it directly and must keep seeing edits.

function toRecord(d: Doctor): DoctorRecord {
  const { userId, active, ...rest } = d
  return { ...rest, id: String(userId), active: active !== false, availableDays: [...d.availableDays] }
}

function fromInput(userId: number, input: DoctorInput): Doctor {
  return { ...input, userId, availableDays: [...input.availableDays] }
}

function validate(input: DoctorInput) {
  const details: { path: string; message: string }[] = []
  if (!input.name.trim()) details.push({ path: "name", message: "Full Name is required" })
  if (!input.fee) details.push({ path: "fee", message: "Consultation Fee is required" })
  if (details.length) throw mockApiError(400, "VALIDATION_FAILED", "Validation failed", details)
}

export const mockDoctorsService: DoctorsService = {
  async list(opts = {}) {
    const q = opts.search?.trim().toLowerCase()
    const matches = DOCTORS.filter(
      (d) =>
        !q ||
        d.name.toLowerCase().includes(q) ||
        d.specialization.toLowerCase().includes(q) ||
        (d.phone && d.phone.includes(q)) ||
        (d.pmcRegNo && d.pmcRegNo.toLowerCase().includes(q))
    )
    return { items: paginate(matches, opts.page, opts.pageSize).map(toRecord), total: matches.length }
  },

  async create(input) {
    validate(input)
    const doctor = fromInput(Math.max(0, ...DOCTORS.map((d) => d.userId)) + 1000, input)
    DOCTORS.push(doctor)
    return toRecord(doctor)
  },

  async update(id, input) {
    validate(input)
    const idx = DOCTORS.findIndex((d) => String(d.userId) === id)
    if (idx < 0) throw mockApiError(404, "NOT_FOUND", "Doctor not found")
    DOCTORS[idx] = fromInput(DOCTORS[idx].userId, input)
    return toRecord(DOCTORS[idx])
  },
}
