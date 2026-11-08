"use client"
import * as React from "react"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { Pill, Plus, Search } from "lucide-react"

import { showMoney } from "@/components/billing/billingUi"
import { EmptyState } from "@/components/shared/EmptyState"
import { ErrorState } from "@/components/shared/ErrorState"
import { Pagination } from "@/components/shared/Pagination"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { CACHE_CLASSES } from "@/lib/query/cacheClasses"
import { useDebouncedSearch } from "@/lib/query/useDebouncedSearch"
import { useScopedKey } from "@/lib/query/useScopedKey"
import { pageFromUrl, useUrlFilters } from "@/lib/query/useUrlFilters"
import { useToast } from "@/components/ui/use-toast"
import { errorSummary, isSavedButUnreadableError, pharmacyApiService, type PmBatch, type PmMedicine, type PmMedicineListOptions } from "@/lib/services"
import { useAccess } from "@/lib/session/useAccess"
import { cn } from "@/lib/utils"
import { BatchActionDialog, MedicineDetailDialog, MedicineFormDialog, ReceiveStockDialog } from "./MedicineDialogs"
import { PM_EXPIRY_LABEL, PM_LEVEL_LABEL, expiryClass, levelClass } from "./pmUi"

const PAGE_SIZE = 10
const URL_KEYS = ["page", "level", "expiry", "active"] as const

type Open =
  | { kind: "add" }
  | { kind: "edit"; medicine: PmMedicine }
  | { kind: "receive"; medicine: PmMedicine }
  | { kind: "detail"; id: string }
  | { kind: "batch"; batch: PmBatch; mode: "write_off" | "adjust"; medicineId: string }
  | null

/**
 * The inventory (PH1): medicines with the server's stock summary (on hand, level, expiry): the badges are the server's levels and the browser never sums batches. Server paging (10),
 * search (300 ms, 2 characters, aborted) and the level, expiry and active filters; the page and non-identifying filters live in the address bar, the search text never. A
 * worklist (15 s, polled every 30 s). pharmacy.stock adds a medicine, edits it, receives stock and deactivates/reactivates.
 */
export function MedicinesTab() {
  const { can } = useAccess()
  const { toast } = useToast()
  const url = useUrlFilters(URL_KEYS)
  const search = useDebouncedSearch()
  const [open, setOpen] = React.useState<Open>(null)
  const page = pageFromUrl(url.get("page"))
  const level = (["low", "out_of_stock"] as const).find((x) => x === url.get("level"))
  const expiry = (["expiring", "expired"] as const).find((x) => x === url.get("expiry"))
  const activeParam = url.get("active")
  const active = activeParam === "all" ? undefined : activeParam === "inactive" ? false : true
  const options: PmMedicineListOptions = { search: search.term, page, pageSize: PAGE_SIZE, level, expiry, active }
  const key = useScopedKey("pharmacyApi", "list", { ...options, search: search.term ?? null, level: level ?? null, expiry: expiry ?? null, active: active ?? null })
  const list = useQuery({ queryKey: key, queryFn: ({ signal }) => pharmacyApiService.listMedicines(options, signal), ...CACHE_CLASSES.worklist, placeholderData: keepPreviousData })
  const items = list.data?.items ?? []
  const stockWriter = can("pharmacy.stock")
  const setFilter = (patch: Partial<Record<(typeof URL_KEYS)[number], string | undefined>>) => url.set({ ...patch, page: undefined })
  const filtered = !!search.term || !!level || !!expiry || activeParam === "all" || activeParam === "inactive"
  const close = () => setOpen(null)
  // one request; a refusal is shown with the backend's own message, never swallowed
  const [toggling, setToggling] = React.useState(false)
  const toggleActive = async (m: PmMedicine) => {
    if (toggling) return // one request at a time: a double click must not send two
    setToggling(true)
    try {
      await pharmacyApiService.setMedicineActive(m.id, !m.active)
      toast({ title: `${m.name} ${m.active ? "deactivated" : "reactivated"}` })
    } catch (err) {
      if (isSavedButUnreadableError(err)) toast({ title: "Done. Refreshing." }) // accepted, answer unreadable: the list is refreshed, never sent again
      else toast({ variant: "destructive", title: `Could not ${m.active ? "deactivate" : "reactivate"} ${m.name}`, description: errorSummary(err) })
    } finally {
      setToggling(false)
    }
  }

  return (
    <div className="space-y-4" data-testid="medicines-tab">
      <div className="space-y-3 rounded-[1.25rem] bg-white p-3 shadow-sm ring-1 ring-black/5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative w-full max-w-md">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input type="text" aria-label="Search medicines" placeholder="Search by name, generic or category..." value={search.input} maxLength={100} autoComplete="off"
              onChange={(e) => { search.onChange(e.target.value); url.set({ page: undefined }) }}
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-4 text-sm font-medium outline-none transition-all placeholder:text-slate-400 focus:border-[#1CC0CE] focus:bg-white focus:ring-2 focus:ring-[#1CC0CE]/20" />
          </div>
          {stockWriter && <Button className="h-11 rounded-xl bg-[#0F2A4D] px-5 font-bold text-white hover:bg-[#16375F]" onClick={() => setOpen({ kind: "add" })}><Plus className="mr-2 h-4 w-4" /> Add medicine</Button>}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Select value={level ?? "any"} onValueChange={(v) => setFilter({ level: v === "any" ? undefined : v })}>
            <SelectTrigger aria-label="Stock level" className="h-10 w-44 rounded-xl border-slate-200 bg-slate-50"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="any">Any stock level</SelectItem><SelectItem value="low">Low stock</SelectItem><SelectItem value="out_of_stock">Out of stock</SelectItem></SelectContent>
          </Select>
          <Select value={expiry ?? "any"} onValueChange={(v) => setFilter({ expiry: v === "any" ? undefined : v })}>
            <SelectTrigger aria-label="Expiry" className="h-10 w-44 rounded-xl border-slate-200 bg-slate-50"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="any">Any expiry</SelectItem><SelectItem value="expiring">Expiring soon</SelectItem><SelectItem value="expired">Has expired stock</SelectItem></SelectContent>
          </Select>
          <Select value={activeParam === "all" || activeParam === "inactive" ? activeParam : "active"} onValueChange={(v) => setFilter({ active: v === "active" ? undefined : v })}>
            <SelectTrigger aria-label="Active" className="h-10 w-40 rounded-xl border-slate-200 bg-slate-50"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Deactivated</SelectItem><SelectItem value="all">All</SelectItem></SelectContent>
          </Select>
          {filtered && <Button variant="ghost" className="h-10 rounded-xl font-bold text-slate-500" onClick={() => { search.onChange(""); url.set({ level: undefined, expiry: undefined, active: undefined, page: undefined }) }}>Clear filters</Button>}
          <span className="ml-auto text-sm font-medium text-slate-500" data-testid="medicine-count">{list.data ? `${list.data.total} ${list.data.total === 1 ? "medicine" : "medicines"}` : ""}</span>
        </div>
      </div>

      <div className="overflow-hidden rounded-[1.5rem] bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-black/5">
        {list.isError && !list.data ? (
          <div className="p-6"><ErrorState error={list.error} onRetry={() => void list.refetch()} /></div>
        ) : list.isPending ? (
          <div className="space-y-3 p-6" role="status" aria-label="Loading medicines">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}</div>
        ) : items.length === 0 ? (
          <div className="p-10"><EmptyState icon={Pill} title="No medicine matches" subtitle={filtered ? "Try different filters." : stockWriter ? "Add the first medicine." : undefined} /></div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-slate-100 bg-slate-50/50 hover:bg-slate-50/50">
                  <TableHead className="px-6 py-4 font-bold text-slate-500">Medicine</TableHead><TableHead className="py-4 font-bold text-slate-500">Category</TableHead><TableHead className="py-4 text-right font-bold text-slate-500">Rate</TableHead>
                  <TableHead className="py-4 text-right font-bold text-slate-500">On hand</TableHead><TableHead className="py-4 font-bold text-slate-500">Stock</TableHead><TableHead className="px-6 py-4 text-right font-bold text-slate-500">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((m) => (
                  <TableRow key={m.id} data-testid={`medicine-row-${m.id}`} data-level={m.stock.level} className={cn("border-b border-slate-50 hover:bg-slate-50", !m.active && "opacity-60")}>
                    <TableCell className="px-6 py-4">
                      <button type="button" className="text-left font-bold text-[#0D1B2E] hover:underline" onClick={() => setOpen({ kind: "detail", id: m.id })}>{m.name}</button>
                      <div className="text-xs text-slate-500">{[m.generic, m.unit].filter(Boolean).join(" · ")}{!m.active && <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">Deactivated</span>}</div>
                    </TableCell>
                    <TableCell className="py-4 text-sm">{m.category ?? "—"}</TableCell>
                    <TableCell className="py-4 text-right tabular-nums">{showMoney(m.saleRate)}</TableCell>
                    <TableCell className="py-4 text-right font-bold tabular-nums" data-testid={`onhand-${m.id}`}>{m.stock.onHand}</TableCell>
                    <TableCell className="py-4">
                      <div className="flex flex-wrap items-center gap-1">
                        <span className={cn("rounded-md px-2 py-0.5 text-[11px] font-bold", levelClass(m.stock.level))} data-testid={`level-${m.id}`}>{PM_LEVEL_LABEL[m.stock.level]}</span>
                        {m.stock.expiry && <span className={cn("rounded-md px-2 py-0.5 text-[11px] font-bold", expiryClass(m.stock.expiry))} data-testid={`expiry-${m.id}`}>{PM_EXPIRY_LABEL[m.stock.expiry]}</span>}
                      </div>
                      {m.stock.nearestExpiry && <div className="text-[11px] text-slate-500">Nearest expiry {m.stock.nearestExpiry}</div>}
                    </TableCell>
                    <TableCell className="px-6 py-4">
                      <div className="flex flex-wrap justify-end gap-1">
                        <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs font-bold" aria-label={`Details of ${m.name}`} onClick={() => setOpen({ kind: "detail", id: m.id })}>Details</Button>
                        {stockWriter && <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs font-bold" aria-label={`Receive stock for ${m.name}`} disabled={!m.active} title={m.active ? undefined : "Reactivate the medicine first"} onClick={() => setOpen({ kind: "receive", medicine: m })}>Receive</Button>}
                        {stockWriter && <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs font-bold" aria-label={`Edit ${m.name}`} onClick={() => setOpen({ kind: "edit", medicine: m })}>Edit</Button>}
                        {stockWriter && <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs font-bold" aria-label={`${m.active ? "Deactivate" : "Reactivate"} ${m.name}`} disabled={toggling} onClick={() => void toggleActive(m)}>{m.active ? "Deactivate" : "Reactivate"}</Button>}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {list.data && (items.length > 0 || page > 1) && <div className="border-t border-slate-100 bg-slate-50/50 p-4"><Pagination page={page} pageSize={PAGE_SIZE} total={list.data.total} onPageChange={(n) => url.set({ page: n === 1 ? undefined : String(n) })} itemLabel="medicines" /></div>}
      </div>

      {open?.kind === "add" && <MedicineFormDialog medicine={null} onClose={close} onDone={() => undefined} />}
      {open?.kind === "edit" && <MedicineFormDialog medicine={open.medicine} onClose={close} onDone={() => undefined} />}
      {open?.kind === "receive" && <ReceiveStockDialog medicine={open.medicine} onClose={close} onDone={() => undefined} />}
      {open?.kind === "detail" && <MedicineDetailDialog id={open.id} onClose={close} onBatchAction={(batch, mode) => setOpen({ kind: "batch", batch, mode, medicineId: (open as { id: string }).id })} />}
      {open?.kind === "batch" && <BatchActionDialog batch={open.batch} mode={open.mode} onClose={() => setOpen({ kind: "detail", id: open.medicineId })} onDone={() => undefined} />}
    </div>
  )
}
