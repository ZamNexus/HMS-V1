import * as React from "react"
import { Link, useNavigate } from "react-router-dom"
import { format, isToday, isThisWeek } from "date-fns"
import { ClipboardList, Plus, Search } from "lucide-react"

import { ENCOUNTERS } from "@/data/encounters"
import { PATIENTS } from "@/data/patients"
import { DOCTORS } from "@/data/doctors"
import { cn, formatCurrency } from "@/lib/utils"
import { EmptyState } from "@/components/shared/EmptyState"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

const FILTERS = ["All", "OPD", "IPD", "Today", "This Week"] as const

export function EncounterListPage() {
  const navigate = useNavigate()
  const [search, setSearch] = React.useState("")
  const [filter, setFilter] = React.useState<(typeof FILTERS)[number]>("All")

  const rows = React.useMemo(() => {
    let list = [...ENCOUNTERS].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    if (filter === "OPD") list = list.filter((e) => e.type === "OPD")
    if (filter === "IPD") list = list.filter((e) => e.type === "IPD")
    if (filter === "Today") list = list.filter((e) => isToday(new Date(e.date)))
    if (filter === "This Week") list = list.filter((e) => isThisWeek(new Date(e.date)))
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter((e) => {
        const patient = PATIENTS.find((p) => p.id === e.patientId)
        return patient?.name.toLowerCase().includes(q) || e.encId.toLowerCase().includes(q) || patient?.mrNo.toLowerCase().includes(q)
      })
    }
    return list
  }, [search, filter])

  return (
    <div className="space-y-6 pb-10 max-w-7xl mx-auto">
      {/* ─── PREMIUM PAGE HEADER ─────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-[#0D1B2E] tracking-tight">Encounters</h1>
          <p className="mt-1 text-sm font-medium text-slate-500">
            {ENCOUNTERS.length} total recorded patient encounters
          </p>
        </div>
        <Button className="rounded-xl h-11 px-6 bg-[#0F2A4D] hover:bg-[#16375F] text-white font-bold shadow-lg shadow-[#0F2A4D]/20 border-0" asChild>
          <Link to="/encounters/new">
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
            {FILTERS.map((f) => {
              const isActive = filter === f
              return (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
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
        {rows.length === 0 ? (
          <div className="p-10">
            <EmptyState icon={ClipboardList} title="No encounters found" subtitle="Try adjusting your search or filters." />
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
                  const patient = PATIENTS.find((p) => p.id === e.patientId)
                  const doctor = DOCTORS.find((d) => d.userId === e.doctorId)
                  return (
                    <TableRow 
                      key={e.id} 
                      className="cursor-pointer transition-colors hover:bg-slate-50 border-b border-slate-50 last:border-0" 
                      onClick={() => navigate(`/encounters/${e.id}`)}
                    >
                      <TableCell className="px-6 py-4 text-sm font-medium text-slate-600 whitespace-nowrap">
                        {format(new Date(e.date), "dd MMM yyyy")}
                      </TableCell>
                      <TableCell className="py-4">
                        <span className="inline-flex items-center rounded-md bg-[#1CC0CE]/10 px-2 py-1 text-xs font-bold text-[#0891B2] ring-1 ring-inset ring-[#1CC0CE]/20 whitespace-nowrap">
                          {e.encId}
                        </span>
                      </TableCell>
                      <TableCell className="py-4 font-bold text-[#0D1B2E]">
                        {patient?.name || "Unknown Patient"}
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
                        {doctor?.name || "—"}
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
      </div>
    </div>
  )
}
