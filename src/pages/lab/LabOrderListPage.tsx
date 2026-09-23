import * as React from "react"
import { Link, useNavigate } from "react-router-dom"
import { format } from "date-fns"
import { FlaskConical, Plus, Search, AlertCircle, FileText, FileEdit } from "lucide-react"

import { LAB_ORDERS } from "@/data/lab"
import { PATIENTS } from "@/data/patients"
import type { LabOrderStatus } from "@/types"
import { cn } from "@/lib/utils"
import { EmptyState } from "@/components/shared/EmptyState"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

const FILTERS = ["All", "Pending", "Collected", "In Progress", "Completed", "Delivered"] as const

export function LabOrderListPage() {
  const navigate = useNavigate()
  const [search, setSearch] = React.useState("")
  const [filter, setFilter] = React.useState<(typeof FILTERS)[number]>("All")

  const pendingCount = LAB_ORDERS.filter((o) => o.status === "Pending").length

  const rows = React.useMemo(() => {
    let list = [...LAB_ORDERS].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    if (filter !== "All") list = list.filter((o) => o.status === (filter as LabOrderStatus))
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter((o) => {
        const patient = PATIENTS.find((p) => p.id === o.patientId)
        return patient?.name.toLowerCase().includes(q) || o.labNo.toLowerCase().includes(q) || patient?.mrNo.toLowerCase().includes(q)
      })
    }
    return list
  }, [search, filter])

  return (
    <div className="space-y-6 pb-10 max-w-7xl mx-auto">
      {/* ─── PREMIUM PAGE HEADER ─────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-black text-[#0D1B2E] tracking-tight">Laboratory</h1>
            {pendingCount > 0 && (
              <span className="flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700 ring-1 ring-inset ring-amber-500/20">
                <AlertCircle className="h-3 w-3" />
                {pendingCount} Pending
              </span>
            )}
          </div>
          <p className="mt-1 text-sm font-medium text-slate-500">
            {LAB_ORDERS.length} total laboratory orders
          </p>
        </div>
        <Button className="rounded-xl h-11 px-6 bg-[#0F2A4D] hover:bg-[#16375F] text-white font-bold shadow-lg shadow-[#0F2A4D]/20 border-0" asChild>
          <Link to="/lab/orders/new">
            <Plus className="h-5 w-5 mr-2" /> New Lab Order
          </Link>
        </Button>
      </div>

      {/* ─── SEARCH & FILTERS BAR ────────────────────────────────────── */}
      <div className="rounded-[1.25rem] bg-white p-3 shadow-sm ring-1 ring-black/5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by patient, order ID or MR No..."
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
            <EmptyState icon={FlaskConical} title="No lab orders found" subtitle="Try adjusting your search or filters." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/50 border-b border-slate-100 hover:bg-slate-50/50">
                  <TableHead className="font-bold text-slate-500 py-4 px-6 h-auto">Order No.</TableHead>
                  <TableHead className="font-bold text-slate-500 py-4 h-auto">Date &amp; Time</TableHead>
                  <TableHead className="font-bold text-slate-500 py-4 h-auto">Patient</TableHead>
                  <TableHead className="font-bold text-slate-500 py-4 h-auto">MR No.</TableHead>
                  <TableHead className="font-bold text-slate-500 py-4 h-auto">Tests</TableHead>
                  <TableHead className="font-bold text-slate-500 py-4 h-auto">Priority</TableHead>
                  <TableHead className="font-bold text-slate-500 py-4 h-auto">Status</TableHead>
                  <TableHead className="font-bold text-slate-500 py-4 px-6 text-right h-auto">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((o) => {
                  const patient = PATIENTS.find((p) => p.id === o.patientId)
                  const testsLabel = o.tests.length > 2
                    ? `${o.tests.slice(0, 2).map((t) => t.testName).join(", ")} +${o.tests.length - 2} more`
                    : o.tests.map((t) => t.testName).join(", ")
                  return (
                    <TableRow 
                      key={o.id} 
                      className="cursor-pointer transition-colors hover:bg-slate-50 border-b border-slate-50 last:border-0" 
                      onClick={() => navigate(`/lab/orders/${o.id}`)}
                    >
                      <TableCell className="px-6 py-4">
                        <span className="inline-flex items-center rounded-md bg-[#1CC0CE]/10 px-2 py-1 text-xs font-bold text-[#0891B2] ring-1 ring-inset ring-[#1CC0CE]/20 whitespace-nowrap">
                          {o.labNo}
                        </span>
                      </TableCell>
                      <TableCell className="py-4 text-sm font-medium text-slate-600 whitespace-nowrap">
                        {format(new Date(o.date), "dd MMM yyyy, HH:mm")}
                      </TableCell>
                      <TableCell className="py-4 font-bold text-[#0D1B2E]">
                        {patient?.name || "Unknown Patient"}
                      </TableCell>
                      <TableCell className="py-4">
                        <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600 whitespace-nowrap">
                          {patient?.mrNo || "—"}
                        </span>
                      </TableCell>
                      <TableCell className="py-4 text-sm font-medium text-slate-600 max-w-[220px] truncate">
                        {testsLabel}
                      </TableCell>
                      <TableCell className="py-4">
                        {o.priority === "Urgent" && <StatusBadge status="Urgent" />}
                      </TableCell>
                      <TableCell className="py-4">
                        <StatusBadge status={o.status} />
                      </TableCell>
                      <TableCell className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-2">
                          {(o.status === "Collected" || o.status === "In Progress") && (
                            <Button 
                              variant="ghost" 
                              className="h-9 px-3 rounded-lg text-[#0891B2] bg-[#1CC0CE]/10 hover:bg-[#1CC0CE]/20 hover:text-[#0891B2] transition-colors text-xs font-bold" 
                              asChild
                            >
                              <Link to={`/lab/orders/${o.id}/results`}><FileEdit className="h-3.5 w-3.5 mr-1.5" /> Enter Results</Link>
                            </Button>
                          )}
                          {(o.status === "Completed" || o.status === "Delivered") && (
                            <Button 
                              variant="ghost" 
                              className="h-9 px-3 rounded-lg text-slate-600 bg-slate-100 hover:bg-slate-200 hover:text-slate-900 transition-colors text-xs font-bold" 
                              onClick={() => window.print()}
                            >
                              <FileText className="h-3.5 w-3.5 mr-1.5" /> Print Report
                            </Button>
                          )}
                        </div>
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
