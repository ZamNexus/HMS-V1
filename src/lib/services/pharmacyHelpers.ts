import type { DispenseLineRecord } from "./types"

// Pure helpers for the Pharmacy screens (unit-tested; no React, no data access). They reproduce the rules the screens
// have always used. None of them is a documented backend rule: where the server decides (stock thresholds, short-stock
// handling, totals) is CONTRACT REQUIRED — see the handoff document.

const DAY_MS = 86_400_000
/** The screens' "Expiring Soon" window. Not documented anywhere. */
export const NEAR_EXPIRY_DAYS = 30

export function daysToExpiry(expiry: string, now: number = Date.now()): number {
  return Math.floor((new Date(expiry).getTime() - now) / DAY_MS)
}

export interface StockFacts {
  expiry: string
  stock: number
  reorderLevel: number
}

export type MedicineStatusLabel = "Expired" | "Out of Stock" | "Expiring Soon" | "Low Stock" | "In Stock"

/** The Status badge: expiry beats stock, out of stock beats expiring soon, expiring soon beats low stock. */
export function medicineStatus(m: StockFacts, now: number = Date.now()): { label: MedicineStatusLabel; days?: number } {
  const days = daysToExpiry(m.expiry, now)
  if (days < 0) return { label: "Expired" }
  if (m.stock === 0) return { label: "Out of Stock" }
  if (days <= NEAR_EXPIRY_DAYS) return { label: "Expiring Soon", days }
  if (m.stock < m.reorderLevel) return { label: "Low Stock" }
  return { label: "In Stock" }
}

export const isLowStock = (m: StockFacts) => m.stock > 0 && m.stock < m.reorderLevel
export const isOutOfStock = (m: StockFacts) => m.stock === 0
export const isExpiringSoon = (m: StockFacts, now?: number) => {
  const d = daysToExpiry(m.expiry, now)
  return d >= 0 && d <= NEAR_EXPIRY_DAYS
}
export const isExpired = (m: StockFacts, now?: number) => daysToExpiry(m.expiry, now) < 0

export const INVENTORY_FILTERS = ["All", "Low Stock", "Out of Stock", "Expiring Soon", "Expired"] as const
export type InventoryFilter = (typeof INVENTORY_FILTERS)[number]

export function matchesInventoryFilter(m: StockFacts, filter: InventoryFilter, now: number = Date.now()): boolean {
  switch (filter) {
    case "Low Stock": return isLowStock(m)
    case "Out of Stock": return isOutOfStock(m)
    case "Expiring Soon": return isExpiringSoon(m, now)
    case "Expired": return isExpired(m, now)
    default: return true
  }
}

/** The four header tiles. Inventory value is stock × SALE rate (as the screen always showed it). */
export function inventorySummary(items: readonly (StockFacts & { saleRate: number })[], now: number = Date.now()) {
  return {
    totalItems: items.length,
    inventoryValue: items.reduce((sum, m) => sum + m.stock * m.saleRate, 0),
    lowStock: items.filter(isLowStock).length,
    expiringSoon: items.filter((m) => isExpiringSoon(m, now)).length,
  }
}

export interface DispenseRowInput {
  medicineId: string
  qty: number
  discountPct: number
  includedInPackage: boolean
  instructions?: string
}

export interface DispenseMedicineFacts {
  name: string
  stock: number
  saleRate: number
}

export interface StockShortfall {
  /** Index of the offending row in the array passed in. */
  rowIndex: number
  medicineId: string
  medicineName: string
  requested: number
  /** What was still on the shelf for this row, after the rows above it for the same medicine. */
  available: number
}

/**
 * Rows asking for more than is on the shelf. The Task List says dispensing must be refused on short stock ("refusal on
 * short stock"), so any shortfall makes the whole dispense unacceptable. The same medicine on several rows draws on one
 * shelf: each row is checked against what the rows above it left. Rows with no medicine, an unknown medicine or a
 * quantity that is not a positive number are not shortfalls (those are separate validation errors). Pure — it changes nothing.
 */
export function findStockShortfalls(
  rows: readonly { medicineId: string | null; qty: number }[],
  medicineOf: (id: string) => Pick<DispenseMedicineFacts, "name" | "stock"> | undefined
): StockShortfall[] {
  const remaining = new Map<string, number>()
  const shortfalls: StockShortfall[] = []
  rows.forEach((r, rowIndex) => {
    if (r.medicineId === null || !Number.isFinite(r.qty) || r.qty <= 0) return
    const med = medicineOf(r.medicineId)
    if (!med) return
    const left = remaining.get(r.medicineId) ?? med.stock
    if (r.qty > left) shortfalls.push({ rowIndex, medicineId: r.medicineId, medicineName: med.name, requested: r.qty, available: left })
    else remaining.set(r.medicineId, left - r.qty)
  })
  return shortfalls
}

/**
 * The lines a dispense would produce, from the rows the user filled in: what was asked for is what is charged and
 * dispensed (dispensed = prescribed). It does NOT check stock — a dispense with a shortfall (see findStockShortfalls)
 * must be refused, not trimmed to the shelf. Rows whose medicine is unknown are skipped.
 */
export function planDispense(rows: readonly DispenseRowInput[], medicineOf: (id: string) => DispenseMedicineFacts | undefined): DispenseLineRecord[] {
  const lines: DispenseLineRecord[] = []
  for (const r of rows) {
    const med = medicineOf(r.medicineId)
    if (!med) continue
    const dispensed = Math.max(0, r.qty)
    const charge = r.includedInPackage ? 0 : dispensed * med.saleRate
    lines.push({
      medicineId: r.medicineId, medicineName: med.name, prescribedQty: r.qty, dispensedQty: dispensed, unitRate: med.saleRate,
      discountPct: r.discountPct, includedInPackage: r.includedInPackage, total: charge - (charge * r.discountPct) / 100,
      instructions: r.instructions,
    })
  }
  return lines
}

/** Gross (before package/discounts), subtotal (after line discounts), then the flat discount % and GST % on top. */
export function dispenseTotals(lines: readonly Pick<DispenseLineRecord, "dispensedQty" | "unitRate" | "total">[], discountPct: number, gstPct: number) {
  const grossTotal = lines.reduce((s, l) => s + l.dispensedQty * l.unitRate, 0)
  const subtotal = lines.reduce((s, l) => s + l.total, 0)
  const afterDiscount = Math.max(0, subtotal - (subtotal * discountPct) / 100)
  const netPayable = afterDiscount + (afterDiscount * gstPct) / 100
  return { grossTotal, subtotal, afterDiscount, netPayable }
}
