// The seven lists of Reports > Lists (D7) and who may read each (handoff 8.11: they are the ordinary list endpoints, so each needs its own read permission).
export const LIST_KEYS = ["patients", "doctors", "services", "panels", "expense-heads", "lab-tests", "admitted"] as const
export type ListKey = (typeof LIST_KEYS)[number]
export const LIST_LABEL: Record<ListKey, string> = {
  patients: "Patient List", doctors: "Doctor List", services: "Services/Items", panels: "Organizations List", "expense-heads": "Expense Head List", "lab-tests": "Lab Test List", admitted: "Admitted Patients List",
}
export const LIST_PERMISSIONS: Record<ListKey, readonly string[]> = {
  patients: ["patients.read"], doctors: ["doctors.read"], services: ["catalogs.read"], panels: ["catalogs.read"], "expense-heads": ["catalogs.read"], "lab-tests": ["catalogs.read"],
  admitted: ["encounters.read", "encounters.check_in"],
}
export const listFromUrl = (v: string | undefined): ListKey => LIST_KEYS.find((k) => k === v) ?? "patients"
