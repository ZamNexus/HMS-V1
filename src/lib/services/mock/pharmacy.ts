import { ENCOUNTERS } from "@/data/encounters"
import { MEDICINES } from "@/data/medicines"
import { DISPENSE_RECORDS, nextDispenseNo } from "@/data/pharmacy"
import { PATIENTS } from "@/data/patients"
import type { DispenseRecord, Medicine } from "@/types"
import { paginate } from "../listing"
import { dispenseTotals, findStockShortfalls, planDispense } from "../pharmacyHelpers"
import { legacyNumericId } from "../reference/refId"
import type { DispensingRecord, DispensingService, MedicineRecord, MedicinesService } from "../types"
import { mockApiError } from "./mockError"

// Mutate the shared MEDICINES / DISPENSE_RECORDS arrays in place, as the screens used to do inline: the dashboard, the
// top-bar stock notifications, the pharmacy report, billing roll-ups, the patient detail tab and the encounter
// prescription picker still read them directly and must keep seeing the same records. Mock mode only understands legacy
// numeric ids; anything else is rejected, never coerced.

const fieldError = (status: number, code: string, message: string, path: string, detail: string) =>
  mockApiError(status, code, message, [{ path, message: detail }])

function requireLegacyId(value: string, path: string): number {
  const n = legacyNumericId(value)
  if (n === null) throw fieldError(400, "VALIDATION_FAILED", "Validation failed", path, "Mock mode only supports numeric legacy ids")
  return n
}

// ── T4: inventory ──────────────────────────────────────────────────────────────────────

const toMedicine = (m: Medicine): MedicineRecord => ({ ...m, id: String(m.id) })

function findMedicine(id: string): number {
  const idx = MEDICINES.findIndex((m) => String(m.id) === id)
  if (idx < 0) throw mockApiError(404, "NOT_FOUND", "Medicine not found")
  return idx
}

export const mockMedicinesService: MedicinesService = {
  async list(opts = {}) {
    const q = opts.search?.trim().toLowerCase()
    const matches = MEDICINES.filter((m) => !q || m.name.toLowerCase().includes(q) || m.generic.toLowerCase().includes(q))
    return { items: paginate(matches, opts.page, opts.pageSize).map(toMedicine), total: matches.length }
  },

  async create(input) {
    const details = []
    if (!input.name.trim()) details.push({ path: "name", message: "Medicine Name is required" })
    if (!input.batchNo.trim()) details.push({ path: "batchNo", message: "Batch No. is required" })
    if (!input.expiry) details.push({ path: "expiry", message: "Expiry Date is required" })
    if (!input.saleRate) details.push({ path: "saleRate", message: "Sale Rate is required" })
    if (details.length) throw mockApiError(400, "VALIDATION_FAILED", "Validation failed", details)
    // Demo-only defaults, exactly as the dialog always applied them: the dialog collects no unit or purchase rate.
    const medicine: Medicine = {
      id: Math.max(0, ...MEDICINES.map((m) => m.id)) + 1,
      name: input.name, generic: input.generic, category: input.category, batchNo: input.batchNo, expiry: input.expiry,
      stock: input.stock, unit: "Tablet", purchaseRate: Math.round(input.saleRate * 0.6), saleRate: input.saleRate, reorderLevel: input.reorderLevel,
    }
    MEDICINES.push(medicine)
    return toMedicine(medicine)
  },

  async update(id, input) {
    const idx = findMedicine(id)
    MEDICINES[idx] = {
      ...MEDICINES[idx], name: input.name, generic: input.generic, category: input.category, batchNo: input.batchNo,
      expiry: input.expiry, stock: input.stock, saleRate: input.saleRate, reorderLevel: input.reorderLevel,
    }
    return toMedicine(MEDICINES[idx])
  },

  async adjustStock(id, input) {
    const idx = findMedicine(id)
    if (!Number.isFinite(input.quantity) || input.quantity <= 0) throw fieldError(400, "VALIDATION_FAILED", "Validation failed", "quantity", "Quantity must be greater than 0")
    // As the dialog always did: removing more than is on hand floors the stock at 0 (whether the backend refuses is CONTRACT REQUIRED).
    const delta = input.direction === "Add" ? input.quantity : -input.quantity
    MEDICINES[idx] = { ...MEDICINES[idx], stock: Math.max(0, MEDICINES[idx].stock + delta) }
    return toMedicine(MEDICINES[idx])
  },
}

// ── T5: dispensing ─────────────────────────────────────────────────────────────────────

function toDispense(d: DispenseRecord): DispensingRecord {
  return {
    ...d,
    id: String(d.id),
    patientId: String(d.patientId),
    encounterId: d.encounterId === null ? null : String(d.encounterId),
    doctorId: d.doctorId === undefined ? undefined : String(d.doctorId),
    lines: d.lines.map((l) => ({ ...l, medicineId: String(l.medicineId) })),
  }
}

export const mockDispensingService: DispensingService = {
  async list(opts = {}) {
    const q = opts.search?.trim().toLowerCase()
    const matches = [...DISPENSE_RECORDS]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .filter((d) => !opts.patientId || String(d.patientId) === opts.patientId)
      .filter((d) => {
        if (!q) return true
        const patient = PATIENTS.find((p) => p.id === d.patientId)
        return Boolean(patient?.name.toLowerCase().includes(q) || d.disNo.toLowerCase().includes(q))
      })
    return { items: paginate(matches, opts.page, opts.pageSize).map(toDispense), total: matches.length }
  },

  async create(input) {
    // Validate everything before touching stock, so a rejected dispense changes nothing.
    const patientId = requireLegacyId(input.patientId, "patientId")
    const doctorId = input.doctorId === undefined ? undefined : requireLegacyId(input.doctorId, "doctorId")
    let encounterId: number | null = null
    if (input.encounterId !== undefined) {
      encounterId = requireLegacyId(input.encounterId, "encounterId")
      if (!ENCOUNTERS.some((e) => e.id === encounterId)) throw fieldError(400, "VALIDATION_FAILED", "Validation failed", "encounterId", "Unknown encounter")
    }
    if (input.lines.length === 0) throw fieldError(400, "VALIDATION_FAILED", "Validation failed", "lines", "Add at least one medicine")
    const medicineIds = input.lines.map((l, i) => {
      const id = requireLegacyId(l.medicineId, `lines.${i}.medicineId`)
      if (!MEDICINES.some((m) => m.id === id)) throw fieldError(400, "VALIDATION_FAILED", "Validation failed", `lines.${i}.medicineId`, "Unknown medicine")
      if (!Number.isFinite(l.quantity) || l.quantity <= 0) throw fieldError(400, "VALIDATION_FAILED", "Validation failed", `lines.${i}.quantity`, "Quantity must be greater than 0")
      return id
    })

    // Task List (T5): "refusal on short stock". If ANY line asks for more than is on the shelf (the same medicine on several
    // lines draws on one shelf), the whole dispense is refused with a per-line error and nothing is deducted or stored.
    // The real error code / body is CONTRACT REQUIRED; this reuses the mock's field-error shape.
    const medicineOf = (id: string) => MEDICINES.find((m) => String(m.id) === id)
    const shortfalls = findStockShortfalls(input.lines.map((l) => ({ medicineId: l.medicineId, qty: l.quantity })), medicineOf)
    if (shortfalls.length > 0) {
      throw mockApiError(400, "VALIDATION_FAILED", "Insufficient stock — nothing was dispensed", shortfalls.map((s) => ({
        path: `lines.${s.rowIndex}.quantity`,
        message: `${s.medicineName}: ${s.requested} requested, ${s.available} in stock`,
      })))
    }

    const lines = planDispense(
      input.lines.map((l) => ({ medicineId: l.medicineId, qty: l.quantity, discountPct: l.discountPct, includedInPackage: l.includedInPackage, instructions: l.instructions })),
      medicineOf
    )
    const { subtotal, netPayable } = dispenseTotals(lines, input.discountPct, input.gstPct)

    // Everything is validated and stock is sufficient for every line: only now does stock leave the shelf, line by line.
    lines.forEach((l, i) => {
      const idx = MEDICINES.findIndex((m) => m.id === medicineIds[i])
      MEDICINES[idx] = { ...MEDICINES[idx], stock: MEDICINES[idx].stock - l.dispensedQty }
    })

    const record: DispenseRecord = {
      id: Math.max(0, ...DISPENSE_RECORDS.map((d) => d.id)) + 1,
      disNo: nextDispenseNo(),
      patientId,
      encounterId,
      doctorId,
      date: new Date().toISOString(),
      lines: lines.map((l, i) => ({ ...l, medicineId: medicineIds[i] })),
      subtotal,
      discountPct: input.discountPct,
      gstPct: input.gstPct,
      netPayable,
      paymentMode: input.paymentMode,
      // Demo attribution, as the screen always stored. The form never asked who dispensed; the backend may take it from the token.
      dispensedBy: "Omar Farooq",
      notes: input.notes,
    }
    DISPENSE_RECORDS.push(record)
    return toDispense(record)
  },
}
