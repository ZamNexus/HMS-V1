import { endOfWeek, format, startOfWeek } from "date-fns"
import type { PaymentStatus } from "@/types"

// Pure helpers for the Encounters screens (unit-tested; no React, no data access).

export const ENCOUNTER_FILTERS = ["All", "OPD", "IPD", "Today", "This Week"] as const
export type EncounterFilter = (typeof ENCOUNTER_FILTERS)[number]

const ISO_DAY = "yyyy-MM-dd"

/**
 * The list screen's quick filters as service options. "Today" / "This Week" become inclusive date bounds
 * (week = Sunday–Saturday, matching the date-fns `isThisWeek` default the screen used before).
 */
export function encounterFilterOptions(filter: EncounterFilter, now: Date = new Date()) {
  switch (filter) {
    case "OPD":
      return { type: "OPD" as const }
    case "IPD":
      return { type: "IPD" as const }
    case "Today":
      return { dateFrom: format(now, ISO_DAY), dateTo: format(now, ISO_DAY) }
    case "This Week":
      return { dateFrom: format(startOfWeek(now), ISO_DAY), dateTo: format(endOfWeek(now), ISO_DAY) }
    default:
      return {}
  }
}

/**
 * Consultation totals exactly as the wizard has always computed them. Used by the wizard (display) and by the
 * mock adapter (storage). Whether the real backend recomputes these is CONTRACT REQUIRED.
 */
export function encounterTotals(i: {
  fee: number
  discountType: "flat" | "percent"
  discount: number
  paymentStatus: PaymentStatus
  amountReceived?: number
}): { netTotal: number; amountReceived: number; balance: number } {
  const netTotal = i.discountType === "flat" ? Math.max(0, i.fee - i.discount) : Math.max(0, i.fee - (i.fee * i.discount) / 100)
  const received = i.amountReceived ?? 0
  const amountReceived = i.paymentStatus === "unpaid" ? 0 : i.paymentStatus === "paid" ? netTotal : received
  const balance = i.paymentStatus === "paid" ? 0 : i.paymentStatus === "unpaid" ? netTotal : Math.max(0, netTotal - received)
  return { netTotal, amountReceived, balance }
}
