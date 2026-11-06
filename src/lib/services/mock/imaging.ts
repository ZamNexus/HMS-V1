import { ENCOUNTERS } from "@/data/encounters"
import { IMAGING_ORDERS, nextXrNo } from "@/data/imaging"
import { getLabTest } from "@/data/labTests"
import { PATIENTS } from "@/data/patients"
import type { ImagingOrder, LabOrderTest } from "@/types"
import { isLegalImagingTransition } from "../imagingHelpers"
import { labOrderTotals } from "../labHelpers"
import { paginate } from "../listing"
import { legacyNumericId } from "../reference/refId"
import type { ImagingOrderRecord, ImagingOrdersService } from "../types"
import { mockApiError } from "./mockError"

// Mutates the shared IMAGING_ORDERS array in place, as the screens used to do inline: billing, reports, the dashboard,
// the patient detail tab and the encounter billing roll-up still read it directly and must keep seeing the same records.
// Mock mode only understands legacy numeric ids; anything else is rejected, never coerced.

const fieldError = (status: number, code: string, message: string, path: string, detail: string) =>
  mockApiError(status, code, message, [{ path, message: detail }])

function requireLegacyId(value: string, path: string): number {
  const n = legacyNumericId(value)
  if (n === null) throw fieldError(400, "VALIDATION_FAILED", "Validation failed", path, "Mock mode only supports numeric legacy ids")
  return n
}

function toOrder(o: ImagingOrder): ImagingOrderRecord {
  return {
    ...o,
    id: String(o.id),
    patientId: String(o.patientId),
    doctorId: String(o.doctorId),
    encounterId: o.encounterId === null ? null : String(o.encounterId),
    tests: o.tests.map((t) => ({ ...t, testId: String(t.testId) })),
  }
}

function find(id: string): number {
  const idx = IMAGING_ORDERS.findIndex((o) => String(o.id) === id)
  if (idx < 0) throw mockApiError(404, "NOT_FOUND", "Imaging order not found")
  return idx
}

export const mockImagingOrdersService: ImagingOrdersService = {
  async list(opts = {}) {
    const q = opts.search?.trim().toLowerCase()
    const matches = [...IMAGING_ORDERS]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .filter((o) => !opts.status || o.status === opts.status)
      .filter((o) => !opts.patientId || String(o.patientId) === opts.patientId)
      .filter((o) => {
        if (!q) return true
        const patient = PATIENTS.find((p) => p.id === o.patientId)
        return Boolean(patient?.name.toLowerCase().includes(q) || o.xrNo.toLowerCase().includes(q) || patient?.mrNo.toLowerCase().includes(q))
      })
    return { items: paginate(matches, opts.page, opts.pageSize).map(toOrder), total: matches.length }
  },

  async get(id) {
    return toOrder(IMAGING_ORDERS[find(id)])
  },

  async create(input) {
    const patientId = requireLegacyId(input.patientId, "patientId")
    const doctorId = requireLegacyId(input.doctorId, "doctorId")
    if (input.tests.length === 0) throw fieldError(400, "VALIDATION_FAILED", "Validation failed", "tests", "Select at least one test")

    let encounterId: number | null = null
    if (input.encounterId !== undefined) {
      encounterId = requireLegacyId(input.encounterId, "encounterId")
      if (!ENCOUNTERS.some((e) => e.id === encounterId)) throw fieldError(400, "VALIDATION_FAILED", "Validation failed", "encounterId", "Unknown encounter")
    }

    const lines = input.tests.map((l, i) => {
      const testId = requireLegacyId(l.testId, `tests.${i}.testId`)
      const test = getLabTest(testId)
      if (!test) throw fieldError(400, "VALIDATION_FAILED", "Validation failed", `tests.${i}.testId`, "Unknown test")
      const line: LabOrderTest = {
        testId, testName: test.name, charges: test.rate, discountPct: l.discountPct, gstPct: l.gstPct,
        includedInPackage: l.includedInPackage, remarks: input.notes || undefined,
      }
      return { line, rate: test.rate }
    })
    const { total } = labOrderTotals(lines.map(({ line, rate }) => ({ rate, ...line })), input.flatDiscount)

    const order: ImagingOrder = {
      id: Math.max(0, ...IMAGING_ORDERS.map((o) => o.id)) + 1,
      xrNo: nextXrNo(),
      patientId,
      encounterId,
      doctorId,
      date: new Date().toISOString(),
      tests: lines.map((l) => l.line),
      discount: input.flatDiscount,
      total,
      paymentMode: input.paymentMode,
      status: "Pending",
    }
    IMAGING_ORDERS.push(order)
    return toOrder(order)
  },

  async transition(id, to) {
    const idx = find(id)
    const current = IMAGING_ORDERS[idx]
    if (!isLegalImagingTransition(current.status, to)) {
      throw fieldError(409, "CONFLICT", "Illegal status change", "status", `An order that is ${current.status} cannot move to ${to}`)
    }
    IMAGING_ORDERS[idx] = { ...current, status: to }
    return toOrder(IMAGING_ORDERS[idx])
  },

  async enterReport(id, input) {
    const idx = find(id)
    const current = IMAGING_ORDERS[idx]
    for (const [i, entry] of input.tests.entries()) {
      if (!current.tests.some((t) => String(t.testId) === entry.testId)) {
        throw fieldError(400, "VALIDATION_FAILED", "Validation failed", `tests.${i}.testId`, "That test is not part of this order")
      }
      if (!entry.narrativeResult.trim()) throw fieldError(400, "VALIDATION_FAILED", "Validation failed", `tests.${i}.narrativeResult`, "The report text is required")
    }
    // Narrative only. No reporting doctor or signature is stored: how that is captured is CONTRACT REQUIRED.
    IMAGING_ORDERS[idx] = {
      ...current,
      tests: current.tests.map((t) => {
        const entry = input.tests.find((e) => e.testId === String(t.testId))
        return entry ? { ...t, narrativeResult: entry.narrativeResult.trim() } : t
      }),
    }
    return toOrder(IMAGING_ORDERS[idx])
  },
}
