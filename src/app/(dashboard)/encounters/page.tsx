"use client"
import { Suspense } from "react"
import { VisitsScreen } from "@/components/visits/VisitsScreen"
import { dataSource as visitsDataSource } from "@/lib/services"
import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import { AlertTriangle, ClipboardList, Plus, Search } from "lucide-react"

import {
  DEFAULT_PAGE_SIZE, ENCOUNTER_FILTERS, encounterFilterOptions, encountersService, errorSummary, viewState, type EncounterFilter,
} from "@/lib/services"
import { useDoctors, usePatients } from "@/lib/useReferenceData"
import { useResource } from "@/lib/useResource"
import { cn, formatCurrency } from "@/lib/utils"
import { EmptyState } from "@/components/shared/EmptyState"
import { Pagination } from "@/components/shared/Pagination"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

// Demo only (mock mode). Against the real API the list, the doctor's queue and the bed board are src/components/visits/VisitsScreen.tsx.
function MockEncounterListPage() {
  const router = useRouter()
  const [search, setSearch] = React.useState("")
  const [query, setQuery] = React.useState("")
  const [filter, setFilter] = React.useState<EncounterFilter>("All")
  const [page, setPage] = React.useState(1)

  // Debounce the search; any new search or filter restarts at page 1.
  React.useEffect(() => {
    const t = setTimeout(() => { setQuery(search.trim()); setPage(1) }, 250)
    return () => clearTimeout(t)
  }, [search])

  const filterOptions = React.useMemo(() => encounterFilterOptions(filter), [filter])
  const loadEncounters = React.useCallback(
    (signal: AbortSignal) => encountersService.list({ search: query, ...filterOptions, page, pageSize: DEFAULT_PAGE_SIZE, signal }),
    [query, filterOptions, page]
  )
  const { data, error, loading, reload } = useResource(loadEncounters)
  const rows = data?.items ?? []
  const view = viewState({ data, error, loading, rowCount: rows.length })

  // Names for the rows on screen come from the shared reference-data hooks (ids stay opaque strings).
  const patients = usePatients(rows.map((r) => r.patientId))
  const doctors = useDoctors()

  return (
    <div className="space-y-6 pb-10 max-w-7xl mx-auto">
      {/* ─── PREMIUM PAGE HEADER ─────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-[#0D1B2E] tracking-tight">Encounters</h1>
          <p className="mt-1 text-sm font-medium text-slate-500">
            {view === "error"
              ? "Encounters unavailable"
              : data
                ? `${data.total} ${query || filter !== "All" ? "matching" : "total recorded"} patient encounters`
                : "Loading encounters…"}
          </p>
        </div>
        <Button className="rounded-xl h-11 px-6 bg-[#0F2A4D] hover:bg-[#16375F] text-white font-bold shadow-lg shadow-[#0F2A4D]/20 border-0" asChild>
          <Link href="/encounters/new">
            <Plus className="h-5 w-5 mr-2" /> New Encounter
          </Link>
        </Button>
      </div>

      {/* ─── SEARCH & FILTERS BAR ────────────────────────────────────── */}
      <div className="rounded-[1.25rem] bg-white p-3 shadow-sm ring-1 ring-black/5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by patient, encounter ID or MR No..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-4 text-sm font-medium text-slate-900 placeholder:text-slate-400 outline-none transition-all focus:border-[#1CC0CE] focus:bg-white focus:ring-2 focus:ring-[#1CC0CE]/20"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          <div className="flex h-11 items-center gap-1 rounded-xl bg-slate-100/80 p-1">
            {ENCOUNTER_FILTERS.map((f) => {
              const isActive = filter === f
              return (
                <button
                  key={f}
                  onClick={() => { setFilter(f); setPage(1) }}
                  className={cn(
                    "rounded-lg px-4 py-2 text-xs font-bold transition-all duration-200 whitespace-nowrap",
                    isActive
                      ? "bg-white text-[#0891B2] shadow-sm ring-1 ring-black/5"
                      : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
                  )}
                >
                  {f}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* ─── ELEVATED DATA TABLE ──────────────────────────────────────── */}
      <div className="rounded-[1.5rem] border-none bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-black/5 overflow-hidden">
        {view === "error" ? (
          <div className="p-10" role="alert">
            <EmptyState
              icon={AlertTriangle}
              title="Couldn't load encounters"
              subtitle={errorSummary(error)}
              action={<Button variant="outline" className="rounded-xl font-bold" onClick={reload}>Try again</Button>}
            />
          </div>
        ) : view === "loading" ? (
          <div className="space-y-3 p-6" role="status" aria-label="Loading encounters">
            {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
          </div>
        ) : view === "empty" ? (
          <div className="p-10">
            <EmptyState
              icon={ClipboardList}
              title="No encounters found"
              subtitle={query || filter !== "All" ? "Try adjusting your search or filters." : "No encounters have been recorded yet."}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/50 border-b border-slate-100 hover:bg-slate-50/50">
                  <TableHead className="font-bold text-slate-500 py-4 px-6 h-auto">Date</TableHead>
                  <TableHead className="font-bold text-slate-500 py-4 h-auto">Encounter ID</TableHead>
                  <TableHead className="font-bold text-slate-500 py-4 h-auto">Patient</TableHead>
                  <TableHead className="font-bold text-slate-500 py-4 h-auto">MR No.</TableHead>
                  <TableHead className="font-bold text-slate-500 py-4 h-auto">Type</TableHead>
                  <TableHead className="font-bold text-slate-500 py-4 h-auto">Doctor</TableHead>
                  <TableHead className="font-bold text-slate-500 py-4 h-auto">Diagnosis</TableHead>
                  <TableHead className="font-bold text-slate-500 py-4 h-auto">Fee</TableHead>
                  <TableHead className="font-bold text-slate-500 py-4 px-6 h-auto">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((e) => {
                  const patient = patients.lookup.get(e.patientId)
                  const doctor = doctors.lookup.get(e.doctorId)
                  return (
                    <TableRow
                      key={e.id}
                      className="cursor-pointer transition-colors hover:bg-slate-50 border-b border-slate-50 last:border-0"
                      onClick={() => router.push(`/encounters/${e.id}`)}
                    >
                      <TableCell className="px-6 py-4 text-sm font-medium text-slate-600 whitespace-nowrap">
                        {format(new Date(e.date), "dd MMM yyyy")}
                      </TableCell>
                      <TableCell className="py-4">
                        <Link
                          href={`/encounters/${e.id}`}
                          onClick={(ev) => ev.stopPropagation()}
                          className="inline-flex items-center rounded-md bg-[#1CC0CE]/10 px-2 py-1 text-xs font-bold text-[#0891B2] ring-1 ring-inset ring-[#1CC0CE]/20 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1CC0CE]"
                        >
                          {e.encId}
                        </Link>
                      </TableCell>
                      <TableCell className="py-4 font-bold text-[#0D1B2E]">
                        {patient?.name ?? (patients.loading ? "…" : patients.failed ? "—" : "Unknown Patient")}
                      </TableCell>
                      <TableCell className="py-4">
                        <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600 whitespace-nowrap">
                          {patient?.mrNo || "—"}
                        </span>
                      </TableCell>
                      <TableCell className="py-4">
                        <StatusBadge status={e.type} />
                      </TableCell>
                      <TableCell className="py-4 text-sm font-medium text-slate-600">
                        {doctor?.name ?? (doctors.loading ? "…" : "—")}
                      </TableCell>
                      <TableCell className="py-4 text-sm font-medium text-slate-500 max-w-[200px] truncate" title={e.diagnosis}>
                        {e.diagnosis || "—"}
                      </TableCell>
                      <TableCell className="py-4 font-black text-slate-900">
                        {formatCurrency(e.netTotal)}
                      </TableCell>
                      <TableCell className="px-6 py-4">
                        <StatusBadge status={e.status} />
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {data && rows.length > 0 && data.total > DEFAULT_PAGE_SIZE && (
          <div className="border-t border-slate-100 bg-slate-50/50 p-4">
            <Pagination page={page} pageSize={DEFAULT_PAGE_SIZE} total={data.total} onPageChange={setPage} itemLabel="encounters" />
          </div>
        )}
      </div>
    </div>
  )
}

export default function EncounterListPage() {
  // useSearchParams (the filters in the address bar) needs a Suspense boundary
  if (visitsDataSource === "api") return <Suspense fallback={<div className="p-10 text-center text-sm text-slate-500">Loading encounters…</div>}><VisitsScreen /></Suspense>
  return <MockEncounterListPage />
}
