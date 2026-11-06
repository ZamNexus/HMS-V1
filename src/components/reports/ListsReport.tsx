"use client"
import * as React from "react"
import { format } from "date-fns"

import {
  doctorsService, encountersService, expenseCategoriesService, labTestsService, organisationsService, patientsService, serviceCatalogService,
} from "@/lib/services"
import { listAll } from "@/lib/services/reference/listAll"
import { useDoctors, usePatients } from "@/lib/useReferenceData"
import { formatCurrency, cn } from "@/lib/utils"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { EmptyState } from "@/components/shared/EmptyState"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card, CardContent } from "@/components/ui/card"
import { ClipboardList } from "lucide-react"
import { ReportBody, useReportData } from "./ReportState"

const LISTS = [
  "Patient List", "Doctor List", "Services/Items", "Organizations List",
  "Expense Head List", "XRay/Lab Test List", "Admitted Patients List",
] as const
type ListKey = (typeof LISTS)[number]

// The Task List says these lists "already come from existing list endpoints" (patients, admitted patients, doctors, organizations,
// services) or "come with T1 and T6" (the lab test list, expense heads) — so each is read through the EXISTING service for that
// resource, not through a report endpoint. Each list is as connected as its own service is; none is simulated.
const loadPatients = () => listAll((o) => patientsService.list(o))
const loadDoctors = () => listAll((o) => doctorsService.list(o))
const loadServices = () => listAll((o) => serviceCatalogService.list(o))
const loadOrganisations = () => listAll((o) => organisationsService.list(o))
const loadExpenseHeads = () => listAll((o) => expenseCategoriesService.list(o))
const loadLabTests = () => listAll((o) => labTestsService.list(o))
const loadAdmitted = () => listAll((o) => encountersService.list({ ...o, type: "IPD" }))

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

      {active === "Patient List" && <PatientList />}
      {active === "Doctor List" && <DoctorList />}
      {active === "Services/Items" && <ServiceList />}
      {active === "Organizations List" && <OrganisationList />}
      {active === "Expense Head List" && <ExpenseHeadList />}
      {active === "XRay/Lab Test List" && <LabTestList />}
      {active === "Admitted Patients List" && <AdmittedList />}
    </div>
  )
}

function PatientList() {
  const state = useReportData(loadPatients)
  return (
    <ReportBody state={state} label="Patient list" testId="list-patients-pending">
      {(all) => (
        <Card><CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>MR No.</TableHead><TableHead>Patient Name</TableHead><TableHead>Gender/Age</TableHead>
              <TableHead>Phone</TableHead><TableHead>City</TableHead><TableHead>Registered</TableHead><TableHead>Status</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {all.items.map((p) => (
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
    </ReportBody>
  )
}

function DoctorList() {
  const state = useReportData(loadDoctors)
  return (
    <ReportBody state={state} label="Doctor list" testId="list-doctors-pending">
      {(all) => (
        <Card><CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Name</TableHead><TableHead>Specialization</TableHead><TableHead>Qualifications</TableHead>
              <TableHead>Fee</TableHead><TableHead>Phone</TableHead><TableHead>Available Days</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {all.items.map((d) => (
                <TableRow key={d.id}>
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
    </ReportBody>
  )
}

function ServiceList() {
  const state = useReportData(loadServices)
  return (
    <ReportBody state={state} label="Services/Items list" testId="list-services-pending">
      {(all) => (
        <Card><CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Code</TableHead><TableHead>Service Name</TableHead><TableHead>Category</TableHead>
              <TableHead>Rate</TableHead><TableHead>Active</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {all.items.map((s) => (
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
    </ReportBody>
  )
}

function OrganisationList() {
  const state = useReportData(loadOrganisations)
  return (
    <ReportBody state={state} label="Organizations list" testId="list-organisations-pending">
      {(all) => (
        <Card><CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Name</TableHead><TableHead>Type</TableHead><TableHead>Contact Person</TableHead>
              <TableHead>Phone</TableHead><TableHead>Commission %</TableHead><TableHead>Active</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {all.items.map((p) => (
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
    </ReportBody>
  )
}

function ExpenseHeadList() {
  const state = useReportData(loadExpenseHeads)
  return (
    <ReportBody state={state} label="Expense head list" testId="list-expense-heads-pending">
      {(all) => (
        <Card><CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>#</TableHead><TableHead>Expense Head</TableHead></TableRow></TableHeader>
            <TableBody>
              {all.items.map((c, i) => (
                <TableRow key={c.id}><TableCell className="font-mono text-secondary">{i + 1}</TableCell><TableCell className="font-medium">{c.name}</TableCell></TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent></Card>
      )}
    </ReportBody>
  )
}

function LabTestList() {
  const state = useReportData(loadLabTests)
  return (
    <ReportBody state={state} label="XRay/Lab test list" testId="list-lab-tests-pending">
      {(all) => (
        <Card><CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Code</TableHead><TableHead>Test Name</TableHead><TableHead>Category</TableHead><TableHead>Fee</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {all.items.map((t) => (
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
    </ReportBody>
  )
}

function AdmittedList() {
  const state = useReportData(loadAdmitted)
  return (
    <ReportBody state={state} label="Admitted patients list" testId="list-admitted-pending">
      {(all) => <AdmittedTable encounters={all.items.filter((e) => e.type === "IPD" && e.status === "open")} />}
    </ReportBody>
  )
}

function AdmittedTable({ encounters }: { encounters: Awaited<ReturnType<typeof loadAdmitted>>["items"] }) {
  const patients = usePatients(encounters.map((e) => e.patientId))
  const doctors = useDoctors()
  if (encounters.length === 0) return <EmptyState icon={ClipboardList} title="No patients currently admitted" />
  return (
    <Card><CardContent className="p-0">
      <Table>
        <TableHeader><TableRow>
          <TableHead>Encounter</TableHead><TableHead>Patient</TableHead><TableHead>Ward</TableHead>
          <TableHead>Bed</TableHead><TableHead>Doctor</TableHead><TableHead>Admitted</TableHead><TableHead>Admission Type</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {encounters.map((e) => (
            <TableRow key={e.id}>
              <TableCell className="font-mono text-secondary">{e.encId}</TableCell>
              <TableCell className="font-medium">{patients.lookup.get(e.patientId)?.name ?? (patients.loading ? "…" : "—")}</TableCell>
              <TableCell>{e.ward ?? "—"}</TableCell>
              <TableCell className="font-mono">{e.bedNo ?? "—"}</TableCell>
              <TableCell>{doctors.lookup.get(e.doctorId)?.name ?? "—"}</TableCell>
              <TableCell>{format(new Date(e.date), "dd MMM yyyy")}</TableCell>
              <TableCell><StatusBadge status={e.admissionType ?? "Planned"} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </CardContent></Card>
  )
}
