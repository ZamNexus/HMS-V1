import * as React from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { format } from "date-fns"
import { Plus, Trash2 } from "lucide-react"

import { SERVICES_INVOICES } from "@/data/billing"
import { SERVICE_CATALOG } from "@/data/services"
import { activeDoctors } from "@/data/doctors"
import { ENCOUNTERS } from "@/data/encounters"
import { getPatient } from "@/data/patients"
import type { LineItem, Patient, PaymentMode, ServiceCatalogItem, ServicesInvoice } from "@/types"
import { formatCurrency } from "@/lib/utils"
import { PatientPicker } from "@/components/shared/PatientPicker"
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

const MODES: PaymentMode[] = ["Cash", "Card", "Bank Transfer", "Cheque", "Insurance"]
const SERVICE_CATEGORIES = ["Haematology", "Biochemistry", "Serology", "Urine Analysis", "Cardiology", "Radiology", "Procedure", "Diagnostic", "Emergency"]

export function ServicesInvoiceFormPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [params] = useSearchParams()
  const initialEncounterId = params.get("encounterId")
  const linkedEncounter = initialEncounterId ? ENCOUNTERS.find((e) => e.id === Number(initialEncounterId)) : undefined

  const [patient, setPatient] = React.useState<Patient | null>(linkedEncounter ? getPatient(linkedEncounter.patientId) ?? null : null)
  const [encounterChoice, setEncounterChoice] = React.useState<string>(linkedEncounter ? String(linkedEncounter.id) : "none")
  const [doctorId, setDoctorId] = React.useState<string>(linkedEncounter ? String(linkedEncounter.doctorId) : "none")
  const [doctorDialogOpen, setDoctorDialogOpen] = React.useState(false)
  const [serviceDialogOpen, setServiceDialogOpen] = React.useState(false)
  const [vitals, setVitals] = React.useState({
    bp: linkedEncounter?.vitals.bp ?? "", sugar: linkedEncounter?.vitals.rbs ?? "",
    weight: linkedEncounter?.vitals.weight ?? "", temperature: linkedEncounter?.vitals.temp ?? "",
  })
  const [lines, setLines] = React.useState<LineItem[]>([])
  const [pendingService, setPendingService] = React.useState<string>("")
  const [discountType, setDiscountType] = React.useState<"flat" | "percent">("flat")
  const [discount, setDiscount] = React.useState(0)
  const [gstPct, setGstPct] = React.useState(0)
  const [mode, setMode] = React.useState<PaymentMode>("Cash")
  const [amountReceived, setAmountReceived] = React.useState(0)
  const [notes, setNotes] = React.useState("")

  const patientEncounters = patient ? ENCOUNTERS.filter((e) => e.patientId === patient.id) : []
  const chosenEncounter = encounterChoice !== "none" ? ENCOUNTERS.find((e) => e.id === Number(encounterChoice)) : undefined

  const subtotal = lines.reduce((s, l) => s + l.amount, 0)
  const afterDiscount = discountType === "flat" ? Math.max(0, subtotal - discount) : Math.max(0, subtotal - (subtotal * discount) / 100)
  const netTotal = afterDiscount + (afterDiscount * gstPct) / 100
  const balance = Math.max(0, netTotal - amountReceived)

  const addServiceById = (id: number) => {
    const svc = SERVICE_CATALOG.find((s) => s.id === id)
    if (!svc) return
    const discountPct = svc.discountPct ?? 0
    const amount = svc.rate * (1 - discountPct / 100)
    setLines((l) => [...l, { id: `${svc.id}-${Date.now()}`, name: svc.name, rate: svc.rate, qty: 1, discountPct, amount }])
  }

  const addService = () => {
    const svc = SERVICE_CATALOG.find((s) => String(s.id) === pendingService)
    if (!svc) return
    addServiceById(svc.id)
    setPendingService("")
  }

  const updateLine = (id: string, patch: Partial<LineItem>) => {
    setLines((ls) => ls.map((l) => {
      if (l.id !== id) return l
      const merged = { ...l, ...patch }
      merged.amount = merged.rate * merged.qty * (1 - merged.discountPct / 100)
      return merged
    }))
  }

  const save = () => {
    if (!patient || lines.length === 0) return
    const invoiceNo = `SI-2024-${String(SERVICES_INVOICES.length + 1).padStart(4, "0")}`
    const record: ServicesInvoice = {
      id: Math.max(0, ...SERVICES_INVOICES.map((s) => s.id)) + 1,
      invoiceNo,
      encounterId: chosenEncounter?.id ?? null,
      patientId: patient.id,
      doctorId: doctorId !== "none" ? Number(doctorId) : null,
      date: new Date().toISOString(),
      vitals,
      lines,
      subtotal,
      discountType,
      discount,
      gstPct,
      netTotal,
      paymentMode: mode,
      amountReceived,
      balance,
      status: balance === 0 ? "paid" : amountReceived > 0 ? "partial" : "unpaid",
    }
    SERVICES_INVOICES.push(record)
    toast({ title: `Services Invoice ${invoiceNo} saved.` })
    navigate("/billing/services")
  }

  return (
    <div>
      <PageHeader title="New Services Invoice" subtitle={`${format(new Date(), "dd MMM yyyy")} · ${format(new Date(), "HH:mm")}`} />
      <Card>
        <CardContent className="space-y-5 p-6">
          <div className="space-y-1.5">
            <Label>Patient *</Label>
            <PatientPicker value={patient} onChange={(p) => { setPatient(p); setEncounterChoice("none") }} />
          </div>

          <PatientInfoPanel patient={patient} />

          {patient && (
            <div className="space-y-1.5">
              <Label>OPD/IPD Encounter</Label>
              <Select value={encounterChoice} onValueChange={setEncounterChoice}>
                <SelectTrigger><SelectValue placeholder="Link to a visit (optional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not linked to a visit</SelectItem>
                  {patientEncounters.map((e) => <SelectItem key={e.id} value={String(e.id)}>{e.encId} — {e.type} · {e.diagnosis}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Doctor (optional)</Label>
              <div className="flex gap-2">
                <Select value={doctorId} onValueChange={setDoctorId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {activeDoctors().map((d) => <SelectItem key={d.userId} value={String(d.userId)}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" size="icon" title="Register new doctor" onClick={() => setDoctorDialogOpen(true)}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Payment Mode</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as PaymentMode)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{MODES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="mb-2 block">Vitals</Label>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {([["bp", "BP"], ["sugar", "Sugar"], ["weight", "Weight"], ["temperature", "Temperature"]] as const).map(([key, label]) => (
                <div key={key} className="space-y-1">
                  <Label className="text-xs font-normal text-muted-foreground">{label}</Label>
                  <Input value={vitals[key]} onChange={(e) => setVitals((v) => ({ ...v, [key]: e.target.value }))} />
                </div>
              ))}
            </div>
          </div>

          <div>
            <Label className="mb-2 block">Service Line Items</Label>
            <div className="mb-2 flex gap-2">
              <Select value={pendingService} onValueChange={setPendingService}>
                <SelectTrigger className="flex-1"><SelectValue placeholder="Search service..." /></SelectTrigger>
                <SelectContent>{SERVICE_CATALOG.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name} — {formatCurrency(s.rate)}</SelectItem>)}</SelectContent>
              </Select>
              <Button type="button" variant="outline" onClick={addService}><Plus className="h-4 w-4" /> Add Service</Button>
              <Button type="button" variant="outline" size="icon" title="Register new service" onClick={() => setServiceDialogOpen(true)}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {lines.length > 0 && (
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Service</TableHead><TableHead>Rate</TableHead><TableHead>Qty</TableHead>
                  <TableHead>Discount %</TableHead><TableHead>Amount</TableHead><TableHead></TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {lines.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="font-medium">{l.name}</TableCell>
                      <TableCell><Input type="number" className="w-24" value={l.rate} onChange={(e) => updateLine(l.id, { rate: Number(e.target.value) })} /></TableCell>
                      <TableCell><Input type="number" className="w-16" value={l.qty} onChange={(e) => updateLine(l.id, { qty: Number(e.target.value) })} /></TableCell>
                      <TableCell><Input type="number" className="w-16" value={l.discountPct} onChange={(e) => updateLine(l.id, { discountPct: Number(e.target.value) })} /></TableCell>
                      <TableCell className="font-semibold">{formatCurrency(l.amount)}</TableCell>
                      <TableCell>
                        <Button type="button" variant="ghost" size="icon" onClick={() => setLines((ls) => ls.filter((x) => x.id !== l.id))}>
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
              <Label>Discount</Label>
              <div className="flex gap-2">
                <Select value={discountType} onValueChange={(v) => setDiscountType(v as "flat" | "percent")}>
                  <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="flat">Flat</SelectItem><SelectItem value="percent">%</SelectItem></SelectContent>
                </Select>
                <Input type="number" value={discount} onChange={(e) => setDiscount(Number(e.target.value))} />
              </div>
            </div>
            <div className="space-y-1.5"><Label>GST %</Label><Input type="number" value={gstPct} onChange={(e) => setGstPct(Number(e.target.value))} /></div>
            <div className="space-y-1.5"><Label>Amount Received</Label><Input type="number" value={amountReceived} onChange={(e) => setAmountReceived(Number(e.target.value))} /></div>
          </div>

          <div className="rounded-md bg-accent-50 p-4 text-right">
            <div className="text-xs text-muted-foreground">Subtotal {formatCurrency(subtotal)} · GST {formatCurrency((afterDiscount * gstPct) / 100)}</div>
            <span className="text-sm text-muted-foreground">Total: </span>
            <span className="text-2xl font-bold text-secondary">{formatCurrency(netTotal)}</span>
          </div>

          <div className="space-y-1.5">
            <Label>Remarks</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={() => navigate(-1)}>Cancel</Button>
        <Button variant="outline" disabled={!patient || lines.length === 0} onClick={save}>Save &amp; Print</Button>
        <Button disabled={!patient || lines.length === 0} onClick={save}>Save</Button>
      </div>

      <QuickAddDoctorDialog open={doctorDialogOpen} onClose={() => setDoctorDialogOpen(false)} onCreated={(id) => setDoctorId(String(id))} />
      <QuickAddServiceDialog open={serviceDialogOpen} onClose={() => setServiceDialogOpen(false)} onCreated={addServiceById} />
    </div>
  )
}

function QuickAddServiceDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: number) => void }) {
  const { toast } = useToast()
  const [name, setName] = React.useState("")
  const [code, setCode] = React.useState("")
  const [category, setCategory] = React.useState(SERVICE_CATEGORIES[0])
  const [rate, setRate] = React.useState(0)

  React.useEffect(() => {
    if (open) { setName(""); setCode(""); setCategory(SERVICE_CATEGORIES[0]); setRate(0) }
  }, [open])

  const save = () => {
    if (!name.trim() || !code.trim() || !rate) return
    const id = Math.max(0, ...SERVICE_CATALOG.map((s) => s.id)) + 1
    const record: ServiceCatalogItem = { id, code: code.trim(), name: name.trim(), category, rate, active: true }
    SERVICE_CATALOG.push(record)
    toast({ title: `${name} added to catalogue` })
    onCreated(id)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="md">
        <DialogHeader><DialogTitle>Register New Service</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>Code *</Label><Input value={code} onChange={(e) => setCode(e.target.value)} autoFocus /></div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{SERVICE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2"><Label>Service Name *</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Rate (Rs.) *</Label><Input type="number" value={rate} onChange={(e) => setRate(Number(e.target.value))} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
