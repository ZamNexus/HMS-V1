"use client"
import * as React from "react"
import { ChevronRight, FileText, Printer } from "lucide-react"

import { PaymentsRegisterTab } from "@/components/billing/RegistersTabs"
import { EmptyState } from "@/components/shared/EmptyState"
import { Button } from "@/components/ui/button"
import { useUrlFilters } from "@/lib/query/useUrlFilters"
import { useAccess } from "@/lib/session/useAccess"
import { useHospital } from "@/lib/session/useHospital"
import { useHospitalToday } from "@/lib/usePatientToday"
import { cn } from "@/lib/utils"
import { printDocument } from "@/lib/print"
import { BalancesTab } from "./BalancesTab"
import { DAY_CLOSE_VIEWS, DayCloseTab, type DayCloseView } from "./DayCloseTab"
import { DocReport, PrescriptionHistory, type DocReportKind } from "./DocReports"
import { ListsApi } from "./ListsApi"
import { PeriodBar } from "./PeriodBar"
import { RevenueTab } from "./RevenueTab"
import { LIST_KEYS, LIST_PERMISSIONS, listFromUrl } from "./listsUi"
import { REGISTER_FILTER_KEYS, clearedRegisterFilters, RP_GROUPS, RP_REPORTS, RP_REPORT_LABEL, RP_TAKES_PERIOD, periodFor, rangeFromUrl, type RpReport } from "./rpUi"

const DOC_KINDS: readonly RpReport[] = ["daily", "opd", "lab", "pharmacy", "expense", "cash-flow", "demographics"]
const KEYS = ["report", "range", "pfrom", "pto", "view", "list", "page", ...REGISTER_FILTER_KEYS] as const
type AccountsView = "payments" | "receipts"
const ACCOUNTS_VIEWS: readonly AccountsView[] = ["payments", "receipts"]

/** Who sees which report: the permission its route needs (handoff 8.11). A report with no published route is shown to whoever could read it once it exists. */
export function reportAllowed(report: RpReport, can: (p: string) => boolean): boolean {
  switch (report) {
    case "revenue": case "balances": return can("reports.read")
    case "daily-transactions": return can("reports.read") || can("billing.read")
    case "accounts": return can("billing.read")
    case "lists": return LIST_KEYS.some((k) => LIST_PERMISSIONS[k].some((p) => can(p)))
    case "expense": case "cash-flow": return can("accounts.read")
    case "prescriptions": return can("encounters.read")
    default: return can("reports.read")
  }
}

/**
 * Reports in API mode (handoff 8.11). Revenue, Daily Transactions (the day close and the two registers), Patient Balances, Accounts (payments and receipts) and the Lists are
 * connected; the reports whose routes the backend has not published a shape for stay in the list, saying what they await, and send nothing. The period (Today ... Custom) is worked
 * out from the hospital's date. CSV export is not offered: it is built from the JSON of a report that is connected, and none of these has a download yet.
 */
export function ReportsApiHub() {
  const { can } = useAccess()
  const { settings } = useHospital()
  const today = useHospitalToday()
  const url = useUrlFilters(KEYS)
  const visible = RP_REPORTS.filter((r) => reportAllowed(r, can))
  const wanted = RP_REPORTS.find((r) => r === url.get("report"))
  const active: RpReport | undefined = wanted && visible.includes(wanted) ? wanted : visible[0]
  const range = rangeFromUrl(url.get("range"))
  const result = periodFor(range, today, { from: url.get("pfrom"), to: url.get("pto") })
  const list = listFromUrl(url.get("list"))
  const dayView: DayCloseView = DAY_CLOSE_VIEWS.find((v) => v === url.get("view")) ?? "charges"
  const accountsView: AccountsView = ACCOUNTS_VIEWS.find((v) => v === url.get("view")) ?? "payments"
  if (!active) return <div className="mx-auto max-w-3xl pt-10"><EmptyState icon={FileText} title="No report is shown to your role" subtitle="Ask an administrator if you need one." /></div>

  return (
    <div className="mx-auto max-w-[90rem] space-y-6 pb-10" data-testid="reports-hub">
      <div className="no-print">
        <h1 className="text-3xl font-black tracking-tight text-[#0D1B2E]">Analytics &amp; Reports</h1>
        <p className="mt-1 text-sm font-medium text-slate-500">View clinic performance, registers, and financial data</p>
      </div>

      {RP_TAKES_PERIOD.has(active) && (
        <PeriodBar range={range} from={url.get("pfrom")} to={url.get("pto")} problem={result.problem} period={result.period} loading={today === null}
          onRange={(r) => url.set({ range: r === "month" ? undefined : r, page: undefined })} onDates={(p) => url.set({ ...(p.from !== undefined || "from" in p ? { pfrom: p.from } : {}), ...(p.to !== undefined || "to" in p ? { pto: p.to } : {}), page: undefined })} />
      )}

      <div className="hidden text-center print:block">
        <h2 className="text-xl font-black uppercase tracking-widest text-black">{settings?.printHeader || settings?.nameEn || "Report"}</h2>
        {settings?.address && <p className="mt-1 text-sm text-slate-600">{settings.address}</p>}
        <hr className="my-4 border-black/20" />
        <p className="mb-2 text-base font-bold uppercase tracking-wider text-black">{RP_REPORT_LABEL[active]}</p>
        {RP_TAKES_PERIOD.has(active) && result.period && <p className="text-xs font-medium text-slate-500">Period: {result.period.dateFrom} to {result.period.dateTo}</p>}
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[240px_1fr] xl:grid-cols-[280px_1fr]">
        <nav className="no-print space-y-6" aria-label="Reports">
          {RP_GROUPS.map((g) => {
            const reports = g.reports.filter((r) => visible.includes(r))
            if (reports.length === 0) return null
            return (
              <div key={g.title} className="space-y-2">
                <div className="px-1 text-[11px] font-black uppercase tracking-widest text-slate-400">{g.title}</div>
                <div className="space-y-1">
                  {reports.map((r) => (
                    <button key={r} type="button" aria-current={active === r ? "page" : undefined} data-testid={`report-nav-${r}`} onClick={() => url.set({ report: r, view: undefined, page: undefined, ...clearedRegisterFilters() })}
                      className={cn("flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-bold transition-all", active === r ? "bg-[#1CC0CE]/10 text-[#0891B2] shadow-sm" : "text-slate-500 hover:bg-slate-50 hover:text-slate-700")}>
                      <span>{RP_REPORT_LABEL[r]}</span>
                      {active === r && <ChevronRight className="h-4 w-4 text-[#1CC0CE]" />}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </nav>

        <div className="min-w-0 space-y-4">
          <div className="no-print flex justify-end">
            <Button className="h-10 rounded-xl bg-[#0F2A4D] px-5 font-bold text-white hover:bg-[#16375F]" onClick={() => printDocument("a4")}><Printer className="mr-2 h-4 w-4" /> Print Report</Button>
          </div>
          {active === "revenue" ? <RevenueTab period={result.period} />
          : active === "daily-transactions" ? <DayCloseTab period={result.period} view={dayView} onView={(v) => url.set({ view: v, page: undefined, ...clearedRegisterFilters() })} />
          : DOC_KINDS.includes(active) ? <DocReport kind={active as DocReportKind} period={result.period} />
          : active === "prescriptions" ? <PrescriptionHistory />
          : active === "balances" ? <BalancesTab />
          : active === "accounts" ? (
            <div data-testid="accounts-report">
              <div className="no-print mb-3 flex gap-2" role="group" aria-label="Register">
                {ACCOUNTS_VIEWS.map((v) => (
                  <button key={v} type="button" aria-pressed={accountsView === v} onClick={() => url.set({ view: v, page: undefined, ...clearedRegisterFilters() })}
                    className={cn("rounded-lg px-4 py-2 text-xs font-bold transition-all", accountsView === v ? "bg-white text-[#0891B2] shadow-sm ring-1 ring-black/5" : "text-slate-500 hover:bg-slate-100")}>
                    {v === "payments" ? "Payments" : "Receipts"}
                  </button>
                ))}
              </div>
              <div className="rounded-[1.5rem] bg-white ring-1 ring-black/5">
                <PaymentsRegisterTab key={accountsView} defaultType={accountsView === "payments" ? "payment" : "advance"} />
              </div>
            </div>
          ) : <ListsApi list={list} onList={(l) => url.set({ list: l })} />}
        </div>
      </div>
    </div>
  )
}
