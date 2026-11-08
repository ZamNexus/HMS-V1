"use client"
import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query"
import { differenceInDays, format, parseISO } from "date-fns"
import { Eye, Pencil, Plus, Printer, Search, UserX } from "lucide-react"

import { demo } from "@hms/demo"
import { EmptyState } from "@/components/shared/EmptyState"
import { ErrorState } from "@/components/shared/ErrorState"
import { Pagination } from "@/components/shared/Pagination"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { CACHE_CLASSES } from "@/lib/query/cacheClasses"
import { scopedKey } from "@/lib/query/scope"
import { pageFromUrl, useUrlFilters } from "@/lib/query/useUrlFilters"
import { useDebouncedSearch } from "@/lib/query/useDebouncedSearch"
import { useScopedKey } from "@/lib/query/useScopedKey"
import { dataSource, formatPatientAge, formatPhone, legacyPatientId, patientsService, type PatientListOptions, type PatientRecord } from "@/lib/services"
import { formatMoney } from "@/lib/session/hospital"
import { useHospital } from "@/lib/session/useHospital"
import { useAccess } from "@/lib/session/useAccess"
import { usePatientToday } from "@/lib/usePatientToday"
import { useOrganisations } from "@/lib/useReferenceData"
import { cn } from "@/lib/utils"

const PAGE_SIZE = 10
// "archived" is the API's includeArchived (live and archived together; the API has no archived-only filter). The demo keeps its "Inactive" status tab.
const VIEWS = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "ipd", label: "IPD" },
  { id: "archived", label: dataSource === "mock" ? "Inactive" : "With archived" },
] as const
type ViewId = (typeof VIEWS)[number]["id"]
// The only things kept in the address bar: never a name, phone or CNIC (handoff 7). The search box is not one of them.
const URL_KEYS = ["page", "view", "gender", "panel", "from", "to"] as const
const SELF_PAY = "self"
const GENDERS = ["Male", "Female", "Other"] as const
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function viewOptions(view: ViewId): Pick<PatientListOptions, "status" | "includeArchived"> {
  if (view === "active") return { status: "active" }
  if (view === "ipd") return { status: "ipd" }
  if (view === "archived") return dataSource === "mock" ? { status: "inactive" } : { includeArchived: true }
  return {}
}

// "Last Visit" in the demo still comes from the (mock) encounters data, keyed by the legacy numeric id.
function demoLastVisit(patientId: number | null): string {
  if (patientId === null) return "—"
  const visits = demo.data.ENCOUNTERS.filter((e) => e.patientId === patientId)
  if (visits.length === 0) return "—"
  const latest = visits.reduce((a, b) => (new Date(a.date) > new Date(b.date) ? a : b))
  const days = differenceInDays(new Date(), new Date(latest.date))
  return days <= 0 ? "Today" : days === 1 ? "1 day ago" : `${days} days ago`
}

function lastVisitText(p: PatientRecord): string {
  if (dataSource === "mock") return demoLastVisit(legacyPatientId(p))
  return p.lastVisitDate ? format(parseISO(p.lastVisitDate), "dd MMM yyyy") : "—"
}

export default function PatientListPage() {
  // useSearchParams needs a Suspense boundary
  return (
    <React.Suspense fallback={<div className="p-10 text-center text-sm text-slate-500">Loading patients…</div>}>
      <PatientList />
    </React.Suspense>
  )
}

function PatientList() {
  const router = useRouter()
  const qc = useQueryClient()
  const { can } = useAccess()
  const { settings } = useHospital()
  const today = usePatientToday()
  const url = useUrlFilters(URL_KEYS)
  const search = useDebouncedSearch()
  const organisations = useOrganisations()

  const page = pageFromUrl(url.get("page"))
  const view: ViewId = VIEWS.some((v) => v.id === url.get("view")) ? (url.get("view") as ViewId) : "all"
  const gender = GENDERS.find((g) => g === url.get("gender"))
  const panel = url.get("panel")
  const from = DATE_RE.test(url.get("from") ?? "") ? url.get("from") : undefined
  const to = DATE_RE.test(url.get("to") ?? "") ? url.get("to") : undefined
  const canWrite = can("patients.write")
  const showBalance = dataSource !== "mock" && can("billing.read")

  const options: PatientListOptions = {
    search: search.term, page, pageSize: PAGE_SIZE, gender, registeredFrom: from, registeredTo: to,
    panelId: panel && panel !== SELF_PAY ? panel : undefined, selfPay: panel === SELF_PAY ? true : undefined,
    ...viewOptions(view),
  }
  const key = useScopedKey("patient", "list", { ...options, search: search.term ?? null })
  const list = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => patientsService.list({ ...options, signal }),
    staleTime: CACHE_CLASSES.register.staleTime, // a list others add to: always revalidated, kept on screen while the next page loads
    placeholderData: keepPreviousData,
  })
  const items = list.data?.items ?? []
  const filtered = !!search.term || view !== "all" || !!gender || !!panel || !!from || !!to

  // A new search or filter starts again at page 1
  const setFilter = (patch: Partial<Record<(typeof URL_KEYS)[number], string | undefined>>) => url.set({ ...patch, page: undefined })
  const prefetch = (id: string) => {
    if (dataSource === "mock") return
    void qc.prefetchQuery({ queryKey: scopedKey("patient", id), queryFn: ({ signal }) => patientsService.get(id, signal), staleTime: CACHE_CLASSES.record.staleTime })
  }

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-[#0D1B2E] tracking-tight">Patients</h1>
          <p className="mt-1 text-sm font-medium text-slate-500" data-testid="patients-count">
            {list.isError && !list.data ? "Patients unavailable" : list.data ? `${list.data.total} ${filtered ? "matching" : "registered"} patients` : "Loading patients…"}
          </p>
        </div>
        {canWrite && (
          <Button className="rounded-xl h-11 px-6 bg-[#0F2A4D] hover:bg-[#16375F] text-white font-bold shadow-lg shadow-[#0F2A4D]/20 border-0" asChild>
            <Link href="/patients/new"><Plus className="h-5 w-5 mr-2" /> Register Patient</Link>
          </Button>
        )}
      </div>

      <div className="rounded-[1.25rem] bg-white p-3 shadow-sm ring-1 ring-black/5 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative w-full max-w-md">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              aria-label="Search patients"
              placeholder="Search by name, MR No., phone or CNIC..."
              value={search.input}
              maxLength={100}
              autoComplete="off"
              onChange={(e) => { search.onChange(e.target.value); url.set({ page: undefined }) }}
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-4 text-sm font-medium text-slate-900 placeholder:text-slate-400 outline-none transition-all focus:border-[#1CC0CE] focus:bg-white focus:ring-2 focus:ring-[#1CC0CE]/20"
            />
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
            <div className="flex h-11 items-center gap-1 rounded-xl bg-slate-100/80 p-1" role="tablist" aria-label="Patient view">
              {VIEWS.map((v) => (
                <button
                  key={v.id}
                  role="tab"
                  aria-selected={view === v.id}
                  onClick={() => setFilter({ view: v.id === "all" ? undefined : v.id })}
                  className={cn(
                    "whitespace-nowrap rounded-lg px-4 py-2 text-xs font-bold transition-all duration-200",
                    view === v.id ? "bg-white text-[#0891B2] shadow-sm ring-1 ring-black/5" : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
                  )}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Select value={gender ?? "any"} onValueChange={(v) => setFilter({ gender: v === "any" ? undefined : v })}>
            <SelectTrigger aria-label="Gender" className="h-10 w-36 rounded-xl bg-slate-50 border-slate-200"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any gender</SelectItem>
              {GENDERS.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={panel ?? "any"} onValueChange={(v) => setFilter({ panel: v === "any" ? undefined : v })}>
            <SelectTrigger aria-label="Organisation" className="h-10 w-52 rounded-xl bg-slate-50 border-slate-200"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any organisation</SelectItem>
              <SelectItem value={SELF_PAY}>Self-pay only</SelectItem>
              {organisations.items.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {dataSource !== "mock" && (
            <>
              <label className="flex flex-col text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Registered from
                <Input type="date" aria-label="Registered from" className="mt-1 h-10 w-40 rounded-xl bg-slate-50 border-slate-200" value={from ?? ""} max={to ?? today ?? undefined} onChange={(e) => setFilter({ from: e.target.value || undefined })} />
              </label>
              <label className="flex flex-col text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Registered to
                <Input type="date" aria-label="Registered to" className="mt-1 h-10 w-40 rounded-xl bg-slate-50 border-slate-200" value={to ?? ""} min={from} max={today ?? undefined} onChange={(e) => setFilter({ to: e.target.value || undefined })} />
              </label>
            </>
          )}
          {filtered && (
            <Button variant="ghost" className="h-10 rounded-xl font-bold text-slate-500" onClick={() => { search.onChange(""); url.set({ view: undefined, gender: undefined, panel: undefined, from: undefined, to: undefined, page: undefined }) }}>
              Clear filters
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-[1.5rem] border-none bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-black/5 overflow-hidden">
        {list.isError && !list.data ? (
          <div className="p-6"><ErrorState error={list.error} onRetry={() => void list.refetch()} /></div>
        ) : list.isPending ? (
          <div className="space-y-3 p-6" role="status" aria-label="Loading patients">
            {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
          </div>
        ) : items.length === 0 ? (
          <div className="p-10">
            <EmptyState icon={UserX} title="No patients found" subtitle={filtered ? "Try adjusting your search or filters." : "No patients have been registered yet."} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/50 border-b border-slate-100 hover:bg-slate-50/50">
                  <TableHead className="font-bold text-slate-500 py-4 px-6 h-auto">MR No.</TableHead>
                  <TableHead className="font-bold text-slate-500 py-4 h-auto">Patient Name</TableHead>
                  <TableHead className="font-bold text-slate-500 py-4 h-auto">Father/Husband</TableHead>
                  <TableHead className="font-bold text-slate-500 py-4 h-auto whitespace-nowrap">Age · Gender</TableHead>
                  <TableHead className="font-bold text-slate-500 py-4 h-auto">Phone</TableHead>
                  {dataSource !== "mock" && <TableHead className="font-bold text-slate-500 py-4 h-auto">Organisation</TableHead>}
                  <TableHead className="font-bold text-slate-500 py-4 h-auto whitespace-nowrap">Last Visit</TableHead>
                  {showBalance && <TableHead className="font-bold text-slate-500 py-4 h-auto text-right">Balance</TableHead>}
                  <TableHead className="font-bold text-slate-500 py-4 h-auto">Status</TableHead>
                  <TableHead className="font-bold text-slate-500 py-4 px-6 text-right h-auto">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((p) => (
                  <TableRow
                    key={p.id}
                    data-testid={`patient-row-${p.id}`}
                    className={cn("cursor-pointer transition-colors hover:bg-slate-50 border-b border-slate-50 last:border-0", p.archived && "opacity-70")}
                    onMouseEnter={() => prefetch(p.id)}
                    onClick={() => router.push(`/patients/${p.id}`)}
                  >
                    <TableCell className="px-6 py-4">
                      <span className="inline-flex items-center rounded-md bg-[#1CC0CE]/10 px-2 py-1 text-xs font-bold text-[#0891B2] ring-1 ring-inset ring-[#1CC0CE]/20 whitespace-nowrap">{p.mrNo}</span>
                    </TableCell>
                    <TableCell className="py-4">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[#0D1B2E]">{p.name}</span>
                        {p.deceasedOn && <StatusBadge status="Deceased" />}
                      </div>
                    </TableCell>
                    <TableCell className="py-4 text-sm font-medium text-slate-500">{p.fatherName}</TableCell>
                    <TableCell className="py-4">
                      <div className="flex items-center gap-1.5 text-sm font-medium text-slate-600 whitespace-nowrap">
                        <span>{today === null ? "—" : formatPatientAge(p, today)}</span>
                        <span className="text-slate-300">•</span>
                        <span>{p.gender.charAt(0)}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-4 text-sm font-medium text-slate-600 whitespace-nowrap">{formatPhone(p.phone)}</TableCell>
                    {dataSource !== "mock" && <TableCell className="py-4 text-sm font-medium text-slate-600">{p.primaryPanelName ?? "Self-pay"}</TableCell>}
                    <TableCell className="py-4 text-sm font-medium text-slate-500 whitespace-nowrap">{lastVisitText(p)}</TableCell>
                    {showBalance && (
                      <TableCell className={cn("py-4 text-right text-sm font-bold whitespace-nowrap", p.balance && Number(p.balance) > 0 ? "text-danger-600" : "text-slate-600")} data-testid={`patient-balance-${p.id}`}>
                        {p.balance === null || p.balance === undefined || !settings ? "—" : formatMoney(p.balance, settings.currencyCode)}
                      </TableCell>
                    )}
                    <TableCell className="py-4"><StatusBadge status={p.status === "ipd" ? "IPD Admitted" : p.status} /></TableCell>
                    <TableCell className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" className="h-9 w-9 p-0 rounded-lg text-slate-400 hover:text-[#1CC0CE] hover:bg-[#1CC0CE]/10 transition-colors" title="View Profile" aria-label={`View ${p.name}`} asChild>
                          <Link href={`/patients/${p.id}`}><Eye className="h-4 w-4" /></Link>
                        </Button>
                        {canWrite && (
                          <Button variant="ghost" className="h-9 w-9 p-0 rounded-lg text-slate-400 hover:text-amber-500 hover:bg-amber-500/10 transition-colors" title="Edit Patient" aria-label={`Edit ${p.name}`} asChild>
                            <Link href={`/patients/${p.id}/edit`}><Pencil className="h-4 w-4" /></Link>
                          </Button>
                        )}
                        <Button variant="ghost" className="h-9 w-9 p-0 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors" title="Print Record" aria-label={`Print ${p.name}`} onClick={() => window.print()}>
                          <Printer className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {list.data && (items.length > 0 || page > 1) && (
          <div className="border-t border-slate-100 bg-slate-50/50 p-4">
            <Pagination page={page} pageSize={PAGE_SIZE} total={list.data.total} onPageChange={(n) => url.set({ page: n === 1 ? undefined : String(n) })} itemLabel="patients" />
          </div>
        )}
      </div>
    </div>
  )
}
