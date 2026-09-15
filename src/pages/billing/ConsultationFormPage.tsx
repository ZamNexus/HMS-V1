import * as React from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { format } from "date-fns"
import { Plus } from "lucide-react"

import { CONSULTATION_INVOICES } from "@/data/billing"
import { ENCOUNTERS } from "@/data/encounters"
import { DOCTORS, activeDoctors } from "@/data/doctors"
import { getPatient } from "@/data/patients"
import type { ConsultationInvoice, Patient, PaymentMode } from "@/types"
import { formatCurrency } from "@/lib/utils"
import { PatientPicker } from "@/components/shared/PatientPicker"
import { PatientInfoPanel } from "@/components/shared/PatientInfoPanel"
import { QuickAddDoctorDialog } from "@/components/shared/QuickAddDoctorDialog"
import { PageHeader } from "@/components/shared/PageHeader"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent } from "@/components/ui/card"
import { useToast } from "@/components/ui/use-toast"

const MODES: PaymentMode[] = ["Cash", "Card", "Bank Transfer", "Cheque", "Insurance"]

export function ConsultationFormPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [params] = useSearchParams()
  const initialEncounterId = params.get("encounterId")
  const linkedEncounter = initialEncounterId ? ENCOUNTERS.find((e) => e.id === Number(initialEncounterId)) : undefined

  const [patient, setPatient] = React.useState<Patient | null>(linkedEncounter ? getPatient(linkedEncounter.patientId) ?? null : null)
  const [encounterChoice, setEncounterChoice] = React.useState<string>(linkedEncounter ? String(linkedEncounter.id) : "none")
  const [doctorId, setDoctorId] = React.useState<number | undefined>(linkedEncounter?.doctorId ?? activeDoctors()[0]?.userId)
  const [doctorDialogOpen, setDoctorDialogOpen] = React.useState(false)
  const doctor = DOCTORS.find((d) => d.userId === doctorId)
  const [fee, setFee] = React.useState(doctor?.fee ?? 0)
  React.useEffect(() => setFee(doctor?.fee ?? 0), [doctorId]) // eslint-disable-line react-hooks/exhaustive-deps
  const [includedInPackage, setIncludedInPackage] = React.useState(false)
  const [discountType, setDiscountType] = React.useState<"flat" | "percent">("flat")
  const [discount, setDiscount] = React.useState(0)
  const [gstPct, setGstPct] = React.useState(0)
  const [mode, setMode] = React.useState<PaymentMode>("Cash")
  const [creditCardAmount, setCreditCardAmount] = React.useState(0)
  const [amountReceived, setAmountReceived] = React.useState(fee)
  const [notes, setNotes] = React.useState("")

  const patientEncounters = patient ? ENCOUNTERS.filter((e) => e.patientId === patient.id) : []
  const chosenEncounter = encounterChoice !== "none" ? ENCOUNTERS.find((e) => e.id === Number(encounterChoice)) : undefined

  const subtotal = includedInPackage ? 0 : fee
  const afterDiscount = discountType === "flat" ? Math.max(0, subtotal - discount) : Math.max(0, subtotal - (subtotal * discount) / 100)
  const netTotal = afterDiscount + (afterDiscount * gstPct) / 100
  const balance = Math.max(0, netTotal - amountReceived)

  const save = () => {
    if (!patient || !doctorId) return
    const invoiceNo = `CI-2024-${String(CONSULTATION_INVOICES.length + 1).padStart(4, "0")}`
    const record: ConsultationInvoice = {
      id: Math.max(0, ...CONSULTATION_INVOICES.map((c) => c.id)) + 1,
      invoiceNo,
      encounterId: chosenEncounter?.id ?? null,
      patientId: patient.id,
      doctorId,
      date: new Date().toISOString(),
      fee,
      includedInPackage,
      subtotal,
      discountType,
      discount,
      gstPct,
      netTotal,
      paymentMode: mode,
      creditCardAmount: mode === "Card" ? creditCardAmount : undefined,
      amountReceived,
      balance,
      notes,
      status: balance === 0 ? "paid" : amountReceived > 0 ? "partial" : "unpaid",
    }
    CONSULTATION_INVOICES.push(record)
    toast({ title: `Consultation Invoice ${invoiceNo} saved.` })
    navigate("/billing/consultations")
  }

  return (
    <div>
      <PageHeader
        title="New Consultation Invoice"
        subtitle={`${format(new Date(), "dd MMM yyyy")} · ${format(new Date(), "HH:mm")}`}
      />
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

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Doctor *</Label>
              <div className="flex gap-2">
                <Select value={doctorId ? String(doctorId) : undefined} onValueChange={(v) => setDoctorId(Number(v))}>
                  <SelectTrigger><SelectValue placeholder="Select doctor" /></SelectTrigger>
                  <SelectContent>{activeDoctors().map((d) => <SelectItem key={d.userId} value={String(d.userId)}>{d.name}</SelectItem>)}</SelectContent>
                </Select>
                <Button type="button" variant="outline" size="icon" title="Register new doctor" onClick={() => setDoctorDialogOpen(true)}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Consultation Fee</Label>
              <Input type="number" value={fee} onChange={(e) => setFee(Number(e.target.value))} disabled={includedInPackage} />
            </div>
            <div className="flex items-end pb-2">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox checked={includedInPackage} onCheckedChange={(v) => setIncludedInPackage(v === true)} />
                Included in Package
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Discount</Label>
              <div className="flex gap-2">
                <Select value={discountType} onValueChange={(v) => setDiscountType(v as "flat" | "percent")}>
                  <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="flat">Flat</SelectItem><SelectItem value="percent">%</SelectItem></SelectContent>
                </Select>
                <Input type="number" value={discount} onChange={(e) => setDiscount(Number(e.target.value))} disabled={includedInPackage} />
              </div>
            </div>
            <div className="space-y-1.5"><Label>GST %</Label><Input type="number" value={gstPct} onChange={(e) => setGstPct(Number(e.target.value))} disabled={includedInPackage} /></div>
            <div className="space-y-1.5">
              <Label>Payment Mode</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as PaymentMode)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{MODES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-md bg-accent-50 p-4 text-right">
            {gstPct > 0 && <div className="text-xs text-muted-foreground">Includes GST {formatCurrency((afterDiscount * gstPct) / 100)}</div>}
            <span className="text-sm text-muted-foreground">Total: </span>
            <span className="text-2xl font-bold text-secondary">{formatCurrency(netTotal)}</span>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {mode === "Card" && (
              <div className="space-y-1.5"><Label>Credit Card Amount</Label><Input type="number" value={creditCardAmount} onChange={(e) => setCreditCardAmount(Number(e.target.value))} /></div>
            )}
            <div className="space-y-1.5">
              <Label>Amount Received</Label>
              <Input type="number" value={amountReceived} onChange={(e) => setAmountReceived(Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label>Balance</Label>
              <Input readOnly value={formatCurrency(balance)} className={balance > 0 ? "text-danger-600" : ""} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={() => navigate(-1)}>Cancel</Button>
        <Button variant="outline" disabled={!patient || !doctorId} onClick={save}>Save &amp; Print Receipt</Button>
        <Button disabled={!patient || !doctorId} onClick={save}>Save</Button>
      </div>

      <QuickAddDoctorDialog open={doctorDialogOpen} onClose={() => setDoctorDialogOpen(false)} onCreated={(id) => setDoctorId(id)} />
    </div>
  )
}
