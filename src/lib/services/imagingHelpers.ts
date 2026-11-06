import type { LabOrderStatus, LabTestCategory } from "@/types"

// Pure helpers for the Imaging screens (unit-tested; no React, no data access). Money arithmetic is shared with
// Laboratory (labLineTotal / labOrderTotals) — imaging lines carry the same discount / GST / package settings.

/** The list screen's status chips. Imaging has never had a "Collected" chip (no sample is collected). */
export const IMAGING_FILTERS = ["All", "Pending", "In Progress", "Completed", "Delivered"] as const
export type ImagingFilter = (typeof IMAGING_FILTERS)[number]

export function imagingFilterStatus(filter: ImagingFilter): LabOrderStatus | undefined {
  return filter === "All" ? undefined : filter
}

/**
 * The status buttons the imaging detail screen offers: Start Processing, Mark Completed, Mark Delivered. The Task List
 * says imaging has "the same status flow as lab" (Pending → Collected → In Progress → Completed → Delivered) but the UI
 * has always skipped Collected; whether the backend does too, and which transitions it permits, is CONTRACT REQUIRED.
 */
const NEXT: Partial<Record<LabOrderStatus, LabOrderStatus>> = {
  Pending: "In Progress",
  "In Progress": "Completed",
  Completed: "Delivered",
}

export function isLegalImagingTransition(from: LabOrderStatus, to: LabOrderStatus): boolean {
  return NEXT[from] === to
}

/**
 * The order form lists the lab catalogue's Radiology and Cardiology tests (the UI's existing rule). Whether imaging
 * has its own catalogue, or also draws on the ECG/ultrasound tests, is CONTRACT REQUIRED.
 */
export const IMAGING_CATEGORIES: readonly LabTestCategory[] = ["Radiology", "Cardiology"]

export function isImagingTest(test: { category: LabTestCategory }): boolean {
  return IMAGING_CATEGORIES.includes(test.category)
}
