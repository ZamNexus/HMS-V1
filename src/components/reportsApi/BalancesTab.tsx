"use client"
import * as React from "react"
import Link from "next/link"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { Users } from "lucide-react"

import { showMoney } from "@/components/billing/billingUi"
import { EmptyState } from "@/components/shared/EmptyState"
import { ErrorState } from "@/components/shared/ErrorState"
import { Pagination } from "@/components/shared/Pagination"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { CACHE_CLASSES } from "@/lib/query/cacheClasses"
import { useScopedKey } from "@/lib/query/useScopedKey"
import { reportsApiService, type RpAging } from "@/lib/services"
import { Figure } from "./RevenueTab"

const PAGE_SIZE = 10
const BUCKETS: readonly (readonly [keyof RpAging, string])[] = [["days0to30", "0 to 30 days"], ["days31to60", "31 to 60 days"], ["days61to90", "61 to 90 days"], ["over90", "Over 90 days"]]

function Aging({ title, total, aging, id }: { title: string; total: string; aging: RpAging; id: string }) {
  return (
    <section aria-label={title} data-testid={`${id}-aging`} className="space-y-3">
      <h2 className="text-sm font-black uppercase tracking-wider text-slate-500">{title}</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Figure label="Owed in all" value={total} testId={`${id}-total`} />
        {BUCKETS.map(([k, label]) => <Figure key={k} label={label} value={aging[k]} testId={`${id}-${k}`} />)}
      </div>
    </section>
  )
}

/**
 * Patient Balances (D2): what is owed right now and for how long (GET /reports/outstanding): patients and panels apart, each aged 0-30 / 31-60 / 61-90 / over 90 days, and by panel;
 * then the patients who owe, largest balance first (GET /reports/outstanding/patients, server-paged 10). Not a period report: it is as of now. reports.read.
 */
export function BalancesTab() {
  const [page, setPage] = React.useState(1)
  const outKey = useScopedKey("reports", "outstanding")
  const out = useQuery({ queryKey: outKey, queryFn: ({ signal }) => reportsApiService.outstanding(signal), ...CACHE_CLASSES.register })
  const opts = { page, pageSize: PAGE_SIZE }
  const listKey = useScopedKey("reports", "outstanding-patients", { ...opts })
  const list = useQuery({ queryKey: listKey, queryFn: ({ signal }) => reportsApiService.outstandingPatients(opts, signal), ...CACHE_CLASSES.register, placeholderData: keepPreviousData })
  const items = list.data?.items ?? []
  return (
    <div className="space-y-8" data-testid="balances-report">
      {out.isPending ? <div className="space-y-3" role="status" aria-label="Loading what is owed"><Skeleton className="h-24 w-full rounded-2xl" /><Skeleton className="h-24 w-full rounded-2xl" /></div>
        : out.isError ? <ErrorState error={out.error} onRetry={() => void out.refetch()} />
        : (
          <>
            <p className="text-xs font-semibold text-slate-500" data-testid="balances-as-of">As of {out.data.asOf}</p>
            <Aging title="Owed by patients" id="pat" total={out.data.patients.total} aging={out.data.patients.aging} />
            <Aging title="Owed by panels" id="pnl" total={out.data.panels.total} aging={out.data.panels.aging} />
            <section aria-label="Owed by each panel" data-testid="balances-by-panel">
              <h2 className="mb-2 text-sm font-black uppercase tracking-wider text-slate-500">Owed by each panel</h2>
              {out.data.byPanel.length === 0 ? <p className="text-sm text-slate-500">No panel owes anything.</p> : (
                <div className="overflow-x-auto rounded-2xl ring-1 ring-black/5"><Table>
                  <TableHeader><TableRow className="bg-slate-50/60 hover:bg-slate-50/60"><TableHead className="px-4">Panel</TableHead><TableHead className="pr-4 text-right">Outstanding</TableHead></TableRow></TableHeader>
                  <TableBody>{out.data.byPanel.map((p) => (
                    <TableRow key={p.panel.id} data-testid={`bal-panel-${p.panel.id}`}><TableCell className="px-4 font-semibold">{p.panel.name}</TableCell><TableCell className="pr-4 text-right font-semibold tabular-nums">{showMoney(p.outstanding)}</TableCell></TableRow>
                  ))}</TableBody>
                </Table></div>
              )}
            </section>
          </>
        )}
      <section aria-label="Patients who owe" data-testid="balances-patients">
        <h2 className="mb-2 text-sm font-black uppercase tracking-wider text-slate-500">Patients who owe, largest first</h2>
        {list.isError && !list.data ? <ErrorState error={list.error} onRetry={() => void list.refetch()} />
          : list.isPending ? <div className="space-y-3" role="status" aria-label="Loading the patient balances">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}</div>
          : items.length === 0 ? <EmptyState icon={Users} title="No patient owes anything" />
          : (
            <>
              <div className="overflow-x-auto rounded-2xl ring-1 ring-black/5"><Table>
                <TableHeader><TableRow className="bg-slate-50/60 hover:bg-slate-50/60"><TableHead className="px-4">Patient</TableHead><TableHead>Phone</TableHead><TableHead>Oldest unpaid</TableHead><TableHead className="pr-4 text-right">Outstanding</TableHead></TableRow></TableHeader>
                <TableBody>{items.map((b) => (
                  <TableRow key={b.patient.id} data-testid={`bal-patient-${b.patient.id}`}>
                    <TableCell className="px-4"><Link href={`/patients/${b.patient.id}`} className="font-semibold text-[#0D1B2E] hover:text-[#0891B2] hover:underline">{b.patient.name}</Link><div className="font-mono text-xs text-slate-500">{b.patient.mrNo}</div></TableCell>
                    <TableCell className="text-sm">{b.patient.phone || "—"}</TableCell>
                    <TableCell className="text-sm tabular-nums">{b.oldestUnpaid}</TableCell>
                    <TableCell className="pr-4 text-right font-semibold tabular-nums">{showMoney(b.outstanding)}</TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table></div>
              <Pagination page={page} pageSize={PAGE_SIZE} total={list.data?.total ?? 0} onPageChange={setPage} itemLabel="patients" />
            </>
          )}
      </section>
    </div>
  )
}
