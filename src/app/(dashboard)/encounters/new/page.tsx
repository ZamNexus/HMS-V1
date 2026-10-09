"use client"
import * as React from "react"
import { Suspense } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Check, Plus, Trash2 } from "lucide-react"

import { ENCOUNTERS, nextEncounterId, nextTokenNo } from "@/data/encounters"
import { getPatient } from "@/data/patients"
import { DOCTORS, activeDoctors } from "@/data/doctors"
import { MEDICINES } from "@/data/medicines"
import { WARDS } from "@/data/wards"
import { IcdLookup } from "@/components/shared/IcdLookup"
import type { Encounter, EncounterType, Patient, PrescriptionItem, PaymentMode } from "@/types"
import { cn, formatCurrency } from "@/lib/utils"
import { PatientPicker } from "@/components/shared/PatientPicker"
import { PatientInfoPanel } from "@/components/shared/PatientInfoPanel"
import { QuickAddDoctorDialog } from "@/components/shared/QuickAddDoctorDialog"
import { PageHeader } from "@/components/shared/PageHeader"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent } from "@/components/ui/card"
import { useToast } from "@/components/ui/use-toast"

const STEPS = ["Patient", "Details", "Prescription", "Billing"]
const ROUTES = ["Oral", "IV", "IM", "Topical", "Inhaled", "Drops"]
const FREQS = ["OD", "BD", "TDS", "QDS", "SOS", "As directed"]
const MODES: PaymentMode[] = ["Cash", "Card", "Bank Transfer", "Insurance"]

function emptyRx(): PrescriptionItem {
  return { medicine: "", dose: "", route: "Oral", frequency: "OD", duration: "", instructions: "" }
}

function EncounterFormContent() {
  const uid = React.useId()
  const params = useSearchParams()
  const router = useRouter()
  const { toast } = useToast()

  const [step, setStep] = React.useState(0)
  const [patient, setPatient] = React.useState<Patient | null>(() => {
    const pid = params?.get("patientId")
    return pid ? getPatient(Number(pid)) ?? null : null
  })

  const [type, setType] = React.useState<EncounterType>((params?.get("type") as EncounterType) || "OPD")
  const [ward, setWard] = React.useState("")
  const [bedNo, setBedNo] = React.useState("")
  const [admissionType, setAdmissionType] = React.useState<"Emergency" | "Planned">("Planned")
  const [doctorId, setDoctorId] = React.useState<number | undefined>(activeDoctors()[0]?.userId)
  const [doctorDialogOpen, setDoctorDialogOpen] = React.useState(false)
  const [tokenNo, setTokenNo] = React.useState<number>(() => nextTokenNo())
  const [priority, setPriority] = React.useState<"Normal" | "Urgent">("Normal")
  const [vitals, setVitals] = React.useState({ bp: "", pulse: "", temp: "", weight: "", height: "", spo2: "", rbs: "" })
  const [chiefComplaint, setChiefComplaint] = React.useState("")
  const [history, setHistory] = React.useState("")
  const [onExamination, setOnExamination] = React.useState("")
  const [diagnosis, setDiagnosis] = React.useState("")
  const [clinicalNotes, setClinicalNotes] = React.useState("")
  const [advisedBy, setAdvisedBy] = React.useState("")
  const [referredBy, setReferredBy] = React.useState("")
  const [rows, setRows] = React.useState<PrescriptionItem[]>([emptyRx(), emptyRx(), emptyRx()])
  const [generalInstructions, setGeneralInstructions] = React.useState("")
  const [followUpDate, setFollowUpDate] = React.useState("")

  const doctor = DOCTORS.find((d) => d.userId === doctorId)
  const [fee, setFee] = React.useState(doctor?.fee ?? 0)
  React.useEffect(() => setFee(doctor?.fee ?? 0), [doctorId]) // eslint-disable-line react-hooks/exhaustive-deps
  const [discountType, setDiscountType] = React.useState<"flat" | "percent">("flat")
  const [discount, setDiscount] = React.useState(0)
  const [paymentStatus, setPaymentStatus] = React.useState<"paid" | "unpaid" | "partial">("paid")
  const [paymentMode, setPaymentMode] = React.useState<PaymentMode>("Cash")
  const [amountReceived, setAmountReceived] = React.useState(0)

  const netTotal = discountType === "flat" ? Math.max(0, fee - discount) : Math.max(0, fee - (fee * discount) / 100)
  const balance = paymentStatus === "paid" ? 0 : paymentStatus === "unpaid" ? netTotal : Math.max(0, netTotal - amountReceived)

  const bmi = React.useMemo(() => {
    const w = parseFloat(vitals.weight)
    const h = parseFloat(vitals.height ?? "")
    if (!w || !h) return null
    const m = h / 100
    const val = w / (m * m)
    const label = val < 18.5 ? "Underweight" : val < 25 ? "Normal" : val < 30 ? "Overweight" : "Obese"
    return { val: val.toFixed(1), label }
  }, [vitals.weight, vitals.height])

  const canNextFromStep1 = !!patient
  const canNextFromStep2 = chiefComplaint.trim().length > 0 && diagnosis.trim().length > 0 && !!doctorId

  const updateRow = (i: number, patch: Partial<PrescriptionItem>) => {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)))
  }

  const save = () => {
    if (!patient) return
    const encId = nextEncounterId(type)
    const record: Encounter = {
      id: Math.max(0, ...ENCOUNTERS.map((e) => e.id)) + 1,
      encId,
      patientId: patient.id,
      type,
      doctorId: doctorId!,
      date: new Date().toISOString(),
      tokenNo,
      ward: type === "IPD" ? ward : undefined,
      bedNo: type === "IPD" ? bedNo : undefined,
      admissionType: type === "IPD" ? admissionType : undefined,
      priority,
      chiefComplaint,
      history,
      onExamination,
      diagnosis,
      clinicalNotes,
      advisedBy: advisedBy || undefined,
      referredBy: referredBy || undefined,
      vitals: { bp: vitals.bp, pulse: vitals.pulse, temp: vitals.temp, weight: vitals.weight, spo2: vitals.spo2, rbs: vitals.rbs },
      prescription: rows.filter((r) => r.medicine.trim() !== ""),
      generalInstructions,
      followUpDate: followUpDate || undefined,
      fee,
      discount,
      discountType,
      netTotal,
      paymentStatus,
      paymentMode,
      amountReceived: paymentStatus === "unpaid" ? 0 : paymentStatus === "paid" ? netTotal : amountReceived,
      balance,
      status: "open",
    }
    ENCOUNTERS.push(record)

    if (type === "IPD" && ward && bedNo) {
      const w = WARDS.find((x) => x.name === ward)
      const bed = w?.beds.find((b) => b.bedNo === bedNo)
      if (bed) {
        bed.status = "occupied"
        bed.patientId = patient.id
        bed.since = new Date().toISOString().slice(0, 10)
      }
    }

    toast({ title: `Encounter ${encId} saved` })
    router.push(`/encounters/${record.id}`)
  }

  return (
    <>
      <div className="mb-6 flex items-center gap-2">
        {STEPS.map((s, i) => (
          <React.Fragment key={s}>
            <div className="flex shrink-0 items-center gap-2" aria-current={i === step ? "step" : undefined}>
              <div
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold",
                  i < step ? "bg-success-600 text-white" : i === step ? "bg-secondary text-white" : "bg-muted text-muted-foreground"
                )}
              >
                {i < step ? <Check className="h-4 w-4" /> : i + 1}
              </div>
              {/* On phones only the current step's label is shown; the others stay available to screen readers */}
              <span className={cn("text-sm font-medium", i === step ? "text-foreground" : "sr-only text-muted-foreground sm:not-sr-only")}>{s}</span>
            </div>
            {i < STEPS.length - 1 && <div className="mx-1 h-px w-4 shrink-0 bg-border sm:mx-2 sm:w-8" />}
          </React.Fragment>
        ))}
      </div>

      {step === 0 && (
        <Card>
          <CardContent className="space-y-4 p-6">
            <PatientPicker value={patient} onChange={setPatient} />
            <PatientInfoPanel patient={patient} />
            <Link href="/patients/new" target="_blank" className="inline-block text-xs font-medium text-secondary hover:underline">
              + Register New Patient
            </Link>
          </CardContent>
        </Card>
      )}

      {step === 1 && (
        <Card>
          <CardContent className="space-y-5 p-6">
            <div>
              <Label id={`${uid}-encounter-type-label`} className="mb-2 block">Encounter Type</Label>
              <div role="group" aria-labelledby={`${uid}-encounter-type-label`} className="inline-flex rounded-md border border-border p-1">
                {(["OPD", "IPD"] as EncounterType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={cn("rounded-sm px-6 py-1.5 text-sm font-medium transition-colors", type === t ? "bg-secondary text-white" : "text-muted-foreground")}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {type === "IPD" && (
              <div className="grid grid-cols-1 gap-4 rounded-md border border-border bg-muted/30 p-4 md:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor={`${uid}-ward`}>Ward</Label>
                  <Select value={ward} onValueChange={(v) => { setWard(v); setBedNo("") }}>
                    <SelectTrigger id={`${uid}-ward`}><SelectValue placeholder="Select ward" /></SelectTrigger>
                    <SelectContent>
                      {WARDS.map((w) => <SelectItem key={w.id} value={w.name}>{w.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`${uid}-bed-no`}>Bed No.</Label>
                  <Select value={bedNo} onValueChange={setBedNo} disabled={!ward}>
                    <SelectTrigger id={`${uid}-bed-no`}><SelectValue placeholder={ward ? "Select an available bed" : "Select ward first"} /></SelectTrigger>
                    <SelectContent>
                      {WARDS.find((w) => w.name === ward)?.beds.filter((b) => b.status === "available").map((b) => (
                        <SelectItem key={b.bedNo} value={b.bedNo}>{b.bedNo}</SelectItem>
                      ))}
                      {ward && WARDS.find((w) => w.name === ward)?.beds.every((b) => b.status !== "available") && (
                        <div className="px-2 py-1.5 text-xs text-muted-foreground">No available beds in this ward</div>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label id={`${uid}-admission-type-label`}>Admission Type</Label>
                  <RadioGroup aria-labelledby={`${uid}-admission-type-label`} className="flex gap-4 pt-2" value={admissionType} onValueChange={(v) => setAdmissionType(v as "Emergency" | "Planned")}>
                    {(["Emergency", "Planned"] as const).map((a) => (
                      <div key={a} className="flex items-center gap-1.5">
                        <RadioGroupItem value={a} id={`adm-${a}`} /><Label htmlFor={`adm-${a}`} className="cursor-pointer font-normal">{a}</Label>
                      </div>
                    ))}
                  </RadioGroup>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor={`${uid}-doctor`}>Doctor *</Label>
                <div className="flex gap-2">
                  <Select value={doctorId ? String(doctorId) : undefined} onValueChange={(v) => setDoctorId(Number(v))}>
                    <SelectTrigger id={`${uid}-doctor`}><SelectValue placeholder="Select doctor" /></SelectTrigger>
                    <SelectContent>
                      {activeDoctors().map((d) => <SelectItem key={d.userId} value={String(d.userId)}>{d.name} — {d.specialization}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button type="button" variant="outline" size="icon" title="Register new doctor" onClick={() => setDoctorDialogOpen(true)}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${uid}-date-amp-time`}>Date &amp; Time</Label>
                <Input id={`${uid}-date-amp-time`} type="datetime-local" defaultValue={new Date().toISOString().slice(0, 16)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${uid}-token-no`}>Token No</Label>
                <Input id={`${uid}-token-no`} type="number" value={tokenNo} onChange={(e) => setTokenNo(Number(e.target.value))} />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label id={`${uid}-priority-label`}>Priority</Label>
                <RadioGroup aria-labelledby={`${uid}-priority-label`} className="flex gap-4 pt-2" value={priority} onValueChange={(v) => setPriority(v as "Normal" | "Urgent")}>
                  {(["Normal", "Urgent"] as const).map((p) => (
                    <div key={p} className="flex items-center gap-1.5">
                      <RadioGroupItem value={p} id={`pri-${p}`} /><Label htmlFor={`pri-${p}`} className="cursor-pointer font-normal">{p}</Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${uid}-advised-by`}>Advised By</Label>
                <Input id={`${uid}-advised-by`} value={advisedBy} onChange={(e) => setAdvisedBy(e.target.value)} placeholder="Referring physician / self" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${uid}-referred-by`}>Referred By</Label>
                <Input id={`${uid}-referred-by`} value={referredBy} onChange={(e) => setReferredBy(e.target.value)} placeholder="Referral source (optional)" />
              </div>
            </div>

            <div>
              <Label id={`${uid}-vitals-label`} className="mb-2 block">Vitals</Label>
              <div role="group" aria-labelledby={`${uid}-vitals-label`} className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {([
                  ["bp", "BP (mmHg)"], ["pulse", "Pulse (/min)"], ["temp", "Temp (°F)"],
                  ["weight", "Weight (kg)"], ["spo2", "SpO2 (%)"], ["rbs", "RBS mg/dL"],
                ] as const).map(([key, label]) => (
                  <div key={key} className="space-y-1">
                    <Label className="text-xs font-normal text-muted-foreground" htmlFor={`${uid}-vital-${key}`}>{label}</Label>
                    <Input
                      id={`${uid}-vital-${key}`}
                      value={vitals[key as keyof typeof vitals]}
                      placeholder={key === "temp" ? "98.6" : undefined}
                      onChange={(e) => setVitals((v) => ({ ...v, [key]: e.target.value }))}
                    />
                  </div>
                ))}
                <div className="space-y-1">
                  <Label htmlFor={`${uid}-height-cm`} className="text-xs font-normal text-muted-foreground">Height (cm)</Label>
                  <Input id={`${uid}-height-cm`} value={vitals.height} onChange={(e) => setVitals((v) => ({ ...v, height: e.target.value }))} />
                </div>
              </div>
              {bmi && (
                <p className="mt-2 text-xs text-muted-foreground">
                  BMI: <span className="font-semibold text-foreground">{bmi.val}</span> ({bmi.label})
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`${uid}-chief-complaint`}>Chief Complaint *</Label>
                <Textarea id={`${uid}-chief-complaint`} rows={2} value={chiefComplaint} onChange={(e) => setChiefComplaint(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${uid}-history`}>History</Label>
                <Textarea id={`${uid}-history`} rows={2} value={history} onChange={(e) => setHistory(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${uid}-on-examination`}>On Examination</Label>
                <Textarea id={`${uid}-on-examination`} rows={2} value={onExamination} onChange={(e) => setOnExamination(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${uid}-diagnosis-icdlookup-onselect-n`} className="flex items-center gap-2">
                  Diagnosis * <IcdLookup onSelect={(name) => setDiagnosis((d) => (d ? `${d}, ${name}` : name))} />
                </Label>
                <Textarea id={`${uid}-diagnosis-icdlookup-onselect-n`} rows={2} value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor={`${uid}-clinical-notes`}>Clinical Notes</Label>
                <Textarea id={`${uid}-clinical-notes`} rows={2} value={clinicalNotes} onChange={(e) => setClinicalNotes(e.target.value)} />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardContent className="space-y-3 p-6">
            {rows.map((row, i) => {
              const med = MEDICINES.find((m) => m.name === row.medicine)
              return (
                <div key={i} className="grid grid-cols-1 gap-2 rounded-md border border-border p-3 md:grid-cols-7">
                  <div className="md:col-span-2 space-y-1">
                    <Label htmlFor={`${uid}-medicine-${i}`} className="text-xs font-normal text-muted-foreground">Medicine</Label>
                    <Select value={row.medicine || undefined} onValueChange={(v) => updateRow(i, { medicine: v })}>
                      <SelectTrigger id={`${uid}-medicine-${i}`}><SelectValue placeholder="Search medicine..." /></SelectTrigger>
                      <SelectContent>
                        {MEDICINES.map((m) => <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {med && (
                      <p className={cn("text-xs", med.stock < med.reorderLevel ? "text-warning-700" : "text-muted-foreground")}>
                        Stock: {med.stock} {med.unit}{med.stock < med.reorderLevel ? " (low stock)" : ""}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`${uid}-dose-${i}`} className="text-xs font-normal text-muted-foreground">Dose</Label>
                    <Input id={`${uid}-dose-${i}`} value={row.dose} onChange={(e) => updateRow(i, { dose: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`${uid}-route-${i}`} className="text-xs font-normal text-muted-foreground">Route</Label>
                    <Select value={row.route} onValueChange={(v) => updateRow(i, { route: v })}>
                      <SelectTrigger id={`${uid}-route-${i}`}><SelectValue /></SelectTrigger>
                      <SelectContent>{ROUTES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`${uid}-freq-${i}`} className="text-xs font-normal text-muted-foreground">Freq</Label>
                    <Select value={row.frequency} onValueChange={(v) => updateRow(i, { frequency: v })}>
                      <SelectTrigger id={`${uid}-freq-${i}`}><SelectValue /></SelectTrigger>
                      <SelectContent>{FREQS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`${uid}-duration-${i}`} className="text-xs font-normal text-muted-foreground">Duration</Label>
                    <Input id={`${uid}-duration-${i}`} value={row.duration} onChange={(e) => updateRow(i, { duration: e.target.value })} />
                  </div>
                  <div className="flex items-end gap-1">
                    <div className="flex-1 space-y-1">
                      <Label htmlFor={`${uid}-instructions-${i}`} className="text-xs font-normal text-muted-foreground">Instructions</Label>
                      <Input id={`${uid}-instructions-${i}`} value={row.instructions} onChange={(e) => updateRow(i, { instructions: e.target.value })} />
                    </div>
                    <Button aria-label="Remove medicine" type="button" variant="ghost" size="icon" onClick={() => setRows((r) => r.filter((_, idx) => idx !== i))}>
                      <Trash2 className="h-4 w-4 text-danger-600" />
                    </Button>
                  </div>
                </div>
              )
            })}
            <Button type="button" variant="outline" onClick={() => setRows((r) => [...r, emptyRx()])}>
              <Plus className="h-4 w-4" /> Add Medicine
            </Button>

            <div className="grid grid-cols-1 gap-4 pt-2 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`${uid}-general-instructions`}>General Instructions</Label>
                <Textarea id={`${uid}-general-instructions`} rows={2} value={generalInstructions} onChange={(e) => setGeneralInstructions(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${uid}-follow-up-date`}>Follow-up Date</Label>
                <Input id={`${uid}-follow-up-date`} type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardContent className="space-y-5 p-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`${uid}-consultation-fee`}>Consultation Fee</Label>
                <Input id={`${uid}-consultation-fee`} type="number" value={fee} onChange={(e) => setFee(Number(e.target.value))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${uid}-discount`}>Discount</Label>
                <div className="flex gap-2">
                  <Select value={discountType} onValueChange={(v) => setDiscountType(v as "flat" | "percent")}>
                    <SelectTrigger id={`${uid}-discount`} className="w-24"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="flat">Flat</SelectItem>
                      <SelectItem value="percent">%</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input type="number" value={discount} onChange={(e) => setDiscount(Number(e.target.value))} />
                </div>
              </div>
            </div>

            <div className="rounded-md bg-accent-50 p-4 text-right">
              <span className="text-sm text-muted-foreground">Net Total: </span>
              <span className="text-2xl font-bold text-secondary">{formatCurrency(netTotal)}</span>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label id={`${uid}-payment-status-label`}>Payment Status</Label>
                <RadioGroup aria-labelledby={`${uid}-payment-status-label`} className="flex gap-4 pt-2" value={paymentStatus} onValueChange={(v) => setPaymentStatus(v as typeof paymentStatus)}>
                  {(["paid", "unpaid", "partial"] as const).map((p) => (
                    <div key={p} className="flex items-center gap-1.5">
                      <RadioGroupItem value={p} id={`ps-${p}`} /><Label htmlFor={`ps-${p}`} className="cursor-pointer font-normal capitalize">{p}</Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>
              {paymentStatus === "partial" && (
                <div className="space-y-1.5">
                  <Label htmlFor={`${uid}-amount-received`}>Amount Received</Label>
                  <Input id={`${uid}-amount-received`} type="number" value={amountReceived} onChange={(e) => setAmountReceived(Number(e.target.value))} />
                  <p className="text-xs text-muted-foreground">Balance: {formatCurrency(Math.max(0, netTotal - amountReceived))}</p>
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor={`${uid}-payment-mode`}>Payment Mode</Label>
                <Select value={paymentMode} onValueChange={(v) => setPaymentMode(v as PaymentMode)}>
                  <SelectTrigger id={`${uid}-payment-mode`}><SelectValue /></SelectTrigger>
                  <SelectContent>{MODES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="mt-6 flex justify-between">
        <Button type="button" variant="ghost" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
          Back
        </Button>
        {step < 3 ? (
          <Button
            type="button"
            disabled={(step === 0 && !canNextFromStep1) || (step === 1 && !canNextFromStep2)}
            onClick={() => setStep((s) => s + 1)}
          >
            Next
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={save}>Save Draft</Button>
            <Button type="button" onClick={save}>Save Encounter</Button>
          </div>
        )}
      </div>

      <QuickAddDoctorDialog open={doctorDialogOpen} onClose={() => setDoctorDialogOpen(false)} onCreated={(id) => setDoctorId(id)} />
    </>
  )
}

export default function EncounterFormPage() {
  return (
    <div>
      <PageHeader title="New Encounter" />
      <Suspense fallback={<div className="p-10 text-center">Loading form...</div>}>
        <EncounterFormContent />
      </Suspense>
    </div>
  )
}
