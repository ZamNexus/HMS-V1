import * as React from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { format } from "date-fns"
import { Pencil, FlaskConical, ScanLine, Pill, Printer, Plus } from "lucide-react"

import { getPatient } from "@/data/patients"
import { getPanel } from "@/data/organisations"
import { encountersForPatient } from "@/data/encounters"
import { LAB_ORDERS } from "@/data/lab"
import { IMAGING_ORDERS } from "@/data/imaging"
import { DISPENSE_RECORDS } from "@/data/pharmacy"
import { CONSULTATION_INVOICES, SERVICES_INVOICES } from "@/data/billing"
import { DOCTORS } from "@/data/doctors"
import { patientBillBreakdown, encounterBillBreakdown } from "@/lib/billingAggregate"
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

function doctorName(doctorId: number) {
  return DOCTORS.find((d) => d.userId === doctorId)?.name ?? "—"
}

export function PatientProfilePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const patient = id ? getPatient(Number(id)) : undefined

  if (!patient) {
    return <EmptyState icon={FileText} title="Patient not found" subtitle="This patient record does not exist." />
  }

  const visits = encountersForPatient(patient.id).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  const labResults = LAB_ORDERS.filter((o) => o.patientId === patient.id)
  const imagingResults = IMAGING_ORDERS.filter((o) => o.patientId === patient.id)
  const dispenses = DISPENSE_RECORDS.filter((d) => d.patientId === patient.id)
  const consultInvoices = CONSULTATION_INVOICES.filter((c) => c.patientId === patient.id)
  const servicesInvoices = SERVICES_INVOICES.filter((s) => s.patientId === patient.id)
  const panel = getPanel(patient.panelId)

  const [visitFilter, setVisitFilter] = React.useState<string>("all")
  const scopedEncounterId = visitFilter !== "all" ? Number(visitFilter) : null
  const bill = scopedEncounterId ? encounterBillBreakdown(scopedEncounterId) : patientBillBreakdown(patient.id)

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
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-teal-100">
                <span className="font-mono">{patient.mrNo}</span>
                <Badge variant="outline" className="border-white/30 text-white">{patient.age} · {patient.gender.charAt(0)}</Badge>
                <Badge variant="outline" className="border-white/30 text-white">{patient.bloodGroup}</Badge>
              </div>
              <div className="mt-1 text-xs text-teal-100/80">
                {patient.phone} {patient.cnic && `· ${patient.cnic}`}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="border-white/40 bg-transparent text-white hover:bg-white/10" onClick={() => navigate(`/patients/${patient.id}/edit`)}>
              <Pencil className="h-4 w-4" /> Edit Patient
            </Button>
            <Button variant="outline" className="border-white/40 bg-transparent text-white hover:bg-white/10" asChild>
              <Link to={`/encounters/new?patientId=${patient.id}`}><Plus className="h-4 w-4" /> New Encounter</Link>
            </Button>
            <Button variant="outline" className="border-white/40 bg-transparent text-white hover:bg-white/10" asChild>
              <Link to={`/lab/orders/new?patientId=${patient.id}`}><FlaskConical className="h-4 w-4" /> New Lab Order</Link>
            </Button>
            <Button variant="outline" className="border-white/40 bg-transparent text-white hover:bg-white/10" asChild>
              <Link to={`/imaging/orders/new?patientId=${patient.id}`}><ScanLine className="h-4 w-4" /> New Imaging Order</Link>
            </Button>
            <Button variant="outline" className="border-white/40 bg-transparent text-white hover:bg-white/10" asChild>
              <Link to={`/pharmacy/dispense?patientId=${patient.id}`}><Pill className="h-4 w-4" /> Dispense Medicine</Link>
            </Button>
            <Button variant="outline" className="border-white/40 bg-transparent text-white hover:bg-white/10" onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> Print Card
            </Button>
          </div>
        </div>
      </div>

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
              <div className="flex justify-between"><span className="text-muted-foreground">Registered</span><span>{format(new Date(patient.registrationDate), "dd MMM yyyy")}</span></div>
              {patient.medicalRecordNo && <div className="flex justify-between"><span className="text-muted-foreground">Medical Record No</span><span className="font-mono">{patient.medicalRecordNo}</span></div>}
              {patient.ssEmpNo && <div className="flex justify-between"><span className="text-muted-foreground">SS/Emp No</span><span>{patient.ssEmpNo}</span></div>}
              <div className="flex justify-between"><span className="text-muted-foreground">Referred By</span><span>{patient.referredBy || "—"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Panel</span><span>{panel?.name ?? "Self-Pay"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Guardian</span><span>{patient.guardianRelation}{patient.guardianName ? ` — ${patient.guardianName}` : ""}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Email</span><span>{patient.email || "—"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Address</span><span className="text-right">{patient.address || "—"}, {patient.city}{patient.country && patient.country !== "Pakistan" ? `, ${patient.country}` : ""}</span></div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-2 p-5 text-sm">
              <h3 className="font-semibold text-foreground">Last Visit</h3>
              {lastVisit ? (
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
              {activePrescriptions.length === 0 ? (
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
          {visits.length === 0 ? (
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
                  <TableRow key={v.id} className="cursor-pointer" onClick={() => navigate(`/encounters/${v.id}`)}>
                    <TableCell>{format(new Date(v.date), "dd MMM yyyy")}</TableCell>
                    <TableCell className="font-mono text-secondary">{v.encId}</TableCell>
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
          {labResults.length === 0 ? (
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
                      <Button variant="ghost" size="sm" asChild><Link to={`/lab/orders/${o.id}`}>View</Link></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        <TabsContent value="billing">
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
            <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Total Billed</div><div className="text-xl font-bold">{formatCurrency(bill.total)}</div></CardContent></Card>
            <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Paid</div><div className="text-xl font-bold text-success-600">{formatCurrency(bill.received)}</div></CardContent></Card>
            <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Outstanding</div><div className={cn("text-xl font-bold", bill.balance > 0 ? "text-danger-600" : "text-success-600")}>{formatCurrency(bill.balance)}</div></CardContent></Card>
          </div>

          <Card className="mb-4">
            <CardContent className="grid grid-cols-2 gap-3 p-4 text-sm sm:grid-cols-5">
              <div><div className="text-xs text-muted-foreground">Consultation</div><div className="font-semibold">{formatCurrency(bill.consultation)}</div></div>
              <div><div className="text-xs text-muted-foreground">Services</div><div className="font-semibold">{formatCurrency(bill.services)}</div></div>
              <div><div className="text-xs text-muted-foreground">Laboratory</div><div className="font-semibold">{formatCurrency(bill.lab)}</div></div>
              <div><div className="text-xs text-muted-foreground">Imaging</div><div className="font-semibold">{formatCurrency(bill.imaging)}</div></div>
              <div><div className="text-xs text-muted-foreground">Medicines</div><div className="font-semibold">{formatCurrency(bill.medicine)}</div></div>
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
        </TabsContent>
      </Tabs>
    </div>
  )
}
