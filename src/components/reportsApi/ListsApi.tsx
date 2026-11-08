"use client"
import * as React from "react"
import Link from "next/link"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { ClipboardList, Search } from "lucide-react"

import { showMoney } from "@/components/billing/billingUi"
import { EmptyState } from "@/components/shared/EmptyState"
import { ErrorState } from "@/components/shared/ErrorState"
import { Pagination } from "@/components/shared/Pagination"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { CACHE_CLASSES } from "@/lib/query/cacheClasses"
import { useDebouncedSearch } from "@/lib/query/useDebouncedSearch"
import { useScopedKey } from "@/lib/query/useScopedKey"
import { doctorsService, expenseCategoriesService, labTestsService, organisationsService, patientsService, serviceCatalogService, visitsService, type ListResult } from "@/lib/services"
import { useAccess } from "@/lib/session/useAccess"
import { cn } from "@/lib/utils"
import { LIST_KEYS, LIST_LABEL, LIST_PERMISSIONS, type ListKey } from "./listsUi"

const PAGE_SIZE = 10

interface Column<T> { head: string; cell: (row: T) => React.ReactNode; className?: string }
interface Fetch { search?: string; page: number; pageSize: number; signal: AbortSignal }

/**
 * One list of the Lists report (D7): an ordinary list endpoint, server-paged (10), with the server's search (debounced, never in the address bar). The prototype loaded every row
 * of seven lists at once; a real database cannot be read that way. A list the user may not read says so and sends nothing.
 */
function PagedList<T extends { id: string }>({ id, noun, fetch, columns }: { id: ListKey; noun: string; fetch: (o: Fetch) => Promise<ListResult<T>>; columns: Column<T>[] }) {
  const { can } = useAccess()
  const allowed = LIST_PERMISSIONS[id].some((p) => can(p))
  const [page, setPage] = React.useState(1)
  const search = useDebouncedSearch()
  const key = useScopedKey("reports", "list", id, { page, search: search.term ?? null })
  const q = useQuery({ queryKey: key, queryFn: ({ signal }) => fetch({ search: search.term, page, pageSize: PAGE_SIZE, signal }), ...CACHE_CLASSES.register, placeholderData: keepPreviousData, enabled: allowed })
  if (!allowed) return <EmptyState icon={ClipboardList} title={`${LIST_LABEL[id]} is not shown to your role`} subtitle="Ask an administrator if you need it." />
  const items = q.data?.items ?? []
  return (
    <div className="space-y-3" data-testid={`list-${id}`}>
      <div className="no-print relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input type="text" aria-label={`Search ${noun}`} placeholder={`Search ${noun}…`} value={search.input} maxLength={100} autoComplete="off"
          onChange={(e) => { search.onChange(e.target.value); setPage(1) }}
          className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none focus:border-[#1CC0CE] focus:bg-white" />
      </div>
      {q.isError && !q.data ? <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        : q.isPending ? <div className="space-y-3" role="status" aria-label={`Loading the ${noun}`}>{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}</div>
        : items.length === 0 ? <EmptyState icon={ClipboardList} title={`No ${noun}`} subtitle={search.term ? "Try a different search." : undefined} />
        : (
          <>
            <div className="overflow-x-auto rounded-2xl ring-1 ring-black/5"><Table>
              <TableHeader><TableRow className="bg-slate-50/60 hover:bg-slate-50/60">{columns.map((c, i) => <TableHead key={c.head} className={cn(i === 0 && "px-4", c.className)}>{c.head}</TableHead>)}</TableRow></TableHeader>
              <TableBody>{items.map((row) => (
                <TableRow key={row.id} data-testid={`${id}-row-${row.id}`}>{columns.map((c, i) => <TableCell key={c.head} className={cn(i === 0 && "px-4", c.className)}>{c.cell(row)}</TableCell>)}</TableRow>
              ))}</TableBody>
            </Table></div>
            <Pagination page={page} pageSize={PAGE_SIZE} total={q.data?.total ?? 0} onPageChange={setPage} itemLabel={noun} />
          </>
        )}
    </div>
  )
}

const active = (a: boolean | undefined) => <StatusBadge status={a === false ? "Inactive" : "Active"} />

function PatientList() {
  return <PagedList id="patients" noun="patients" fetch={(o) => patientsService.list(o)} columns={[
    { head: "MR No.", cell: (p) => <span className="font-mono text-xs font-bold text-[#0891B2]">{p.mrNo}</span> },
    { head: "Patient", cell: (p) => <Link href={`/patients/${p.id}`} className="font-semibold hover:text-[#0891B2] hover:underline">{p.name}</Link> },
    { head: "Gender", cell: (p) => p.gender },
    { head: "Phone", cell: (p) => p.phone || "—" },
    { head: "City", cell: (p) => p.city || "—" },
    { head: "Registered", cell: (p) => <span className="tabular-nums">{p.registrationDate}</span> },
  ]} />
}
function DoctorList() {
  return <PagedList id="doctors" noun="doctors" fetch={(o) => doctorsService.list(o)} columns={[
    { head: "Doctor", cell: (d) => <span className="font-semibold">{d.name}</span> },
    { head: "Specialization", cell: (d) => d.specialization || "—" },
    { head: "PMC No.", cell: (d) => d.pmcRegNo || "—" },
    { head: "Phone", cell: (d) => d.phone || "—" },
    { head: "Fee", cell: (d) => <span className="tabular-nums">{d.feeText ? showMoney(d.feeText) : "—"}</span> },
    { head: "Available days", cell: (d) => (d.availableDays.length ? `${d.availableDays.join(", ")}${d.hoursFrom ? ` · ${d.hoursFrom}–${d.hoursTo}` : ""}` : "—") },
    { head: "Status", cell: (d) => active(d.active) },
  ]} />
}
function ServiceList() {
  return <PagedList id="services" noun="services" fetch={(o) => serviceCatalogService.list(o)} columns={[
    { head: "Code", cell: (s) => <span className="font-mono text-xs font-bold">{s.code}</span> },
    { head: "Service", cell: (s) => <span className="font-semibold">{s.name}</span> },
    { head: "Category", cell: (s) => s.category || "—" },
    { head: "Rate", cell: (s) => <span className="tabular-nums">{s.rateText ? showMoney(s.rateText) : "—"}</span>, className: "text-right" },
    { head: "Status", cell: (s) => active(s.active) },
  ]} />
}
function PanelList() {
  return <PagedList id="panels" noun="organizations" fetch={(o) => organisationsService.list(o)} columns={[
    { head: "Organization", cell: (o) => <span className="font-semibold">{o.name}</span> },
    { head: "Type", cell: (o) => o.type },
    { head: "Contact", cell: (o) => o.contactPerson || "—" },
    { head: "Phone", cell: (o) => o.phone || "—" },
    { head: "Billing", cell: (o) => (o.billingMode === "panel_billed" ? "Billed to the panel" : "Patient pays") },
    { head: "Status", cell: (o) => active(o.active) },
  ]} />
}
function ExpenseHeadList() {
  return <PagedList id="expense-heads" noun="expense heads" fetch={(o) => expenseCategoriesService.list(o)} columns={[
    { head: "Expense head", cell: (c) => <span className="font-semibold">{c.name}</span> },
    { head: "Status", cell: (c) => active(c.active) },
  ]} />
}
function LabTestList() {
  return <PagedList id="lab-tests" noun="lab tests" fetch={(o) => labTestsService.list(o)} columns={[
    { head: "Code", cell: (t) => <span className="font-mono text-xs font-bold">{t.code}</span> },
    { head: "Test", cell: (t) => <span className="font-semibold">{t.name}</span> },
    { head: "Category", cell: (t) => t.category },
    { head: "Specimen", cell: (t) => t.specimenType || "—" },
    { head: "Rate", cell: (t) => <span className="tabular-nums">{t.rateText ? showMoney(t.rateText) : "—"}</span>, className: "text-right" },
    { head: "Status", cell: (t) => active(t.active) },
  ]} />
}
/** Admitted patients are the open in-patient visits (handoff 8.11: GET /encounters?type=ipd&status=open). */
function AdmittedList() {
  return <PagedList id="admitted" noun="admitted patients" fetch={(o) => visitsService.list({ ...o, type: "ipd", status: "open" })} columns={[
    { head: "Visit", cell: (v) => <span className="font-mono text-xs font-bold text-[#0891B2]">{v.encId}</span> },
    { head: "Patient", cell: (v) => <Link href={`/patients/${v.patient.id}`} className="font-semibold hover:text-[#0891B2] hover:underline">{v.patient.name}</Link> },
    { head: "Doctor", cell: (v) => v.doctor.name },
    { head: "Ward / bed", cell: (v) => (v.bed ? `${v.bed.wardName} · ${v.bed.bedNo}` : "Not assigned") },
    { head: "Admitted", cell: (v) => <span className="tabular-nums">{v.date}</span> },
  ]} />
}

export function ListsApi({ list, onList }: { list: ListKey; onList: (l: ListKey) => void }) {
  const { can } = useAccess()
  const shown = LIST_KEYS.filter((k) => LIST_PERMISSIONS[k].some((p) => can(p)))
  const current = shown.includes(list) ? list : shown[0]
  if (!current) return <EmptyState icon={ClipboardList} title="No list is shown to your role" subtitle="Ask an administrator if you need one." />
  return (
    <div data-testid="lists-report">
      <div className="no-print mb-4 flex flex-wrap gap-1 rounded-md bg-muted p-1" role="group" aria-label="List">
        {shown.map((k) => (
          <button key={k} type="button" aria-pressed={current === k} onClick={() => onList(k)}
            className={cn("shrink-0 rounded-sm px-3 py-1.5 text-xs font-medium transition-colors", current === k ? "bg-background text-secondary shadow-sm" : "text-muted-foreground")}>{LIST_LABEL[k]}</button>
        ))}
      </div>
      <p className="mb-3 hidden text-sm font-semibold print:block">{LIST_LABEL[current]}</p>
      {current === "patients" && <PatientList />}
      {current === "doctors" && <DoctorList />}
      {current === "services" && <ServiceList />}
      {current === "panels" && <PanelList />}
      {current === "expense-heads" && <ExpenseHeadList />}
      {current === "lab-tests" && <LabTestList />}
      {current === "admitted" && <AdmittedList />}
    </div>
  )
}
