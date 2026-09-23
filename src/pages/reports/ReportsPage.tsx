import * as React from "react"
import { Download, Printer, ChevronRight, FileText, BarChart3, ListOrdered } from "lucide-react"

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
  { key: "daily", label: "Daily Summary", group: "Analytics", Component: DailySummaryReport, icon: BarChart3 },
  { key: "daily-transactions", label: "Daily Transactions", group: "Registers", Component: DailyTransactionsReport, icon: ListOrdered },
  { key: "opd", label: "OPD Statistics", group: "Analytics", Component: OpdStatisticsReport, icon: BarChart3 },
  { key: "revenue", label: "Revenue", group: "Analytics", Component: RevenueReport, icon: BarChart3 },
  { key: "lab", label: "Laboratory", group: "Analytics", Component: LabReport, icon: BarChart3 },
  { key: "pharmacy", label: "Pharmacy", group: "Analytics", Component: PharmacyReport, icon: BarChart3 },
  { key: "expense", label: "Expenses", group: "Analytics", Component: ExpenseReport, icon: BarChart3 },
  { key: "demographics", label: "Patient Demographics", group: "Analytics", Component: PatientDemographicsReport, icon: BarChart3 },
  { key: "lists", label: "Lists", group: "Registers", Component: ListsReport, icon: FileText },
  { key: "accounts", label: "Accounts", group: "Registers", Component: AccountsReport, icon: FileText },
  { key: "patient-balances", label: "Patient Balances", group: "Registers", Component: PatientBalancesReport, icon: FileText },
  { key: "prescriptions", label: "Prescription History", group: "Registers", Component: PrescriptionHistoryReport, icon: FileText },
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
    <div className="space-y-6 pb-10 max-w-[90rem] mx-auto">
      {/* ─── PREMIUM PAGE HEADER ─────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print">
        <div>
          <h1 className="text-3xl font-black text-[#0D1B2E] tracking-tight">Analytics & Reports</h1>
          <p className="mt-1 text-sm font-medium text-slate-500">View clinic performance, registers, and financial data</p>
        </div>
      </div>

      {/* ─── TOP ACTION BAR ────────────────────────────────────────────── */}
      <div className="rounded-[1.25rem] bg-white p-3 shadow-sm ring-1 ring-black/5 flex flex-col xl:flex-row xl:items-center justify-between gap-4 no-print">
        <div className="flex flex-wrap items-center gap-2 p-1 bg-slate-50/80 rounded-xl ring-1 ring-slate-100">
          {DATE_RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setDateRange(r)}
              className={cn(
                "rounded-lg px-4 py-2 text-xs font-bold transition-all whitespace-nowrap",
                dateRange === r
                  ? "bg-white text-[#0891B2] shadow-sm ring-1 ring-black/5"
                  : "text-slate-500 hover:text-slate-700 hover:bg-slate-100/50"
              )}
            >
              {r}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" className="rounded-xl h-11 px-5 font-bold text-slate-600 border-slate-200 bg-white hover:bg-slate-50 transition-colors" onClick={exportCsv}>
            <Download className="h-4 w-4 mr-2" /> Export CSV
          </Button>
          <Button className="rounded-xl h-11 px-6 bg-[#0F2A4D] hover:bg-[#16375F] text-white font-bold shadow-lg shadow-[#0F2A4D]/20 border-0" onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-2" /> Print Report
          </Button>
        </div>
      </div>

      <div className="hidden text-center print:block mb-8">
        <h2 className="text-xl font-black text-black uppercase tracking-widest">Citi Clinic — عيادة المدينة</h2>
        <p className="text-sm text-slate-600 mt-1">Scheme III, Bostan Khan Road, Rawalpindi</p>
        <hr className="my-4 border-black/20" />
        <p className="mb-2 text-base font-bold text-black uppercase tracking-wider">{current.label}</p>
        <p className="text-xs text-slate-500 font-medium">Period: {dateRange} · Generated: {new Date().toLocaleString()}</p>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[240px_1fr] xl:grid-cols-[280px_1fr]">
        <nav className="no-print space-y-6">
          {GROUPS.map((group) => (
            <div key={group} className="space-y-2">
              <div className="px-1 text-[11px] font-black uppercase tracking-widest text-slate-400">
                {group === "Registers" ? "Lists & History" : group}
              </div>
              <div className="space-y-1">
                {REPORTS.filter((r) => r.group === group).map((r) => {
                  const Icon = r.icon
                  const isActive = active === r.key
                  return (
                    <button
                      key={r.key}
                      onClick={() => setActive(r.key)}
                      className={cn(
                        "group flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-bold transition-all",
                        isActive
                          ? "bg-[#1CC0CE]/10 text-[#0891B2] shadow-sm"
                          : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <Icon className={cn("h-4 w-4 transition-colors", isActive ? "text-[#1CC0CE]" : "text-slate-400 group-hover:text-slate-500")} />
                        {r.label}
                      </div>
                      {isActive && <ChevronRight className="h-4 w-4 text-[#1CC0CE]" />}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="min-w-0">
          <current.Component />
        </div>
      </div>

      <p className="mt-8 hidden text-center text-[10px] font-bold uppercase tracking-widest text-slate-400 print:block">
        Confidential — Citi Clinic Management Information System
      </p>
    </div>
  )
}
