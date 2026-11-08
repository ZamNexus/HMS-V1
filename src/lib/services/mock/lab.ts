import { ECG_ULTRASOUND_TESTS } from "@/data/ecgUltrasound"
import { ENCOUNTERS } from "@/data/encounters"
import { LAB_ORDERS, nextLabNo } from "@/data/lab"
import { LAB_TESTS, getLabTest } from "@/data/labTests"
import { PATIENTS } from "@/data/patients"
import type { EcgUltrasoundTest, LabOrder, LabOrderTest, LabResultParam, LabTest } from "@/types"
import { flagFor, isLegalLabTransition, labOrderTotals } from "../labHelpers"
import { paginate } from "../listing"
import { legacyNumericId } from "../reference/refId"
import type {
  EcgUltrasoundTestRecord, EcgUltrasoundTestsService, LabOrderRecord, LabOrdersService, LabTestRecord, LabTestsService,
} from "../types"
import { mockApiError } from "./mockError"

// Mutate the shared LAB_TESTS / ECG_ULTRASOUND_TESTS / LAB_ORDERS arrays in place, as the screens used to do inline:
// imaging, billing, reports, the dashboard and the top-bar notifications still read them directly and must keep
// seeing the same records. Mock mode only understands legacy numeric ids; anything else is rejected, never coerced.

const fieldError = (status: number, code: string, message: string, path: string, detail: string) =>
  mockApiError(status, code, message, [{ path, message: detail }])

function requireLegacyId(value: string, path: string): number {
  const n = legacyNumericId(value)
  if (n === null) throw fieldError(400, "VALIDATION_FAILED", "Validation failed", path, "Mock mode only supports numeric legacy ids")
  return n
}

// ── T1: catalog ────────────────────────────────────────────────────────────────────────

const toLabTest = (t: LabTest): LabTestRecord => ({ ...t, id: String(t.id) })

export const mockLabTestsService: LabTestsService = {
  async list(opts = {}) {
    const q = opts.search?.trim().toLowerCase()
    const matches = LAB_TESTS.filter((t) => !opts.category || t.category === opts.category).filter(
      (t) => !q || t.name.toLowerCase().includes(q) || t.code.toLowerCase().includes(q)
    )
    return { items: paginate(matches, opts.page, opts.pageSize).map(toLabTest), total: matches.length }
  },

  async create(input) {
    const details = []
    if (!input.code.trim()) details.push({ path: "code", message: "Code is required" })
    if (!input.name.trim()) details.push({ path: "name", message: "Test Name is required" })
    if (details.length) throw mockApiError(400, "VALIDATION_FAILED", "Validation failed", details)
    const test: LabTest = {
      id: Math.max(0, ...LAB_TESTS.map((t) => t.id)) + 1,
      code: input.code.trim(), name: input.name.trim(), category: input.category, rate: input.rate,
      unit: "-", normalRange: "-", turnaroundHours: input.turnaroundHours,
    }
    LAB_TESTS.push(test)
    return toLabTest(test)
  },

  async update(id, input) {
    const idx = LAB_TESTS.findIndex((t) => String(t.id) === id)
    if (idx < 0) throw mockApiError(404, "NOT_FOUND", "Lab test not found")
    LAB_TESTS[idx] = { ...LAB_TESTS[idx], code: input.code, name: input.name, category: input.category, rate: input.rate, turnaroundHours: input.turnaroundHours }
    return toLabTest(LAB_TESTS[idx])
  },

  async patch(id, patch) {
    const idx = LAB_TESTS.findIndex((t) => String(t.id) === id)
    if (idx < 0) throw mockApiError(404, "NOT_FOUND", "Lab test not found")
    const { code, name, category, rate, turnaroundHours } = patch
    LAB_TESTS[idx] = { ...LAB_TESTS[idx], ...(code !== undefined && { code }), ...(name !== undefined && { name }), ...(category !== undefined && { category }), ...(rate !== undefined && { rate }), ...(turnaroundHours !== undefined && { turnaroundHours }) }
    return toLabTest(LAB_TESTS[idx])
  },

  // The demo catalogue has no active flag (decision: not invented); the record is returned unchanged.
  async setActive(id) {
    const idx = LAB_TESTS.findIndex((t) => String(t.id) === id)
    if (idx < 0) throw mockApiError(404, "NOT_FOUND", "Lab test not found")
    return toLabTest(LAB_TESTS[idx])
  },
}

const toEcg = (t: EcgUltrasoundTest): EcgUltrasoundTestRecord => ({ ...t, id: String(t.id) })

export const mockEcgUltrasoundTestsService: EcgUltrasoundTestsService = {
  async list(opts = {}) {
    const q = opts.search?.trim().toLowerCase()
    const matches = ECG_ULTRASOUND_TESTS.filter((t) => !q || t.name.toLowerCase().includes(q) || t.code.toLowerCase().includes(q))
    return { items: paginate(matches, opts.page, opts.pageSize).map(toEcg), total: matches.length }
  },

  async create(input) {
    const details = []
    if (!input.code.trim()) details.push({ path: "code", message: "Test Code is required" })
    if (!input.name.trim()) details.push({ path: "name", message: "Test Name is required" })
    if (details.length) throw mockApiError(400, "VALIDATION_FAILED", "Validation failed", details)
    const test: EcgUltrasoundTest = {
      id: Math.max(0, ...ECG_ULTRASOUND_TESTS.map((t) => t.id)) + 1,
      code: input.code, name: input.name, fee: input.fee, remarks: input.remarks, active: input.active,
    }
    ECG_ULTRASOUND_TESTS.push(test)
    return toEcg(test)
  },

  async update(id, input) {
    const idx = ECG_ULTRASOUND_TESTS.findIndex((t) => String(t.id) === id)
    if (idx < 0) throw mockApiError(404, "NOT_FOUND", "Test not found")
    ECG_ULTRASOUND_TESTS[idx] = { ...ECG_ULTRASOUND_TESTS[idx], code: input.code, name: input.name, fee: input.fee, remarks: input.remarks, active: input.active }
    return toEcg(ECG_ULTRASOUND_TESTS[idx])
  },

  async patch(id, patch) {
    const idx = ECG_ULTRASOUND_TESTS.findIndex((t) => String(t.id) === id)
    if (idx < 0) throw mockApiError(404, "NOT_FOUND", "Test not found")
    const { code, name, fee } = patch
    ECG_ULTRASOUND_TESTS[idx] = { ...ECG_ULTRASOUND_TESTS[idx], ...(code !== undefined && { code }), ...(name !== undefined && { name }), ...(fee !== undefined && { fee }) }
    return toEcg(ECG_ULTRASOUND_TESTS[idx])
  },

  async setActive(id, active) {
    const idx = ECG_ULTRASOUND_TESTS.findIndex((t) => String(t.id) === id)
    if (idx < 0) throw mockApiError(404, "NOT_FOUND", "Test not found")
    ECG_ULTRASOUND_TESTS[idx] = { ...ECG_ULTRASOUND_TESTS[idx], active }
    return toEcg(ECG_ULTRASOUND_TESTS[idx])
  },
}

// ── T2: orders ─────────────────────────────────────────────────────────────────────────

function toOrder(o: LabOrder): LabOrderRecord {
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
  const idx = LAB_ORDERS.findIndex((o) => String(o.id) === id)
  if (idx < 0) throw mockApiError(404, "NOT_FOUND", "Lab order not found")
  return idx
}

export const mockLabOrdersService: LabOrdersService = {
  async list(opts = {}) {
    const q = opts.search?.trim().toLowerCase()
    const matches = [...LAB_ORDERS]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .filter((o) => !opts.status || o.status === opts.status)
      .filter((o) => !opts.patientId || String(o.patientId) === opts.patientId)
      .filter((o) => {
        if (!q) return true
        const patient = PATIENTS.find((p) => p.id === o.patientId)
        return Boolean(patient?.name.toLowerCase().includes(q) || o.labNo.toLowerCase().includes(q) || patient?.mrNo.toLowerCase().includes(q))
      })
    return { items: paginate(matches, opts.page, opts.pageSize).map(toOrder), total: matches.length }
  },

  async get(id) {
    return toOrder(LAB_ORDERS[find(id)])
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

    const lines: (LabOrderTest & { rate: number })[] = input.tests.map((l, i) => {
      const testId = requireLegacyId(l.testId, `tests.${i}.testId`)
      const test = getLabTest(testId)
      if (!test) throw fieldError(400, "VALIDATION_FAILED", "Validation failed", `tests.${i}.testId`, "Unknown test")
      return { testId, testName: test.name, charges: test.rate, rate: test.rate, discountPct: l.discountPct, gstPct: l.gstPct, includedInPackage: l.includedInPackage }
    })
    const { total } = labOrderTotals(lines, input.flatDiscount)

    const order: LabOrder = {
      id: Math.max(0, ...LAB_ORDERS.map((o) => o.id)) + 1,
      labNo: nextLabNo(),
      patientId,
      encounterId,
      doctorId,
      date: new Date().toISOString(),
      priority: input.priority,
      sampleType: input.sampleType,
      sampleId: `SMP-2024-${Math.floor(1000 + Math.random() * 8999)}`,
      clinicalNotes: input.clinicalNotes,
      tests: lines.map(({ testId, testName, charges, discountPct, gstPct, includedInPackage }) => ({ testId, testName, charges, discountPct, gstPct, includedInPackage })),
      discount: input.flatDiscount,
      total,
      paymentStatus: input.paymentMode === "On Account" ? "unpaid" : "paid",
      paymentMode: input.paymentMode,
      status: "Pending",
    }
    LAB_ORDERS.push(order)
    return toOrder(order)
  },

  async transition(id, to) {
    const idx = find(id)
    const current = LAB_ORDERS[idx]
    if (!isLegalLabTransition(current.status, to)) {
      throw fieldError(409, "CONFLICT", "Illegal status change", "status", `An order that is ${current.status} cannot move to ${to}`)
    }
    LAB_ORDERS[idx] = { ...current, status: to }
    return toOrder(LAB_ORDERS[idx])
  },

  async enterResults(id, input) {
    const idx = find(id)
    const current = LAB_ORDERS[idx]
    const tests = current.tests.map((t) => {
      const test = getLabTest(t.testId)
      if (!test) return t
      const entry = input.tests.find((e) => e.testId === String(t.testId))
      if (test.narrative) return { ...t, narrativeResult: entry?.narrativeResult ?? t.narrativeResult }
      if (test.parameters) {
        // The server auto-flags against the normal ranges; this mock does the same.
        const results: LabResultParam[] = test.parameters.map((p) => {
          const typed = entry?.results?.find((r) => r.parameter === p.parameter)?.result
          const value = typed !== undefined ? typed : t.results?.find((r) => r.parameter === p.parameter)?.result ?? ""
          return {
            parameter: p.parameter, result: value, unit: p.unit,
            normalRange: `${p.normalLow}–${p.normalHigh}`, flag: flagFor(parseFloat(value), p.normalLow, p.normalHigh),
          }
        })
        return { ...t, results }
      }
      const raw = entry?.results?.[0]?.result ?? t.results?.[0]?.result ?? ""
      return { ...t, results: [{ parameter: test.name, result: raw, unit: test.unit, normalRange: test.normalRange, flag: "Normal" as const }] }
    })
    LAB_ORDERS[idx] = {
      ...current,
      tests,
      pathologistRemarks: input.pathologistRemarks || current.pathologistRemarks,
      performedBy: input.performedBy ?? current.performedBy,
      verifiedBy: input.verifiedBy || current.verifiedBy,
      status: input.markComplete ? "Completed" : current.status,
    }
    return toOrder(LAB_ORDERS[idx])
  },
}
