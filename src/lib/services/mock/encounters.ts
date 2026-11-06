import { format } from "date-fns"
import { ENCOUNTERS, nextEncounterId } from "@/data/encounters"
import { PATIENTS } from "@/data/patients"
import { WARDS } from "@/data/wards"
import type { Encounter, Ward } from "@/types"
import { encounterTotals } from "../encounterHelpers"
import { paginate } from "../listing"
import { legacyNumericId } from "../reference/refId"
import type { EncounterRecord, EncountersService, WardRecord, WardsService } from "../types"
import { mockApiError } from "./mockError"

// Mutate the shared ENCOUNTERS and WARDS arrays in place, as the screens used to do inline: billing, lab,
// imaging, pharmacy, reports and the dashboard still read them directly and must keep seeing the same records.
// Mock mode only understands legacy numeric patient/doctor ids; anything else is rejected instead of coerced.

const wardIdOf = (name: string | undefined) => {
  const ward = WARDS.find((w) => w.name === name)
  return ward ? String(ward.id) : undefined
}

function toRecord(e: Encounter): EncounterRecord {
  return { ...e, id: String(e.id), patientId: String(e.patientId), doctorId: String(e.doctorId), wardId: wardIdOf(e.ward) }
}

function find(id: string): number {
  const idx = ENCOUNTERS.findIndex((e) => String(e.id) === id)
  if (idx < 0) throw mockApiError(404, "NOT_FOUND", "Encounter not found")
  return idx
}

function requireLegacyId(value: string, path: string): number {
  const n = legacyNumericId(value)
  if (n === null) {
    throw mockApiError(400, "VALIDATION_FAILED", "Validation failed", [{ path, message: "Mock mode only supports numeric legacy ids" }])
  }
  return n
}

function releaseBed(e: Encounter): boolean {
  const bed = WARDS.find((w) => w.name === e.ward)?.beds.find((b) => b.bedNo === e.bedNo)
  if (!bed) return false
  bed.status = "available"
  bed.patientId = null
  bed.since = null
  return true
}

export const mockEncountersService: EncountersService = {
  async list(opts = {}) {
    const q = opts.search?.trim().toLowerCase()
    const day = (e: Encounter) => format(new Date(e.date), "yyyy-MM-dd")
    const matches = [...ENCOUNTERS]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .filter((e) => !opts.type || e.type === opts.type)
      .filter((e) => !opts.dateFrom || day(e) >= opts.dateFrom)
      .filter((e) => !opts.dateTo || day(e) <= opts.dateTo)
      .filter((e) => !opts.patientId || String(e.patientId) === opts.patientId)
      .filter((e) => {
        if (!q) return true
        const patient = PATIENTS.find((p) => p.id === e.patientId)
        return Boolean(patient?.name.toLowerCase().includes(q) || e.encId.toLowerCase().includes(q) || patient?.mrNo.toLowerCase().includes(q))
      })
    return { items: paginate(matches, opts.page, opts.pageSize).map(toRecord), total: matches.length }
  },

  async get(id) {
    return toRecord(ENCOUNTERS[find(id)])
  },

  async create(input) {
    const patientId = requireLegacyId(input.patientId, "patientId")
    const doctorId = requireLegacyId(input.doctorId, "doctorId")

    let ward: Ward | undefined
    let bed: Ward["beds"][number] | undefined
    if (input.type === "IPD" && input.wardId) {
      ward = WARDS.find((w) => String(w.id) === input.wardId)
      if (!ward) throw mockApiError(400, "VALIDATION_FAILED", "Validation failed", [{ path: "wardId", message: "Unknown ward" }])
      if (input.bedNo) {
        bed = ward.beds.find((b) => b.bedNo === input.bedNo)
        if (!bed) throw mockApiError(400, "VALIDATION_FAILED", "Validation failed", [{ path: "bedNo", message: "Unknown bed" }])
        if (bed.status !== "available") throw mockApiError(409, "CONFLICT", "Bed is not available", [{ path: "bedNo", message: "Bed is not available" }])
      }
    }

    const totals = encounterTotals(input)
    const record: Encounter = {
      id: Math.max(0, ...ENCOUNTERS.map((e) => e.id)) + 1,
      encId: nextEncounterId(input.type),
      patientId,
      type: input.type,
      doctorId,
      date: new Date().toISOString(),
      tokenNo: input.tokenNo,
      ward: input.type === "IPD" ? ward?.name ?? "" : undefined,
      bedNo: input.type === "IPD" ? input.bedNo ?? "" : undefined,
      admissionType: input.type === "IPD" ? input.admissionType : undefined,
      priority: input.priority,
      chiefComplaint: input.chiefComplaint,
      history: input.history,
      onExamination: input.onExamination,
      diagnosis: input.diagnosis,
      clinicalNotes: input.clinicalNotes,
      advisedBy: input.advisedBy || undefined,
      referredBy: input.referredBy || undefined,
      vitals: input.vitals,
      prescription: input.prescription,
      generalInstructions: input.generalInstructions,
      followUpDate: input.followUpDate || undefined,
      fee: input.fee,
      discount: input.discount,
      discountType: input.discountType,
      netTotal: totals.netTotal,
      paymentStatus: input.paymentStatus,
      paymentMode: input.paymentMode,
      amountReceived: totals.amountReceived,
      balance: totals.balance,
      status: "open",
    }
    ENCOUNTERS.push(record)
    if (bed) {
      bed.status = "occupied"
      bed.patientId = patientId
      bed.since = new Date().toISOString().slice(0, 10)
    }
    return toRecord(record)
  },

  async discharge(id, input) {
    const idx = find(id)
    const current = ENCOUNTERS[idx]
    if (current.status !== "open") {
      throw mockApiError(409, "CONFLICT", "Encounter is not open", [{ path: "status", message: "Only an open encounter can be discharged" }])
    }
    ENCOUNTERS[idx] = {
      ...current,
      status: "discharged",
      dischargeDate: input.dischargeDate,
      dischargeDiagnosis: input.dischargeDiagnosis,
      dischargeSummary: input.dischargeSummary ?? "",
      conditionOnDischarge: input.conditionOnDischarge,
    }
    // Follow-up date / instructions were never persisted by the legacy model; the mock keeps that behaviour.
    return { encounter: toRecord(ENCOUNTERS[idx]), bedReleased: releaseBed(current) }
  },
}

const toWard = (w: Ward): WardRecord => ({
  id: String(w.id),
  name: w.name,
  type: w.type,
  beds: w.beds.map((b) => ({ bedNo: b.bedNo, status: b.status, patientId: b.patientId === null ? null : String(b.patientId), since: b.since })),
})

export const mockWardsService: WardsService = {
  async list(opts = {}) {
    return { items: paginate(WARDS, opts.page, opts.pageSize).map(toWard), total: WARDS.length }
  },
}
