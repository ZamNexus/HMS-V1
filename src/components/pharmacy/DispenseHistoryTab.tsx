"use client"
import * as React from "react"
import Link from "next/link"
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query"
import { ClipboardList, Search } from "lucide-react"

import { InvoiceDetailDialog } from "@/components/billing/InvoicesTab"
import { showMoney } from "@/components/billing/billingUi"
import { EmptyState } from "@/components/shared/EmptyState"
import { ErrorState } from "@/components/shared/ErrorState"
import { Pagination } from "@/components/shared/Pagination"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { CACHE_CLASSES } from "@/lib/query/cacheClasses"
import { useDebouncedSearch } from "@/lib/query/useDebouncedSearch"
import { useScopedKey } from "@/lib/query/useScopedKey"
import { pageFromUrl, useUrlFilters } from "@/lib/query/useUrlFilters"
import { pharmacyApiService, type PmDispense, type PmDispenseLine, type PmDispenseListOptions } from "@/lib/services"
import { formatInstant } from "@/lib/session/hospital"
import { useAccess } from "@/lib/session/useAccess"
import { useHospital } from "@/lib/session/useHospital"
import { PayBill } from "./PayBill"
import { ReturnDialog, SlipDialog } from "./SlipAndReturn"
import { shortages } from "./pmUi"

const PAGE_SIZE = 10
const URL_KEYS = ["page", "who", "from", "to"] as const
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * One dispense (PH7): who got what, from which batches, what was returned and what was charged. A line shows `requested` against `dispensed` (a line takes what is available), and its
 * Return button is the server's `allowedActions` (pharmacy.dispense). The slip is read fresh and printed alone. Payment for a patient goes through billing: the invoice opens there.
 */
export function DispenseDetailDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const { settings } = useHospital()
  const { can } = useAccess()
  const qc = useQueryClient()
  const key = useScopedKey("pharmacyApi", "dispense", id)
  const q = useQuery({ queryKey: key, queryFn: ({ signal }) => pharmacyApiService.getDispense(id, signal), ...CACHE_CLASSES.record })
  const [ret, setRet] = React.useState<PmDispenseLine | null>(null)
  const [slip, setSlip] = React.useState(false)
  const [invoice, setInvoice] = React.useState(false)
  const tz = settings?.timezone
  const done = (saved: PmDispense | null) => { if (saved) qc.setQueryData(key, saved); else void q.refetch() }
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl" data-testid="dispense-dialog">
        <DialogHeader><DialogTitle>{q.data ? q.data.dispenseNo : "Dispense"}</DialogTitle></DialogHeader>
        {q.isPending ? <Skeleton className="h-48 w-full rounded-xl" role="status" aria-label="Loading the dispense" /> : q.isError ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : (() => {
          const d = q.data
          const short = shortages(d)
          return (
            <div className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="text-sm">
                  <div className="font-bold" data-testid="dispense-party">{d.patient ? <Link className="underline" href={`/patients/${d.patient.id}`}>{d.patient.name}</Link> : d.counterCustomer ?? "Counter sale"}{d.patient ? ` · ${d.patient.mrNo}` : " · counter sale"}</div>
                  <div className="text-xs text-slate-500">{tz ? formatInstant(d.dispensedAt, tz) : d.dispensedAt} · dispensed by {d.dispensedBy.name}{d.doctor ? ` · ${d.doctor.name}` : ""}{d.encounter ? <> · <Link className="underline" href={`/encounters/${d.encounter.id}`}>{d.encounter.encId}</Link></> : null}</div>
                  {d.remarks && <div className="text-xs text-slate-500">{d.remarks}</div>}
                </div>
                <div className="flex gap-2">
                  {d.invoice && d.patient && !can("billing.read") && can("billing.collect_payment") && <PayBill patient={d.patient} invoice={d.invoice} />}
                  {d.invoice && can("billing.read") && <Button variant="outline" className="h-9 rounded-lg text-xs font-bold" onClick={() => setInvoice(true)}>Open invoice {d.invoice.invoiceNo}</Button>}
                  <Button variant="outline" className="h-9 rounded-lg text-xs font-bold" onClick={() => setSlip(true)}>Slip</Button>
                </div>
              </div>
              {short.length > 0 && <div role="status" data-testid="short-stock" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-900">Short stock: {short.map((s) => `${s.name} ${s.dispensed} of ${s.requested}`).join("; ")}.</div>}
              <Table>
                <TableHeader><TableRow><TableHead>Medicine</TableHead><TableHead className="text-right">Requested</TableHead><TableHead className="text-right">Dispensed</TableHead><TableHead className="text-right">Returned</TableHead><TableHead className="text-right">Rate</TableHead><TableHead>Batches</TableHead><TableHead /></TableRow></TableHeader>
                <TableBody>
                  {d.lines.map((l) => (
                    <React.Fragment key={l.id}>
                      <TableRow data-testid={`dline-${l.id}`}>
                        <TableCell><div className="font-semibold">{l.name}</div>{l.instructions && <div className="text-xs text-slate-500">{l.instructions}</div>}{!l.prescriptionLineId && d.encounter && <div className="text-[11px] text-slate-500">Not on the prescription</div>}</TableCell>
                        <TableCell className="text-right tabular-nums">{l.requested}</TableCell>
                        <TableCell className={`text-right font-bold tabular-nums ${l.dispensed < l.requested ? "text-amber-700" : ""}`}>{l.dispensed}</TableCell>
                        <TableCell className="text-right tabular-nums">{l.returned}</TableCell>
                        <TableCell className="text-right tabular-nums">{showMoney(l.unitRate)}</TableCell>
                        <TableCell className="text-xs">{l.batches.map((b) => `${b.batchNo} (exp ${b.expiryDate}) ×${b.quantity}`).join(", ")}</TableCell>
                        <TableCell className="text-right">{l.allowedActions.includes("return") && <Button type="button" variant="outline" size="sm" className="h-8 text-xs font-bold" aria-label={`Return ${l.name}`} onClick={() => setRet(l)}>Return</Button>}</TableCell>
                      </TableRow>
                      {l.returns.map((r) => (
                        <TableRow key={r.id} className="bg-slate-50 text-xs" data-testid={`return-${r.id}`}>
                          <TableCell colSpan={7}>Returned {r.quantity} on {tz ? formatInstant(r.returnedAt, tz) : r.returnedAt} by {r.returnedBy.name}: {r.reason} · {r.restocked ? "put back on the shelf" : "not restocked"}</TableCell>
                        </TableRow>
                      ))}
                    </React.Fragment>
                  ))}
                </TableBody>
              </Table>
              {ret && <ReturnDialog dispense={d} line={ret} onClose={() => setRet(null)} onDone={done} />}
              {slip && <SlipDialog id={d.id} onClose={() => setSlip(false)} />}
              {invoice && d.invoice && <InvoiceDetailDialog id={d.invoice.id} onClose={() => setInvoice(false)} />}
            </div>
          )
        })()}
      </DialogContent>
    </Dialog>
  )
}

/** Dispense history (PH7): server-paged (10), search, patients/counter sales, dates; a register, read on demand. Filters in the address bar, the search text never. */
export function DispenseHistoryTab() {
  const { settings } = useHospital()
  const url = useUrlFilters(URL_KEYS)
  const search = useDebouncedSearch()
  const [openId, setOpenId] = React.useState<string | null>(null)
  const page = pageFromUrl(url.get("page"))
  const who = (["patients", "counter"] as const).find((x) => x === url.get("who"))
  const from = DATE_RE.test(url.get("from") ?? "") ? (url.get("from") as string) : undefined
  const to = DATE_RE.test(url.get("to") ?? "") ? (url.get("to") as string) : undefined
  const rangeOk = !from || !to || from <= to
  const options: PmDispenseListOptions = { search: search.term, page, pageSize: PAGE_SIZE, counter: who === undefined ? undefined : who === "counter", dateFrom: rangeOk ? from : undefined, dateTo: rangeOk ? to : undefined }
  const key = useScopedKey("pharmacyApi", "dispenses", { ...options, search: search.term ?? null, counter: options.counter ?? null })
  const list = useQuery({ queryKey: key, queryFn: ({ signal }) => pharmacyApiService.listDispenses(options, signal), ...CACHE_CLASSES.register, placeholderData: keepPreviousData })
  const items = list.data?.items ?? []
  const setFilter = (patch: Partial<Record<(typeof URL_KEYS)[number], string | undefined>>) => url.set({ ...patch, page: undefined })
  const filtered = !!search.term || !!who || !!from || !!to
  return (
    <div className="space-y-4" data-testid="dispense-history">
      <div className="flex flex-wrap items-end gap-3 rounded-[1.25rem] bg-white p-3 shadow-sm ring-1 ring-black/5">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input type="text" aria-label="Search dispenses" placeholder="Search by slip no., patient or MR No..." value={search.input} maxLength={100} autoComplete="off" onChange={(e) => { search.onChange(e.target.value); url.set({ page: undefined }) }}
            className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-4 text-sm font-medium outline-none placeholder:text-slate-400 focus:border-[#1CC0CE] focus:bg-white focus:ring-2 focus:ring-[#1CC0CE]/20" />
        </div>
        <Select value={who ?? "any"} onValueChange={(v) => setFilter({ who: v === "any" ? undefined : v })}>
          <SelectTrigger aria-label="Dispensed to" className="h-10 w-44 rounded-xl border-slate-200 bg-slate-50"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="any">Patients and counter</SelectItem><SelectItem value="patients">Patients</SelectItem><SelectItem value="counter">Counter sales</SelectItem></SelectContent>
        </Select>
        <label className="flex flex-col text-[11px] font-bold uppercase tracking-wider text-slate-500">From<Input type="date" aria-label="From" className="mt-1 h-10 w-40 rounded-xl" value={from ?? ""} max={to} onChange={(e) => setFilter({ from: e.target.value || undefined })} /></label>
        <label className="flex flex-col text-[11px] font-bold uppercase tracking-wider text-slate-500">To<Input type="date" aria-label="To" className="mt-1 h-10 w-40 rounded-xl" value={to ?? ""} min={from} onChange={(e) => setFilter({ to: e.target.value || undefined })} /></label>
        {filtered && <Button variant="ghost" className="h-10 rounded-xl font-bold text-slate-500" onClick={() => { search.onChange(""); url.set({ who: undefined, from: undefined, to: undefined, page: undefined }) }}>Clear filters</Button>}
      </div>
      <div className="overflow-hidden rounded-[1.5rem] bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-black/5">
        {list.isError && !list.data ? <div className="p-6"><ErrorState error={list.error} onRetry={() => void list.refetch()} /></div>
          : list.isPending ? <div className="space-y-3 p-6" role="status" aria-label="Loading dispenses">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}</div>
          : items.length === 0 ? <div className="p-10"><EmptyState icon={ClipboardList} title="Nothing dispensed yet" subtitle={filtered ? "Try different filters." : undefined} /></div>
          : (
            <Table>
              <TableHeader><TableRow className="bg-slate-50/50 hover:bg-slate-50/50"><TableHead className="px-6">Slip</TableHead><TableHead>For</TableHead><TableHead>Medicines</TableHead><TableHead className="text-right">Total</TableHead><TableHead className="px-6 text-right">Received</TableHead></TableRow></TableHeader>
              <TableBody>
                {items.map((d) => (
                  <TableRow key={d.id} data-testid={`dispense-row-${d.id}`} className="cursor-pointer hover:bg-slate-50" onClick={() => setOpenId(d.id)}>
                    <TableCell className="px-6"><button type="button" className="font-mono text-xs font-bold text-[#0891B2] hover:underline focus-visible:underline" onClick={(e) => { e.stopPropagation(); setOpenId(d.id) }}>{d.dispenseNo}</button><div className="text-xs text-slate-500">{settings?.timezone ? formatInstant(d.dispensedAt, settings.timezone) : d.dispensedAt}</div></TableCell>
                    <TableCell><div className="font-bold">{d.patient ? d.patient.name : d.counterCustomer ?? "Counter sale"}</div><div className="text-xs text-slate-500">{d.patient ? d.patient.mrNo : "Counter sale"}</div></TableCell>
                    <TableCell className="text-xs">{d.lines.map((l) => `${l.name} ×${l.quantity}`).join(", ")}</TableCell>
                    <TableCell className="text-right tabular-nums">{showMoney(d.total)}</TableCell>
                    <TableCell className="px-6 text-right tabular-nums">{showMoney(d.received)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        {list.data && (items.length > 0 || page > 1) && <div className="border-t border-slate-100 bg-slate-50/50 p-4"><Pagination page={page} pageSize={PAGE_SIZE} total={list.data.total} onPageChange={(n) => url.set({ page: n === 1 ? undefined : String(n) })} itemLabel="dispenses" /></div>}
      </div>
      {openId && <DispenseDetailDialog id={openId} onClose={() => setOpenId(null)} />}
    </div>
  )
}
