"use client"
import * as React from "react"
import { Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { format } from "date-fns"
import { Plus, Trash2 } from "lucide-react"

import {
  DEFAULT_PAGE_SIZE, FINANCE_OPERATION_LABELS, dataSource, encountersService, errorSummary, financeContractStatus, formatMoneyString, isNotConnectedError, isPositiveMoney, moneyFromInputNumber,
  serviceCatalogService, serviceLineAmount, servicesInvoicesService, servicesTotals, type DiscountType, type PatientRecord, type ServiceCatalogRecord,
} from "@/lib/services"
import { listAll } from "@/lib/services/reference/listAll"
import { useDoctors, useEncounter, usePatient } from "@/lib/useReferenceData"
import { useResource } from "@/lib/useResource"
import type { PaymentMode } from "@/types"
import { formatCurrency } from "@/lib/utils"
import { ContractPending } from "@/components/shared/ContractPending"
import { PatientRecordPicker } from "@/components/shared/PatientPicker"
import { PatientInfoPanel } from "@/components/shared/PatientInfoPanel"
import { QuickAddDoctorDialog } from "@/components/shared/QuickAddDoctorDialog"
import { PageHeader } from "@/components/shared/PageHeader"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useToast } from "@/components/ui/use-toast"
import { failedChecks, validationToast } from "@/lib/validation"

const MODES: PaymentMode[] = ["Cash", "Card", "Bank Transfer", "Cheque", "Insurance"]
const SERVICE_CATEGORIES = ["Haematology", "Biochemistry", "Serology", "Urine Analysis", "Cardiology", "Radiology", "Procedure", "Diagnostic", "Emergency"]
// In API mode creating an invoice is offered only once its endpoint is confirmed (see src/lib/services/financeContract.ts).
const contract = financeContractStatus(dataSource)

/** A line as typed: numbers while editing, exact money strings only at the service boundary. */
interface FormLine { id: string; name: string; rate: number; qty: number; discountPct: number }

function ServicesInvoiceFormContent() {
  const uid = React.useId()
  const router = useRouter()
  const { toast } = useToast()
  const params = useSearchParams()
  // ?encounterId= is an opaque string id (never Number()-ed).
  const initialEncounterId = params?.get("encounterId") ?? undefined
  const linkedEncounter = useEncounter(initialEncounterId).data ?? undefined
  const linkedPatient = usePatient(linkedEncounter?.patientId)
  const doctors = useDoctors()

  const [picked, setPicked] = React.useState<PatientRecord | null | undefined>(undefined)
  const patient = picked !== undefined ? picked : linkedPatient.data ?? null
  const [encounterEdit, setEncounterEdit] = React.useState<string | undefined>(undefined)
  const encounterChoice = encounterEdit ?? (linkedEncounter && patient && linkedEncounter.patientId === patient.id ? linkedEncounter.id : "none")
  const [doctorEdit, setDoctorEdit] = React.useState<string | undefined>(undefined)
  const doctorId = doctorEdit ?? linkedEncounter?.doctorId ?? "none"
  const [doctorDialogOpen, setDoctorDialogOpen] = React.useState(false)
  const [serviceDialogOpen, setServiceDialogOpen] = React.useState(false)
  const [vitalsEdit, setVitalsEdit] = React.useState<{ bp: string; sugar: string; weight: string; temperature: string } | null>(null)
  const vitals = vitalsEdit ?? {
    bp: linkedEncounter?.vitals.bp ?? "", sugar: linkedEncounter?.vitals.rbs ?? "", weight: linkedEncounter?.vitals.weight ?? "", temperature: linkedEncounter?.vitals.temp ?? "",
  }
  const [lines, setLines] = React.useState<FormLine[]>([])
  const [pendingService, setPendingService] = React.useState<string>("")
  const [discountType, setDiscountType] = React.useState<DiscountType>("flat")
  const [discount, setDiscount] = React.useState(0)
  const [gstPct, setGstPct] = React.useState(0)
  const [mode, setMode] = React.useState<PaymentMode>("Cash")
  const [amountReceived, setAmountReceived] = React.useState(0)
  const [notes, setNotes] = React.useState("")
  const [saving, setSaving] = React.useState(false)

  const loadEncounters = React.useCallback(
    (signal: AbortSignal) => (patient ? encountersService.list({ patientId: patient.id, pageSize: DEFAULT_PAGE_SIZE, signal }) : Promise.resolve({ items: [], total: 0 })),
    [patient]
  )
  const encountersQuery = useResource(loadEncounters)
  const patientEncounters = patient ? (encountersQuery.data?.items ?? []).filter((e) => e.patientId === patient.id) : []
  const chosenEncounter = encounterChoice !== "none" ? patientEncounters.find((e) => e.id === encounterChoice) : undefined

  // Exact money for every line (null while a typed value has more than two decimals).
  const priced = lines.map((l) => {
    const rate = moneyFromInputNumber(l.rate)
    const pct = moneyFromInputNumber(l.discountPct)
    const valid = rate !== null && pct !== null && Number.isFinite(l.qty) && l.qty > 0
    return { line: l, rate, pct, amount: valid ? serviceLineAmount(rate, l.qty, pct) : null }
  })
  const discountM = moneyFromInputNumber(discount)
  const gstM = moneyFromInputNumber(gstPct)
  const receivedM = moneyFromInputNumber(amountReceived)
  const amountsValid = priced.every((p) => p.amount !== null) && discountM !== null && gstM !== null && receivedM !== null
  const totals = amountsValid
    ? servicesTotals({ lines: priced.map((p) => ({ amount: p.amount! })), discountType, discount: discountM!, gstPct: gstM!, amountReceived: receivedM! })
    : null

  // The picker lists the catalogue through serviceCatalogService (never the demo array directly). Its contract is separate from the invoice's.
  const loadCatalogue = React.useCallback((signal: AbortSignal) => listAll((o) => serviceCatalogService.list(o), { signal }), [])
  const catalogue = useResource(loadCatalogue)
  const catalogueItems = catalogue.data?.items ?? []

  const addServiceRecord = (svc: ServiceCatalogRecord) => {
    setLines((l) => [...l, { id: `${svc.id}-${Date.now()}`, name: svc.name, rate: svc.rate, qty: 1, discountPct: svc.discountPct ?? 0 }])
  }

  const addService = () => {
    const svc = catalogueItems.find((s) => s.id === pendingService)
    if (!svc) return
    addServiceRecord(svc)
    setPendingService("")
  }

  const updateLine = (id: string, patch: Partial<FormLine>) => setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)))

  const canSave = Boolean(patient && lines.length > 0 && totals) && !saving

  const save = async () => {
    if (!patient || lines.length === 0 || !totals || discountM === null || gstM === null || receivedM === null) return
    setSaving(true)
    try {
      const record = await servicesInvoicesService.create({
        patientId: patient.id, encounterId: chosenEncounter?.id, doctorId: doctorId !== "none" ? doctorId : undefined, vitals,
        lines: priced.map((p) => ({ name: p.line.name, rate: p.rate!, qty: p.line.qty, discountPct: p.pct! })),
        discountType, discount: discountM, gstPct: gstM, paymentMode: mode, amountReceived: receivedM, notes: notes || undefined,
      })
      toast({ title: `Services Invoice ${record.invoiceNo} saved.` })
      router.push("/billing/services")
    } catch (err) {
      toast({ variant: "destructive", title: "Could not save the invoice", description: errorSummary(err) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <Card>
        <CardContent className="space-y-5 p-6">
          <div className="space-y-1.5">
            <Label htmlFor={`${uid}-patient`}>Patient *</Label>
            <PatientRecordPicker id={`${uid}-patient`} value={patient} onChange={(p) => { setPicked(p); setEncounterEdit("none") }} />
          </div>

          <PatientInfoPanel patient={patient} />

          {patient && (
            <div className="space-y-1.5">
              <Label htmlFor={`${uid}-opd-ipd-encounter`}>OPD/IPD Encounter</Label>
              <Select value={encounterChoice} onValueChange={setEncounterEdit}>
                <SelectTrigger id={`${uid}-opd-ipd-encounter`}><SelectValue placeholder="Link to a visit (optional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not linked to a visit</SelectItem>
                  {patientEncounters.map((e) => <SelectItem key={e.id} value={e.id}>{e.encId} — {e.type} · {e.diagnosis}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`${uid}-doctor-optional`}>Doctor (optional)</Label>
              <div className="flex gap-2">
                <Select value={doctorId} onValueChange={setDoctorEdit} disabled={doctors.loading}>
                  <SelectTrigger id={`${uid}-doctor-optional`}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {doctors.active.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" size="icon" title="Register new doctor" onClick={() => setDoctorDialogOpen(true)}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {Boolean(doctors.error) && <p role="alert" className="text-xs text-red-600">Doctors unavailable: {errorSummary(doctors.error)}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${uid}-payment-mode`}>Payment Mode</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as PaymentMode)}>
                <SelectTrigger id={`${uid}-payment-mode`}><SelectValue /></SelectTrigger>
                <SelectContent>{MODES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label id={`${uid}-vitals-label`} className="mb-2 block">Vitals</Label>
            <div role="group" aria-labelledby={`${uid}-vitals-label`} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {([["bp", "BP"], ["sugar", "Sugar"], ["weight", "Weight"], ["temperature", "Temperature"]] as const).map(([key, label]) => (
                <div key={key} className="space-y-1">
                  <Label className="text-xs font-normal text-muted-foreground" htmlFor={`${uid}-vital-${key}`}>{label}</Label>
                  <Input id={`${uid}-vital-${key}`} value={vitals[key]} onChange={(e) => setVitalsEdit({ ...vitals, [key]: e.target.value })} />
                </div>
              ))}
            </div>
          </div>

          <div>
            <Label htmlFor={`${uid}-service-line-items`} className="mb-2 block">Service Line Items</Label>
            <div className="mb-2 flex gap-2">
              <Select value={pendingService} onValueChange={setPendingService}>
                <SelectTrigger id={`${uid}-service-line-items`} className="flex-1"><SelectValue placeholder="Search service..." /></SelectTrigger>
                <SelectContent>{catalogueItems.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} — {formatCurrency(s.rate)}</SelectItem>)}</SelectContent>
              </Select>
              <Button type="button" variant="outline" onClick={addService} disabled={pendingService === ""}><Plus className="h-4 w-4" /> Add Service</Button>
              <Button type="button" variant="outline" size="icon" title="Register new service" disabled={isNotConnectedError(catalogue.error)} onClick={() => setServiceDialogOpen(true)}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {isNotConnectedError(catalogue.error) ? (
              <p data-testid="services-catalogue-pending" role="status" className="mb-2 text-xs text-amber-800">
                The services catalogue is not connected (no catalogue contract has been provided), so no service can be picked here and none is shown from demo data.
              </p>
            ) : catalogue.error && !catalogue.data ? (
              <p role="alert" className="mb-2 text-xs text-red-700">Couldn&apos;t load the services catalogue. {errorSummary(catalogue.error)} <button type="button" className="font-semibold underline" onClick={catalogue.reload}>Try again</button></p>
            ) : null}

            {lines.length > 0 && (
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Service</TableHead><TableHead>Rate</TableHead><TableHead>Qty</TableHead>
                  <TableHead>Discount %</TableHead><TableHead>Amount</TableHead><TableHead></TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {priced.map(({ line: l, amount }) => (
                    <TableRow key={l.id}>
                      <TableCell className="font-medium">{l.name}</TableCell>
                      <TableCell><Input type="number" className="w-24" value={l.rate} onChange={(e) => updateLine(l.id, { rate: Number(e.target.value) })} /></TableCell>
                      <TableCell><Input type="number" className="w-16" value={l.qty} onChange={(e) => updateLine(l.id, { qty: Number(e.target.value) })} /></TableCell>
                      <TableCell><Input type="number" className="w-16" value={l.discountPct} onChange={(e) => updateLine(l.id, { discountPct: Number(e.target.value) })} /></TableCell>
                      <TableCell className="font-semibold">{amount !== null ? formatMoneyString(amount) : "—"}</TableCell>
                      <TableCell>
                        <Button aria-label="Remove line item" type="button" variant="ghost" size="icon" onClick={() => setLines((ls) => ls.filter((x) => x.id !== l.id))}>
                          <Trash2 className="h-4 w-4 text-danger-600" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor={`${uid}-discount`}>Discount</Label>
              <div className="flex gap-2">
                <Select value={discountType} onValueChange={(v) => setDiscountType(v as DiscountType)}>
                  <SelectTrigger id={`${uid}-discount`} className="w-24"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="flat">Flat</SelectItem><SelectItem value="percent">%</SelectItem></SelectContent>
                </Select>
                <Input type="number" value={discount} onChange={(e) => setDiscount(Number(e.target.value))} />
              </div>
            </div>
            <div className="space-y-1.5"><Label htmlFor={`${uid}-gst`}>GST %</Label><Input id={`${uid}-gst`} type="number" value={gstPct} onChange={(e) => setGstPct(Number(e.target.value))} /></div>
            <div className="space-y-1.5"><Label htmlFor={`${uid}-amount-received`}>Amount Received</Label><Input id={`${uid}-amount-received`} type="number" value={amountReceived} onChange={(e) => setAmountReceived(Number(e.target.value))} /></div>
          </div>

          <div className="rounded-md bg-accent-50 p-4 text-right">
            <div className="text-xs text-muted-foreground">Subtotal {totals ? formatMoneyString(totals.subtotal) : "—"} · GST {totals ? formatMoneyString(totals.gst) : "—"}</div>
            <span className="text-sm text-muted-foreground">Total: </span>
            <span data-testid="services-total" className="text-2xl font-bold text-secondary">{totals ? formatMoneyString(totals.netTotal) : "—"}</span>
            {!amountsValid && <p role="alert" className="mt-1 text-xs text-red-600">Amounts can have at most two decimals, and every quantity must be greater than 0.</p>}
            {totals && isPositiveMoney(totals.balance) && <p className="mt-1 text-xs text-danger-600">Balance {formatMoneyString(totals.balance)}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`${uid}-remarks`}>Remarks</Label>
            <Textarea id={`${uid}-remarks`} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={() => router.back()}>Cancel</Button>
        <Button variant="outline" disabled={!canSave} onClick={save}>Save &amp; Print</Button>
        <Button disabled={!canSave} onClick={save}>{saving ? "Saving…" : "Save"}</Button>
      </div>

      <QuickAddDoctorDialog open={doctorDialogOpen} onClose={() => setDoctorDialogOpen(false)} onCreatedRecord={(d) => { doctors.reload(); setDoctorEdit(d.id) }} />
      <QuickAddServiceDialog open={serviceDialogOpen} onClose={() => setServiceDialogOpen(false)} onCreated={(svc) => { catalogue.reload(); addServiceRecord(svc) }} />
    </div>
  )
}

function QuickAddServiceDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (svc: ServiceCatalogRecord) => void }) {
  const uid = React.useId()
  const { toast } = useToast()
  const [name, setName] = React.useState("")
  const [code, setCode] = React.useState("")
  const [category, setCategory] = React.useState(SERVICE_CATEGORIES[0])
  const [rate, setRate] = React.useState(0)
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (open) { setName(""); setCode(""); setCategory(SERVICE_CATEGORIES[0]); setRate(0) }
  }, [open])

  const save = async () => {
    const problems = failedChecks([[code.trim(), "Code is required"], [name.trim(), "Service Name is required"], [rate, "Rate is required"]])
    if (problems.length) { toast(validationToast(problems)); return }
    setSaving(true)
    try {
      const record = await serviceCatalogService.create({ code: code.trim(), name: name.trim(), category, rate, active: true })
      toast({ title: `${name} added to catalogue` })
      onCreated(record)
      onClose()
    } catch (err) {
      toast({ variant: "destructive", title: "Could not add the service", description: errorSummary(err) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader><DialogTitle>Register New Service</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor={`${uid}-code`}>Code *</Label><Input id={`${uid}-code`} value={code} onChange={(e) => setCode(e.target.value)} autoFocus /></div>
          <div className="space-y-1.5">
            <Label htmlFor={`${uid}-category`}>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id={`${uid}-category`}><SelectValue /></SelectTrigger>
              <SelectContent>{SERVICE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2"><Label htmlFor={`${uid}-service-name`}>Service Name *</Label><Input id={`${uid}-service-name`} value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor={`${uid}-rate-rs`}>Rate (Rs.) *</Label><Input id={`${uid}-rate-rs`} type="number" value={rate} onChange={(e) => setRate(Number(e.target.value))} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={saving} onClick={save}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function ServicesInvoiceFormPage() {
  return (
    <div>
      <PageHeader title="New Services Invoice" subtitle={`${format(new Date(), "dd MMM yyyy")} · ${format(new Date(), "HH:mm")}`} />
      {contract.can("servicesInvoices.create") ? (
        <Suspense fallback={<div className="p-10 text-center">Loading form...</div>}>
          <ServicesInvoiceFormContent />
        </Suspense>
      ) : (
        <ContractPending title="Creating services invoices is unavailable" awaiting={[FINANCE_OPERATION_LABELS["servicesInvoices.create"]]} testId="services-new-pending" />
      )}
    </div>
  )
}
