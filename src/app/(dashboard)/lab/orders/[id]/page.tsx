"use client"
import * as React from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { format } from "date-fns"
import { AlertTriangle, Printer, FileX } from "lucide-react"

import { errorSummary, labOrdersService, type LabOrderRecord } from "@/lib/services"
import { isApiError } from "@/lib/api/client"
import { useDoctors, useLabOrder, usePatient } from "@/lib/useReferenceData"
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

function resultSummary(o: LabOrderRecord, testId: string) {
  const test = o.tests.find((t) => t.testId === testId)
  if (!test) return "—"
  if (test.narrativeResult) return "Reported"
  if (test.results && test.results.length > 0) {
    return test.results.slice(0, 1).map((r) => `${r.parameter}: ${r.result} ${r.unit}`).join(", ")
  }
  return "—"
}

export default function LabOrderDetailPage() {
  const params = useParams()
  const id = params?.id as string | undefined
  const { data, error, loading, reload } = useLabOrder(id)

  if (error && !data) {
    const notFound = isApiError(error) && error.status === 404
    return (
      <div role="alert">
        <EmptyState
          icon={notFound ? FileX : AlertTriangle}
          title={notFound ? "Lab order not found" : "Couldn't load this lab order"}
          subtitle={notFound ? undefined : errorSummary(error)}
          action={notFound ? undefined : <Button variant="outline" onClick={reload}>Try again</Button>}
        />
      </div>
    )
  }
  if (loading || !data) {
    return (
      <div className="space-y-4" role="status" aria-label="Loading lab order">
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    )
  }
  return <LabOrderDetail order={data} onChanged={reload} />
}

function LabOrderDetail({ order, onChanged }: { order: LabOrderRecord; onChanged: () => void }) {
  const { toast } = useToast()
  const patientQuery = usePatient(order.patientId)
  const doctors = useDoctors()
  const [busy, setBusy] = React.useState(false)
  const patient = patientQuery.data
  const doctor = doctors.lookup.get(order.doctorId)

  const advanceStatus = async (status: LabOrderStatus) => {
    setBusy(true)
    try {
      await labOrdersService.transition(order.id, status)
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
        title={order.labNo}
        subtitle={patient ? `${patient.name} · ${patient.mrNo} · ${patient.phone}` : patientQuery.loading ? "…" : "—"}
        actions={
          <>
            {order.priority === "Urgent" && <StatusBadge status="Urgent" />}
            <StatusBadge status={order.status} />
          </>
        }
      />

      <Card className="mb-4">
        <CardContent className="grid grid-cols-2 gap-3 p-5 text-sm sm:grid-cols-4">
          <div><div className="text-xs text-muted-foreground">Ordered By</div><div>{doctor?.name ?? (doctors.loading ? "…" : "—")}</div></div>
          <div><div className="text-xs text-muted-foreground">Date/Time</div><div>{format(new Date(order.date), "dd MMM yyyy, HH:mm")}</div></div>
          <div><div className="text-xs text-muted-foreground">Sample</div><div>{order.sampleType} · {order.sampleId}</div></div>
          <div><div className="text-xs text-muted-foreground">Total</div><div className="font-semibold">{formatCurrency(order.total)}</div></div>
        </CardContent>
      </Card>

      <div className="mb-4 flex flex-wrap gap-2">
        {order.status === "Pending" && <Button disabled={busy} onClick={() => advanceStatus("Collected")}>Mark Collected</Button>}
        {order.status === "Collected" && (
          <>
            <Button variant="outline" disabled={busy} onClick={() => advanceStatus("In Progress")}>Start Processing</Button>
            <Button asChild><Link href={`/lab/orders/${order.id}/results`}>Enter Results</Link></Button>
          </>
        )}
        {order.status === "In Progress" && <Button asChild><Link href={`/lab/orders/${order.id}/results`}>Enter Results</Link></Button>}
        {order.status === "Completed" && (
          <>
            <Button variant="outline" disabled={busy} onClick={() => advanceStatus("Delivered")}>Mark Delivered</Button>
            <Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print Report</Button>
          </>
        )}
        {order.status === "Delivered" && <Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print Report</Button>}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Test Name</TableHead><TableHead>Code</TableHead><TableHead>Category</TableHead>
              <TableHead>Sample</TableHead><TableHead>Result Summary</TableHead><TableHead className="text-right">Action</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {order.tests.map((t) => (
                <TableRow key={t.testId}>
                  <TableCell className="font-medium">{t.testName}</TableCell>
                  <TableCell className="font-mono text-xs text-secondary">—</TableCell>
                  <TableCell>—</TableCell>
                  <TableCell>{order.sampleType}</TableCell>
                  <TableCell className="max-w-[240px] truncate text-xs">{resultSummary(order, t.testId)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" asChild><Link href={`/lab/orders/${order.id}/results`}>Enter Result</Link></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {order.pathologistRemarks && (
        <Card className="mt-4">
          <CardContent className="p-5 text-sm">
            <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Pathologist&apos;s Remarks</div>
            <p>{order.pathologistRemarks}</p>
            <p className="mt-2 text-xs text-muted-foreground">Performed by: {order.performedBy} · Verified by: {order.verifiedBy}</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
