"use client"
import { useQuery } from "@tanstack/react-query"
import { BarChart3 } from "lucide-react"

import { SOURCE_LABEL, showMoney } from "@/components/billing/billingUi"
import { EmptyState } from "@/components/shared/EmptyState"
import { ErrorState } from "@/components/shared/ErrorState"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { CACHE_CLASSES } from "@/lib/query/cacheClasses"
import { useScopedKey } from "@/lib/query/useScopedKey"
import { reportsApiService, type RpPeriod } from "@/lib/services"

export function Figure({ label, value, testId, sub }: { label: string; value: string; testId: string; sub?: string }) {
  return (
    <div className="rounded-2xl bg-white p-5 ring-1 ring-black/5">
      <p className="text-[11px] font-black uppercase tracking-wider text-slate-500">{label}</p>
      <p data-testid={testId} className="mt-1 text-2xl font-black tracking-tight text-[#0D1B2E] tabular-nums">{showMoney(value)}</p>
      {sub && <p className="mt-1 text-xs font-medium text-slate-500">{sub}</p>}
    </div>
  )
}

/**
 * Revenue (D2): GET /reports/revenue for the period. Earned = net of discount, excluding GST, voided charges left out, on the day the charge was earned (handoff 8.11), less credit
 * notes. Every figure is the server's text; nothing here adds or rounds. reports.read.
 */
export function RevenueTab({ period }: { period: RpPeriod | null }) {
  const key = useScopedKey("reports", "revenue", period?.dateFrom ?? null, period?.dateTo ?? null)
  const q = useQuery({ queryKey: key, queryFn: ({ signal }) => reportsApiService.revenue(period as RpPeriod, signal), ...CACHE_CLASSES.register, enabled: period !== null })
  if (period === null) return <EmptyState icon={BarChart3} title="Choose a valid period" subtitle="The report reads the period chosen above." />
  if (q.isPending) return <div className="space-y-3" role="status" aria-label="Loading the revenue report"><Skeleton className="h-24 w-full rounded-2xl" /><Skeleton className="h-64 w-full rounded-2xl" /></div>
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />
  const r = q.data
  return (
    <div className="space-y-6" data-testid="revenue-report">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Figure label="Gross revenue" value={r.grossRevenue} testId="rev-gross" />
        <Figure label="Credit notes" value={r.creditNotes} testId="rev-credit-notes" />
        <Figure label="Net revenue" value={r.netRevenue} testId="rev-net" sub="Gross less credit notes" />
        <Figure label="GST collected" value={r.gstCollected} testId="rev-gst" sub="Shown apart, never counted as revenue" />
        <Figure label="Discounts given" value={r.discountsGiven} testId="rev-discounts" />
        <Figure label="Voided charges" value={r.voided} testId="rev-voided" sub="Shown apart, never counted" />
      </div>
      <section aria-label="Revenue by kind of charge" data-testid="rev-by-source">
        <h2 className="mb-2 text-sm font-black uppercase tracking-wider text-slate-500">By kind of charge</h2>
        {r.bySource.length === 0 ? <EmptyState icon={BarChart3} title="No revenue in this period" /> : (
          <div className="overflow-x-auto rounded-2xl ring-1 ring-black/5"><Table>
            <TableHeader><TableRow className="bg-slate-50/60 hover:bg-slate-50/60"><TableHead className="px-4">Kind</TableHead><TableHead className="text-right">Charges</TableHead><TableHead className="text-right">Revenue</TableHead><TableHead className="pr-4 text-right">GST</TableHead></TableRow></TableHeader>
            <TableBody>{r.bySource.map((s) => (
              <TableRow key={s.sourceType} data-testid={`rev-source-${s.sourceType}`}><TableCell className="px-4 font-semibold">{SOURCE_LABEL[s.sourceType]}</TableCell><TableCell className="text-right tabular-nums">{s.charges}</TableCell><TableCell className="text-right tabular-nums">{showMoney(s.revenue)}</TableCell><TableCell className="pr-4 text-right tabular-nums">{showMoney(s.gst)}</TableCell></TableRow>
            ))}</TableBody>
          </Table></div>
        )}
      </section>
      <section aria-label="Revenue by doctor" data-testid="rev-by-doctor">
        <h2 className="mb-2 text-sm font-black uppercase tracking-wider text-slate-500">By doctor, with the commission owed</h2>
        {r.byDoctor.length === 0 ? <p className="text-sm text-slate-500">No doctor revenue in this period.</p> : (
          <div className="overflow-x-auto rounded-2xl ring-1 ring-black/5"><Table>
            <TableHeader><TableRow className="bg-slate-50/60 hover:bg-slate-50/60"><TableHead className="px-4">Doctor</TableHead><TableHead className="text-right">Charges</TableHead><TableHead className="text-right">Revenue</TableHead><TableHead className="pr-4 text-right">Commission</TableHead></TableRow></TableHeader>
            <TableBody>{r.byDoctor.map((d) => (
              <TableRow key={d.doctor.id} data-testid={`rev-doctor-${d.doctor.id}`}><TableCell className="px-4 font-semibold">{d.doctor.name}</TableCell><TableCell className="text-right tabular-nums">{d.charges}</TableCell><TableCell className="text-right tabular-nums">{showMoney(d.revenue)}</TableCell><TableCell className="pr-4 text-right tabular-nums">{showMoney(d.commission)}</TableCell></TableRow>
            ))}</TableBody>
          </Table></div>
        )}
      </section>
      <section aria-label="Revenue by panel" data-testid="rev-by-panel">
        <h2 className="mb-2 text-sm font-black uppercase tracking-wider text-slate-500">By panel</h2>
        {r.byPanel.length === 0 ? <p className="text-sm text-slate-500">No panel revenue in this period.</p> : (
          <div className="overflow-x-auto rounded-2xl ring-1 ring-black/5"><Table>
            <TableHeader><TableRow className="bg-slate-50/60 hover:bg-slate-50/60"><TableHead className="px-4">Panel</TableHead><TableHead className="text-right">Charges</TableHead><TableHead className="text-right">Revenue</TableHead><TableHead className="pr-4 text-right">Commission</TableHead></TableRow></TableHeader>
            <TableBody>{r.byPanel.map((p) => (
              <TableRow key={p.panel.id} data-testid={`rev-panel-${p.panel.id}`}><TableCell className="px-4 font-semibold">{p.panel.name}</TableCell><TableCell className="text-right tabular-nums">{p.charges}</TableCell><TableCell className="text-right tabular-nums">{showMoney(p.revenue)}</TableCell><TableCell className="pr-4 text-right tabular-nums">{showMoney(p.commission)}</TableCell></TableRow>
            ))}</TableBody>
          </Table></div>
        )}
      </section>
    </div>
  )
}
