import type { DataSource } from "./dataSource"
import { ENDPOINTS, type Endpoint, type EndpointKey } from "./endpoints"

// Whether the Pharmacy screens may talk to a backend. In API mode an operation is available only when its endpoint is
// configured in ./endpoints.ts (which happens only from the OpenAPI spec). Until then the screens say so, disable the
// action and request nothing. Mock mode is always "connected" to its in-memory demo data. This never inspects the
// network and never guesses a route.

export const PHARMACY_OPERATIONS = [
  "medicines.list", "medicines.create", "medicines.update", "medicines.adjustStock", "dispensing.list", "dispensing.create",
] as const satisfies readonly EndpointKey[]

export type PharmacyOperation = (typeof PHARMACY_OPERATIONS)[number]

export const PHARMACY_OPERATION_LABELS: Record<PharmacyOperation, string> = {
  "medicines.list": "list medicines (inventory, stock, tiles)",
  "medicines.create": "add a medicine",
  "medicines.update": "edit a medicine",
  "medicines.adjustStock": "adjust stock",
  "dispensing.list": "list dispense records (history)",
  "dispensing.create": "dispense medicines",
}

export interface PharmacyContract {
  source: DataSource
  /** True when at least one Pharmacy operation has no confirmed endpoint (API mode only). */
  pending: boolean
  /** The operations with no confirmed endpoint. Always empty in mock mode. */
  missing: readonly PharmacyOperation[]
  /** Whether the operation may be offered to the user. */
  can: (operation: PharmacyOperation) => boolean
}

export function pharmacyContractStatus(source: DataSource, table: Record<EndpointKey, Endpoint | null> = ENDPOINTS): PharmacyContract {
  const missing = source === "api" ? PHARMACY_OPERATIONS.filter((op) => table[op] === null) : []
  return { source, pending: missing.length > 0, missing, can: (operation) => !missing.includes(operation) }
}
