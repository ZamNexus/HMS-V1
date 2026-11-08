import type { PmDispense, PmDispenseLineInput, PmExpiry, PmLevel, PmMovementType, PmPrescriptionLine } from "@/lib/services"

// Pure helpers for the pharmacy screens (unit-tested). Stock is batches and every figure (on hand, level, expiry, value) comes from the server on each medicine: nothing here sums
// batches or computes a level. Only whole-number quantities are compared (a short line, a return limit).

export const PM_TABS = ["inventory", "dispense", "history"] as const
export type PmTab = (typeof PM_TABS)[number]
export const PM_TAB_LABEL: Record<PmTab, string> = { inventory: "Inventory", dispense: "Dispense", history: "History" }

export const PM_LEVEL_LABEL: Record<PmLevel, string> = { in_stock: "In stock", low: "Low stock", out_of_stock: "Out of stock" }
export const PM_EXPIRY_LABEL: Record<Exclude<PmExpiry, null>, string> = { expired: "Has expired stock", expiring: "Expiring soon" }
export const PM_MOVEMENT_LABEL: Record<PmMovementType, string> = { received: "Received", dispensed: "Dispensed", returned: "Returned", written_off: "Written off", adjusted: "Adjusted" }

export function levelClass(level: PmLevel): string {
  return level === "out_of_stock" ? "bg-red-100 text-red-700" : level === "low" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-700"
}
export function expiryClass(expiry: Exclude<PmExpiry, null>): string {
  return expiry === "expired" ? "bg-red-600 text-white" : "bg-orange-100 text-orange-800"
}

/** One medicine line on the dispense screen. The quantity is typed text until sent. */
export interface DraftLine {
  key: number
  medicineId: string
  medicineName: string
  /** The server's figure for what is on hand (shown, never recomputed). */
  onHand: number | null
  quantity: string
  instructions: string
  /** Set when the line fulfils a prescription line; a substitute medicine is an unlinked line. */
  prescriptionLineId: string | null
  /** The prescription line this started from: its text, what remains, and the catalogue medicine the doctor picked (null for free text). */
  rx: { text: string; remaining: number | null; medicineId: string | null } | null
}

/** A draft for a prescription line. The catalogue medicine the doctor picked is chosen if it is still active; otherwise the pharmacist picks what to give. The quantity starts at what remains. */
export function draftForRx(line: PmPrescriptionLine, key: number): DraftLine {
  const usable = line.medicine && line.medicine.active ? line.medicine : null
  return {
    key, medicineId: usable?.id ?? "", medicineName: usable?.name ?? "", onHand: null, quantity: line.remaining !== null && line.remaining > 0 ? String(line.remaining) : "",
    instructions: [line.dose, line.route, line.frequency, line.duration].filter(Boolean).join(" ") || (line.instructions ?? ""), prescriptionLineId: line.id, rx: { text: line.medicineText, remaining: line.remaining, medicineId: line.medicine?.id ?? null },
  }
}
export function emptyDraft(key: number): DraftLine {
  return { key, medicineId: "", medicineName: "", onHand: null, quantity: "", instructions: "", prescriptionLineId: null, rx: null }
}
/** Whole-number text only: "8" is 8, "8.5", "-1", "abc" and "" are not. */
export function wholeQuantity(text: string): number | null {
  return /^\d{1,7}$/.test(text.trim()) ? Number(text.trim()) : null
}
/**
 * The lines that will be sent: those with a medicine and a quantity above zero. Lines left empty are skipped (a prescription line the pharmacist does not dispense today). A line is linked
 * to its prescription line (`prescriptionLineId`) unless the pharmacist chose a DIFFERENT medicine than the doctor's catalogue pick: a substitute medicine is an unlinked line (handoff 8.9).
 */
export function linesToSend(drafts: readonly DraftLine[]): PmDispenseLineInput[] {
  return drafts.filter((d) => d.medicineId && (wholeQuantity(d.quantity) ?? 0) > 0).map((d) => ({
    medicineId: d.medicineId, quantity: wholeQuantity(d.quantity) as number, prescriptionLineId: linkedTo(d), instructions: d.instructions.trim() || undefined,
  }))
}
function linkedTo(d: DraftLine): string | undefined {
  if (!d.prescriptionLineId) return undefined
  return d.rx?.medicineId && d.rx.medicineId !== d.medicineId ? undefined : d.prescriptionLineId
}
/** True when this line gives a different medicine than the one the doctor prescribed (a substitute). */
export function isSubstitute(d: DraftLine): boolean {
  return !!d.medicineId && !!d.rx?.medicineId && d.rx.medicineId !== d.medicineId
}
/** Why a draft line cannot be sent yet, or null. */
export function draftProblem(d: DraftLine): string | null {
  if (d.quantity.trim() === "" && !d.medicineId) return null
  if (d.quantity.trim() !== "" && wholeQuantity(d.quantity) === null) return "Quantity must be a whole number."
  if ((wholeQuantity(d.quantity) ?? 0) > 0 && !d.medicineId) return "Choose the medicine."
  return null
}
/** Lines the server could only part-fill (a line takes what is available): compare `dispensed` with `requested`. */
export function shortages(d: Pick<PmDispense, "lines">): { name: string; requested: number; dispensed: number }[] {
  return d.lines.filter((l) => l.dispensed < l.requested).map((l) => ({ name: l.name, requested: l.requested, dispensed: l.dispensed }))
}
/** What can still be returned from a line: dispensed minus returned (whole numbers). */
export function returnable(line: { dispensed: number; returned: number }): number {
  return Math.max(0, line.dispensed - line.returned)
}
/** `details.lines` of a 422 OUT_OF_STOCK, as readable names (the backend's shape is not published: strings or objects with a name are shown, anything else is skipped). */
export function outOfStockNames(details: unknown): string[] {
  const lines = details && typeof details === "object" && !Array.isArray(details) ? (details as Record<string, unknown>).lines : undefined
  if (!Array.isArray(lines)) return []
  return lines.map((l) => (typeof l === "string" ? l : l && typeof l === "object" && typeof (l as Record<string, unknown>).name === "string" ? ((l as Record<string, unknown>).name as string) : null)).filter((x): x is string => !!x)
}
