import * as React from "react"
import { Download, Printer } from "lucide-react"

import { EXPENSES } from "@/data/billing"
import { cn } from "@/lib/utils"
import { buildCSV } from "@/lib/csv"
import { DailySummaryReport } from "@/pages/reports/DailySummaryReport"
import { DailyTransactionsReport } from "@/pages/reports/DailyTransactionsReport"
import { OpdStatisticsReport } from "@/pages/reports/OpdStatisticsReport"
import { RevenueReport } from "@/pages/reports/RevenueReport"
import { LabReport } from "@/pages/reports/LabReport"
import { PharmacyReport } from "@/pages/reports/PharmacyReport"
import { ExpenseReport } from "@/pages/reports/ExpenseReport"
import { PatientDemographicsReport } from "@/pages/reports/PatientDemographicsReport"
import { ListsReport } from "@/pages/reports/ListsReport"
import { AccountsReport } from "@/pages/reports/AccountsReport"
import { PatientBalancesReport } from "@/pages/reports/PatientBalancesReport"
import { PrescriptionHistoryReport } from "@/pages/reports/PrescriptionHistoryReport"
import { Button } from "@/components/ui/button"

const REPORTS = [
  { key: "daily", label: "Daily Summary", group: "Analytics", Component: DailySummaryReport },
  { key: "daily-transactions", label: "Daily Transactions", group: "Registers", Component: DailyTransactionsReport },
  { key: "opd", label: "OPD Statistics", group: "Analytics", Component: OpdStatisticsReport },
  { key: "revenue", label: "Revenue", group: "Analytics", Component: RevenueReport },
  { key: "lab", label: "Laboratory", group: "Analytics", Component: LabReport },
  { key: "pharmacy", label: "Pharmacy", group: "Analytics", Component: PharmacyReport },
  { key: "expense", label: "Expenses", group: "Analytics", Component: ExpenseReport },
  { key: "demographics", label: "Patient Demographics", group: "Analytics", Component: PatientDemographicsReport },
  { key: "lists", label: "Lists", group: "Registers", Component: ListsReport },
  { key: "accounts", label: "Accounts", group: "Registers", Component: AccountsReport },
  { key: "patient-balances", label: "Patient Balances", group: "Registers", Component: PatientBalancesReport },
  { key: "prescriptions", label: "Prescription History", group: "Registers", Component: PrescriptionHistoryReport },
] as const

const GROUPS = ["Analytics", "Registers"] as const

const DATE_RANGES = ["Today", "Yesterday", "This Week", "This Month", "Last Month", "Custom"] as const

export function ReportsPage() {
  const [active, setActive] = React.useState<(typeof REPORTS)[number]["key"]>("daily")
  const [dateRange, setDateRange] = React.useState<(typeof DATE_RANGES)[number]>("This Month")
  const current = REPORTS.find((r) => r.key === active)!

  const exportCsv = () => {
    if (active === "expense") {
      buildCSV(
        ["Date", "Category", "Description", "Amount", "Mode", "Entered By"],
        EXPENSES.map((e) => [e.date, e.category, e.description, String(e.amount), e.mode, e.enteredBy])
      )
      return
    }
    buildCSV(["Report"], [[current.label]])
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 no-print">
        <h1 className="text-2xl font-bold text-foreground">Reports</h1>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1 rounded-md bg-muted p-1">
            {DATE_RANGES.map((r) => (
              <button key={r} onClick={() => setDateRange(r)} className={cn("rounded-sm px-2.5 py-1.5 text-xs font-medium transition-colors", dateRange === r ? "bg-background text-secondary shadow-sm" : "text-muted-foreground")}>
                {r}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={exportCsv}><Download className="h-4 w-4" /> Export CSV</Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print Report</Button>
        </div>
      </div>

      <div className="hidden text-center print:block">
        <h2 className="text-lg font-bold">Citi Clinic — عيادة المدينة</h2>
        <p className="text-xs">Scheme III, Bostan Khan Road, Rawalpindi</p>
        <hr className="my-2" />
        <p className="mb-2 text-sm font-semibold">{current.label} · {dateRange} · Generated: {new Date().toLocaleString()}</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[200px_1fr]">
        <nav className="no-print space-y-4">
          {GROUPS.map((group) => (
            <div key={group}>
              <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                {group === "Registers" ? "Lists, Accounts & History" : group}
              </div>
              <div className="space-y-1">
                {REPORTS.filter((r) => r.group === group).map((r) => (
                  <button
                    key={r.key}
                    onClick={() => setActive(r.key)}
                    className={cn(
                      "block w-full rounded-md px-3 py-2 text-left text-sm font-medium transition-colors",
                      active === r.key ? "bg-accent-50 text-secondary" : "text-muted-foreground hover:bg-muted/50"
                    )}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div>
          <current.Component />
        </div>
      </div>

      <p className="mt-6 hidden text-center text-[10px] text-muted-foreground print:block">
        Confidential — Citi Clinic Management Information System
      </p>
    </div>
  )
}
