import * as React from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { Plus, X } from "lucide-react"

import { IMAGING_ORDERS, nextXrNo } from "@/data/imaging"
import { LAB_TESTS } from "@/data/labTests"
import { activeDoctors } from "@/data/doctors"
import { getPatient } from "@/data/patients"
import { ENCOUNTERS } from "@/data/encounters"
import type { ImagingOrder, LabOrderTest, Patient, PaymentMode } from "@/types"
import { formatCurrency } from "@/lib/utils"
import { PatientPicker } from "@/components/shared/PatientPicker"
import { PatientInfoPanel } from "@/components/shared/PatientInfoPanel"
import { QuickAddDoctorDialog } from "@/components/shared/QuickAddDoctorDialog"
import { QuickAddLabTestDialog } from "@/components/shared/QuickAddLabTestDialog"
import { PageHeader } from "@/components/shared/PageHeader"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent } from "@/components/ui/card"
import { useToast } from "@/components/ui/use-toast"

const MODES: PaymentMode[] = ["Cash", "Card", "Bank Transfer", "Insurance", "On Account"]
const MODE_LABELS: Partial<Record<PaymentMode, string>> = { "On Account": "Credit" }
const IMAGING_TESTS = LAB_TESTS.filter((t) => t.category === "Radiology" || t.category === "Cardiology")

interface TestSettings {
  discountPct: number
  gstPct: number
  includedInPackage: boolean
}

export function ImagingOrderFormPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [params] = useSearchParams()

  const [patient, setPatient] = React.useState<Patient | null>(() => {
    const pid = params.get("patientId")
    return pid ? getPatient(Number(pid)) ?? null : null
  })
  const initialEncounterId = params.get("encounterId")
  const [encounterChoice, setEncounterChoice] = React.useState<string>(initialEncounterId ?? "none")
  const [doctorId, setDoctorId] = React.useState<number | undefined>(activeDoctors()[0]?.userId)
  const [doctorDialogOpen, setDoctorDialogOpen] = React.useState(false)
  const [testDialogOpen, setTestDialogOpen] = React.useState(false)
  const [mode, setMode] = React.useState<PaymentMode>("Cash")
  const [selected, setSelected] = React.useState<Set<number>>(new Set())
  const [testSettings, setTestSettings] = React.useState<Record<number, TestSettings>>({})
  const [flatDiscount, setFlatDiscount] = React.useState(0)
  const [notes, setNotes] = React.useState("")

  const patientEncounters = patient ? ENCOUNTERS.filter((e) => e.patientId === patient.id) : []
  const chosenEncounter = encounterChoice !== "none" ? ENCOUNTERS.find((e) => e.id === Number(encounterChoice)) : undefined
  const selectedTests = IMAGING_TESTS.filter((t) => selected.has(t.id))

  const lineTotal = (t: (typeof IMAGING_TESTS)[number]) => {
    const s = testSettings[t.id] ?? { discountPct: 0, gstPct: 0, includedInPackage: false }
    const charge = s.includedInPackage ? 0 : t.rate
    const afterDisc = charge - (charge * s.discountPct) / 100
    return afterDisc + (afterDisc * s.gstPct) / 100
  }
  const grossTotal = selectedTests.reduce((sum, t) => sum + lineTotal(t), 0)
  const total = Math.max(0, grossTotal - flatDiscount)

  const toggleTest = (id: number) => {
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) {
        next.delete(id)
        setTestSettings((prev) => { const { [id]: _drop, ...rest } = prev; return rest })
      } else {
        next.add(id)
        setTestSettings((prev) => ({ ...prev, [id]: { discountPct: 0, gstPct: 0, includedInPackage: false } }))
      }
      return next
    })
  }

  const updateSetting = (id: number, patch: Partial<TestSettings>) => {
    setTestSettings((prev) => ({ ...prev, [id]: { ...(prev[id] ?? { discountPct: 0, gstPct: 0, includedInPackage: false }), ...patch } }))
  }

  const save = () => {
    if (!patient || selected.size === 0 || !doctorId) return
    const xrNo = nextXrNo()
    const tests: LabOrderTest[] = selectedTests.map((t) => {
      const s = testSettings[t.id] ?? { discountPct: 0, gstPct: 0, includedInPackage: false }
      return { testId: t.id, testName: t.name, charges: t.rate, discountPct: s.discountPct, gstPct: s.gstPct, includedInPackage: s.includedInPackage, remarks: notes || undefined }
    })
    const record: ImagingOrder = {
      id: Math.max(0, ...IMAGING_ORDERS.map((o) => o.id)) + 1,
      xrNo,
      patientId: patient.id,
      encounterId: chosenEncounter?.id ?? null,
      doctorId,
      date: new Date().toISOString(),
      tests,
      discount: flatDiscount,
      total,
      paymentMode: mode,
      status: "Pending",
    }
    IMAGING_ORDERS.push(record)
    toast({ title: `Imaging Order ${xrNo} saved` })
    navigate(`/imaging/orders/${record.id}`)
  }

  return (
    <div>
      <PageHeader title="New Imaging Order" subtitle={nextXrNo()} />
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
              <Label>Ordering Doctor</Label>
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
              <Label>Date/Time</Label>
              <Input type="datetime-local" defaultValue={new Date().toISOString().slice(0, 16)} />
            </div>
            <div className="space-y-1.5">
              <Label>Payment Mode</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as PaymentMode)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{MODES.map((m) => <SelectItem key={m} value={m}>{MODE_LABELS[m] ?? m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label>X-Ray / Test</Label>
              <Button type="button" variant="outline" size="sm" onClick={() => setTestDialogOpen(true)}>
                <Plus className="mr-1 h-3.5 w-3.5" /> New Test
              </Button>
            </div>
            <div className="space-y-1.5">
              {IMAGING_TESTS.map((t) => (
                <label key={t.id} className="flex cursor-pointer items-center gap-2 rounded-md border border-border p-2.5 text-sm hover:bg-muted/40">
                  <Checkbox checked={selected.has(t.id)} onCheckedChange={() => toggleTest(t.id)} />
                  <span className="flex-1">{t.name}</span>
                  <span className="font-mono text-[10px] text-secondary">{t.code}</span>
                  <span className="w-20 text-right text-xs font-medium">{formatCurrency(t.rate)}</span>
                </label>
              ))}
            </div>
          </div>

          {selected.size > 0 && (
            <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
              {selectedTests.map((t) => {
                const s = testSettings[t.id] ?? { discountPct: 0, gstPct: 0, includedInPackage: false }
                return (
                  <div key={t.id} className="space-y-1 border-b border-border/60 pb-2 text-xs last:border-0">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{t.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono">{formatCurrency(lineTotal(t))}</span>
                        <button type="button" onClick={() => toggleTest(t.id)}><X className="h-3 w-3 text-danger-600" /></button>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1">Dis%
                        <Input type="number" value={s.discountPct} disabled={s.includedInPackage}
                          onChange={(e) => updateSetting(t.id, { discountPct: Number(e.target.value) })}
                          className="h-6 w-14 px-1.5 text-[11px]" />
                      </span>
                      <span className="flex items-center gap-1">GST%
                        <Input type="number" value={s.gstPct} disabled={s.includedInPackage}
                          onChange={(e) => updateSetting(t.id, { gstPct: Number(e.target.value) })}
                          className="h-6 w-14 px-1.5 text-[11px]" />
                      </span>
                      <label className="flex cursor-pointer items-center gap-1">
                        <Checkbox checked={s.includedInPackage} onCheckedChange={(v) => updateSetting(t.id, { includedInPackage: v === true })} />
                        Package
                      </label>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>Flat Discount (Rs.)</Label>
              <Input type="number" value={flatDiscount} onChange={(e) => setFlatDiscount(Number(e.target.value))} />
            </div>
            <div className="flex flex-col items-end justify-end gap-0.5">
              {grossTotal !== total && <span className="text-xs text-muted-foreground">Gross: {formatCurrency(grossTotal)}</span>}
              <div className="rounded-md bg-accent-50 px-4 py-2 text-right">
                <span className="text-xs text-muted-foreground">Total: </span>
                <span className="text-xl font-bold text-secondary">{formatCurrency(total)}</span>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Remarks / Notes</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={() => navigate(-1)}>Cancel</Button>
        <Button disabled={!patient || selected.size === 0 || !doctorId} onClick={save}>Save Order</Button>
      </div>

      <QuickAddDoctorDialog open={doctorDialogOpen} onClose={() => setDoctorDialogOpen(false)} onCreated={(id) => setDoctorId(id)} />
      <QuickAddLabTestDialog open={testDialogOpen} onClose={() => setTestDialogOpen(false)} onCreated={(id) => toggleTest(id)} defaultCategory="Radiology" />
    </div>
  )
}
