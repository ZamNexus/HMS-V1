"use client"
import * as React from "react"
import { format } from "date-fns"

import { reportsService, type PrescriptionHistoryReportData } from "@/lib/services"
import { useDoctors, usePatients } from "@/lib/useReferenceData"
import { EmptyState } from "@/components/shared/EmptyState"
import { Pagination } from "@/components/shared/Pagination"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card, CardContent } from "@/components/ui/card"
import { FileText } from "lucide-react"
import { ReportBody, useReportData } from "./ReportState"

const PAGE_SIZE = 15

export function PrescriptionHistoryReport() {
  const [search, setSearch] = React.useState("")
  const [query, setQuery] = React.useState("")
  const [page, setPage] = React.useState(1)

  // Debounce the search; a new search restarts at page 1.
  React.useEffect(() => {
    const t = setTimeout(() => { setQuery(search.trim()); setPage(1) }, 250)
    return () => clearTimeout(t)
  }, [search])

  const load = React.useCallback((signal: AbortSignal) => reportsService.prescriptionHistory({ search: query, page, pageSize: PAGE_SIZE, signal }), [query, page])
  const state = useReportData(load)

  return (
    <div>
      <Input placeholder="Search by patient, doctor or medicine..." value={search} disabled={state.pending} onChange={(e) => setSearch(e.target.value)} className="mb-4 max-w-sm no-print" />
      <ReportBody state={state} label="Prescription History report" testId="report-prescriptions-pending">
        {(r) => <PrescriptionTable r={r} page={page} onPage={setPage} />}
      </ReportBody>
    </div>
  )
}

function PrescriptionTable({ r, page, onPage }: { r: PrescriptionHistoryReportData; page: number; onPage: (p: number) => void }) {
  const patients = usePatients(r.rows.map((x) => x.patientId))
  const doctors = useDoctors()
  if (r.total === 0) return <EmptyState icon={FileText} title="No prescriptions found" />
  return (
    <Card><CardContent className="p-0">
      <Table>
        <TableHeader><TableRow>
          <TableHead>Date</TableHead><TableHead>Encounter</TableHead><TableHead>Patient</TableHead><TableHead>Doctor</TableHead>
          <TableHead>Medicine</TableHead><TableHead>Dose</TableHead><TableHead>Frequency</TableHead><TableHead>Duration</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {r.rows.map((row) => (
            <TableRow key={row.key}>
              <TableCell>{format(new Date(row.date), "dd MMM yyyy")}</TableCell>
              <TableCell className="font-mono text-secondary">{row.encId}</TableCell>
              <TableCell className="font-medium">{patients.lookup.get(row.patientId)?.name ?? (patients.loading ? "…" : "—")}</TableCell>
              <TableCell>{doctors.lookup.get(row.doctorId)?.name ?? "—"}</TableCell>
              <TableCell className="font-medium">{row.medicine}</TableCell>
              <TableCell>{row.dose}</TableCell>
              <TableCell>{row.frequency}</TableCell>
              <TableCell>{row.duration}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Pagination page={page} pageSize={PAGE_SIZE} total={r.total} onPageChange={onPage} itemLabel="prescriptions" />
    </CardContent></Card>
  )
}
