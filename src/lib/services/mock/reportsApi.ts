import { NotConnectedError } from "../errors"
import type { ReportsApiService } from "../types"

// The demo keeps the prototype's own report screens (mock/reports.ts); this API-shaped service has no demo data, so every call says so.
const none = (what: string) => async (): Promise<never> => { throw new NotConnectedError(`${what} (the demo uses its own report screens)`) }

export const mockReportsApiService: ReportsApiService = {
  revenue: none("the revenue report"), collections: none("the collections report"), outstanding: none("the outstanding report"), outstandingPatients: none("the patient balances"),
  dailySummary: none("the daily summary"), opd: none("the OPD report"), demographics: none("the demographics report"), lab: none("the laboratory report"), pharmacy: none("the pharmacy report"),
  financialSummary: none("the financial summary"), revenueDaily: none("the daily revenue"), cashFlow: none("the cash flow"), expensesReport: none("the expenses report"), prescriptions: none("prescription history"),
  dashboard: none("the dashboard"),
}
