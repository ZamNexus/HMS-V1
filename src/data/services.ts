import type { ServiceCatalogItem } from "@/types"
import { LAB_TESTS } from "@/data/labTests"

export const EXTRA_SERVICES: ServiceCatalogItem[] = [
  { id: 101, code: "SVC-DRS", name: "Dressing", category: "Procedure", rate: 300, active: true },
  { id: 102, code: "SVC-IVD", name: "IV Drip Setup", category: "Procedure", rate: 200, active: true },
  { id: 103, code: "SVC-NEB", name: "Nebulisation", category: "Procedure", rate: 400, active: true },
  { id: 104, code: "SVC-BPC", name: "BP Check", category: "Procedure", rate: 100, active: true },
  { id: 105, code: "SVC-INJ", name: "Injection Admin", category: "Procedure", rate: 150, active: true },
  { id: 106, code: "SVC-SUT", name: "Wound Suturing", category: "Procedure", rate: 1500, active: true },
  { id: 107, code: "SVC-PLS", name: "Plaster", category: "Procedure", rate: 800, active: true },
  { id: 108, code: "SVC-EMG", name: "EMG", category: "Diagnostic", rate: 14000, active: true },
  { id: 109, code: "SVC-EMR", name: "Emergency Charges", category: "Emergency", rate: 1000, active: true },
]

export const SERVICE_CATALOG: ServiceCatalogItem[] = [
  ...LAB_TESTS.map((t) => ({
    id: t.id,
    code: t.code,
    name: t.name,
    category: t.category,
    rate: t.rate,
    active: true,
  })),
  ...EXTRA_SERVICES,
]

export function getService(id: number): ServiceCatalogItem | undefined {
  return SERVICE_CATALOG.find((s) => s.id === id)
}
