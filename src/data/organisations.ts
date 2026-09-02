import type { Panel } from "@/types"

export const PANELS: Panel[] = [
  { id: 1, name: "EFU Insurance", type: "Insurance", contactPerson: "Bilal Anwar", phone: "042-111-338-338", commissionPct: 15, active: true },
  { id: 2, name: "State Life", type: "Insurance", contactPerson: "Nasreen Akhtar", phone: "051-9271234", commissionPct: 12, active: true },
  { id: 3, name: "PTCL Panel", type: "Corporate", contactPerson: "Hamid Sultan", phone: "051-2222001", commissionPct: 10, active: true },
  { id: 4, name: "Army Medical", type: "Government", contactPerson: "Col. Farrukh", phone: "051-9280000", commissionPct: 0, active: true },
  { id: 5, name: "Govt Employee Panel", type: "Government", contactPerson: "Shazia Kausar", phone: "051-9203456", commissionPct: 0, active: true },
]

export function getPanel(id: number | null): Panel | undefined {
  if (id === null) return undefined
  return PANELS.find((p) => p.id === id)
}
