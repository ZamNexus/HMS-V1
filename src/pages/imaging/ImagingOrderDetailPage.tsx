import * as React from "react"
import { useParams } from "react-router-dom"
import { format } from "date-fns"
import { ImageUp, Printer, FileX } from "lucide-react"

import { IMAGING_ORDERS } from "@/data/imaging"
import { getPatient } from "@/data/patients"
import { DOCTORS } from "@/data/doctors"
import type { LabOrderStatus } from "@/types"
import { formatCurrency } from "@/lib/utils"
import { PageHeader } from "@/components/shared/PageHeader"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { EmptyState } from "@/components/shared/EmptyState"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/components/ui/use-toast"

export function ImagingOrderDetailPage() {
  const { id } = useParams()
  const { toast } = useToast()
  const [, forceUpdate] = React.useReducer((x) => x + 1, 0)
  const order = id ? IMAGING_ORDERS.find((o) => o.id === Number(id)) : undefined

  if (!order) return <EmptyState icon={FileX} title="Imaging order not found" />

  const patient = getPatient(order.patientId)
  const doctor = DOCTORS.find((d) => d.userId === order.doctorId)

  const advanceStatus = (status: LabOrderStatus) => {
    const idx = IMAGING_ORDERS.findIndex((o) => o.id === order.id)
    if (idx >= 0) IMAGING_ORDERS[idx] = { ...IMAGING_ORDERS[idx], status }
    toast({ title: `Status updated to ${status}` })
    forceUpdate()
  }

  return (
    <div>
      <PageHeader
        title={order.xrNo}
        subtitle={`${patient?.name} · ${patient?.mrNo} · ${patient?.phone}`}
        actions={<StatusBadge status={order.status} />}
      />

      <Card className="mb-4">
        <CardContent className="grid grid-cols-2 gap-3 p-5 text-sm sm:grid-cols-4">
          <div><div className="text-xs text-muted-foreground">Ordered By</div><div>{doctor?.name}</div></div>
          <div><div className="text-xs text-muted-foreground">Date/Time</div><div>{format(new Date(order.date), "dd MMM yyyy, HH:mm")}</div></div>
          <div><div className="text-xs text-muted-foreground">Payment Mode</div><div>{order.paymentMode}</div></div>
          <div><div className="text-xs text-muted-foreground">Total</div><div className="font-semibold">{formatCurrency(order.total)}</div></div>
        </CardContent>
      </Card>

      <div className="mb-4 flex flex-wrap gap-2">
        {order.status === "Pending" && <Button onClick={() => advanceStatus("In Progress")}>Start Processing</Button>}
        {order.status === "In Progress" && <Button onClick={() => advanceStatus("Completed")}>Mark Completed</Button>}
        {order.status === "Completed" && <Button variant="outline" onClick={() => advanceStatus("Delivered")}>Mark Delivered</Button>}
        {(order.status === "Completed" || order.status === "Delivered") && (
          <Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print Report</Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Test Name</TableHead><TableHead>Charges</TableHead><TableHead>Result</TableHead><TableHead className="text-right">Image</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {order.tests.map((t) => (
                <TableRow key={t.testId}>
                  <TableCell className="font-medium">{t.testName}</TableCell>
                  <TableCell>{formatCurrency(t.charges)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{t.narrativeResult ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" disabled className="cursor-not-allowed opacity-60" title="PACS integration planned — Phase 2">
                      <ImageUp className="h-4 w-4" /> Upload Image
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
