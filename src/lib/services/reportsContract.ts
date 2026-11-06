import type { DataSource } from "./dataSource"
import { ENDPOINTS, type Endpoint, type EndpointKey } from "./endpoints"

// Whether the report screens may talk to a backend. In API mode a report is available only when its endpoint key is set in
// ./endpoints.ts (which happens only from the OpenAPI spec). Until then the report page says so, disables its controls and requests
// nothing. Mock mode is always "connected" to its in-memory demo data. Inspects only the endpoint table: never the network, never a
// guessed route. (Same idea as ./financeContract.ts and ./pharmacyContract.ts.) Reports that are built purely from other services
// (Expenses totals / list, the bank statement, the Lists report) are not listed here — they are as connected as those services are.

export const REPORT_OPERATIONS = [
  "reports.dailySummary", "reports.dailyTransactions", "reports.opdStatistics", "reports.revenue", "reports.laboratory", "reports.pharmacy",
  "reports.expenseTrend", "reports.demographics", "reports.patientBalances", "reports.organisationBalances", "reports.patientAccountSummary",
  "reports.accountsPayments", "reports.accountsReceipts", "reports.prescriptionHistory", "serviceCatalog.list",
] as const satisfies readonly EndpointKey[]

export type ReportOperation = (typeof REPORT_OPERATIONS)[number]

export const REPORT_OPERATION_LABELS: Record<ReportOperation, string> = {
  "reports.dailySummary": "Daily Summary report",
  "reports.dailyTransactions": "Daily Transactions report",
  "reports.opdStatistics": "OPD Statistics report",
  "reports.revenue": "Revenue report",
  "reports.laboratory": "Laboratory report",
  "reports.pharmacy": "Pharmacy report",
  "reports.expenseTrend": "Expenses daily trend",
  "reports.demographics": "Patient Demographics report",
  "reports.patientBalances": "Patient Balances report",
  "reports.organisationBalances": "Organization Wise Balances report",
  "reports.patientAccountSummary": "Patient Account Summary report",
  "reports.accountsPayments": "Accounts — payments report",
  "reports.accountsReceipts": "Accounts — receipts report",
  "reports.prescriptionHistory": "Prescription History report",
  "serviceCatalog.list": "services catalogue list (Lists report)",
}

export interface ReportsContract {
  source: DataSource
  /** True when at least one report operation has no confirmed endpoint (API mode only). */
  pending: boolean
  missing: readonly ReportOperation[]
  can: (operation: ReportOperation) => boolean
}

export function reportsContractStatus(source: DataSource, table: Record<EndpointKey, Endpoint | null> = ENDPOINTS): ReportsContract {
  const missing = source === "api" ? REPORT_OPERATIONS.filter((op) => table[op] === null) : []
  return { source, pending: missing.length > 0, missing, can: (operation) => !missing.includes(operation) }
}
