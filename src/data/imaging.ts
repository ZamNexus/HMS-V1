import type { ImagingOrder, LabOrderTest } from "@/types"
import { getLabTest } from "@/data/labTests"
import { shiftDate } from "@/lib/dateShift"

function makeTest(testId: number): LabOrderTest {
  const t = getLabTest(testId)!
  return { testId, testName: t.name, charges: t.rate, discountPct: 0, gstPct: 0, narrativeResult: "No significant abnormality detected." }
}

const RAW_IMAGING_ORDERS: ImagingOrder[] = [
  { id: 1, xrNo: "XRY-2024-0001", patientId: 9, encounterId: 8, doctorId: 2, date: "2024-08-15T08:20:00", tests: [makeTest(14)], discount: 0, total: 800, paymentMode: "Cash", status: "Delivered" },
  { id: 2, xrNo: "XRY-2024-0002", patientId: 15, encounterId: 10, doctorId: 3, date: "2024-08-22T15:20:00", tests: [makeTest(15)], discount: 0, total: 2500, paymentMode: "Insurance", status: "Completed" },
  { id: 3, xrNo: "XRY-2024-0003", patientId: 3, encounterId: 3, doctorId: 3, date: "2024-08-18T11:20:00", tests: [makeTest(13)], discount: 0, total: 500, paymentMode: "Insurance", status: "In Progress" },
  { id: 4, xrNo: "XRY-2024-0004", patientId: 17, encounterId: 15, doctorId: 5, date: "2024-08-10T09:20:00", tests: [makeTest(14), makeTest(13)], discount: 100, total: 1200, paymentMode: "Cash", status: "Pending" },
]
export const IMAGING_ORDERS: ImagingOrder[] = RAW_IMAGING_ORDERS.map((o) => ({ ...o, date: shiftDate(o.date) }))

export function getImagingOrder(id: number): ImagingOrder | undefined {
  return IMAGING_ORDERS.find((o) => o.id === id)
}
