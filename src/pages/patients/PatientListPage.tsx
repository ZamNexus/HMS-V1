import * as React from "react"
import { Link, useNavigate } from "react-router-dom"
import { differenceInDays } from "date-fns"
import { Eye, Pencil, Printer, Plus, UserX } from "lucide-react"

import { PATIENTS } from "@/data/patients"
import { ENCOUNTERS } from "@/data/encounters"
import { cn } from "@/lib/utils"
import { PageHeader } from "@/components/shared/PageHeader"
import { EmptyState } from "@/components/shared/EmptyState"
import { Pagination } from "@/components/shared/Pagination"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { Input } from "@/components/ui/input"
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
    <div>
      <PageHeader
        title="Patients"
        subtitle={`${PATIENTS.length} registered patients`}
        actions={
          <Button asChild>
            <Link to="/patients/new">
              <Plus className="h-4 w-4" /> Register Patient
            </Link>
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Input
          placeholder="Search by name, MR No. or phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <div className="flex gap-1 rounded-md bg-muted p-1">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-sm px-3 py-1.5 text-xs font-medium transition-colors",
                filter === f ? "bg-background text-secondary shadow-sm" : "text-muted-foreground"
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card">
        {paged.length === 0 ? (
          <EmptyState icon={UserX} title="No patients found" subtitle="Try adjusting your search or filters." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>MR No.</TableHead>
                <TableHead>Patient Name</TableHead>
                <TableHead>Father/Husband</TableHead>
                <TableHead>Age · Gender</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Last Visit</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.map((p) => (
                <TableRow key={p.id} className="cursor-pointer" onClick={() => navigate(`/patients/${p.id}`)}>
                  <TableCell className="font-mono text-secondary">{p.mrNo}</TableCell>
                  <TableCell className="font-medium text-foreground">{p.name}</TableCell>
                  <TableCell className="text-muted-foreground">{p.fatherName}</TableCell>
                  <TableCell>{p.age} · {p.gender.charAt(0)}</TableCell>
                  <TableCell>{p.phone}</TableCell>
                  <TableCell className="text-muted-foreground">{lastVisit(p.id)}</TableCell>
                  <TableCell>
                    <StatusBadge status={p.status === "ipd" ? "IPD Admitted" : p.status} />
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" asChild>
                        <Link to={`/patients/${p.id}`}><Eye className="h-4 w-4" /></Link>
                      </Button>
                      <Button variant="ghost" size="icon" asChild>
                        <Link to={`/patients/${p.id}/edit`}><Pencil className="h-4 w-4" /></Link>
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => window.print()}>
                        <Printer className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {paged.length > 0 && (
          <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={setPage} itemLabel="patients" />
        )}
      </div>
    </div>
  )
}
