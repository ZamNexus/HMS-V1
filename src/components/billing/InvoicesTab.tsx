"use client"
import * as React from "react"
import Link from "next/link"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { FileText, Search } from "lucide-react"

import { EmptyState } from "@/components/shared/EmptyState"
import { ErrorState } from "@/components/shared/ErrorState"
import { Pagination } from "@/components/shared/Pagination"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { isUlid } from "@/lib/api/convert"
import { CACHE_CLASSES } from "@/lib/query/cacheClasses"
import { useDebouncedSearch } from "@/lib/query/useDebouncedSearch"
import { useScopedKey } from "@/lib/query/useScopedKey"
import { pageFromUrl, useUrlFilters } from "@/lib/query/useUrlFilters"
import { INVOICE_STATUSES, billingService, type ChargeSourceType, type InvoiceListOptions, type InvoiceStatus, type InvoiceSummary } from "@/lib/services"
import { formatInstant } from "@/lib/session/hospital"
import { useAccess } from "@/lib/session/useAccess"
import { useHospital } from "@/lib/session/useHospital"
import { ChargeServicesDialog } from "./ChargeServicesDialog"
import { InvoiceView } from "./InvoiceView"
import { INVOICE_STATUS_LABEL, SOURCE_LABEL, isCounterSale, partyName, showMoney } from "./billingUi"

const PAGE_SIZE = 10
const URL_KEYS = ["page", "status", "from", "to", "patient", "type"] as const
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * The billing hub's invoice list for one charge source (B2): Consultations (`sourceType=consultation`) and Services (`sourceType=service`). Server paging and
 * filters (status, dates, search); the page and non-identifying filters live in the address bar, the search text never. A counter sale shows its customer's
 * name where a patient name would be. Opening a row reads the invoice with its charges. billing.read.
 */
/**
 * Financial Statistics reuses it for OPD / IPD (handoff 8.11: GET /invoices?encounterType=): no `sourceType` lists every kind of invoice, `lockType` fixes the visit type (its box is hidden) and
 * `period` is the screen's own period (its date boxes are hidden; `null` = not valid yet, nothing is read).
 */
export function InvoicesTab({ sourceType, lockType, period }: { sourceType?: ChargeSourceType; lockType?: "opd" | "ipd"; period?: { dateFrom: string; dateTo: string } | null }) {
  const { can } = useAccess()
  const { settings } = useHospital()
  const url = useUrlFilters(URL_KEYS)
  const search = useDebouncedSearch()
  const [openId, setOpenId] = React.useState<string | null>(null)
  const allowed = can("billing.read")
  const [creating, setCreating] = React.useState(false)
  const canCreate = sourceType === "service" && can("billing.charge")

  const page = pageFromUrl(url.get("page"))
  const status = INVOICE_STATUSES.find((s) => s === url.get("status"))
  const from = period !== undefined ? period?.dateFrom : DATE_RE.test(url.get("from") ?? "") ? (url.get("from") as string) : undefined
  const to = period !== undefined ? period?.dateTo : DATE_RE.test(url.get("to") ?? "") ? (url.get("to") as string) : undefined
  const patientId = isUlid(url.get("patient") ?? "") ? (url.get("patient") as string) : undefined
  const encounterType = lockType ?? (["opd", "ipd"] as const).find((x) => x === url.get("type"))
  const rangeOk = !from || !to || from <= to

  const options: InvoiceListOptions = { search: search.term, page, pageSize: PAGE_SIZE, sourceType, status, dateFrom: rangeOk ? from : undefined, dateTo: rangeOk ? to : undefined, patientId, encounterType }
  const key = useScopedKey("invoices", "list", { ...options, search: search.term ?? null })
  const list = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => billingService.listInvoices(options, signal),
    ...CACHE_CLASSES.register,
    placeholderData: keepPreviousData,
    enabled: allowed && period !== null,
  })
  const items = list.data?.items ?? []
  const setFilter = (patch: Partial<Record<(typeof URL_KEYS)[number], string | undefined>>) => url.set({ ...patch, page: undefined })
  const filtered = !!search.term || !!status || (period === undefined && (!!from || !!to)) || !!patientId || (!lockType && !!encounterType)

  if (!allowed) return <div className="p-6"><EmptyState icon={FileText} title="Invoices are not shown to your role" subtitle="The billing lists are visible to users who can read billing." /></div>

  return (
    <div className="space-y-4 p-4" data-testid="invoices-tab">
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input aria-label="Search invoices" placeholder="Search by patient, MR No. or invoice number..." value={search.input} maxLength={100} autoComplete="off" className="h-10 rounded-xl pl-10"
            onChange={(e) => { search.onChange(e.target.value); url.set({ page: undefined }) }} />
        </div>
        <Select value={status ?? "any"} onValueChange={(v) => setFilter({ status: v === "any" ? undefined : v })}>
          <SelectTrigger aria-label="Invoice status" className="h-10 w-40 rounded-xl border-slate-200 bg-slate-50"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any status</SelectItem>
            {INVOICE_STATUSES.map((s) => <SelectItem key={s} value={s}>{INVOICE_STATUS_LABEL[s]}</SelectItem>)}
          </SelectContent>
        </Select>
        {!lockType && <Select value={encounterType ?? "any"} onValueChange={(v) => setFilter({ type: v === "any" ? undefined : v })}>
          <SelectTrigger aria-label="Visit type" className="h-10 w-40 rounded-xl border-slate-200 bg-slate-50"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="any">OPD and IPD</SelectItem><SelectItem value="opd">OPD</SelectItem><SelectItem value="ipd">IPD</SelectItem></SelectContent>
        </Select>}
        {period === undefined && <><label className="flex flex-col text-[11px] font-bold uppercase tracking-wider text-slate-500">From
          <Input type="date" aria-label="From" className="mt-1 h-10 w-40 rounded-xl" value={from ?? ""} max={to} onChange={(e) => setFilter({ from: e.target.value || undefined })} /></label>
        <label className="flex flex-col text-[11px] font-bold uppercase tracking-wider text-slate-500">To
          <Input type="date" aria-label="To" className="mt-1 h-10 w-40 rounded-xl" value={to ?? ""} min={from} onChange={(e) => setFilter({ to: e.target.value || undefined })} /></label></>}
        {canCreate && <Button className="h-10 rounded-xl bg-[#0F2A4D] px-5 font-bold text-white hover:bg-[#16375F]" onClick={() => setCreating(true)}>New services invoice</Button>}
        {patientId && <Button variant="outline" className="h-10 rounded-xl font-bold" onClick={() => setFilter({ patient: undefined })}>One patient only: clear</Button>}
        {filtered && <Button variant="ghost" className="h-10 rounded-xl font-bold text-slate-500" onClick={() => { search.onChange(""); url.set({ status: undefined, from: undefined, to: undefined, patient: undefined, type: undefined, page: undefined }) }}>Clear filters</Button>}
      </div>

      {period === null ? (
        <EmptyState icon={FileText} title="Choose a valid period" subtitle="The list reads the period chosen above." />
      ) : list.isError && !list.data ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : list.isPending ? (
        <div className="space-y-3" role="status" aria-label="Loading invoices">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState icon={FileText} title={filtered ? "No invoice matches" : sourceType === "consultation" ? "No consultation invoices yet" : sourceType === "service" ? "No service invoices yet" : "No invoices in this period"} subtitle={filtered ? "Try different filters." : undefined} />
      ) : (
        <div className="overflow-x-auto rounded-2xl ring-1 ring-black/5">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/60 hover:bg-slate-50/60">
                <TableHead className="px-4">Invoice</TableHead>
                <TableHead>Patient</TableHead>
                <TableHead>Visit</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Received</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead className="pr-4">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((inv) => <InvoiceRow key={inv.id} inv={inv} timezone={settings?.timezone} onOpen={() => setOpenId(inv.id)} />)}
            </TableBody>
          </Table>
        </div>
      )}
      {list.data && (items.length > 0 || page > 1) && (
        <Pagination page={page} pageSize={PAGE_SIZE} total={list.data.total} onPageChange={(n) => url.set({ page: n === 1 ? undefined : String(n) })} itemLabel="invoices" />
      )}
      <InvoiceDetailDialog id={openId} onClose={() => setOpenId(null)} />
      {creating && <ChargeServicesDialog onClose={() => setCreating(false)} onDone={(saved) => { if (saved) setOpenId(saved.id) }} />}
    </div>
  )
}

function InvoiceRow({ inv, timezone, onOpen }: { inv: InvoiceSummary; timezone?: string; onOpen: () => void }) {
  return (
    <TableRow data-testid={`invoice-row-${inv.id}`} className="cursor-pointer hover:bg-slate-50" onClick={onOpen}>
      <TableCell className="px-4">
        <button type="button" className="font-mono text-xs font-bold text-[#0891B2] hover:underline focus-visible:underline" onClick={(e) => { e.stopPropagation(); onOpen() }}>{inv.invoiceNo}</button>
        {timezone && <div className="text-xs text-slate-500">{formatInstant(inv.issuedAt, timezone, { dateStyle: "medium" })}</div>}
      </TableCell>
      <TableCell>
        <div className="font-semibold">{partyName(inv)}</div>
        <div className="text-xs text-slate-500">{isCounterSale(inv) ? "Counter sale" : inv.patient?.mrNo}</div>
      </TableCell>
      <TableCell className="text-xs">
        {inv.encounter ? <Link href={`/encounters/${inv.encounter.id}`} onClick={(e) => e.stopPropagation()} className="font-mono font-bold text-[#0891B2] hover:underline">{inv.encounter.encId}</Link> : <span className="text-slate-400">—</span>}
        <div className="text-slate-500">{inv.sourceTypes.map((s) => SOURCE_LABEL[s]).join(", ")}</div>
      </TableCell>
      <TableCell className="text-right tabular-nums">{showMoney(inv.total)}</TableCell>
      <TableCell className="text-right tabular-nums">{showMoney(inv.received)}</TableCell>
      <TableCell className="text-right font-semibold tabular-nums">{showMoney(inv.balance)}</TableCell>
      <TableCell className="pr-4"><StatusBadge status={INVOICE_STATUS_LABEL[inv.status as InvoiceStatus]} /></TableCell>
    </TableRow>
  )
}

/** One invoice with its charges (`GET /invoices/{id}`): a record being worked on, so it is read again every time it is opened. */
export function InvoiceDetailDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { settings } = useHospital()
  const key = useScopedKey("invoice", "detail", id)
  const q = useQuery({ queryKey: key, queryFn: ({ signal }) => billingService.getInvoice(id as string, signal), ...CACHE_CLASSES.record, enabled: !!id })
  return (
    <Dialog open={!!id} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto" data-testid="invoice-dialog">
        <DialogHeader><DialogTitle>Invoice</DialogTitle></DialogHeader>
        {q.isPending ? <Skeleton className="h-56 w-full rounded-2xl" role="status" aria-label="Loading the invoice" /> : q.isError ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : <InvoiceView invoice={q.data} timezone={settings?.timezone} />}
      </DialogContent>
    </Dialog>
  )
}
