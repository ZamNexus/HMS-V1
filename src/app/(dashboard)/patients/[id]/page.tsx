"use client"
import * as React from "react"
import Link from "next/link"
import { useRouter, useParams } from "next/navigation"
import { format, parseISO } from "date-fns"
import { AlertTriangle, Pencil, FlaskConical, ScanLine, Pill, Printer, Plus } from "lucide-react"

import { dataSource, errorSummary, formatCnic, formatMoneyString, formatPatientAge, formatPhone, isPositiveMoney, legacyPatientId, type PatientRecord } from "@/lib/services"
import { useDoctors, useOrganisations, usePatient } from "@/lib/useReferenceData"
import { useAccess } from "@/lib/session/useAccess"
import { usePatientToday } from "@/lib/usePatientToday"
import { PatientLifecycleActions } from "@/components/patients/PatientLifecycleActions"
import { PatientAccountPanel } from "@/components/billing/AccountPanels"
import { PatientVisitsTab } from "@/components/visits/PatientVisitsTab"
import { isApiError } from "@/lib/api/client"
import { Skeleton } from "@/components/ui/skeleton"
import { demo } from "@hms/demo"
import { useBillSummary } from "@/lib/useBillSummary"
import { BillSummaryNotice } from "@/components/shared/BillSummaryNotice"
import { cn, formatCurrency, initials } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { EmptyState } from "@/components/shared/EmptyState"
import { FileText } from "lucide-react"

function NotYetConnected({ what }: { what: string }) {
  return (
    <EmptyState
      icon={FileText}
      title={`${what} not yet connected`}
      subtitle="This section still depends on modules that are not connected to the backend, so nothing is shown rather than demo data."
    />
  )
}

export default function PatientProfilePage() {
  const params = useParams()
  const id = params?.id as string | undefined
  const { data, error, loading, reload } = usePatient(id)

  if (error && !data) {
    const notFound = isApiError(error) && error.status === 404
    return (
      <div role="alert">
        <EmptyState
          icon={notFound ? FileText : AlertTriangle}
          title={notFound ? "Patient not found" : "Couldn't load this patient"}
          subtitle={notFound ? "This patient record does not exist." : errorSummary(error)}
          action={notFound ? undefined : <Button variant="outline" onClick={reload}>Try again</Button>}
        />
      </div>
    )
  }
  if (loading || !data) {
    return (
      <div className="space-y-4" role="status" aria-label="Loading patient">
        <Skeleton className="h-32 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    )
  }
  return <PatientProfile patient={data} onChanged={reload} />
}

function PatientProfile({ patient, onChanged }: { patient: PatientRecord; onChanged: () => void }) {
  const router = useRouter()
  const { can } = useAccess()
  const today = usePatientToday()
  // Archive / restore and record / revoke death are real-API actions with their own permissions (see PatientLifecycleActions).
  const archived = patient.archived === true
  const deceased = !!patient.deceasedOn
  const [visitFilter, setVisitFilter] = React.useState<string>("all")

  // Visits, lab, imaging, pharmacy and the invoice rows still come from other modules' mock data keyed by the legacy numeric patient
  // id, and are read ONLY in mock mode (never in API mode, whatever the id looks like). Otherwise those sections get "not yet connected"
  // notices instead of demo records. The balance panel itself comes from billSummaryService (see below).
  const legacyId = dataSource === "mock" ? legacyPatientId(patient) : null
  // Doctor names are only needed for the (mock) visit history; organisations only when the patient has one.
  const doctors = useDoctors(legacyId !== null)
  const organisations = useOrganisations(dataSource === "mock" && patient.panelId !== null) // the API answer carries the panel names
  const doctorName = (doctorId: number) => doctors.lookup.get(doctorId)?.name ?? "—"
  const visits = legacyId !== null ? demo.data.encountersForPatient(legacyId).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()) : []
  const labResults = legacyId !== null ? demo.data.LAB_ORDERS.filter((o) => o.patientId === legacyId) : []
  const imagingResults = legacyId !== null ? demo.data.IMAGING_ORDERS.filter((o) => o.patientId === legacyId) : []
  const dispenses = legacyId !== null ? demo.data.DISPENSE_RECORDS.filter((d) => d.patientId === legacyId) : []
  const consultInvoices = legacyId !== null ? demo.data.CONSULTATION_INVOICES.filter((c) => c.patientId === legacyId) : []
  const servicesInvoices = legacyId !== null ? demo.data.SERVICES_INVOICES.filter((s) => s.patientId === legacyId) : []
  const panelName =
    patient.panelId === null
      ? "Self-Pay"
      : patient.primaryPanelName ?? organisations.lookup.get(patient.panelId)?.name ?? (organisations.loading ? "…" : "Organisation (not yet connected)")

  const scopedEncounterId = visitFilter !== "all" ? Number(visitFilter) : null
  // The totals come from billSummaryService (the backend owns every figure; nothing is summed here): this patient, or one of their visits.
  // API mode shows a "not connected" notice until the contract is confirmed — never demo amounts and never a made-up zero.
  const billState = useBillSummary(scopedEncounterId !== null ? { kind: "encounter", id: String(scopedEncounterId) } : { kind: "patient", id: patient.id })
  const bill = billState.data

  const lastVisit = visits[0]
  const activePrescriptions = lastVisit?.prescription ?? []

  return (
    <div>
      <div className="overflow-hidden rounded-lg bg-gradient-to-r from-navy-900 to-teal-800 p-6 text-white">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-white/15 text-xl font-bold">
              {patient.photoUrl ? <img src={patient.photoUrl} alt={patient.name} className="h-full w-full object-cover" /> : initials(patient.name)}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold">{patient.name}</h1>
                <StatusBadge status={patient.status === "ipd" ? "IPD Admitted" : patient.status} />
                {deceased && <StatusBadge status="Deceased" />}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-teal-100">
                <span className="font-mono" data-testid="profile-mr-no">{patient.mrNo}</span>
                <Badge variant="outline" className="border-white/30 text-white" data-testid="profile-age">{today === null ? "—" : formatPatientAge(patient, today)} · {patient.gender.charAt(0)}</Badge>
                <Badge variant="outline" className="border-white/30 text-white">{patient.bloodGroup}</Badge>
              </div>
              <div className="mt-1 text-xs text-teal-100/80">
                {formatPhone(patient.phone)} {patient.cnic && `· ${formatCnic(patient.cnic)}`}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {dataSource !== "mock" && (
              <PatientLifecycleActions
                patient={patient}
                onChanged={(action) => (action === "archived" ? router.push("/patients") : onChanged())}
                buttonClassName="border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white"
              />
            )}
            {can("patients.write") && (
              <Button asChild variant="outline" className="border-white/40 bg-transparent text-white hover:bg-white/10"><Link href={`/patients/${patient.id}/edit`}>
                <Pencil className="h-4 w-4" /> Edit Patient
              </Link></Button>
            )}
            {/* a deceased or archived patient cannot be given a new visit (the API refuses it) */}
            {!deceased && !archived && (
              <Button variant="outline" className="border-white/40 bg-transparent text-white hover:bg-white/10" asChild>
                <Link href={`/encounters/new?patientId=${patient.id}`}><Plus className="h-4 w-4" /> New Encounter</Link>
              </Button>
            )}
            <Button variant="outline" className="border-white/40 bg-transparent text-white hover:bg-white/10" asChild>
              <Link href={`/lab/orders/new?patientId=${patient.id}`}><FlaskConical className="h-4 w-4" /> New Lab Order</Link>
            </Button>
            <Button variant="outline" className="border-white/40 bg-transparent text-white hover:bg-white/10" asChild>
              <Link href={`/imaging/orders/new?patientId=${patient.id}`}><ScanLine className="h-4 w-4" /> New Imaging Order</Link>
            </Button>
            <Button variant="outline" className="border-white/40 bg-transparent text-white hover:bg-white/10" asChild>
              <Link href={`/pharmacy/dispense?patientId=${patient.id}`}><Pill className="h-4 w-4" /> Dispense Medicine</Link>
            </Button>
            <Button variant="outline" className="border-white/40 bg-transparent text-white hover:bg-white/10" onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> Print Card
            </Button>
          </div>
        </div>
      </div>

      {archived && (
        <div role="status" data-testid="profile-archived-banner" className="mt-4 rounded-lg border border-slate-300 bg-slate-100 p-3 text-sm text-slate-800">
          <span className="font-bold">This patient is archived.</span> The record is kept in full but hidden from default searches. {can("patients.archive") ? "Use Restore Patient to bring it back." : ""}
        </div>
      )}
      {deceased && (
        <div role="status" data-testid="profile-deceased-banner" className="mt-4 rounded-lg border border-slate-300 bg-slate-100 p-3 text-sm text-slate-800">
          <span className="font-bold">Deceased on {format(parseISO(patient.deceasedOn as string), "dd MMM yyyy")}.</span> The record stays viewable; no new visit can be opened.
        </div>
      )}

      <Tabs defaultValue="summary" className="mt-6">
        <TabsList>
          <TabsTrigger value="summary">Summary</TabsTrigger>
          <TabsTrigger value="visits">Visits</TabsTrigger>
          <TabsTrigger value="lab">Lab Results</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardContent className="space-y-2 p-5 text-sm">
              <h3 className="font-semibold text-foreground">Registration Info</h3>
              <div className="flex justify-between"><span className="text-muted-foreground">Registered</span><span>{format(parseISO(patient.registrationDate), "dd MMM yyyy")}</span></div>
              {patient.medicalRecordNo && <div className="flex justify-between"><span className="text-muted-foreground">Medical Record No</span><span className="font-mono">{patient.medicalRecordNo}</span></div>}
              {patient.ssEmpNo && <div className="flex justify-between"><span className="text-muted-foreground">SS/Emp No</span><span>{patient.ssEmpNo}</span></div>}
              <div className="flex justify-between"><span className="text-muted-foreground">Referred By</span><span>{patient.referredBy || "—"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Date of birth</span><span data-testid="profile-dob">{format(parseISO(patient.dob), "dd MMM yyyy")}{patient.dobEstimated ? " (estimated)" : ""}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Panel</span><span>{panelName}</span></div>
              {patient.coverages?.map((c) => (
                <div key={c.priority} data-testid={`profile-coverage-${c.priority}`} className="rounded-md bg-muted/40 p-2 text-xs">
                  <div className="flex justify-between font-medium"><span className="capitalize">{c.priority} organisation</span><span>{c.panelName}</span></div>
                  {c.memberNo && <div className="flex justify-between"><span className="text-muted-foreground">Member no.</span><span>{c.memberNo}</span></div>}
                  {(c.principalMemberName || c.principalRelation) && <div className="flex justify-between"><span className="text-muted-foreground">Principal member</span><span>{c.principalMemberName}{c.principalRelation ? ` (${c.principalRelation})` : ""}</span></div>}
                  {(c.validFrom || c.validTo) && <div className="flex justify-between"><span className="text-muted-foreground">Valid</span><span>{c.validFrom ? format(parseISO(c.validFrom), "dd MMM yyyy") : "…"} to {c.validTo ? format(parseISO(c.validTo), "dd MMM yyyy") : "…"}</span></div>}
                  {c.benefitsApply !== undefined && <div className="flex justify-between"><span className="text-muted-foreground">Benefits</span><span>{c.benefitsApply ? "Apply today" : "Do not apply today"}</span></div>}
                </div>
              ))}
              <div className="flex justify-between"><span className="text-muted-foreground">Guardian</span><span>{patient.guardianRelation}{patient.guardianName ? ` — ${patient.guardianName}` : ""}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Email</span><span>{patient.email || "—"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Address</span><span className="text-right">{patient.address || "—"}, {patient.city}{patient.country && patient.country !== "Pakistan" ? `, ${patient.country}` : ""}</span></div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-2 p-5 text-sm">
              <h3 className="font-semibold text-foreground">Last Visit</h3>
              {legacyId === null ? <p className="text-muted-foreground">Not yet connected to the backend.</p> : lastVisit ? (
                <>
                  <div className="flex justify-between"><span className="text-muted-foreground">Date</span><span>{format(new Date(lastVisit.date), "dd MMM yyyy")}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Doctor</span><span>{doctorName(lastVisit.doctorId)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Diagnosis</span><span>{lastVisit.diagnosis}</span></div>
                  <div className="flex justify-between items-center"><span className="text-muted-foreground">Type</span><StatusBadge status={lastVisit.type} /></div>
                </>
              ) : <p className="text-muted-foreground">No visits recorded.</p>}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardContent className="p-5 text-sm">
              <h3 className="mb-2 font-semibold text-foreground">Active Prescriptions</h3>
              {legacyId === null ? (
                <p className="text-muted-foreground">Not yet connected to the backend.</p>
              ) : activePrescriptions.length === 0 ? (
                <p className="text-muted-foreground">No active prescriptions.</p>
              ) : (
                <ul className="space-y-1">
                  {activePrescriptions.map((rx, i) => (
                    <li key={i} className="flex justify-between border-b border-border py-1.5 last:border-0">
                      <span className="font-medium">{rx.medicine}</span>
                      <span className="text-muted-foreground">{rx.dose} · {rx.frequency} · {rx.duration}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="visits">
          {dataSource !== "mock" ? (
            can("encounters.read") || can("encounters.check_in") ? <PatientVisitsTab patientId={patient.id} /> : <NotYetConnected what="Visit history (your role cannot see visits)" />
          ) : legacyId === null ? (
            <NotYetConnected what="Visit history" />
          ) : visits.length === 0 ? (
            <EmptyState icon={FileText} title="No visits recorded" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead><TableHead>Encounter ID</TableHead><TableHead>Type</TableHead>
                  <TableHead>Doctor</TableHead><TableHead>Chief Complaint</TableHead><TableHead>Diagnosis</TableHead>
                  <TableHead>Fee</TableHead><TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visits.map((v) => (
                  <TableRow key={v.id} className="cursor-pointer" onClick={() => router.push(`/encounters/${v.id}`)}>
                    <TableCell>{format(new Date(v.date), "dd MMM yyyy")}</TableCell>
                    <TableCell className="font-mono text-secondary">
                      <Link href={`/encounters/${v.id}`} onClick={(ev) => ev.stopPropagation()} className="hover:underline focus-visible:underline focus-visible:outline-none">{v.encId}</Link>
                    </TableCell>
                    <TableCell><StatusBadge status={v.type} /></TableCell>
                    <TableCell>{doctorName(v.doctorId)}</TableCell>
                    <TableCell className="max-w-[180px] truncate">{v.chiefComplaint}</TableCell>
                    <TableCell>{v.diagnosis}</TableCell>
                    <TableCell>{formatCurrency(v.netTotal)}</TableCell>
                    <TableCell><StatusBadge status={v.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        <TabsContent value="lab">
          {legacyId === null ? (
            <NotYetConnected what="Lab results" />
          ) : labResults.length === 0 ? (
            <EmptyState icon={FlaskConical} title="No lab results" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead><TableHead>Order No.</TableHead><TableHead>Tests</TableHead>
                  <TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {labResults.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell>{format(new Date(o.date), "dd MMM yyyy")}</TableCell>
                    <TableCell className="font-mono text-secondary">{o.labNo}</TableCell>
                    <TableCell>{o.tests.map((t) => t.testName).join(", ")}</TableCell>
                    <TableCell><StatusBadge status={o.status} /></TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" asChild><Link href={`/lab/orders/${o.id}`}>View</Link></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        <TabsContent value="billing">
          {dataSource === "api" ? (
            <div className="space-y-4" data-testid="patient-billing-api">
              <PatientAccountPanel patientId={patient.id} patientName={patient.name} />
              {can("billing.read") && <Link className="text-sm font-bold text-[#0891B2] hover:underline" href={`/billing/consultations?patient=${patient.id}`}>See this patient&apos;s invoices</Link>}
            </div>
          ) : !bill ? <BillSummaryNotice state={billState} awaiting="patient bill summary" testId="patient-billing-pending" /> : (
          <>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-foreground">
              {scopedEncounterId ? `Scoped to ${visits.find((v) => v.id === scopedEncounterId)?.encId ?? ""}` : "All Visits"}
            </h3>
            <div className="w-64 space-y-1">
              <Select value={visitFilter} onValueChange={setVisitFilter}>
                <SelectTrigger><SelectValue placeholder="Filter by OPD/IPD visit" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Visits</SelectItem>
                  {visits.map((v) => <SelectItem key={v.id} value={String(v.id)}>{v.encId} — {v.type} · {format(new Date(v.date), "dd MMM yyyy")}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Total Billed</div><div className="text-xl font-bold">{formatMoneyString(bill.total)}</div></CardContent></Card>
            <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Paid</div><div className="text-xl font-bold text-success-600">{formatMoneyString(bill.received)}</div></CardContent></Card>
            <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Outstanding</div><div className={cn("text-xl font-bold", isPositiveMoney(bill.balance) ? "text-danger-600" : "text-success-600")}>{formatMoneyString(bill.balance)}</div></CardContent></Card>
          </div>

          <Card className="mb-4">
            <CardContent className="grid grid-cols-2 gap-3 p-4 text-sm sm:grid-cols-5">
              <div><div className="text-xs text-muted-foreground">Consultation</div><div className="font-semibold">{formatMoneyString(bill.consultation)}</div></div>
              <div><div className="text-xs text-muted-foreground">Services</div><div className="font-semibold">{formatMoneyString(bill.services)}</div></div>
              <div><div className="text-xs text-muted-foreground">Laboratory</div><div className="font-semibold">{formatMoneyString(bill.laboratory)}</div></div>
              <div><div className="text-xs text-muted-foreground">Imaging</div><div className="font-semibold">{formatMoneyString(bill.imaging)}</div></div>
              <div><div className="text-xs text-muted-foreground">Medicines</div><div className="font-semibold">{formatMoneyString(bill.medicines)}</div></div>
            </CardContent>
          </Card>

          {(() => {
            const allInvoices = [
              ...consultInvoices.map((c) => ({ key: c.invoiceNo, date: c.date, invoiceNo: c.invoiceNo, type: "Consultation", amount: c.netTotal, paid: c.amountReceived, balance: c.balance, status: c.status, encounterId: c.encounterId })),
              ...servicesInvoices.map((s) => ({ key: s.invoiceNo, date: s.date, invoiceNo: s.invoiceNo, type: "Services", amount: s.netTotal, paid: s.amountReceived, balance: s.balance, status: s.status, encounterId: s.encounterId })),
              ...labResults.map((o) => ({ key: o.labNo, date: o.date, invoiceNo: o.labNo, type: "Laboratory", amount: o.total, paid: o.paymentStatus === "paid" ? o.total : 0, balance: o.paymentStatus === "paid" ? 0 : o.total, status: o.paymentStatus, encounterId: o.encounterId })),
              ...imagingResults.map((o) => ({ key: o.xrNo, date: o.date, invoiceNo: o.xrNo, type: "Imaging", amount: o.total, paid: o.total, balance: 0, status: "paid", encounterId: o.encounterId })),
              ...dispenses.map((d) => ({ key: d.disNo, date: d.date, invoiceNo: d.disNo, type: "Pharmacy", amount: d.netPayable, paid: d.netPayable, balance: 0, status: "paid", encounterId: d.encounterId })),
            ]
              .filter((inv) => scopedEncounterId === null || inv.encounterId === scopedEncounterId)
              .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

            return allInvoices.length === 0 ? (
              <EmptyState icon={FileText} title="No billing history" subtitle={scopedEncounterId ? "No charges recorded against this visit." : undefined} />
            ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead><TableHead>Invoice No.</TableHead><TableHead>Type</TableHead>
                  <TableHead>Amount</TableHead><TableHead>Paid</TableHead><TableHead>Balance</TableHead><TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allInvoices.map((inv) => (
                    <TableRow key={inv.key}>
                      <TableCell>{format(new Date(inv.date), "dd MMM yyyy")}</TableCell>
                      <TableCell className="font-mono text-secondary">{inv.invoiceNo}</TableCell>
                      <TableCell>{inv.type}</TableCell>
                      <TableCell>{formatCurrency(inv.amount)}</TableCell>
                      <TableCell>{formatCurrency(inv.paid)}</TableCell>
                      <TableCell className={inv.balance > 0 ? "text-danger-600" : ""}>{formatCurrency(inv.balance)}</TableCell>
                      <TableCell><StatusBadge status={inv.status} /></TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
            )
          })()}
          </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
