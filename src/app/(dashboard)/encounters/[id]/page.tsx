"use client"
import { VisitDetailScreen } from "@/components/visits/VisitDetailScreen"
import { dataSource as visitsDataSource } from "@/lib/services"
import * as React from "react"
import Link from "next/link"
import { useRouter, useParams } from "next/navigation"
import { format } from "date-fns"
import { AlertTriangle, Printer, FlaskConical, ScanLine, Receipt, Stethoscope, Pill, LogOut, FileX } from "lucide-react"

import { DEFAULT_PAGE_SIZE, encountersService, errorSummary, formatMoneyString, isPositiveMoney, type BillSummary, type EncounterRecord } from "@/lib/services"
import { isApiError } from "@/lib/api/client"
import { useDoctors, useEncounter, usePatient } from "@/lib/useReferenceData"
import { useResource } from "@/lib/useResource"
import { cn, formatCurrency } from "@/lib/utils"
import { useBillSummary } from "@/lib/useBillSummary"
import { BillSummaryNotice } from "@/components/shared/BillSummaryNotice"
import { PageHeader } from "@/components/shared/PageHeader"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { EmptyState } from "@/components/shared/EmptyState"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

// Demo only (mock mode). Against the real API the encounter page is src/components/visits/VisitDetailScreen.tsx.
function MockEncounterDetailPage() {
  const params = useParams()
  const id = params?.id as string | undefined
  const { data, error, loading, reload } = useEncounter(id)

  if (error && !data) {
    const notFound = isApiError(error) && error.status === 404
    return (
      <div role="alert">
        <EmptyState
          icon={notFound ? FileX : AlertTriangle}
          title={notFound ? "Encounter not found" : "Couldn't load this encounter"}
          subtitle={notFound ? undefined : errorSummary(error)}
          action={notFound ? undefined : <Button variant="outline" onClick={reload}>Try again</Button>}
        />
      </div>
    )
  }
  if (loading || !data) {
    return (
      <div className="space-y-4" role="status" aria-label="Loading encounter">
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    )
  }
  return <EncounterDetail encounter={data} />
}

function EncounterDetail({ encounter }: { encounter: EncounterRecord }) {
  const router = useRouter()
  const patientQuery = usePatient(encounter.patientId)
  const doctors = useDoctors()
  const patient = patientQuery.data
  const doctor = doctors.lookup.get(encounter.doctorId)

  // The patient's other encounters (history tab), through the same service as the list.
  const loadHistory = React.useCallback(
    (signal: AbortSignal) => encountersService.list({ patientId: encounter.patientId, pageSize: DEFAULT_PAGE_SIZE, signal }),
    [encounter.patientId]
  )
  const historyQuery = useResource(loadHistory)
  const history = (historyQuery.data?.items ?? []).filter((e) => e.id !== encounter.id)

  // The bill roll-up comes from billSummaryService (the backend owns every figure; nothing is summed here). Until its contract is
  // confirmed, API mode shows an explicit "not connected" notice — never demo amounts and never a made-up zero.
  const billState = useBillSummary({ kind: "encounter", id: encounter.id })
  const bill = billState.data

  return (
    <div>
      <PageHeader
        title={`${patient?.name ?? (patientQuery.loading ? "…" : "—")} — ${encounter.encId}`}
        subtitle={`${format(new Date(encounter.date), "dd MMM yyyy, HH:mm")} · ${doctor?.name ?? ""}`}
        actions={
          <>
            <StatusBadge status={encounter.type} />
            <StatusBadge status={encounter.status} />
            <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print Slip</Button>
            <Button variant="outline" size="sm" asChild><Link href={`/lab/orders/new?encounterId=${encounter.id}&patientId=${encounter.patientId}`}><FlaskConical className="h-4 w-4" /> New Lab Order</Link></Button>
            <Button variant="outline" size="sm" asChild><Link href={`/imaging/orders/new?encounterId=${encounter.id}&patientId=${encounter.patientId}`}><ScanLine className="h-4 w-4" /> New Imaging Order</Link></Button>
            <Button variant="outline" size="sm" asChild><Link href={`/pharmacy/dispense?encounterId=${encounter.id}&patientId=${encounter.patientId}`}><Pill className="h-4 w-4" /> Dispense Medicine</Link></Button>
            <Button variant="outline" size="sm" asChild><Link href={`/billing/consultations/new?encounterId=${encounter.id}`}><Stethoscope className="h-4 w-4" /> Consultation Invoice</Link></Button>
            <Button variant="outline" size="sm" asChild><Link href={`/billing/services/new?encounterId=${encounter.id}`}><Receipt className="h-4 w-4" /> Services Invoice</Link></Button>
            {encounter.type === "IPD" && encounter.status === "open" && (
              <Button variant="outline" size="sm" asChild><Link href={`/encounters/${encounter.id}/discharge`}><LogOut className="h-4 w-4" /> Discharge</Link></Button>
            )}
          </>
        }
      />

      {bill ? (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8" data-testid="encounter-bill-stats">
          <BillStat label="Consultation" value={bill.consultation} />
          <BillStat label="Services" value={bill.services} />
          <BillStat label="Laboratory" value={bill.laboratory} />
          <BillStat label="Imaging (X-Ray/ECG/USG)" value={bill.imaging} />
          <BillStat label="Medicines" value={bill.medicines} />
          <BillStat label="Total Bill" value={bill.total} emphasize />
          <BillStat label="Received" value={bill.received} tone="success" />
          <BillStat label="Balance" value={bill.balance} tone={isPositiveMoney(bill.balance) ? "danger" : "success"} emphasize />
        </div>
      ) : (
        <div className="mb-6"><BillSummaryNotice state={billState} awaiting="encounter bill summary" testId="encounter-bill-pending" /></div>
      )}

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
            {encounter.tokenNo != null && <Section label="Token No" value={String(encounter.tokenNo)} />}
            <Section label="Chief Complaint" value={encounter.chiefComplaint} />
            <Section label="History" value={encounter.history} />
            <Section label="On Examination" value={encounter.onExamination} />
            <Section label="Diagnosis" value={encounter.diagnosis} />
            <Section label="Clinical Notes" value={encounter.clinicalNotes} />
            <Section label="Advised By" value={encounter.advisedBy} />
            <Section label="Referred By" value={encounter.referredBy} />
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
          {!bill ? (
            <BillSummaryNotice state={billState} awaiting="encounter bill summary" testId="encounter-billing-tab-pending" />
          ) : (
            <Card>
              <CardContent className="space-y-2 p-5 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Consultation</span><span>{formatMoneyString(bill.consultation)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Services</span><span>{formatMoneyString(bill.services)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Laboratory</span><span>{formatMoneyString(bill.laboratory)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Imaging (X-Ray)</span><span>{formatMoneyString(bill.imaging)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Medicines</span><span>{formatMoneyString(bill.medicines)}</span></div>
                <div className="flex justify-between border-t border-border pt-2 font-semibold"><span>Total Bill</span><span>{formatMoneyString(bill.total)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Amount Received</span><span className="text-success-600">{formatMoneyString(bill.received)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Balance</span><span className={isPositiveMoney(bill.balance) ? "font-semibold text-danger-600" : ""}>{formatMoneyString(bill.balance)}</span></div>
                <div className="pt-2"><StatusBadge status={encounter.paymentStatus} /></div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="history">
          {historyQuery.error && !historyQuery.data ? (
            <div role="alert">
              <EmptyState icon={AlertTriangle} title="Couldn't load patient history" subtitle={errorSummary(historyQuery.error)} action={<Button variant="outline" onClick={historyQuery.reload}>Try again</Button>} />
            </div>
          ) : historyQuery.loading && !historyQuery.data ? (
            <div className="space-y-2" role="status" aria-label="Loading patient history">
              <Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" />
            </div>
          ) : history.length === 0 ? (
            <EmptyState icon={FileX} title="No other encounters" />
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Date</TableHead><TableHead>Encounter ID</TableHead><TableHead>Type</TableHead>
                <TableHead>Doctor</TableHead><TableHead>Diagnosis</TableHead><TableHead>Fee</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {history.map((h) => (
                  <TableRow key={h.id} className="cursor-pointer" onClick={() => router.push(`/encounters/${h.id}`)}>
                    <TableCell>{format(new Date(h.date), "dd MMM yyyy")}</TableCell>
                    <TableCell className="font-mono text-secondary">
                      <Link href={`/encounters/${h.id}`} onClick={(ev) => ev.stopPropagation()} className="hover:underline focus-visible:underline focus-visible:outline-none">{h.encId}</Link>
                    </TableCell>
                    <TableCell><StatusBadge status={h.type} /></TableCell>
                    <TableCell>{doctors.lookup.get(h.doctorId)?.name}</TableCell>
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

function BillStat({ label, value, tone, emphasize }: { label: string; value: BillSummary["total"]; tone?: "success" | "danger"; emphasize?: boolean }) {
  const toneClass = tone === "success" ? "text-success-600" : tone === "danger" ? "text-danger-600" : "text-foreground"
  return (
    <div className="rounded-md border border-border bg-muted/30 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("mt-0.5 font-mono", emphasize ? "text-base font-bold" : "text-sm font-medium", toneClass)}>{formatMoneyString(value)}</div>
    </div>
  )
}

export default function EncounterDetailPage() {
  const params = useParams()
  const id = params?.id as string | undefined
  if (visitsDataSource === "api") return id ? <VisitDetailScreen id={id} /> : null
  return <MockEncounterDetailPage />
}
