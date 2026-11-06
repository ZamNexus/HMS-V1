import type { DataSource } from "./dataSource"
import { ENDPOINTS, type Endpoint, type EndpointKey } from "./endpoints"

// Whether the Master Data services catalogue, Item History (T12) and the patient / encounter balance panels may talk to a backend. In
// API mode an operation is available only when its endpoint key is set in ./endpoints.ts (which happens only from the OpenAPI spec).
// Until then the screens say so, disable the action and request nothing. Mock mode is always "connected" to its in-memory demo data.
// Inspects only the endpoint table: never the network, never a guessed route. (Same idea as ./dashboardContract.ts.)
// Top-bar notifications are not listed: they have no endpoint key at all because no document mentions them.

export const CROSS_MODULE_OPERATIONS = [
  "serviceCatalog.list", "serviceCatalog.create", "serviceCatalog.update", "itemHistory.list", "billSummary.patient", "billSummary.encounter",
] as const satisfies readonly EndpointKey[]

export type CrossModuleOperation = (typeof CROSS_MODULE_OPERATIONS)[number]

export const CROSS_MODULE_OPERATION_LABELS: Record<CrossModuleOperation, string> = {
  "serviceCatalog.list": "list the services catalogue",
  "serviceCatalog.create": "add a service to the catalogue",
  "serviceCatalog.update": "edit or deactivate a catalogue service",
  "itemHistory.list": "Item History (audit-log read, T12)",
  "billSummary.patient": "patient bill summary",
  "billSummary.encounter": "encounter bill summary",
}

export interface CrossModuleContract {
  source: DataSource
  /** True when at least one operation has no confirmed endpoint (API mode only). */
  pending: boolean
  missing: readonly CrossModuleOperation[]
  can: (operation: CrossModuleOperation) => boolean
}

export function crossModuleContractStatus(source: DataSource, table: Record<EndpointKey, Endpoint | null> = ENDPOINTS): CrossModuleContract {
  const missing = source === "api" ? CROSS_MODULE_OPERATIONS.filter((op) => table[op] === null) : []
  return { source, pending: missing.length > 0, missing, can: (operation) => !missing.includes(operation) }
}
