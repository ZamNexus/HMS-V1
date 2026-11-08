"use client"
import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { ClipboardList, Plus, Search } from "lucide-react"

import { EmptyState } from "@/components/shared/EmptyState"
import { ErrorState } from "@/components/shared/ErrorState"
import { Pagination } from "@/components/shared/Pagination"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useAuth } from "@/lib/auth"
import { CACHE_CLASSES } from "@/lib/query/cacheClasses"
import { useDebouncedSearch } from "@/lib/query/useDebouncedSearch"
import { useScopedKey } from "@/lib/query/useScopedKey"
import { pageFromUrl, useUrlFilters } from "@/lib/query/useUrlFilters"
import { visitsService, type VisitListOptions, type VisitSummary, type VisitType } from "@/lib/services"
import { formatInstant } from "@/lib/session/hospital"
import { useAccess } from "@/lib/session/useAccess"
import { useHospital } from "@/lib/session/useHospital"
import { useDoctors } from "@/lib/useReferenceData"
import { cn } from "@/lib/utils"
import { BedBoard } from "./BedBoard"
import { STATUS_LABEL, TAB_LABEL, TABS, TYPE_LABEL, tabQuery, tokenLabel, type Tab } from "./visitUi"

const PAGE_SIZE = 10
// What is kept in the address bar: the page and non-identifying filters (never a name, phone, MR or CNIC number; the search box is not one of them).
const URL_KEYS = ["tab", "page", "type", "status", "doctor", "from", "to", "archived"] as const
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Encounters (E1). Today's queue, every visit, the doctor's "to finish" list, the admitted patients and the bed board. A worklist: refreshed every 30 s
 * while open. Filters go to the server; the page and filters live in the address bar, the search text never.
 */
export function VisitsScreen() {
  const router = useRouter()
  const { can, modules } = useAccess()
  const { user } = useAuth()
  const { settings } = useHospital()
  const doctors = useDoctors()
  const url = useUrlFilters(URL_KEYS)
  const search = useDebouncedSearch()
  const today = settings?.today ?? null
  const ipdOn = modules?.ipd === true // unknown (still loading) counts as off, so an IPD option never flashes
  const canCheckIn = can("encounters.check_in") || (ipdOn && can("ipd.admit"))
  const showBeds = ipdOn && can("ipd.read")

  const tabs = TABS.filter((t) => (t === "beds" ? showBeds : t === "admitted" ? ipdOn : true))
  const asked = url.get("tab")
  const tab: Tab = (tabs as readonly string[]).includes(asked ?? "") ? (asked as Tab) : "queue"
  const page = pageFromUrl(url.get("page"))
  const doctorId = url.get("doctor")
  const type = (["opd", "ipd"] as const).find((x) => x === url.get("type"))
  const status = (["open", "closed", "discharged", "cancelled"] as const).find((x) => x === url.get("status"))
  const from = DATE_RE.test(url.get("from") ?? "") ? url.get("from") : undefined
  const to = DATE_RE.test(url.get("to") ?? "") ? url.get("to") : undefined
  const archived = url.get("archived") === "true" && can("encounters.archive")
  const myDoctor = user ? doctors.active.find((d) => d.id === user.id) : undefined

  const options: VisitListOptions = today ? { search: search.term, page, pageSize: PAGE_SIZE, ...tabQuery(tab, today, { doctorId, type, status, from, to, archived }) } : { page, pageSize: PAGE_SIZE }
  const key = useScopedKey("visits", "list", { ...options, search: search.term ?? null })
  const list = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => visitsService.list({ ...options, signal }),
    ...CACHE_CLASSES.worklist,
    placeholderData: keepPreviousData,
    enabled: today !== null && tab !== "beds",
  })
  const items = list.data?.items ?? []
  const setFilter = (patch: Partial<Record<(typeof URL_KEYS)[number], string | undefined>>) => url.set({ ...patch, page: undefined })
  const filtered = !!search.term || !!doctorId || !!type || !!status || !!from || !!to || archived

  return (
    <div className="space-y-6 pb-10" data-testid="visits-screen">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-[#0D1B2E]">Encounters</h1>
          <p className="mt-1 text-sm font-medium text-slate-500" data-testid="visits-count">
            {tab === "beds" ? "Live bed board" : list.isError && !list.data ? "Encounters unavailable" : list.data ? `${list.data.total} ${filtered ? "matching " : ""}${list.data.total === 1 ? "encounter" : "encounters"}` : "Loading encounters…"}
          </p>
        </div>
        {canCheckIn && (
          <Button asChild className="h-11 rounded-xl border-0 bg-[#0F2A4D] px-6 font-bold text-white shadow-lg shadow-[#0F2A4D]/20 hover:bg-[#16375F]">
            <Link href="/encounters/new"><Plus className="mr-2 h-5 w-5" /> {ipdOn && can("ipd.admit") && !can("encounters.check_in") ? "Admit Patient" : "Check In"}</Link>
          </Button>
        )}
      </div>

      <div className="flex h-11 w-fit max-w-full items-center gap-1 overflow-x-auto rounded-xl bg-slate-100/80 p-1" role="tablist" aria-label="Encounter view">
        {tabs.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => url.set({ tab: t === "queue" ? undefined : t, page: undefined })}
            className={cn("whitespace-nowrap rounded-lg px-4 py-2 text-xs font-bold transition-all", tab === t ? "bg-white text-[#0891B2] shadow-sm ring-1 ring-black/5" : "text-slate-500 hover:bg-slate-200/50 hover:text-slate-700")}>
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      {tab === "beds" ? (
        <BedBoard />
      ) : (
        <>
          <div className="space-y-3 rounded-[1.25rem] bg-white p-3 shadow-sm ring-1 ring-black/5">
            <div className="relative w-full max-w-md">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input type="text" aria-label="Search encounters" placeholder="Search by patient, MR No., phone or encounter number..." value={search.input} maxLength={100} autoComplete="off"
                onChange={(e) => { search.onChange(e.target.value); url.set({ page: undefined }) }}
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-4 text-sm font-medium text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-[#1CC0CE] focus:bg-white focus:ring-2 focus:ring-[#1CC0CE]/20" />
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <Select value={doctorId ?? "any"} onValueChange={(v) => setFilter({ doctor: v === "any" ? undefined : v })}>
                <SelectTrigger aria-label="Doctor" className="h-10 w-56 rounded-xl border-slate-200 bg-slate-50"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any doctor</SelectItem>
                  {doctors.active.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {myDoctor && <Button variant={doctorId === myDoctor.id ? "default" : "outline"} className="h-10 rounded-xl font-bold" onClick={() => setFilter({ doctor: doctorId === myDoctor.id ? undefined : myDoctor.id })}>My patients</Button>}
              {(tab === "queue" || tab === "all") && (
                <Select value={type ?? "any"} onValueChange={(v) => setFilter({ type: v === "any" ? undefined : v })}>
                  <SelectTrigger aria-label="Type" className="h-10 w-36 rounded-xl border-slate-200 bg-slate-50"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="any">OPD and IPD</SelectItem><SelectItem value="opd">OPD</SelectItem>{ipdOn && <SelectItem value="ipd">IPD</SelectItem>}</SelectContent>
                </Select>
              )}
              {tab === "all" && (
                <>
                  <Select value={status ?? "any"} onValueChange={(v) => setFilter({ status: v === "any" ? undefined : v })}>
                    <SelectTrigger aria-label="Status" className="h-10 w-40 rounded-xl border-slate-200 bg-slate-50"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any status</SelectItem>
                      {(["open", "closed", "discharged", "cancelled"] as const).map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <label className="flex flex-col text-[11px] font-bold uppercase tracking-wider text-slate-500">From<Input type="date" aria-label="From" className="mt-1 h-10 w-40 rounded-xl border-slate-200 bg-slate-50" value={from ?? ""} max={to ?? today ?? undefined} onChange={(e) => setFilter({ from: e.target.value || undefined })} /></label>
                  <label className="flex flex-col text-[11px] font-bold uppercase tracking-wider text-slate-500">To<Input type="date" aria-label="To" className="mt-1 h-10 w-40 rounded-xl border-slate-200 bg-slate-50" value={to ?? ""} min={from} max={today ?? undefined} onChange={(e) => setFilter({ to: e.target.value || undefined })} /></label>
                  {can("encounters.archive") && (
                    <div className="flex h-10 items-center gap-2"><Checkbox id="visits-archived" checked={archived} onCheckedChange={(v) => setFilter({ archived: v === true ? "true" : undefined })} /><Label htmlFor="visits-archived" className="cursor-pointer text-sm font-medium text-slate-700">Include archived</Label></div>
                  )}
                </>
              )}
              {filtered && <Button variant="ghost" className="h-10 rounded-xl font-bold text-slate-500" onClick={() => { search.onChange(""); url.set({ doctor: undefined, type: undefined, status: undefined, from: undefined, to: undefined, archived: undefined, page: undefined }) }}>Clear filters</Button>}
            </div>
          </div>

          <div className="overflow-hidden rounded-[1.5rem] bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-black/5">
            {list.isError && !list.data ? (
              <div className="p-6"><ErrorState error={list.error} onRetry={() => void list.refetch()} /></div>
            ) : list.isPending ? (
              <div className="space-y-3 p-6" role="status" aria-label="Loading encounters">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}</div>
            ) : items.length === 0 ? (
              <div className="p-10"><EmptyState icon={ClipboardList} title={tab === "queue" ? "Nobody in the queue" : tab === "pending" ? "No records waiting to be finished" : "No encounters"} subtitle={filtered ? "Try different filters." : undefined} /></div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-slate-100 bg-slate-50/50 hover:bg-slate-50/50">
                      <TableHead className="h-auto px-6 py-4 font-bold text-slate-500">Token</TableHead>
                      <TableHead className="h-auto py-4 font-bold text-slate-500">Visit</TableHead>
                      <TableHead className="h-auto py-4 font-bold text-slate-500">Patient</TableHead>
                      <TableHead className="h-auto py-4 font-bold text-slate-500">Doctor</TableHead>
                      <TableHead className="h-auto py-4 font-bold text-slate-500">Where / diagnosis</TableHead>
                      <TableHead className="h-auto px-6 py-4 font-bold text-slate-500">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((v) => <VisitRow key={v.id} v={v} timezone={settings?.timezone} onOpen={() => router.push(`/encounters/${v.id}`)} />)}
                  </TableBody>
                </Table>
              </div>
            )}
            {list.data && (items.length > 0 || page > 1) && (
              <div className="border-t border-slate-100 bg-slate-50/50 p-4">
                <Pagination page={page} pageSize={PAGE_SIZE} total={list.data.total} onPageChange={(n) => url.set({ page: n === 1 ? undefined : String(n) })} itemLabel="encounters" />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function VisitRow({ v, timezone, onOpen }: { v: VisitSummary; timezone?: string; onOpen: () => void }) {
  return (
    <TableRow data-testid={`visit-row-${v.id}`} className={cn("cursor-pointer border-b border-slate-50 transition-colors last:border-0 hover:bg-slate-50", v.archived && "opacity-70")} onClick={onOpen}>
      <TableCell className="px-6 py-4 font-black text-[#0D1B2E]">{tokenLabel(v)}</TableCell>
      <TableCell className="py-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" className="font-mono text-xs font-bold text-[#0891B2] hover:underline focus-visible:underline" onClick={(e) => { e.stopPropagation(); onOpen() }}>{v.encId}</button>
          <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">{TYPE_LABEL[v.type]}</span>
          {v.priority === "urgent" && <span className="rounded-md bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">Urgent</span>}
        </div>
        {timezone && <div className="text-xs text-slate-500">{formatInstant(v.startedAt, timezone, { dateStyle: "medium", timeStyle: "short" })}</div>}
      </TableCell>
      <TableCell className="py-4">
        <div className="font-bold text-[#0D1B2E]">{v.patient.name}{v.patient.deceasedOn && <span className="ml-2"><StatusBadge status="Deceased" /></span>}</div>
        <div className="font-mono text-xs text-slate-500">{v.patient.mrNo}</div>
      </TableCell>
      <TableCell className="py-4 text-sm font-medium text-slate-600">{v.doctor.name}</TableCell>
      <TableCell className="py-4 text-sm text-slate-600">
        {v.bed ? <div className="font-medium">{v.bed.wardName} · bed {v.bed.bedNo}</div> : null}
        <div className={cn(v.primaryDiagnosis ? "text-slate-700" : "text-slate-400")}>{v.primaryDiagnosis ?? "No diagnosis yet"}</div>
      </TableCell>
      <TableCell className="px-6 py-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge status={STATUS_LABEL[v.status]} />
          {v.pending && <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800" title="An earlier day's visit whose record is not finished">To finish</span>}
          {v.archived && <span className="rounded-md bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">Archived</span>}
        </div>
      </TableCell>
    </TableRow>
  )
}
