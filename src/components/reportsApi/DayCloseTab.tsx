"use client"
import { useQuery } from "@tanstack/react-query"
import { Wallet } from "lucide-react"

import { MODE_LABEL, showMoney } from "@/components/billing/billingUi"
import { ChargesRegisterTab, PaymentsRegisterTab } from "@/components/billing/RegistersTabs"
import { EmptyState } from "@/components/shared/EmptyState"
import { ErrorState } from "@/components/shared/ErrorState"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { CACHE_CLASSES } from "@/lib/query/cacheClasses"
import { useScopedKey } from "@/lib/query/useScopedKey"
import { reportsApiService, type RpPeriod } from "@/lib/services"
import { useAccess } from "@/lib/session/useAccess"
import { cn } from "@/lib/utils"
import { Figure } from "./RevenueTab"

export type DayCloseView = "charges" | "payments"
export const DAY_CLOSE_VIEWS: readonly DayCloseView[] = ["charges", "payments"]

/** The day close (D2): money in and out for the period (GET /reports/collections, reports.read), by payment mode and by the staff member who took it. */
function Collections({ period }: { period: RpPeriod | null }) {
  const key = useScopedKey("reports", "collections", period?.dateFrom ?? null, period?.dateTo ?? null)
  const q = useQuery({ queryKey: key, queryFn: ({ signal }) => reportsApiService.collections(period as RpPeriod, signal), ...CACHE_CLASSES.register, enabled: period !== null })
  if (period === null) return <EmptyState icon={Wallet} title="Choose a valid period" subtitle="The totals read the period chosen above." />
  if (q.isPending) return <div className="space-y-3" role="status" aria-label="Loading the collections"><Skeleton className="h-24 w-full rounded-2xl" /><Skeleton className="h-40 w-full rounded-2xl" /></div>
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />
  const c = q.data
  return (
    <div className="space-y-5" data-testid="collections-report">
      <div className="grid grid-cols-3 gap-4">
        <Figure label="Received" value={c.received} testId="col-received" />
        <Figure label="Refunded" value={c.refunded} testId="col-refunded" />
        <Figure label="Net" value={c.net} testId="col-net" sub="Received less refunded" />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <section aria-label="Collections by payment mode" data-testid="col-by-mode">
          <h2 className="mb-2 text-sm font-black uppercase tracking-wider text-slate-500">By payment mode</h2>
          {c.byMode.length === 0 ? <p className="text-sm text-slate-500">Nothing was received or refunded in this period.</p> : (
            <div className="overflow-x-auto rounded-2xl ring-1 ring-black/5"><Table>
              <TableHeader><TableRow className="bg-slate-50/60 hover:bg-slate-50/60"><TableHead className="px-4">Mode</TableHead><TableHead className="text-right">Received</TableHead><TableHead className="pr-4 text-right">Refunded</TableHead></TableRow></TableHeader>
              <TableBody>{c.byMode.map((m) => (
                <TableRow key={m.mode} data-testid={`col-mode-${m.mode}`}><TableCell className="px-4 font-semibold">{MODE_LABEL[m.mode]}</TableCell><TableCell className="text-right tabular-nums">{showMoney(m.received)}</TableCell><TableCell className="pr-4 text-right tabular-nums">{showMoney(m.refunded)}</TableCell></TableRow>
              ))}</TableBody>
            </Table></div>
          )}
        </section>
        <section aria-label="Collections by staff member" data-testid="col-by-collector">
          <h2 className="mb-2 text-sm font-black uppercase tracking-wider text-slate-500">By who took it</h2>
          {c.byCollector.length === 0 ? <p className="text-sm text-slate-500">No receipts in this period.</p> : (
            <div className="overflow-x-auto rounded-2xl ring-1 ring-black/5"><Table>
              <TableHeader><TableRow className="bg-slate-50/60 hover:bg-slate-50/60"><TableHead className="px-4">Staff member</TableHead><TableHead className="text-right">Receipts</TableHead><TableHead className="text-right">Received</TableHead><TableHead className="pr-4 text-right">Refunded</TableHead></TableRow></TableHeader>
              <TableBody>{c.byCollector.map((u) => (
                <TableRow key={u.user.id} data-testid={`col-user-${u.user.id}`}><TableCell className="px-4 font-semibold">{u.user.name}</TableCell><TableCell className="text-right tabular-nums">{u.receipts}</TableCell><TableCell className="text-right tabular-nums">{showMoney(u.received)}</TableCell><TableCell className="pr-4 text-right tabular-nums">{showMoney(u.refunded)}</TableCell></TableRow>
              ))}</TableBody>
            </Table></div>
          )}
        </section>
      </div>
    </div>
  )
}

/**
 * Daily Transactions (D2): the period's money in and out (reports.read) above the two registers it is made of: the charges earned and the payments taken (billing.read). A part
 * the user may not read is simply not shown.
 */
export function DayCloseTab({ period, view, onView }: { period: RpPeriod | null; view: DayCloseView; onView: (v: DayCloseView) => void }) {
  const { can } = useAccess()
  const registers = can("billing.read")
  return (
    <div className="space-y-6" data-testid="day-close">
      {can("reports.read") && <Collections period={period} />}
      {registers && (
        <section aria-label="Registers">
          <div className="no-print mb-3 flex gap-2" role="group" aria-label="Register">
            {DAY_CLOSE_VIEWS.map((v) => (
              <button key={v} type="button" aria-pressed={view === v} onClick={() => onView(v)}
                className={cn("rounded-lg px-4 py-2 text-xs font-bold transition-all", view === v ? "bg-white text-[#0891B2] shadow-sm ring-1 ring-black/5" : "text-slate-500 hover:bg-slate-100")}>
                {v === "charges" ? "Charges earned" : "Payments taken"}
              </button>
            ))}
          </div>
          <div className="rounded-[1.5rem] bg-white ring-1 ring-black/5">
            {view === "charges" ? <ChargesRegisterTab period={period} /> : <PaymentsRegisterTab defaultType="payment" period={period} />}
          </div>
        </section>
      )}
    </div>
  )
}
