import * as React from "react"
import { Link, useNavigate } from "react-router-dom"
import { format, isToday, isThisWeek } from "date-fns"
import { ClipboardList, Plus } from "lucide-react"

import { ENCOUNTERS } from "@/data/encounters"
import { PATIENTS } from "@/data/patients"
import { DOCTORS } from "@/data/doctors"
import { cn, formatCurrency } from "@/lib/utils"
import { PageHeader } from "@/components/shared/PageHeader"
import { EmptyState } from "@/components/shared/EmptyState"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { Input } from "@/components/ui/input"
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
        return patient?.name.toLowerCase().includes(q) || e.encId.toLowerCase().includes(q)
      })
    }
    return list
  }, [search, filter])

  return (
    <div>
      <PageHeader
        title="Encounters"
        actions={
          <Button asChild>
            <Link to="/encounters/new"><Plus className="h-4 w-4" /> New Encounter</Link>
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Input placeholder="Search by patient or encounter ID..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
        <div className="flex gap-1 rounded-md bg-muted p-1">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn("rounded-sm px-3 py-1.5 text-xs font-medium transition-colors", filter === f ? "bg-background text-secondary shadow-sm" : "text-muted-foreground")}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card">
        {rows.length === 0 ? (
          <EmptyState icon={ClipboardList} title="No encounters found" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead><TableHead>Encounter ID</TableHead><TableHead>Patient</TableHead>
                <TableHead>MR No.</TableHead><TableHead>Type</TableHead><TableHead>Doctor</TableHead>
                <TableHead>Diagnosis</TableHead><TableHead>Fee</TableHead><TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((e) => {
                const patient = PATIENTS.find((p) => p.id === e.patientId)
                const doctor = DOCTORS.find((d) => d.userId === e.doctorId)
                return (
                  <TableRow key={e.id} className="cursor-pointer" onClick={() => navigate(`/encounters/${e.id}`)}>
                    <TableCell>{format(new Date(e.date), "dd MMM yyyy")}</TableCell>
                    <TableCell className="font-mono text-secondary">{e.encId}</TableCell>
                    <TableCell className="font-medium">{patient?.name}</TableCell>
                    <TableCell className="font-mono text-xs">{patient?.mrNo}</TableCell>
                    <TableCell><StatusBadge status={e.type} /></TableCell>
                    <TableCell>{doctor?.name}</TableCell>
                    <TableCell>{e.diagnosis}</TableCell>
                    <TableCell>{formatCurrency(e.netTotal)}</TableCell>
                    <TableCell><StatusBadge status={e.status} /></TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  )
}
