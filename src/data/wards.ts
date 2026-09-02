import type { Ward, Bed } from "@/types"

function makeBeds(count: number, occupied: number, prefix: string, patientIds: number[] = []): Bed[] {
  const beds: Bed[] = []
  for (let i = 1; i <= count; i++) {
    const isOccupied = i <= occupied
    beds.push({
      bedNo: `${prefix}-${String(i).padStart(2, "0")}`,
      status: isOccupied ? "occupied" : i === count ? "maintenance" : "available",
      patientId: isOccupied ? patientIds[i - 1] ?? null : null,
      since: isOccupied ? "2024-08-20" : null,
    })
  }
  return beds
}

export const WARDS: Ward[] = [
  { id: 1, name: "General Ward M", type: "General", beds: makeBeds(10, 7, "GWM", [3]) },
  { id: 2, name: "General Ward F", type: "General", beds: makeBeds(10, 5, "GWF") },
  { id: 3, name: "Children Ward", type: "Children", beds: makeBeds(6, 2, "CHW") },
  { id: 4, name: "Private Rooms", type: "Private", beds: makeBeds(5, 3, "PVT", [9]) },
  { id: 5, name: "ICU", type: "ICU", beds: makeBeds(4, 1, "ICU", [17]) },
]
