"use client"
import { FileText } from "lucide-react"

import { ChargesRegisterTab, PaymentsRegisterTab } from "@/components/billing/RegistersTabs"
import { InvoicesTab } from "@/components/billing/InvoicesTab"
import { EmptyState } from "@/components/shared/EmptyState"
import { useUrlFilters } from "@/lib/query/useUrlFilters"
import { useAccess } from "@/lib/session/useAccess"
import { useHospitalToday } from "@/lib/usePatientToday"
import { cn } from "@/lib/utils"
import { BankApiTab } from "@/components/accounts/BankApiTab"
import { ExpensesApiTab } from "@/components/accounts/ExpensesApiTab"
import { DocReport, RevenueGraph } from "./DocReports"
import { PeriodBar } from "./PeriodBar"
import { REGISTER_FILTER_KEYS, clearedRegisterFilters, periodFor, rangeFromUrl } from "./rpUi"
import { STATS_CHARGES, STATS_LABEL, STATS_PAYMENT_TYPE, STATS_TABS, statsTabAllowed, statsTabFromUrl, type StatsTab } from "./statsUi"

const KEYS = ["tab", "range", "pfrom", "pto", "visit", "page", ...REGISTER_FILTER_KEYS] as const

/**
 * Financial Statistics in API mode (D5b; handoff 8.11): each tab reads its own register for the chosen period: charges by kind (Services, Checkups, Lab Tests, Medicine, X-Rays,
 * ECG, Ultrasound), payments (Receipts = advances, Payments), and the invoices of OPD or IPD visits. The Summary, Expenses, Bank and Graphs tabs await routes the backend has not
 * published a shape for; they stay listed, saying so, and send nothing. No figure on this page is added up here: totals come from the server or are not shown.
 */
export function StatsApiHub() {
  const { can } = useAccess()
  const today = useHospitalToday()
  const url = useUrlFilters(KEYS)
  const tabs = STATS_TABS.filter((t) => statsTabAllowed(t, can))
  const wanted = statsTabFromUrl(url.get("tab"))
  const tab: StatsTab | undefined = wanted && tabs.includes(wanted) ? wanted : tabs[0]
  const range = rangeFromUrl(url.get("range"))
  const result = periodFor(range, today, { from: url.get("pfrom"), to: url.get("pto") })
  const visit: "opd" | "ipd" = url.get("visit") === "ipd" ? "ipd" : "opd"
  if (!tab) return <div className="mx-auto max-w-3xl pt-10"><EmptyState icon={FileText} title="No statistics are shown to your role" subtitle="Ask an administrator if you need them." /></div>
  const lock = STATS_CHARGES[tab]
  const paymentType = STATS_PAYMENT_TYPE[tab]
  return (
    <div className="mx-auto max-w-7xl space-y-4 pb-10" data-testid="stats-hub">
      <div className="no-print">
        <h1 className="text-3xl font-black tracking-tight text-[#0D1B2E]">Financial Statistics</h1>
        <p className="mt-1 text-sm font-medium text-slate-500">What was earned and received in the period, register by register</p>
      </div>
      <PeriodBar range={range} from={url.get("pfrom")} to={url.get("pto")} problem={result.problem} period={result.period} loading={today === null}
        onRange={(r) => url.set({ range: r === "month" ? undefined : r, page: undefined })} onDates={(p) => url.set({ ...("from" in p ? { pfrom: p.from } : {}), ...("to" in p ? { pto: p.to } : {}), page: undefined })} />
      <div className="no-print flex flex-wrap gap-1.5 rounded-xl bg-muted/40 p-1.5" role="group" aria-label="Statistics">
        {tabs.map((t) => (
          <button key={t} type="button" aria-pressed={tab === t} data-testid={`stats-tab-${t}`} onClick={() => url.set({ tab: t, page: undefined, ...clearedRegisterFilters() })}
            className={cn("rounded-lg px-3.5 py-1.5 text-[13px] font-medium transition-all duration-200", tab === t ? "bg-white text-primary shadow-sm ring-1 ring-border/50" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground")}>
            {STATS_LABEL[t]}
          </button>
        ))}
      </div>
      <div key={tab} className="rounded-[1.5rem] bg-white ring-1 ring-black/5" data-testid={`stats-body-${tab}`}>
        {tab === "summary" ? <div className="p-4"><DocReport kind="financial-summary" period={result.period} /></div>
          : tab === "graphs" ? <div className="p-4"><RevenueGraph period={result.period} /></div>
          : tab === "expenses" ? <ExpensesApiTab period={result.period} />
          : tab === "bank" ? <BankApiTab period={result.period} />
          : lock ? <ChargesRegisterTab period={result.period} lock={lock} />
          : paymentType ? <PaymentsRegisterTab defaultType={paymentType} period={result.period} />
          : (
            <div>
              <div className="no-print flex gap-2 px-4 pt-4" role="group" aria-label="Visit type">
                {(["opd", "ipd"] as const).map((v) => (
                  <button key={v} type="button" aria-pressed={visit === v} onClick={() => url.set({ visit: v, page: undefined, ...clearedRegisterFilters() })}
                    className={cn("rounded-lg px-4 py-2 text-xs font-bold transition-all", visit === v ? "bg-slate-100 text-[#0891B2] ring-1 ring-black/5" : "text-slate-500 hover:bg-slate-100")}>{v.toUpperCase()}</button>
                ))}
              </div>
              <InvoicesTab key={visit} lockType={visit} period={result.period} />
            </div>
          )}
      </div>
    </div>
  )
}
