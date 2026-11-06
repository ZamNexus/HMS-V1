"use client"
import * as React from "react"
import { Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { format } from "date-fns"
import { Plus } from "lucide-react"

import {
  DEFAULT_PAGE_SIZE, FINANCE_OPERATION_LABELS, consultationInvoicesService, consultationTotals, dataSource, encountersService, errorSummary, financeContractStatus,
  formatMoneyString, isPositiveMoney, moneyFromInputNumber, type DiscountType, type PatientRecord,
} from "@/lib/services"
import { useDoctors, useEncounter, usePatient } from "@/lib/useReferenceData"
import { useResource } from "@/lib/useResource"
import type { PaymentMode } from "@/types"
import { ContractPending } from "@/components/shared/ContractPending"
import { PatientRecordPicker } from "@/components/shared/PatientPicker"
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
// In API mode creating an invoice is offered only once its endpoint is confirmed (see src/lib/services/financeContract.ts).
const contract = financeContractStatus(dataSource)

function ConsultationFormContent() {
  const uid = React.useId()
  const router = useRouter()
  const { toast } = useToast()
  const params = useSearchParams()
  // ?encounterId= is an opaque string id (never Number()-ed).
  const initialEncounterId = params?.get("encounterId") ?? undefined
  const linkedEncounter = useEncounter(initialEncounterId).data ?? undefined
  const linkedPatient = usePatient(linkedEncounter?.patientId)
  const doctors = useDoctors()

  // `picked` overrides the patient implied by the linked encounter once the user chooses / clears one.
  const [picked, setPicked] = React.useState<PatientRecord | null | undefined>(undefined)
  const patient = picked !== undefined ? picked : linkedPatient.data ?? null
  const [encounterEdit, setEncounterEdit] = React.useState<string | undefined>(undefined)
  const encounterChoice = encounterEdit ?? (linkedEncounter && patient && linkedEncounter.patientId === patient.id ? linkedEncounter.id : "none")
  const [doctorEdit, setDoctorEdit] = React.useState<string | undefined>(undefined)
  const doctorId = doctorEdit ?? linkedEncounter?.doctorId ?? doctors.active[0]?.id
  const doctor = doctors.lookup.get(doctorId ?? "")
  const [doctorDialogOpen, setDoctorDialogOpen] = React.useState(false)

  // Numeric form fields stay numbers while typing; they become exact money strings only at the service boundary.
  // The fee follows the chosen doctor's fee, and the amount received follows the fee, until the user types over them.
  const [feeEdit, setFeeEdit] = React.useState<number | null>(null)
  const fee = feeEdit ?? doctor?.fee ?? 0
  const [includedInPackage, setIncludedInPackage] = React.useState(false)
  const [discountType, setDiscountType] = React.useState<DiscountType>("flat")
  const [discount, setDiscount] = React.useState(0)
  const [gstPct, setGstPct] = React.useState(0)
  const [mode, setMode] = React.useState<PaymentMode>("Cash")
  const [creditCardAmount, setCreditCardAmount] = React.useState(0)
  const [receivedEdit, setReceivedEdit] = React.useState<number | null>(null)
  const amountReceived = receivedEdit ?? fee
  const [notes, setNotes] = React.useState("")
  const [saving, setSaving] = React.useState(false)

  const loadEncounters = React.useCallback(
    (signal: AbortSignal) => (patient ? encountersService.list({ patientId: patient.id, pageSize: DEFAULT_PAGE_SIZE, signal }) : Promise.resolve({ items: [], total: 0 })),
    [patient]
  )
  const encountersQuery = useResource(loadEncounters)
  const patientEncounters = patient ? (encountersQuery.data?.items ?? []).filter((e) => e.patientId === patient.id) : []
  const chosenEncounter = encounterChoice !== "none" ? patientEncounters.find((e) => e.id === encounterChoice) : undefined

  const money = {
    fee: moneyFromInputNumber(fee), discount: moneyFromInputNumber(discount), gst: moneyFromInputNumber(gstPct), received: moneyFromInputNumber(amountReceived),
    card: moneyFromInputNumber(creditCardAmount),
  }
  const amountsValid = money.fee !== null && money.discount !== null && money.gst !== null && money.received !== null && (mode !== "Card" || money.card !== null)
  const totals = amountsValid
    ? consultationTotals({ fee: money.fee!, includedInPackage, discountType, discount: money.discount!, gstPct: money.gst!, amountReceived: money.received! })
    : null

  const canSave = Boolean(patient && doctorId && totals) && !saving

  const save = async () => {
    if (!patient || !doctorId || !totals || money.fee === null || money.discount === null || money.gst === null || money.received === null) return
    setSaving(true)
    try {
      const record = await consultationInvoicesService.create({
        patientId: patient.id, encounterId: chosenEncounter?.id, doctorId, fee: money.fee, includedInPackage, discountType, discount: money.discount, gstPct: money.gst,
        paymentMode: mode, creditCardAmount: mode === "Card" && money.card !== null ? money.card : undefined, amountReceived: money.received, notes: notes || undefined,
      })
      toast({ title: `Consultation Invoice ${record.invoiceNo} saved.` })
      router.push("/billing/consultations")
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

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor={`${uid}-doctor`}>Doctor *</Label>
              <div className="flex gap-2">
                <Select value={doctorId} onValueChange={(v) => { setDoctorEdit(v); setFeeEdit(null) }} disabled={doctors.loading}>
                  <SelectTrigger id={`${uid}-doctor`}><SelectValue placeholder={doctors.loading ? "Loading doctors…" : "Select doctor"} /></SelectTrigger>
                  <SelectContent>{doctors.active.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
                </Select>
                <Button type="button" variant="outline" size="icon" title="Register new doctor" onClick={() => setDoctorDialogOpen(true)}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {Boolean(doctors.error) && <p role="alert" className="text-xs text-red-600">Doctors unavailable: {errorSummary(doctors.error)}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${uid}-consultation-fee`}>Consultation Fee</Label>
              <Input id={`${uid}-consultation-fee`} type="number" value={fee} onChange={(e) => setFeeEdit(Number(e.target.value))} disabled={includedInPackage} />
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
              <Label htmlFor={`${uid}-discount`}>Discount</Label>
              <div className="flex gap-2">
                <Select value={discountType} onValueChange={(v) => setDiscountType(v as DiscountType)}>
                  <SelectTrigger id={`${uid}-discount`} className="w-24"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="flat">Flat</SelectItem><SelectItem value="percent">%</SelectItem></SelectContent>
                </Select>
                <Input type="number" value={discount} onChange={(e) => setDiscount(Number(e.target.value))} disabled={includedInPackage} />
              </div>
            </div>
            <div className="space-y-1.5"><Label htmlFor={`${uid}-gst`}>GST %</Label><Input id={`${uid}-gst`} type="number" value={gstPct} onChange={(e) => setGstPct(Number(e.target.value))} disabled={includedInPackage} /></div>
            <div className="space-y-1.5">
              <Label htmlFor={`${uid}-payment-mode`}>Payment Mode</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as PaymentMode)}>
                <SelectTrigger id={`${uid}-payment-mode`}><SelectValue /></SelectTrigger>
                <SelectContent>{MODES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-md bg-accent-50 p-4 text-right">
            {totals && isPositiveMoney(totals.gst) && <div className="text-xs text-muted-foreground">Includes GST {formatMoneyString(totals.gst)}</div>}
            <span className="text-sm text-muted-foreground">Total: </span>
            <span data-testid="consultation-total" className="text-2xl font-bold text-secondary">{totals ? formatMoneyString(totals.netTotal) : "—"}</span>
            {!amountsValid && <p role="alert" className="mt-1 text-xs text-red-600">Amounts can have at most two decimals.</p>}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {mode === "Card" && (
              <div className="space-y-1.5"><Label htmlFor={`${uid}-credit-card-amount`}>Credit Card Amount</Label><Input id={`${uid}-credit-card-amount`} type="number" value={creditCardAmount} onChange={(e) => setCreditCardAmount(Number(e.target.value))} /></div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor={`${uid}-amount-received`}>Amount Received</Label>
              <Input id={`${uid}-amount-received`} type="number" value={amountReceived} onChange={(e) => setReceivedEdit(Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${uid}-balance`}>Balance</Label>
              <Input id={`${uid}-balance`} readOnly value={totals ? formatMoneyString(totals.balance) : "—"} className={totals && isPositiveMoney(totals.balance) ? "text-danger-600" : ""} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`${uid}-notes`}>Notes</Label>
            <Textarea id={`${uid}-notes`} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={() => router.back()}>Cancel</Button>
        <Button variant="outline" disabled={!canSave} onClick={save}>Save &amp; Print Receipt</Button>
        <Button disabled={!canSave} onClick={save}>{saving ? "Saving…" : "Save"}</Button>
      </div>

      <QuickAddDoctorDialog open={doctorDialogOpen} onClose={() => setDoctorDialogOpen(false)} onCreatedRecord={(d) => { doctors.reload(); setDoctorEdit(d.id); setFeeEdit(null) }} />
    </div>
  )
}

export default function ConsultationFormPage() {
  return (
    <div>
      <PageHeader
        title="New Consultation Invoice"
        subtitle={`${format(new Date(), "dd MMM yyyy")} · ${format(new Date(), "HH:mm")}`}
      />
      {contract.can("consultationInvoices.create") ? (
        <Suspense fallback={<div className="p-10 text-center">Loading form...</div>}>
          <ConsultationFormContent />
        </Suspense>
      ) : (
        <ContractPending title="Creating consultation invoices is unavailable" awaiting={[FINANCE_OPERATION_LABELS["consultationInvoices.create"]]} testId="consultation-new-pending" />
      )}
    </div>
  )
}
