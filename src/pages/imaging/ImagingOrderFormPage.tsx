import * as React from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { X } from "lucide-react"

import { IMAGING_ORDERS } from "@/data/imaging"
import { LAB_TESTS } from "@/data/labTests"
import { DOCTORS } from "@/data/doctors"
import { getPatient } from "@/data/patients"
import type { ImagingOrder, LabOrderTest, Patient, PaymentMode } from "@/types"
import { formatCurrency } from "@/lib/utils"
import { PatientPicker } from "@/components/shared/PatientPicker"
import { PageHeader } from "@/components/shared/PageHeader"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent } from "@/components/ui/card"
import { useToast } from "@/components/ui/use-toast"

const MODES: PaymentMode[] = ["Cash", "Card", "Bank Transfer", "Insurance"]
const IMAGING_TESTS = LAB_TESTS.filter((t) => t.category === "Radiology" || t.category === "Cardiology")

export function ImagingOrderFormPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [params] = useSearchParams()

  const [patient, setPatient] = React.useState<Patient | null>(() => {
    const pid = params.get("patientId")
    return pid ? getPatient(Number(pid)) ?? null : null
  })
  const encounterId = params.get("encounterId")
  const [doctorId, setDoctorId] = React.useState<number | undefined>(DOCTORS[0]?.userId)
  const [mode, setMode] = React.useState<PaymentMode>("Cash")
  const [selected, setSelected] = React.useState<Set<number>>(new Set())
  const [discount, setDiscount] = React.useState(0)
  const [notes, setNotes] = React.useState("")

  const selectedTests = IMAGING_TESTS.filter((t) => selected.has(t.id))
  const total = Math.max(0, selectedTests.reduce((s, t) => s + t.rate, 0) - discount)

  const toggleTest = (id: number) => {
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const save = () => {
    if (!patient || selected.size === 0 || !doctorId) return
    const xrNo = `XRY-2024-${String(IMAGING_ORDERS.length + 1).padStart(4, "0")}`
    const tests: LabOrderTest[] = selectedTests.map((t) => ({ testId: t.id, testName: t.name, charges: t.rate, discountPct: 0, gstPct: 0, remarks: notes || undefined }))
    const record: ImagingOrder = {
      id: Math.max(0, ...IMAGING_ORDERS.map((o) => o.id)) + 1,
      xrNo,
      patientId: patient.id,
      encounterId: encounterId ? Number(encounterId) : null,
      doctorId,
      date: new Date().toISOString(),
      tests,
      discount,
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
      <PageHeader title="New Imaging Order" />
      <Card>
        <CardContent className="space-y-5 p-6">
          <div className="space-y-1.5">
            <Label>Patient *</Label>
            <PatientPicker value={patient} onChange={setPatient} />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Ordering Doctor</Label>
              <Select value={doctorId ? String(doctorId) : undefined} onValueChange={(v) => setDoctorId(Number(v))}>
                <SelectTrigger><SelectValue placeholder="Select doctor" /></SelectTrigger>
                <SelectContent>{DOCTORS.map((d) => <SelectItem key={d.userId} value={String(d.userId)}>{d.name}</SelectItem>)}</SelectContent>
              </Select>
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
            <Label className="mb-2 block">X-Ray / Test</Label>
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
            <div className="space-y-1 rounded-md border border-border bg-muted/30 p-3">
              {selectedTests.map((t) => (
                <div key={t.id} className="flex items-center justify-between text-xs">
                  <span>{t.name}</span>
                  <div className="flex items-center gap-2">
                    <span>{formatCurrency(t.rate)}</span>
                    <button onClick={() => toggleTest(t.id)}><X className="h-3 w-3 text-danger-600" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>Discount (Rs.)</Label>
              <input type="number" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={discount} onChange={(e) => setDiscount(Number(e.target.value))} />
            </div>
            <div className="flex items-end justify-end">
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
    </div>
  )
}
