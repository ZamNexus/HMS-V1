import type { DispenseRecord, DispenseLine } from "@/types"
import { getMedicine } from "@/data/medicines"
import { ENCOUNTERS } from "@/data/encounters"
import { shiftDate } from "@/lib/dateShift"

function lineFor(medicineId: number, qty: number): DispenseLine {
  const m = getMedicine(medicineId)!
  return {
    medicineId, medicineName: m.name, prescribedQty: qty, dispensedQty: qty,
    unitRate: m.saleRate, total: m.saleRate * qty,
  }
}

const SEED: { patientId: number; encounterId: number | null; lines: DispenseLine[]; mode: "Cash" | "Card" | "On Account" }[] = [
  { patientId: 1, encounterId: 1, lines: [lineFor(1, 10), lineFor(2, 6)], mode: "Cash" },
  { patientId: 5, encounterId: 2, lines: [lineFor(7, 60), lineFor(13, 30)], mode: "Cash" },
  { patientId: 3, encounterId: 3, lines: [lineFor(8, 30), lineFor(14, 30)], mode: "On Account" },
  { patientId: 8, encounterId: 5, lines: [lineFor(16, 5), lineFor(30, 12)], mode: "Card" },
  { patientId: 11, encounterId: 6, lines: [lineFor(2, 8)], mode: "Cash" },
  { patientId: 12, encounterId: 7, lines: [lineFor(22, 60), lineFor(21, 60)], mode: "Cash" },
  { patientId: 9, encounterId: 8, lines: [lineFor(12, 6), lineFor(26, 3)], mode: "On Account" },
  { patientId: 14, encounterId: 9, lines: [lineFor(3, 10)], mode: "Cash" },
  { patientId: 15, encounterId: 10, lines: [lineFor(3, 20), lineFor(23, 30)], mode: "Cash" },
  { patientId: 16, encounterId: 11, lines: [lineFor(25, 30)], mode: "Cash" },
  { patientId: 4, encounterId: 12, lines: [lineFor(24, 8)], mode: "Card" },
  { patientId: 20, encounterId: 14, lines: [lineFor(11, 10)], mode: "Cash" },
]

export const DISPENSE_RECORDS: DispenseRecord[] = SEED.map((s, i) => {
  const subtotal = s.lines.reduce((sum, l) => sum + l.total, 0)
  const enc = ENCOUNTERS.find((e) => e.id === s.encounterId)
  return {
    id: i + 1,
    disNo: `DIS-2024-${String(i + 1).padStart(4, "0")}`,
    patientId: s.patientId,
    encounterId: s.encounterId,
    date: enc?.date ?? shiftDate("2024-08-20T12:00:00"),
    lines: s.lines,
    subtotal,
    discountPct: 0,
    netPayable: subtotal,
    paymentMode: s.mode,
    dispensedBy: "Omar Farooq",
  }
})

export function nextDispenseNo(): string {
  const max = DISPENSE_RECORDS.reduce((m, d) => Math.max(m, parseInt(d.disNo.split("-").pop() ?? "0", 10)), 0)
  return `DIS-2024-${String(max + 1).padStart(4, "0")}`
}
