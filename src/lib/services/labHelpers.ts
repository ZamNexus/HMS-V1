import type { LabOrderStatus, LabResultParam } from "@/types"

// Pure helpers for the Laboratory screens (unit-tested; no React, no data access).

export const LAB_FILTERS = ["All", "Pending", "Collected", "In Progress", "Completed", "Delivered"] as const
export type LabFilter = (typeof LAB_FILTERS)[number]

/** The list screen's status chips as a service option. */
export function labFilterStatus(filter: LabFilter): LabOrderStatus | undefined {
  return filter === "All" ? undefined : filter
}

/**
 * Status moves the Laboratory screens offer as buttons (Mark Collected, Start Processing, Mark Delivered). Completing an
 * order happens through result entry, not here. The documented workflow is Pending → Collected → In Progress →
 * Completed → Delivered; which transitions the backend permits is CONTRACT REQUIRED.
 */
const NEXT: Partial<Record<LabOrderStatus, LabOrderStatus>> = {
  Pending: "Collected",
  Collected: "In Progress",
  Completed: "Delivered",
}

export function isLegalLabTransition(from: LabOrderStatus, to: LabOrderStatus): boolean {
  return NEXT[from] === to
}

/**
 * Flag for a numeric result against a normal range — the rule the result-entry page has always used. The Task List
 * says the server auto-flags; this is the mock adapter's stand-in and the form's live preview. It never yields
 * "Critical" because no critical thresholds exist in the data. NaN (nothing / non-numeric typed) gives no flag.
 */
export function flagFor(value: number, low: number, high: number): LabResultParam["flag"] {
  if (Number.isNaN(value)) return ""
  if (value > high) return "High"
  if (value < low) return "Low"
  return "Normal"
}

export interface LabLineSettings {
  discountPct: number
  gstPct: number
  includedInPackage?: boolean
}

/** One test's charge after package/discount/GST — the order form's original arithmetic. */
export function labLineTotal(rate: number, s: LabLineSettings): number {
  const charge = s.includedInPackage ? 0 : rate
  const afterDisc = charge - (charge * s.discountPct) / 100
  return afterDisc + (afterDisc * s.gstPct) / 100
}

/** Gross and net total of an order. Whether the server recomputes these is CONTRACT REQUIRED. */
export function labOrderTotals(lines: (LabLineSettings & { rate: number })[], flatDiscount: number): { grossTotal: number; total: number } {
  const grossTotal = lines.reduce((sum, l) => sum + labLineTotal(l.rate, l), 0)
  return { grossTotal, total: Math.max(0, grossTotal - flatDiscount) }
}
