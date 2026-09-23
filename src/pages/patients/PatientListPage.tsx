import * as React from "react"
import { Link, useNavigate } from "react-router-dom"
import { differenceInDays } from "date-fns"
import { Eye, Pencil, Printer, Plus, UserX, Search } from "lucide-react"

import { PATIENTS } from "@/data/patients"
import { ENCOUNTERS } from "@/data/encounters"
import { cn } from "@/lib/utils"
import { EmptyState } from "@/components/shared/EmptyState"
import { Pagination } from "@/components/shared/Pagination"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

const PAGE_SIZE = 10
const FILTERS = ["All", "Active", "IPD", "Inactive"] as const

function lastVisit(patientId: number): string {
  const visits = ENCOUNTERS.filter((e) => e.patientId === patientId)
  if (visits.length === 0) return "—"
  const latest = visits.reduce((a, b) => (new Date(a.date) > new Date(b.date) ? a : b))
  const days = differenceInDays(new Date(), new Date(latest.date))
  if (days <= 0) return "Today"
  if (days === 1) return "1 day ago"
  return `${days} days ago`
}

export function PatientListPage() {
  const navigate = useNavigate()
  const [search, setSearch] = React.useState("")
  const [filter, setFilter] = React.useState<(typeof FILTERS)[number]>("All")
  const [page, setPage] = React.useState(1)

  const filtered = React.useMemo(() => {
    let list = PATIENTS
    if (filter === "Active") list = list.filter((p) => p.status === "active")
    if (filter === "IPD") list = list.filter((p) => p.status === "ipd")
    if (filter === "Inactive") list = list.filter((p) => p.status === "inactive")
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (p) => p.name.toLowerCase().includes(q) || p.mrNo.toLowerCase().includes(q) || p.phone.includes(q)
      )
    }
    return list
  }, [search, filter])

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  React.useEffect(() => setPage(1), [search, filter])

  return (
    <div className="space-y-6 pb-10">
      {/* ─── PREMIUM PAGE HEADER ─────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-[#0D1B2E] tracking-tight">Patients</h1>
          <p className="mt-1 text-sm font-medium text-slate-500">
            {PATIENTS.length} registered patients
          </p>
        </div>
        <Button className="rounded-xl h-11 px-6 bg-[#0F2A4D] hover:bg-[#16375F] text-white font-bold shadow-lg shadow-[#0F2A4D]/20 border-0" asChild>
          <Link to="/patients/new">
            <Plus className="h-5 w-5 mr-2" /> Register Patient
          </Link>
        </Button>
      </div>

      {/* ─── SEARCH & FILTERS BAR ────────────────────────────────────── */}
      <div className="rounded-[1.25rem] bg-white p-3 shadow-sm ring-1 ring-black/5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name, MR No. or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-4 text-sm font-medium text-slate-900 placeholder:text-slate-400 outline-none transition-all focus:border-[#1CC0CE] focus:bg-white focus:ring-2 focus:ring-[#1CC0CE]/20"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          <div className="flex h-11 items-center gap-1 rounded-xl bg-slate-100/80 p-1">
            {FILTERS.map((f) => {
              const isActive = filter === f
              return (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    "rounded-lg px-4 py-2 text-xs font-bold transition-all duration-200",
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
        {paged.length === 0 ? (
          <div className="p-10">
            <EmptyState icon={UserX} title="No patients found" subtitle="Try adjusting your search or filters." />
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
                  <TableHead className="font-bold text-slate-500 py-4 h-auto whitespace-nowrap">Last Visit</TableHead>
                  <TableHead className="font-bold text-slate-500 py-4 h-auto">Status</TableHead>
                  <TableHead className="font-bold text-slate-500 py-4 px-6 text-right h-auto">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.map((p) => (
                  <TableRow 
                    key={p.id} 
                    className="cursor-pointer transition-colors hover:bg-slate-50 border-b border-slate-50 last:border-0" 
                    onClick={() => navigate(`/patients/${p.id}`)}
                  >
                    <TableCell className="px-6 py-4">
                      <span className="inline-flex items-center rounded-md bg-[#1CC0CE]/10 px-2 py-1 text-xs font-bold text-[#0891B2] ring-1 ring-inset ring-[#1CC0CE]/20 whitespace-nowrap">
                        {p.mrNo}
                      </span>
                    </TableCell>
                    <TableCell className="py-4">
                      <div className="font-bold text-[#0D1B2E]">{p.name}</div>
                    </TableCell>
                    <TableCell className="py-4 text-sm font-medium text-slate-500">{p.fatherName}</TableCell>
                    <TableCell className="py-4">
                      <div className="flex items-center gap-1.5 text-sm font-medium text-slate-600 whitespace-nowrap">
                        <span>{p.age}</span>
                        <span className="text-slate-300">•</span>
                        <span>{p.gender.charAt(0)}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-4 text-sm font-medium text-slate-600 whitespace-nowrap">{p.phone}</TableCell>
                    <TableCell className="py-4 text-sm font-medium text-slate-500 whitespace-nowrap">{lastVisit(p.id)}</TableCell>
                    <TableCell className="py-4">
                      <StatusBadge status={p.status === "ipd" ? "IPD Admitted" : p.status} />
                    </TableCell>
                    <TableCell className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-2">
                        <Button 
                          variant="ghost" 
                          className="h-9 w-9 p-0 rounded-lg text-slate-400 hover:text-[#1CC0CE] hover:bg-[#1CC0CE]/10 transition-colors" 
                          title="View Profile"
                          asChild
                        >
                          <Link to={`/patients/${p.id}`}><Eye className="h-4 w-4" /></Link>
                        </Button>
                        <Button 
                          variant="ghost" 
                          className="h-9 w-9 p-0 rounded-lg text-slate-400 hover:text-amber-500 hover:bg-amber-500/10 transition-colors" 
                          title="Edit Patient"
                          asChild
                        >
                          <Link to={`/patients/${p.id}/edit`}><Pencil className="h-4 w-4" /></Link>
                        </Button>
                        <Button 
                          variant="ghost" 
                          className="h-9 w-9 p-0 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors" 
                          title="Print Record"
                          onClick={() => window.print()}
                        >
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
        
        {/* Pagination Section */}
        {paged.length > 0 && (
          <div className="border-t border-slate-100 bg-slate-50/50 p-4">
            <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={setPage} itemLabel="patients" />
          </div>
        )}
      </div>
    </div>
  )
}
