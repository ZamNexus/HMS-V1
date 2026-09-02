import { Link, useNavigate, useParams } from "react-router-dom"
import { format } from "date-fns"
import { Printer, FlaskConical, ScanLine, Receipt, LogOut } from "lucide-react"

import { getEncounter, encountersForPatient } from "@/data/encounters"
import { getPatient } from "@/data/patients"
import { DOCTORS } from "@/data/doctors"
import { formatCurrency } from "@/lib/utils"
import { encounterBillBreakdown } from "@/lib/billingAggregate"
import { PageHeader } from "@/components/shared/PageHeader"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { EmptyState } from "@/components/shared/EmptyState"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { FileX } from "lucide-react"

export function EncounterDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const encounter = id ? getEncounter(Number(id)) : undefined

  if (!encounter) return <EmptyState icon={FileX} title="Encounter not found" />

  const patient = getPatient(encounter.patientId)
  const doctor = DOCTORS.find((d) => d.userId === encounter.doctorId)
  const history = patient ? encountersForPatient(patient.id).filter((e) => e.id !== encounter.id) : []
  const bill = encounterBillBreakdown(encounter.id)

  return (
    <div>
      <PageHeader
        title={`${patient?.name ?? ""} — ${encounter.encId}`}
        subtitle={`${format(new Date(encounter.date), "dd MMM yyyy, HH:mm")} · ${doctor?.name ?? ""}`}
        actions={
          <>
            <StatusBadge status={encounter.type} />
            <StatusBadge status={encounter.status} />
            <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print Slip</Button>
            <Button variant="outline" size="sm" asChild><Link to={`/lab/orders/new?encounterId=${encounter.id}&patientId=${encounter.patientId}`}><FlaskConical className="h-4 w-4" /> New Lab Order</Link></Button>
            <Button variant="outline" size="sm" asChild><Link to={`/imaging/orders/new?encounterId=${encounter.id}&patientId=${encounter.patientId}`}><ScanLine className="h-4 w-4" /> New Imaging Order</Link></Button>
            <Button variant="outline" size="sm" asChild><Link to={`/billing/consultations/new?encounterId=${encounter.id}`}><Receipt className="h-4 w-4" /> New Invoice</Link></Button>
            {encounter.type === "IPD" && encounter.status === "open" && (
              <Button variant="outline" size="sm" asChild><Link to={`/encounters/${encounter.id}/discharge`}><LogOut className="h-4 w-4" /> Discharge</Link></Button>
            )}
          </>
        }
      />

      <Tabs defaultValue="clinical">
        <TabsList>
          <TabsTrigger value="clinical">Clinical Notes</TabsTrigger>
          <TabsTrigger value="prescription">Prescription</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
          <TabsTrigger value="history">Patient History</TabsTrigger>
        </TabsList>

        <TabsContent value="clinical" className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
            {([
              ["BP", encounter.vitals.bp || "—"], ["Pulse", encounter.vitals.pulse || "—"], ["Temp", encounter.vitals.temp || "—"],
              ["Weight", encounter.vitals.weight || "—"], ["SpO2", encounter.vitals.spo2 || "—"], ["RBS", encounter.vitals.rbs || "—"],
            ] as const).map(([label, val]) => (
              <Card key={label}><CardContent className="p-3 text-center"><div className="text-xs text-muted-foreground">{label}</div><div className="text-lg font-bold text-secondary">{val}</div></CardContent></Card>
            ))}
          </div>
          <Card><CardContent className="space-y-3 p-5 text-sm">
            <Section label="Chief Complaint" value={encounter.chiefComplaint} />
            <Section label="History" value={encounter.history} />
            <Section label="On Examination" value={encounter.onExamination} />
            <Section label="Diagnosis" value={encounter.diagnosis} />
            <Section label="Clinical Notes" value={encounter.clinicalNotes} />
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="prescription">
          <Card>
            <CardContent className="p-0">
              {encounter.prescription.length === 0 ? (
                <div className="p-6"><EmptyState icon={FileX} title="No prescription recorded" /></div>
              ) : (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Medicine</TableHead><TableHead>Dose</TableHead><TableHead>Route</TableHead>
                    <TableHead>Frequency</TableHead><TableHead>Duration</TableHead><TableHead>Instructions</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {encounter.prescription.map((rx, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{rx.medicine}</TableCell>
                        <TableCell>{rx.dose}</TableCell><TableCell>{rx.route}</TableCell>
                        <TableCell>{rx.frequency}</TableCell><TableCell>{rx.duration}</TableCell><TableCell>{rx.instructions}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
          {encounter.prescription.length > 0 && (
            <Button variant="outline" className="mt-3" onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> Print Prescription
            </Button>
          )}
        </TabsContent>

        <TabsContent value="billing">
          <Card>
            <CardContent className="space-y-2 p-5 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Consultation</span><span>{formatCurrency(bill.consultation)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Services</span><span>{formatCurrency(bill.services)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Laboratory</span><span>{formatCurrency(bill.lab)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Imaging (X-Ray)</span><span>{formatCurrency(bill.imaging)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Medicines</span><span>{formatCurrency(bill.medicine)}</span></div>
              <div className="flex justify-between border-t border-border pt-2 font-semibold"><span>Total Bill</span><span>{formatCurrency(bill.total)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Amount Received</span><span className="text-success-600">{formatCurrency(bill.received)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Balance</span><span className={bill.balance > 0 ? "font-semibold text-danger-600" : ""}>{formatCurrency(bill.balance)}</span></div>
              <div className="pt-2"><StatusBadge status={encounter.paymentStatus} /></div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          {history.length === 0 ? (
            <EmptyState icon={FileX} title="No other encounters" />
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Date</TableHead><TableHead>Encounter ID</TableHead><TableHead>Type</TableHead>
                <TableHead>Doctor</TableHead><TableHead>Diagnosis</TableHead><TableHead>Fee</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {history.map((h) => (
                  <TableRow key={h.id} className="cursor-pointer" onClick={() => navigate(`/encounters/${h.id}`)}>
                    <TableCell>{format(new Date(h.date), "dd MMM yyyy")}</TableCell>
                    <TableCell className="font-mono text-secondary">{h.encId}</TableCell>
                    <TableCell><StatusBadge status={h.type} /></TableCell>
                    <TableCell>{DOCTORS.find((d) => d.userId === h.doctorId)?.name}</TableCell>
                    <TableCell>{h.diagnosis}</TableCell>
                    <TableCell>{formatCurrency(h.netTotal)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

function Section({ label, value }: { label: string; value?: string }) {
  if (!value) return null
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <p className="mt-0.5 text-foreground">{value}</p>
    </div>
  )
}
