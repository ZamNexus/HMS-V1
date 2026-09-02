import * as React from "react"
import { useNavigate, useSearchParams } from "react-router-dom"

import { CONSULTATION_INVOICES } from "@/data/billing"
import { ENCOUNTERS } from "@/data/encounters"
import { DOCTORS } from "@/data/doctors"
import { getPatient } from "@/data/patients"
import type { ConsultationInvoice, Patient, PaymentMode } from "@/types"
import { formatCurrency } from "@/lib/utils"
import { PatientPicker } from "@/components/shared/PatientPicker"
import { PageHeader } from "@/components/shared/PageHeader"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent } from "@/components/ui/card"
import { useToast } from "@/components/ui/use-toast"

const MODES: PaymentMode[] = ["Cash", "Card", "Bank Transfer", "Cheque", "Insurance"]

export function ConsultationFormPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [params] = useSearchParams()
  const encounterId = params.get("encounterId")
  const linkedEncounter = encounterId ? ENCOUNTERS.find((e) => e.id === Number(encounterId)) : undefined

  const [patient, setPatient] = React.useState<Patient | null>(linkedEncounter ? getPatient(linkedEncounter.patientId) ?? null : null)
  const [doctorId, setDoctorId] = React.useState<number | undefined>(linkedEncounter?.doctorId ?? DOCTORS[0]?.userId)
  const doctor = DOCTORS.find((d) => d.userId === doctorId)
  const [fee, setFee] = React.useState(doctor?.fee ?? 0)
  React.useEffect(() => setFee(doctor?.fee ?? 0), [doctorId]) // eslint-disable-line react-hooks/exhaustive-deps
  const [discountType, setDiscountType] = React.useState<"flat" | "percent">("flat")
  const [discount, setDiscount] = React.useState(0)
  const [mode, setMode] = React.useState<PaymentMode>("Cash")
  const [amountReceived, setAmountReceived] = React.useState(fee)
  const [notes, setNotes] = React.useState("")

  const subtotal = fee
  const netTotal = discountType === "flat" ? Math.max(0, subtotal - discount) : Math.max(0, subtotal - (subtotal * discount) / 100)
  const balance = Math.max(0, netTotal - amountReceived)

  const save = () => {
    if (!patient || !doctorId) return
    const invoiceNo = `CI-2024-${String(CONSULTATION_INVOICES.length + 1).padStart(4, "0")}`
    const record: ConsultationInvoice = {
      id: Math.max(0, ...CONSULTATION_INVOICES.map((c) => c.id)) + 1,
      invoiceNo,
      encounterId: linkedEncounter?.id ?? null,
      patientId: patient.id,
      doctorId,
      date: new Date().toISOString(),
      fee,
      subtotal,
      discountType,
      discount,
      netTotal,
      paymentMode: mode,
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
      <PageHeader title="New Consultation Invoice" />
      <Card>
        <CardContent className="space-y-5 p-6">
          <div className="space-y-1.5">
            <Label>Patient *</Label>
            <PatientPicker value={patient} onChange={setPatient} />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Doctor *</Label>
              <Select value={doctorId ? String(doctorId) : undefined} onValueChange={(v) => setDoctorId(Number(v))}>
                <SelectTrigger><SelectValue placeholder="Select doctor" /></SelectTrigger>
                <SelectContent>{DOCTORS.map((d) => <SelectItem key={d.userId} value={String(d.userId)}>{d.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Consultation Fee</Label>
              <Input type="number" value={fee} onChange={(e) => setFee(Number(e.target.value))} />
            </div>
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
          </div>

          <div className="rounded-md bg-accent-50 p-4 text-right">
            <span className="text-sm text-muted-foreground">Net Total: </span>
            <span className="text-2xl font-bold text-secondary">{formatCurrency(netTotal)}</span>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Payment Mode</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as PaymentMode)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{MODES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
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
    </div>
  )
}
