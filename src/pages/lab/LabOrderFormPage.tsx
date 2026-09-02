import * as React from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { X } from "lucide-react"

import { LAB_ORDERS, nextLabNo } from "@/data/lab"
import { LAB_TESTS, LAB_TEST_CATEGORIES } from "@/data/labTests"
import { DOCTORS } from "@/data/doctors"
import { getPatient } from "@/data/patients"
import { ENCOUNTERS } from "@/data/encounters"
import type { LabOrder, LabOrderTest, Patient } from "@/types"
import { cn, formatCurrency } from "@/lib/utils"
import { PatientPicker } from "@/components/shared/PatientPicker"
import { PageHeader } from "@/components/shared/PageHeader"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Card, CardContent } from "@/components/ui/card"
import { useToast } from "@/components/ui/use-toast"

export function LabOrderFormPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [params] = useSearchParams()

  const [patient, setPatient] = React.useState<Patient | null>(() => {
    const pid = params.get("patientId")
    return pid ? getPatient(Number(pid)) ?? null : null
  })
  const encounterId = params.get("encounterId")
  const [doctorId, setDoctorId] = React.useState<number | undefined>(DOCTORS[0]?.userId)
  const [priority, setPriority] = React.useState<"Normal" | "Urgent">("Normal")
  const [clinicalNotes, setClinicalNotes] = React.useState("")
  const [sampleType, setSampleType] = React.useState("Blood")
  const [selected, setSelected] = React.useState<Set<number>>(new Set())
  const [discount, setDiscount] = React.useState(0)
  const [paymentStatus, setPaymentStatus] = React.useState<"paid" | "unpaid">("unpaid")

  const patientEncounters = patient ? ENCOUNTERS.filter((e) => e.patientId === patient.id) : []
  const selectedTests = LAB_TESTS.filter((t) => selected.has(t.id))
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
    if (!patient || selected.size === 0) return
    const labNo = nextLabNo()
    const tests: LabOrderTest[] = selectedTests.map((t) => ({ testId: t.id, testName: t.name, charges: t.rate, discountPct: 0, gstPct: 0 }))
    const record: LabOrder = {
      id: Math.max(0, ...LAB_ORDERS.map((o) => o.id)) + 1,
      labNo,
      patientId: patient.id,
      encounterId: encounterId ? Number(encounterId) : null,
      doctorId: doctorId!,
      date: new Date().toISOString(),
      priority,
      sampleType,
      sampleId: `SMP-2024-${Math.floor(1000 + Math.random() * 8999)}`,
      clinicalNotes,
      tests,
      discount,
      total,
      paymentStatus,
      status: "Pending",
    }
    LAB_ORDERS.push(record)
    toast({ title: `Lab Order ${labNo} saved` })
    navigate(`/lab/orders/${record.id}`)
  }

  return (
    <div>
      <PageHeader title="New Lab Order" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardContent className="space-y-4 p-6">
            <div className="space-y-1.5">
              <Label>Patient *</Label>
              <PatientPicker value={patient} onChange={setPatient} />
            </div>

            {patientEncounters.length > 0 && (
              <div className="space-y-1.5">
                <Label>Link to Encounter (optional)</Label>
                <Select defaultValue={encounterId ?? "none"}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {patientEncounters.map((e) => <SelectItem key={e.id} value={String(e.id)}>{e.encId} — {e.diagnosis}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Ordering Doctor</Label>
              <Select value={doctorId ? String(doctorId) : undefined} onValueChange={(v) => setDoctorId(Number(v))}>
                <SelectTrigger><SelectValue placeholder="Select doctor" /></SelectTrigger>
                <SelectContent>{DOCTORS.map((d) => <SelectItem key={d.userId} value={String(d.userId)}>{d.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Collection Date/Time</Label>
              <Input type="datetime-local" defaultValue={new Date().toISOString().slice(0, 16)} />
            </div>

            <div className="space-y-1.5">
              <Label>Priority</Label>
              <RadioGroup className="flex gap-4 pt-1" value={priority} onValueChange={(v) => setPriority(v as "Normal" | "Urgent")}>
                {(["Normal", "Urgent"] as const).map((p) => (
                  <div key={p} className="flex items-center gap-1.5"><RadioGroupItem value={p} id={`p-${p}`} /><Label htmlFor={`p-${p}`} className="cursor-pointer font-normal">{p}</Label></div>
                ))}
              </RadioGroup>
            </div>

            <div className="space-y-1.5">
              <Label>Clinical Notes</Label>
              <Textarea rows={2} value={clinicalNotes} onChange={(e) => setClinicalNotes(e.target.value)} />
            </div>

            {selected.size > 0 && (
              <div className="grid grid-cols-1 gap-4 rounded-md border border-border bg-muted/30 p-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Sample Type</Label>
                  <Select value={sampleType} onValueChange={setSampleType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{["Blood", "Urine", "Stool", "Swab", "Sputum", "Other"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5"><Label>Sample ID</Label><Input readOnly value="Auto-generated on save" className="font-mono text-xs" /></div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>Discount (Rs.)</Label><Input type="number" value={discount} onChange={(e) => setDiscount(Number(e.target.value))} /></div>
              <div className="space-y-1.5">
                <Label>Payment Status</Label>
                <Select value={paymentStatus} onValueChange={(v) => setPaymentStatus(v as "paid" | "unpaid")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="paid">Paid</SelectItem><SelectItem value="unpaid">Unpaid</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardContent className="space-y-3 p-6">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Select Tests</h3>
              <span className="font-mono text-sm font-bold text-secondary">{formatCurrency(selectedTests.reduce((s, t) => s + t.rate, 0))}</span>
            </div>
            <Accordion type="multiple" defaultValue={[...LAB_TEST_CATEGORIES]}>
              {LAB_TEST_CATEGORIES.map((cat) => {
                const tests = LAB_TESTS.filter((t) => t.category === cat)
                const selectedInCat = tests.filter((t) => selected.has(t.id)).length
                return (
                  <AccordionItem key={cat} value={cat}>
                    <AccordionTrigger className="text-sm">
                      {cat} <span className="ml-2 text-xs font-normal text-muted-foreground">({selectedInCat}/{tests.length})</span>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-1.5">
                      {tests.map((t) => (
                        <label key={t.id} className={cn("flex cursor-pointer items-center gap-2 rounded-md p-1.5 text-sm hover:bg-muted/50")}>
                          <Checkbox checked={selected.has(t.id)} onCheckedChange={() => toggleTest(t.id)} />
                          <span className="flex-1">{t.name}</span>
                          <span className="font-mono text-[10px] text-secondary">{t.code}</span>
                          <span className="w-16 text-right text-xs text-muted-foreground">{t.turnaroundHours}h</span>
                          <span className="w-16 text-right text-xs font-medium">{formatCurrency(t.rate)}</span>
                        </label>
                      ))}
                    </AccordionContent>
                  </AccordionItem>
                )
              })}
            </Accordion>

            {selected.size > 0 && (
              <div className="sticky bottom-0 space-y-1 rounded-md border border-border bg-white p-3 shadow-sm">
                <p className="text-xs font-semibold text-muted-foreground">Selected ({selected.size})</p>
                {selectedTests.map((t) => (
                  <div key={t.id} className="flex items-center justify-between text-xs">
                    <span>{t.name}</span>
                    <div className="flex items-center gap-2">
                      <span>{formatCurrency(t.rate)}</span>
                      <button onClick={() => toggleTest(t.id)}><X className="h-3 w-3 text-danger-600" /></button>
                    </div>
                  </div>
                ))}
                <div className="flex justify-between border-t border-border pt-1 text-sm font-semibold">
                  <span>Total</span><span className="text-secondary">{formatCurrency(total)}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={() => navigate(-1)}>Cancel</Button>
        <Button disabled={!patient || selected.size === 0 || !doctorId} onClick={save}>Save Order</Button>
      </div>
    </div>
  )
}
