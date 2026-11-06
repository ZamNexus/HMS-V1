import type { DataSource } from "./dataSource"
import { ENDPOINTS, type Endpoint, type EndpointKey } from "./endpoints"

// Whether the Dashboard and Financial Statistics screens may talk to a backend. In API mode an operation is available only when its
// endpoint key is set in ./endpoints.ts (which happens only from the OpenAPI spec). Until then the screens say so and request
// nothing. Mock mode is always "connected" to its in-memory demo data. Inspects only the endpoint table: never the network, never a
// guessed route. (Same idea as ./reportsContract.ts and ./financeContract.ts.)

export const DASHBOARD_OPERATIONS = [
  "dashboard.summary", "dashboard.weeklyVisits", "dashboard.revenueTrend", "dashboard.upNext", "dashboard.cashFlow",
  "statistics.summary", "statistics.records", "statistics.dailyCheckupRevenue",
] as const satisfies readonly EndpointKey[]

export type DashboardOperation = (typeof DASHBOARD_OPERATIONS)[number]

export const DASHBOARD_OPERATION_LABELS: Record<DashboardOperation, string> = {
  "dashboard.summary": "dashboard summary tiles",
  "dashboard.weeklyVisits": "weekly patient visits",
  "dashboard.revenueTrend": "revenue trend",
  "dashboard.upNext": "today's scheduled appointments",
  "dashboard.cashFlow": "Cash Flow",
  "statistics.summary": "financial statistics summary",
  "statistics.records": "financial statistics records by category",
  "statistics.dailyCheckupRevenue": "daily checkup revenue",
}

export interface DashboardContract {
  source: DataSource
  /** True when at least one operation has no confirmed endpoint (API mode only). */
  pending: boolean
  missing: readonly DashboardOperation[]
  can: (operation: DashboardOperation) => boolean
}

export function dashboardContractStatus(source: DataSource, table: Record<EndpointKey, Endpoint | null> = ENDPOINTS): DashboardContract {
  const missing = source === "api" ? DASHBOARD_OPERATIONS.filter((op) => table[op] === null) : []
  return { source, pending: missing.length > 0, missing, can: (operation) => !missing.includes(operation) }
}
