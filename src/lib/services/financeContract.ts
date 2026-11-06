import type { DataSource } from "./dataSource"
import { ENDPOINTS, type Endpoint, type EndpointKey } from "./endpoints"

// Whether the Billing / Expenses / Bank screens may talk to a backend. In API mode an operation is available only when its
// key in ./endpoints.ts is set (which happens only from the OpenAPI spec). Until then the screens say so, disable the action
// and request nothing. Mock mode is always "connected" to its in-memory demo data. Inspects only the endpoint table: it never
// probes the network and never guesses a route. (Same idea as ./pharmacyContract.ts.)

export const FINANCE_OPERATIONS = [
  "consultationInvoices.list", "consultationInvoices.create", "servicesInvoices.list", "servicesInvoices.create",
  "payments.list", "payments.create", "receipts.list", "receipts.create",
  "expenseCategories.list", "expenseCategories.create", "expenseCategories.update", "expenseCategories.remove",
  "expenses.list", "expenses.create", "expenses.totals",
  "bankAccounts.list", "bankAccounts.create", "bankAccounts.update", "bankTransactions.statement", "bankTransactions.create",
] as const satisfies readonly EndpointKey[]

export type FinanceOperation = (typeof FINANCE_OPERATIONS)[number]

export const FINANCE_OPERATION_LABELS: Record<FinanceOperation, string> = {
  "consultationInvoices.list": "list consultation invoices",
  "consultationInvoices.create": "create a consultation invoice",
  "servicesInvoices.list": "list services invoices",
  "servicesInvoices.create": "create a services invoice",
  "payments.list": "list payments",
  "payments.create": "record a payment",
  "receipts.list": "list receipts",
  "receipts.create": "create a receipt",
  "expenseCategories.list": "list expense categories",
  "expenseCategories.create": "add an expense category",
  "expenseCategories.update": "rename an expense category",
  "expenseCategories.remove": "delete an expense category",
  "expenses.list": "list expenses",
  "expenses.create": "record an expense",
  "expenses.totals": "expense totals by head",
  "bankAccounts.list": "list bank accounts",
  "bankAccounts.create": "add a bank account",
  "bankAccounts.update": "edit a bank account",
  "bankTransactions.statement": "bank statement with running balance",
  "bankTransactions.create": "record a bank transaction",
}

export interface FinanceContract {
  source: DataSource
  /** True when at least one operation has no confirmed endpoint (API mode only). */
  pending: boolean
  /** The operations with no confirmed endpoint. Always empty in mock mode. */
  missing: readonly FinanceOperation[]
  /** Whether the operation may be offered to the user. */
  can: (operation: FinanceOperation) => boolean
  /** True only when every listed operation is available. */
  canAll: (operations: readonly FinanceOperation[]) => boolean
  /** The listed operations that are NOT available. */
  missingOf: (operations: readonly FinanceOperation[]) => FinanceOperation[]
}

export function financeContractStatus(source: DataSource, table: Record<EndpointKey, Endpoint | null> = ENDPOINTS): FinanceContract {
  const missing = source === "api" ? FINANCE_OPERATIONS.filter((op) => table[op] === null) : []
  const can = (operation: FinanceOperation) => !missing.includes(operation)
  return {
    source, pending: missing.length > 0, missing, can,
    canAll: (operations) => operations.every(can),
    missingOf: (operations) => operations.filter((op) => !can(op)),
  }
}
