import type { LabOrder, LabOrderTest, LabOrderStatus, LabResultParam } from "@/types"
import { LAB_TESTS, getLabTest } from "@/data/labTests"
import { shiftDate } from "@/lib/dateShift"

function makeTest(testId: number, discountPct = 0): LabOrderTest {
  const t = getLabTest(testId)!
  return { testId, testName: t.name, charges: t.rate, discountPct, gstPct: 0 }
}

function resultFor(testId: number, flagOverride?: LabResultParam["flag"]): LabResultParam[] | undefined {
  const t = getLabTest(testId)
  if (!t?.parameters) return undefined
  return t.parameters.map((p, i) => {
    const mid = (p.normalLow + p.normalHigh) / 2
    const value = i === 0 && flagOverride === "High" ? p.normalHigh + p.normalHigh * 0.15
      : i === 0 && flagOverride === "Low" ? p.normalLow - p.normalLow * 0.2
      : Math.round(mid * 100) / 100
    const flag: LabResultParam["flag"] = value > p.normalHigh ? "High" : value < p.normalLow ? "Low" : "Normal"
    return {
      parameter: p.parameter,
      result: String(value),
      unit: p.unit,
      normalRange: `${p.normalLow}–${p.normalHigh}`,
      flag,
    }
  })
}

const SEED: { patientId: number; doctorId: number; encounterId: number | null; testIds: number[]; status: LabOrderStatus; priority: "Normal" | "Urgent"; date: string }[] = [
  { patientId: 1, doctorId: 2, encounterId: 1, testIds: [1, 3], status: "Delivered", priority: "Normal", date: "2024-08-20T09:15:00" },
  { patientId: 5, doctorId: 2, encounterId: 2, testIds: [9, 6], status: "Completed", priority: "Normal", date: "2024-08-20T09:40:00" },
  { patientId: 3, doctorId: 3, encounterId: 3, testIds: [1, 7, 8], status: "In Progress", priority: "Urgent", date: "2024-08-18T11:10:00" },
  { patientId: 6, doctorId: 2, encounterId: 4, testIds: [3], status: "Collected", priority: "Normal", date: "2024-08-19T10:10:00" },
  { patientId: 11, doctorId: 2, encounterId: 6, testIds: [1, 12], status: "Pending", priority: "Urgent", date: "2024-08-21T09:05:00" },
  { patientId: 12, doctorId: 4, encounterId: 7, testIds: [1], status: "Completed", priority: "Normal", date: "2024-08-21T10:35:00" },
  { patientId: 9, doctorId: 2, encounterId: 8, testIds: [1, 2, 14], status: "Delivered", priority: "Urgent", date: "2024-08-15T08:10:00" },
  { patientId: 15, doctorId: 3, encounterId: 10, testIds: [6, 13], status: "Pending", priority: "Normal", date: "2024-08-22T15:10:00" },
  { patientId: 20, doctorId: 4, encounterId: 14, testIds: [3], status: "Completed", priority: "Normal", date: "2024-08-24T12:10:00" },
  { patientId: 7, doctorId: 2, encounterId: 13, testIds: [7, 4], status: "In Progress", priority: "Normal", date: "2024-08-24T10:10:00" },
]

export const LAB_ORDERS: LabOrder[] = SEED.map((s, i) => {
  const tests = s.testIds.map((tid) => makeTest(tid))
  const total = tests.reduce((sum, t) => sum + t.charges - (t.charges * t.discountPct) / 100, 0)
  const isResulted = s.status === "Completed" || s.status === "Delivered"
  const testsWithResults = tests.map((t) => {
    const test = LAB_TESTS.find((lt) => lt.id === t.testId)!
    if (!isResulted) return t
    if (test.narrative) {
      return { ...t, narrativeResult: "No significant abnormality detected." }
    }
    if (test.parameters) {
      return { ...t, results: resultFor(t.testId, i === 6 ? "High" : undefined) }
    }
    const mid = test.normalRange.includes("–")
      ? test.normalRange.split("–").map(Number)
      : [0, 0]
    const val = mid.length === 2 ? Math.round((mid[0] + mid[1]) / 2) : 0
    return {
      ...t,
      results: [{ parameter: test.name, result: String(val || "Non-Reactive"), unit: test.unit, normalRange: test.normalRange, flag: "Normal" as const }],
    }
  })
  return {
    id: i + 1,
    labNo: `LB-2024-${String(i + 1).padStart(4, "0")}`,
    patientId: s.patientId,
    encounterId: s.encounterId,
    doctorId: s.doctorId,
    date: shiftDate(s.date),
    priority: s.priority,
    sampleType: "Blood",
    sampleId: `SMP-2024-${String(1000 + i)}`,
    collectedBy: s.status === "Pending" ? undefined : "Zara Ahmed",
    tests: testsWithResults,
    discount: 0,
    total,
    paymentStatus: i % 3 === 0 ? "unpaid" : "paid",
    status: s.status,
    pathologistRemarks: isResulted ? "All parameters reviewed. Clinical correlation advised." : undefined,
    performedBy: isResulted ? "Zara Ahmed" : undefined,
    verifiedBy: isResulted ? "Dr. Imran Siddiqui" : undefined,
  }
})

export function getLabOrder(id: number): LabOrder | undefined {
  return LAB_ORDERS.find((o) => o.id === id)
}

export function nextLabNo(): string {
  const max = LAB_ORDERS.reduce((m, o) => Math.max(m, parseInt(o.labNo.split("-").pop() ?? "0", 10)), 0)
  return `LB-2024-${String(max + 1).padStart(4, "0")}`
}
