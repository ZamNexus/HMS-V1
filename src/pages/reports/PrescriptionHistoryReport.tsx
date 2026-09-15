import * as React from "react"
import { format } from "date-fns"

import { ENCOUNTERS } from "@/data/encounters"
import { PATIENTS } from "@/data/patients"
import { DOCTORS } from "@/data/doctors"
import { EmptyState } from "@/components/shared/EmptyState"
import { Pagination } from "@/components/shared/Pagination"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card, CardContent } from "@/components/ui/card"
import { FileText } from "lucide-react"

function patientName(id: number) {
  return PATIENTS.find((p) => p.id === id)?.name ?? "—"
}
function doctorName(id: number) {
  return DOCTORS.find((d) => d.userId === id)?.name ?? "—"
}

export function PrescriptionHistoryReport() {
  const [search, setSearch] = React.useState("")
  const [page, setPage] = React.useState(1)
  const pageSize = 15

  const rows = React.useMemo(() => {
    const flat = ENCOUNTERS.flatMap((e) =>
      e.prescription.map((rx, i) => ({
        key: `${e.id}-${i}`, encId: e.encId, date: e.date, patientId: e.patientId, doctorId: e.doctorId, ...rx,
      }))
    ).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    const q = search.trim().toLowerCase()
    if (!q) return flat
    return flat.filter((r) => patientName(r.patientId).toLowerCase().includes(q) || r.medicine.toLowerCase().includes(q) || doctorName(r.doctorId).toLowerCase().includes(q))
  }, [search])

  React.useEffect(() => setPage(1), [search])
  const paged = rows.slice((page - 1) * pageSize, page * pageSize)

  return (
    <div>
      <Input placeholder="Search by patient, doctor or medicine..." value={search} onChange={(e) => setSearch(e.target.value)} className="mb-4 max-w-sm no-print" />
      {rows.length === 0 ? (
        <EmptyState icon={FileText} title="No prescriptions found" />
      ) : (
        <Card><CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Date</TableHead><TableHead>Encounter</TableHead><TableHead>Patient</TableHead><TableHead>Doctor</TableHead>
              <TableHead>Medicine</TableHead><TableHead>Dose</TableHead><TableHead>Frequency</TableHead><TableHead>Duration</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {paged.map((r) => (
                <TableRow key={r.key}>
                  <TableCell>{format(new Date(r.date), "dd MMM yyyy")}</TableCell>
                  <TableCell className="font-mono text-secondary">{r.encId}</TableCell>
                  <TableCell className="font-medium">{patientName(r.patientId)}</TableCell>
                  <TableCell>{doctorName(r.doctorId)}</TableCell>
                  <TableCell className="font-medium">{r.medicine}</TableCell>
                  <TableCell>{r.dose}</TableCell>
                  <TableCell>{r.frequency}</TableCell>
                  <TableCell>{r.duration}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination page={page} pageSize={pageSize} total={rows.length} onPageChange={setPage} itemLabel="prescriptions" />
        </CardContent></Card>
      )}
    </div>
  )
}
