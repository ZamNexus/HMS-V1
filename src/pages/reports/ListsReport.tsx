import * as React from "react"
import { format } from "date-fns"

import { PATIENTS } from "@/data/patients"
import { DOCTORS } from "@/data/doctors"
import { SERVICE_CATALOG } from "@/data/services"
import { PANELS } from "@/data/organisations"
import { EXPENSE_CATEGORIES } from "@/data/billing"
import { LAB_TESTS } from "@/data/labTests"
import { ENCOUNTERS } from "@/data/encounters"
import { formatCurrency, cn } from "@/lib/utils"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { EmptyState } from "@/components/shared/EmptyState"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card, CardContent } from "@/components/ui/card"
import { ClipboardList } from "lucide-react"

const LISTS = [
  "Patient List", "Doctor List", "Services/Items", "Organizations List",
  "Expense Head List", "XRay/Lab Test List", "Admitted Patients List",
] as const
type ListKey = (typeof LISTS)[number]

function patientName(id: number) {
  return PATIENTS.find((p) => p.id === id)?.name ?? "—"
}
function doctorName(id: number) {
  return DOCTORS.find((d) => d.userId === id)?.name ?? "—"
}

export function ListsReport() {
  const [active, setActive] = React.useState<ListKey>("Patient List")

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-1 rounded-md bg-muted p-1 no-print">
        {LISTS.map((l) => (
          <button
            key={l}
            onClick={() => setActive(l)}
            className={cn("shrink-0 rounded-sm px-3 py-1.5 text-xs font-medium transition-colors", active === l ? "bg-background text-secondary shadow-sm" : "text-muted-foreground")}
          >
            {l}
          </button>
        ))}
      </div>

      <p className="mb-3 hidden text-sm font-semibold print:block">{active}</p>

      {active === "Patient List" && (
        <Card><CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>MR No.</TableHead><TableHead>Patient Name</TableHead><TableHead>Gender/Age</TableHead>
              <TableHead>Phone</TableHead><TableHead>City</TableHead><TableHead>Registered</TableHead><TableHead>Status</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {PATIENTS.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-secondary">{p.mrNo}</TableCell>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>{p.gender.charAt(0)} · {p.age}</TableCell>
                  <TableCell>{p.phone}</TableCell>
                  <TableCell>{p.city}</TableCell>
                  <TableCell>{format(new Date(p.registrationDate), "dd MMM yyyy")}</TableCell>
                  <TableCell><StatusBadge status={p.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent></Card>
      )}

      {active === "Doctor List" && (
        <Card><CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Name</TableHead><TableHead>Specialization</TableHead><TableHead>Qualifications</TableHead>
              <TableHead>Fee</TableHead><TableHead>Phone</TableHead><TableHead>Available Days</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {DOCTORS.map((d) => (
                <TableRow key={d.userId}>
                  <TableCell className="font-medium">{d.name}</TableCell>
                  <TableCell>{d.specialization}</TableCell>
                  <TableCell className="text-muted-foreground">{d.qualifications}</TableCell>
                  <TableCell>{formatCurrency(d.fee)}</TableCell>
                  <TableCell>{d.phone}</TableCell>
                  <TableCell className="text-muted-foreground">{d.availableDays.join(", ")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent></Card>
      )}

      {active === "Services/Items" && (
        <Card><CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Code</TableHead><TableHead>Service Name</TableHead><TableHead>Category</TableHead>
              <TableHead>Rate</TableHead><TableHead>Active</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {SERVICE_CATALOG.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-secondary">{s.code}</TableCell>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell>{s.category}</TableCell>
                  <TableCell>{formatCurrency(s.rate)}</TableCell>
                  <TableCell><StatusBadge status={s.active ? "Active" : "Inactive"} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent></Card>
      )}

      {active === "Organizations List" && (
        <Card><CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Name</TableHead><TableHead>Type</TableHead><TableHead>Contact Person</TableHead>
              <TableHead>Phone</TableHead><TableHead>Commission %</TableHead><TableHead>Active</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {PANELS.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>{p.type}</TableCell>
                  <TableCell>{p.contactPerson}</TableCell>
                  <TableCell>{p.phone}</TableCell>
                  <TableCell>{p.commissionPct}%</TableCell>
                  <TableCell><StatusBadge status={p.active ? "Active" : "Inactive"} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent></Card>
      )}

      {active === "Expense Head List" && (
        <Card><CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>#</TableHead><TableHead>Expense Head</TableHead></TableRow></TableHeader>
            <TableBody>
              {EXPENSE_CATEGORIES.map((c, i) => (
                <TableRow key={c}><TableCell className="font-mono text-secondary">{i + 1}</TableCell><TableCell className="font-medium">{c}</TableCell></TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent></Card>
      )}

      {active === "XRay/Lab Test List" && (
        <Card><CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Code</TableHead><TableHead>Test Name</TableHead><TableHead>Category</TableHead><TableHead>Fee</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {LAB_TESTS.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-mono text-secondary">{t.code}</TableCell>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell><StatusBadge status={t.category} /></TableCell>
                  <TableCell>{formatCurrency(t.rate)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent></Card>
      )}

      {active === "Admitted Patients List" && (() => {
        const admitted = ENCOUNTERS.filter((e) => e.type === "IPD" && e.status === "open")
        return admitted.length === 0 ? (
          <EmptyState icon={ClipboardList} title="No patients currently admitted" />
        ) : (
          <Card><CardContent className="p-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Encounter</TableHead><TableHead>Patient</TableHead><TableHead>Ward</TableHead>
                <TableHead>Bed</TableHead><TableHead>Doctor</TableHead><TableHead>Admitted</TableHead><TableHead>Admission Type</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {admitted.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-mono text-secondary">{e.encId}</TableCell>
                    <TableCell className="font-medium">{patientName(e.patientId)}</TableCell>
                    <TableCell>{e.ward ?? "—"}</TableCell>
                    <TableCell className="font-mono">{e.bedNo ?? "—"}</TableCell>
                    <TableCell>{doctorName(e.doctorId)}</TableCell>
                    <TableCell>{format(new Date(e.date), "dd MMM yyyy")}</TableCell>
                    <TableCell><StatusBadge status={e.admissionType ?? "Planned"} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        )
      })()}
    </div>
  )
}
