import * as React from "react"
import { Link, useNavigate } from "react-router-dom"
import { format } from "date-fns"
import { FlaskConical, Plus } from "lucide-react"

import { LAB_ORDERS } from "@/data/lab"
import { PATIENTS } from "@/data/patients"
import type { LabOrderStatus } from "@/types"
import { cn } from "@/lib/utils"
import { PageHeader } from "@/components/shared/PageHeader"
import { EmptyState } from "@/components/shared/EmptyState"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
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
        return patient?.name.toLowerCase().includes(q) || o.labNo.toLowerCase().includes(q)
      })
    }
    return list
  }, [search, filter])

  return (
    <div>
      <PageHeader
        title="Laboratory"
        actions={
          <>
            {pendingCount > 0 && <Badge variant="warning">{pendingCount} Pending</Badge>}
            <Button asChild><Link to="/lab/orders/new"><Plus className="h-4 w-4" /> New Lab Order</Link></Button>
          </>
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
          <EmptyState icon={FlaskConical} title="No lab orders found" />
        ) : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>Order No.</TableHead><TableHead>Date &amp; Time</TableHead><TableHead>Patient</TableHead>
              <TableHead>MR No.</TableHead><TableHead>Tests</TableHead><TableHead>Priority</TableHead>
              <TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {rows.map((o) => {
                const patient = PATIENTS.find((p) => p.id === o.patientId)
                const testsLabel = o.tests.length > 2
                  ? `${o.tests.slice(0, 2).map((t) => t.testName).join(", ")} +${o.tests.length - 2} more`
                  : o.tests.map((t) => t.testName).join(", ")
                return (
                  <TableRow key={o.id} className="cursor-pointer" onClick={() => navigate(`/lab/orders/${o.id}`)}>
                    <TableCell className="font-mono text-secondary">{o.labNo}</TableCell>
                    <TableCell>{format(new Date(o.date), "dd MMM yyyy, HH:mm")}</TableCell>
                    <TableCell className="font-medium">{patient?.name}</TableCell>
                    <TableCell className="font-mono text-xs">{patient?.mrNo}</TableCell>
                    <TableCell className="max-w-[220px] truncate">{testsLabel}</TableCell>
                    <TableCell>{o.priority === "Urgent" && <StatusBadge status="Urgent" />}</TableCell>
                    <TableCell><StatusBadge status={o.status} /></TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        {(o.status === "Collected" || o.status === "In Progress") && (
                          <Button variant="ghost" size="sm" asChild><Link to={`/lab/orders/${o.id}/results`}>Enter Results</Link></Button>
                        )}
                        {(o.status === "Completed" || o.status === "Delivered") && (
                          <Button variant="ghost" size="sm" onClick={() => window.print()}>Print Report</Button>
                        )}
                      </div>
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
