"use client"
import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { Plus, ScanLine, Search } from "lucide-react"

import { EmptyState } from "@/components/shared/EmptyState"
import { ErrorState } from "@/components/shared/ErrorState"
import { Pagination } from "@/components/shared/Pagination"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { CACHE_CLASSES } from "@/lib/query/cacheClasses"
import { useDebouncedSearch } from "@/lib/query/useDebouncedSearch"
import { useScopedKey } from "@/lib/query/useScopedKey"
import { pageFromUrl, useUrlFilters } from "@/lib/query/useUrlFilters"
import { DX_MODALITIES, DX_PRIORITIES, imagingApiService, type DxPriority, type ImagingOrderListOptionsApi, type ImagingOrderRow } from "@/lib/services"
import { formatInstant } from "@/lib/session/hospital"
import { useAccess } from "@/lib/session/useAccess"
import { useHospital } from "@/lib/session/useHospital"
import { cn } from "@/lib/utils"
import { DxStatusBadge, PriorityBadge } from "./DxBits"
import { DX_PRIORITY_LABEL, DX_TEST_STATUS_LABEL, IMAGING_TABS, IMAGING_TAB_LABEL, imagingTabQuery, type ImagingTab } from "./dxUi"

const PAGE_SIZE = 10
const URL_KEYS = ["tab", "page", "priority", "modality", "from", "to", "archived"] as const
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Imaging orders (I1): All orders, To perform (`toPerform`), To report (`toReport`, the doctor's reporting list) and Hand-over (`status=completed`), with a modality
 * filter. A worklist (15 s, refreshed every 30 s). The tab, page and non-identifying filters live in the address bar, the search text never.
 */
export function ImagingOrdersScreen() {
  const router = useRouter()
  const { can, modules } = useAccess()
  const off = modules ? modules.imaging === false : false // the department is switched off here
  const { settings } = useHospital()
  const url = useUrlFilters(URL_KEYS)
  const search = useDebouncedSearch()
  const tabs: readonly ImagingTab[] = off ? ["all"] : IMAGING_TABS
  const tab: ImagingTab = tabs.find((t) => t === url.get("tab")) ?? "all"
  const page = pageFromUrl(url.get("page"))
  const priority = DX_PRIORITIES.find((p) => p === url.get("priority"))
  const modality = DX_MODALITIES.find((m) => m === url.get("modality"))
  const from = DATE_RE.test(url.get("from") ?? "") ? (url.get("from") as string) : undefined
  const to = DATE_RE.test(url.get("to") ?? "") ? (url.get("to") as string) : undefined
  const archived = url.get("archived") === "true" && can("diagnostics.archive")
  const rangeOk = !from || !to || from <= to
  const options: ImagingOrderListOptionsApi = { search: search.term, page, pageSize: PAGE_SIZE, priority, modality, dateFrom: rangeOk ? from : undefined, dateTo: rangeOk ? to : undefined, includeArchived: archived || undefined, ...imagingTabQuery(tab) }
  const key = useScopedKey("imagingApi", "list", { ...options, search: search.term ?? null })
  const list = useQuery({ queryKey: key, queryFn: ({ signal }) => imagingApiService.list(options, signal), ...CACHE_CLASSES.worklist, placeholderData: keepPreviousData })
  const items = list.data?.items ?? []
  const setFilter = (patch: Partial<Record<(typeof URL_KEYS)[number], string | undefined>>) => url.set({ ...patch, page: undefined })
  const filtered = !!search.term || !!priority || !!modality || !!from || !!to || archived

  return (
    <div className="space-y-6 pb-10" data-testid="imaging-orders-screen">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-[#0D1B2E]">Imaging Orders</h1>
          <p className="mt-1 text-sm font-medium text-slate-500" data-testid="imaging-count">{list.isError && !list.data ? "Orders unavailable" : list.data ? `${list.data.total} ${filtered ? "matching " : ""}${list.data.total === 1 ? "order" : "orders"}` : "Loading…"}</p>
        </div>
        {can("diagnostics.order") && (
          <Button asChild className="h-11 rounded-xl border-0 bg-[#0F2A4D] px-6 font-bold text-white shadow-lg shadow-[#0F2A4D]/20 hover:bg-[#16375F]"><Link href="/imaging/orders/new"><Plus className="mr-2 h-5 w-5" /> New Imaging Order</Link></Button>
        )}
      </div>

      {off && <div role="status" data-testid="module-off-notice" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-900">The imaging department is switched off here. Past orders stay readable; a new order is placed as an external referral, recorded but not worked.</div>}
      <div className="flex h-11 w-fit max-w-full items-center gap-1 overflow-x-auto rounded-xl bg-slate-100/80 p-1" role="tablist" aria-label="Imaging view">
        {tabs.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => url.set({ tab: t === "all" ? undefined : t, page: undefined })}
            className={cn("whitespace-nowrap rounded-lg px-4 py-2 text-xs font-bold transition-all", tab === t ? "bg-white text-[#0891B2] shadow-sm ring-1 ring-black/5" : "text-slate-500 hover:bg-slate-200/50 hover:text-slate-700")}>
            {IMAGING_TAB_LABEL[t]}
          </button>
        ))}
      </div>

      <div className="space-y-3 rounded-[1.25rem] bg-white p-3 shadow-sm ring-1 ring-black/5">
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input type="text" aria-label="Search imaging orders" placeholder="Search by order no., MR No., patient or outside doctor..." value={search.input} maxLength={100} autoComplete="off"
            onChange={(e) => { search.onChange(e.target.value); url.set({ page: undefined }) }}
            className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-4 text-sm font-medium text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-[#1CC0CE] focus:bg-white focus:ring-2 focus:ring-[#1CC0CE]/20" />
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Select value={modality ?? "any"} onValueChange={(v) => setFilter({ modality: v === "any" ? undefined : v })}>
            <SelectTrigger aria-label="Modality" className="h-10 w-48 rounded-xl border-slate-200 bg-slate-50"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="any">Any modality</SelectItem>{DX_MODALITIES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={priority ?? "any"} onValueChange={(v) => setFilter({ priority: v === "any" ? undefined : v })}>
            <SelectTrigger aria-label="Priority" className="h-10 w-40 rounded-xl border-slate-200 bg-slate-50"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="any">Any priority</SelectItem>{DX_PRIORITIES.map((p: DxPriority) => <SelectItem key={p} value={p}>{DX_PRIORITY_LABEL[p]}</SelectItem>)}</SelectContent>
          </Select>
          <label className="flex flex-col text-[11px] font-bold uppercase tracking-wider text-slate-500">From<Input type="date" aria-label="From" className="mt-1 h-10 w-40 rounded-xl" value={from ?? ""} max={to} onChange={(e) => setFilter({ from: e.target.value || undefined })} /></label>
          <label className="flex flex-col text-[11px] font-bold uppercase tracking-wider text-slate-500">To<Input type="date" aria-label="To" className="mt-1 h-10 w-40 rounded-xl" value={to ?? ""} min={from} onChange={(e) => setFilter({ to: e.target.value || undefined })} /></label>
          {can("diagnostics.archive") && <div className="flex h-10 items-center gap-2"><Checkbox id="img-archived" checked={archived} onCheckedChange={(v) => setFilter({ archived: v === true ? "true" : undefined })} /><Label htmlFor="img-archived" className="cursor-pointer text-sm font-medium">Include archived</Label></div>}
          {filtered && <Button variant="ghost" className="h-10 rounded-xl font-bold text-slate-500" onClick={() => { search.onChange(""); url.set({ priority: undefined, modality: undefined, from: undefined, to: undefined, archived: undefined, page: undefined }) }}>Clear filters</Button>}
        </div>
      </div>

      <div className="overflow-hidden rounded-[1.5rem] bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-black/5">
        {list.isError && !list.data ? (
          <div className="p-6"><ErrorState error={list.error} onRetry={() => void list.refetch()} /></div>
        ) : list.isPending ? (
          <div className="space-y-3 p-6" role="status" aria-label="Loading imaging orders">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}</div>
        ) : items.length === 0 ? (
          <div className="p-10"><EmptyState icon={ScanLine} title={tab === "perform" ? "Nothing to perform" : tab === "report" ? "Nothing waiting for a report" : tab === "handover" ? "Nothing to hand over" : "No imaging orders"} subtitle={filtered ? "Try different filters." : undefined} /></div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-slate-100 bg-slate-50/50 hover:bg-slate-50/50">
                  <TableHead className="px-6 py-4 font-bold text-slate-500">Order</TableHead><TableHead className="py-4 font-bold text-slate-500">Patient</TableHead><TableHead className="py-4 font-bold text-slate-500">Tests</TableHead>
                  <TableHead className="py-4 font-bold text-slate-500">Ordered by</TableHead><TableHead className="px-6 py-4 font-bold text-slate-500">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((o) => <ImagingRow key={o.id} o={o} timezone={settings?.timezone} onOpen={() => router.push(`/imaging/orders/${o.id}`)} />)}
              </TableBody>
            </Table>
          </div>
        )}
        {list.data && (items.length > 0 || page > 1) && (
          <div className="border-t border-slate-100 bg-slate-50/50 p-4"><Pagination page={page} pageSize={PAGE_SIZE} total={list.data.total} onPageChange={(n) => url.set({ page: n === 1 ? undefined : String(n) })} itemLabel="orders" /></div>
        )}
      </div>
    </div>
  )
}

function ImagingRow({ o, timezone, onOpen }: { o: ImagingOrderRow; timezone?: string; onOpen: () => void }) {
  return (
    <TableRow data-testid={`imaging-row-${o.id}`} className={cn("cursor-pointer border-b border-slate-50 transition-colors last:border-0 hover:bg-slate-50", o.archived && "opacity-70")} onClick={onOpen}>
      <TableCell className="px-6 py-4">
        <div className="flex flex-wrap items-center gap-1.5"><button type="button" className="font-mono text-xs font-bold text-[#0891B2] hover:underline focus-visible:underline" onClick={(e) => { e.stopPropagation(); onOpen() }}>{o.orderNo}</button><PriorityBadge priority={o.priority} />{o.archived && <span className="rounded-md bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">Archived</span>}</div>
        {timezone && <div className="text-xs text-slate-500">{formatInstant(o.orderedAt, timezone)}</div>}
      </TableCell>
      <TableCell className="py-4"><div className="font-bold text-[#0D1B2E]">{o.patient.name}</div><div className="text-xs text-slate-500">{o.patient.mrNo}</div></TableCell>
      <TableCell className="py-4 text-xs">
        {o.tests.map((t, i) => <div key={i}>{t.name} <span className="text-slate-500">· {t.modality} · {DX_TEST_STATUS_LABEL[t.status]}</span></div>)}
        {o.toPerform > 0 && <div className="mt-1 font-bold text-amber-700" data-testid={`to-perform-${o.id}`}>{o.toPerform} to perform</div>}
        {o.toReport > 0 && <div className="font-bold text-teal-700" data-testid={`to-report-${o.id}`}>{o.toReport} to report</div>}
      </TableCell>
      <TableCell className="py-4 text-sm">{o.fulfillment === "external_referral" ? <span className="font-bold text-amber-700">External referral</span> : o.referringDoctor}</TableCell>
      <TableCell className="px-6 py-4"><DxStatusBadge status={o.status} /></TableCell>
    </TableRow>
  )
}
