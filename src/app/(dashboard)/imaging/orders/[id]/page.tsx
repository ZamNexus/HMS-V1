"use client"
import * as React from "react"
import { useParams } from "next/navigation"
import { format } from "date-fns"
import { AlertTriangle, ImageUp, Printer, FileX } from "lucide-react"

import { errorSummary, imagingOrdersService, type ImagingOrderRecord } from "@/lib/services"
import { isApiError } from "@/lib/api/client"
import { useDoctors, useImagingOrder, usePatient } from "@/lib/useReferenceData"
import type { LabOrderStatus } from "@/types"
import { formatCurrency } from "@/lib/utils"
import { PageHeader } from "@/components/shared/PageHeader"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { EmptyState } from "@/components/shared/EmptyState"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/components/ui/use-toast"
import { ImagingOrderDetailScreen } from "@/components/diagnostics/ImagingOrderDetailScreen"
import { dataSource as dxDataSource } from "@/lib/services"

function MockImagingOrderDetailPage() {
  const params = useParams()
  const id = params?.id as string | undefined
  const { data, error, loading, reload } = useImagingOrder(id)

  if (error && !data) {
    const notFound = isApiError(error) && error.status === 404
    return (
      <div role="alert">
        <EmptyState
          icon={notFound ? FileX : AlertTriangle}
          title={notFound ? "Imaging order not found" : "Couldn't load this imaging order"}
          subtitle={notFound ? undefined : errorSummary(error)}
          action={notFound ? undefined : <Button variant="outline" onClick={reload}>Try again</Button>}
        />
      </div>
    )
  }
  if (loading || !data) {
    return (
      <div className="space-y-4" role="status" aria-label="Loading imaging order">
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    )
  }
  return <ImagingOrderDetail order={data} onChanged={reload} />
}

function ImagingOrderDetail({ order, onChanged }: { order: ImagingOrderRecord; onChanged: () => void }) {
  const { toast } = useToast()
  const patientQuery = usePatient(order.patientId)
  const doctors = useDoctors()
  const [busy, setBusy] = React.useState(false)
  const patient = patientQuery.data
  const doctor = doctors.lookup.get(order.doctorId)

  const advanceStatus = async (status: LabOrderStatus) => {
    setBusy(true)
    try {
      await imagingOrdersService.transition(order.id, status)
      toast({ title: `Status updated to ${status}` })
      onChanged()
    } catch (err) {
      toast({ variant: "destructive", title: "Could not update the status", description: errorSummary(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <PageHeader
        title={order.xrNo}
        subtitle={patient ? `${patient.name} · ${patient.mrNo} · ${patient.phone}` : patientQuery.loading ? "…" : "—"}
        actions={<StatusBadge status={order.status} />}
      />

      <Card className="mb-4">
        <CardContent className="grid grid-cols-2 gap-3 p-5 text-sm sm:grid-cols-4">
          <div><div className="text-xs text-muted-foreground">Ordered By</div><div>{doctor?.name ?? (doctors.loading ? "…" : "—")}</div></div>
          <div><div className="text-xs text-muted-foreground">Date/Time</div><div>{format(new Date(order.date), "dd MMM yyyy, HH:mm")}</div></div>
          <div><div className="text-xs text-muted-foreground">Payment Mode</div><div>{order.paymentMode}</div></div>
          <div><div className="text-xs text-muted-foreground">Total</div><div className="font-semibold">{formatCurrency(order.total)}</div></div>
        </CardContent>
      </Card>

      <div className="mb-4 flex flex-wrap gap-2">
        {order.status === "Pending" && <Button disabled={busy} onClick={() => advanceStatus("In Progress")}>Start Processing</Button>}
        {order.status === "In Progress" && <Button disabled={busy} onClick={() => advanceStatus("Completed")}>Mark Completed</Button>}
        {order.status === "Completed" && <Button variant="outline" disabled={busy} onClick={() => advanceStatus("Delivered")}>Mark Delivered</Button>}
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

export default function ImagingOrderDetailPage() {
  if (dxDataSource === "api") return <ImagingOrderDetailScreen />
  return <MockImagingOrderDetailPage />
}
