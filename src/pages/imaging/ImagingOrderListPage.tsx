import * as React from "react"
import { Link, useNavigate } from "react-router-dom"
import { format } from "date-fns"
import { ScanLine, Plus } from "lucide-react"

import { IMAGING_ORDERS } from "@/data/imaging"
import { PATIENTS } from "@/data/patients"
import type { LabOrderStatus } from "@/types"
import { cn, formatCurrency } from "@/lib/utils"
import { PageHeader } from "@/components/shared/PageHeader"
import { EmptyState } from "@/components/shared/EmptyState"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

const FILTERS = ["All", "Pending", "In Progress", "Completed", "Delivered"] as const

export function ImagingOrderListPage() {
  const navigate = useNavigate()
  const [search, setSearch] = React.useState("")
  const [filter, setFilter] = React.useState<(typeof FILTERS)[number]>("All")

  const rows = React.useMemo(() => {
    let list = [...IMAGING_ORDERS].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    if (filter !== "All") list = list.filter((o) => o.status === (filter as LabOrderStatus))
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter((o) => {
        const patient = PATIENTS.find((p) => p.id === o.patientId)
        return patient?.name.toLowerCase().includes(q) || o.xrNo.toLowerCase().includes(q)
      })
    }
    return list
  }, [search, filter])

  return (
    <div>
      <PageHeader
        title="Imaging (X-Ray)"
        actions={
          <Button asChild>
            <Link to="/imaging/orders/new"><Plus className="h-4 w-4" /> New Imaging Order</Link>
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Input placeholder="Search by patient or order number..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
        <div className="flex gap-1 overflow-x-auto rounded-md bg-muted p-1">
          {FILTERS.map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={cn("shrink-0 rounded-sm px-3 py-1.5 text-xs font-medium transition-colors", filter === f ? "bg-background text-secondary shadow-sm" : "text-muted-foreground")}>
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card">
        {rows.length === 0 ? (
          <EmptyState icon={ScanLine} title="No imaging orders found" />
        ) : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>Order No.</TableHead><TableHead>Date</TableHead><TableHead>Patient</TableHead>
              <TableHead>MR No.</TableHead><TableHead>Tests</TableHead><TableHead>Total</TableHead>
              <TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {rows.map((o) => {
                const patient = PATIENTS.find((p) => p.id === o.patientId)
                return (
                  <TableRow key={o.id} className="cursor-pointer" onClick={() => navigate(`/imaging/orders/${o.id}`)}>
                    <TableCell className="font-mono text-secondary">{o.xrNo}</TableCell>
                    <TableCell>{format(new Date(o.date), "dd MMM yyyy")}</TableCell>
                    <TableCell className="font-medium">{patient?.name}</TableCell>
                    <TableCell className="font-mono text-xs">{patient?.mrNo}</TableCell>
                    <TableCell className="max-w-[220px] truncate">{o.tests.map((t) => t.testName).join(", ")}</TableCell>
                    <TableCell>{formatCurrency(o.total)}</TableCell>
                    <TableCell><StatusBadge status={o.status} /></TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      {(o.status === "Completed" || o.status === "Delivered") && (
                        <Button variant="ghost" size="sm" onClick={() => window.print()}>Print Report</Button>
                      )}
                    </TableCell>
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
