"use client"
import * as React from "react"
import { Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Plus, X } from "lucide-react"

import { nextLabNo } from "@/data/lab"
import { LAB_TEST_CATEGORIES } from "@/data/labTests"
import {
  DEFAULT_PAGE_SIZE, dataSource, encountersService, errorSummary, labLineTotal, labOrderTotals, labOrdersService, type PatientRecord,
} from "@/lib/services"
import { useDoctors, useLabTests, usePatient } from "@/lib/useReferenceData"
import { useResource } from "@/lib/useResource"
import type { PaymentMode } from "@/types"
import { cn, formatCurrency } from "@/lib/utils"
import { PatientRecordPicker } from "@/components/shared/PatientPicker"
import { PatientInfoPanel } from "@/components/shared/PatientInfoPanel"
import { QuickAddDoctorDialog } from "@/components/shared/QuickAddDoctorDialog"
import { QuickAddLabTestDialog } from "@/components/shared/QuickAddLabTestDialog"
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

const MODES: PaymentMode[] = ["Cash", "Card", "Bank Transfer", "Insurance", "On Account"]
const MODE_LABELS: Partial<Record<PaymentMode, string>> = { "On Account": "Credit" }

interface TestSettings {
  discountPct: number
  gstPct: number
  includedInPackage: boolean
}

function LabOrderFormContent() {
  const uid = React.useId()
  const router = useRouter()
  const { toast } = useToast()
  const params = useSearchParams()

  // ?patientId= / ?encounterId= are opaque string ids (never Number()-ed). `picked` overrides the preselected patient once the
  // user chooses/clears one.
  const preselected = usePatient(params?.get("patientId") ?? undefined)
  const [picked, setPicked] = React.useState<PatientRecord | null | undefined>(undefined)
  const patient = picked !== undefined ? picked : preselected.data
  const initialEncounterId = params?.get("encounterId")
  const [encounterChoice, setEncounterChoice] = React.useState<string>(initialEncounterId ?? "none")
  // Doctors come from the shared reference data; the first active doctor is the default until one is chosen.
  const doctors = useDoctors()
  const [chosenDoctorId, setChosenDoctorId] = React.useState<string | undefined>(undefined)
  const doctorId = chosenDoctorId ?? doctors.active[0]?.id
  const [doctorDialogOpen, setDoctorDialogOpen] = React.useState(false)
  const [testDialogOpen, setTestDialogOpen] = React.useState(false)
  const [priority, setPriority] = React.useState<"Normal" | "Urgent">("Normal")
  const [clinicalNotes, setClinicalNotes] = React.useState("")
  const [sampleType, setSampleType] = React.useState("Blood")
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [testSettings, setTestSettings] = React.useState<Record<string, TestSettings>>({})
  const [flatDiscount, setFlatDiscount] = React.useState(0)
  const [mode, setMode] = React.useState<PaymentMode>("Cash")
  const [saving, setSaving] = React.useState(false)
  const [saveError, setSaveError] = React.useState("")

  // The patient's encounters (optional link) and the test catalog come from the services / shared hooks.
  const loadEncounters = React.useCallback(
    (signal: AbortSignal) =>
      patient ? encountersService.list({ patientId: patient.id, pageSize: DEFAULT_PAGE_SIZE, signal }) : Promise.resolve({ items: [], total: 0 }),
    [patient]
  )
  const encountersQuery = useResource(loadEncounters)
  const patientEncounters = patient ? (encountersQuery.data?.items ?? []).filter((e) => e.patientId === patient.id) : []
  // A linked encounter that isn't one of this patient's is dropped, as before.
  const chosenEncounter = encounterChoice !== "none" ? patientEncounters.find((e) => e.id === encounterChoice) : undefined

  const catalog = useLabTests()
  const selectedTests = catalog.items.filter((t) => selected.has(t.id))
  const settingsOf = (id: string): TestSettings => testSettings[id] ?? { discountPct: 0, gstPct: 0, includedInPackage: false }
  const lineTotal = (t: (typeof selectedTests)[number]) => labLineTotal(t.rate, settingsOf(t.id))
  const { grossTotal, total } = labOrderTotals(selectedTests.map((t) => ({ rate: t.rate, ...settingsOf(t.id) })), flatDiscount)

  const toggleTest = (id: string) => {
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

  const updateSetting = (id: string, patch: Partial<TestSettings>) => {
    setTestSettings((prev) => ({ ...prev, [id]: { ...(prev[id] ?? { discountPct: 0, gstPct: 0, includedInPackage: false }), ...patch } }))
  }

  const save = async () => {
    if (!patient || selected.size === 0 || !doctorId) return
    setSaveError("")
    setSaving(true)
    try {
      const record = await labOrdersService.create({
        patientId: patient.id,
        encounterId: chosenEncounter?.id,
        doctorId,
        priority,
        sampleType,
        clinicalNotes,
        tests: selectedTests.map((t) => ({ testId: t.id, ...settingsOf(t.id) })),
        flatDiscount,
        paymentMode: mode,
      })
      toast({ title: `Lab Order ${record.labNo} saved` })
      router.push(`/lab/orders/${record.id}`)
    } catch (err) {
      setSaveError(errorSummary(err))
      toast({ variant: "destructive", title: "Could not save the lab order", description: errorSummary(err) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardContent className="space-y-4 p-6">
            <div className="space-y-1.5">
              <Label htmlFor={`${uid}-patient`}>Patient *</Label>
              <PatientRecordPicker id={`${uid}-patient`} value={patient ?? null} onChange={(p) => { setPicked(p); setEncounterChoice("none") }} />
            </div>

            <PatientInfoPanel patient={patient} />

            {patient && (
              <div className="space-y-1.5">
                <Label htmlFor={`${uid}-link-to-encounter-optional`}>Link to Encounter (optional)</Label>
                <Select value={encounterChoice} onValueChange={setEncounterChoice}>
                  <SelectTrigger id={`${uid}-link-to-encounter-optional`}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {patientEncounters.map((e) => <SelectItem key={e.id} value={e.id}>{e.encId} — {e.diagnosis}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor={`${uid}-ordering-doctor`}>Ordering Doctor</Label>
              <div className="flex gap-2">
                <Select value={doctorId} onValueChange={setChosenDoctorId} disabled={doctors.loading}>
                  <SelectTrigger id={`${uid}-ordering-doctor`}><SelectValue placeholder={doctors.loading ? "Loading doctors…" : "Select doctor"} /></SelectTrigger>
                  <SelectContent>{doctors.active.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
                </Select>
                <Button type="button" variant="outline" size="icon" title="Register new doctor" onClick={() => setDoctorDialogOpen(true)}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {Boolean(doctors.error) && <p role="alert" className="text-xs text-red-600">Doctors unavailable: {errorSummary(doctors.error)}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={`${uid}-collection-date-time`}>Collection Date/Time</Label>
              <Input id={`${uid}-collection-date-time`} type="datetime-local" defaultValue={new Date().toISOString().slice(0, 16)} />
            </div>

            <div className="space-y-1.5">
              <Label id={`${uid}-priority-label`}>Priority</Label>
              <RadioGroup aria-labelledby={`${uid}-priority-label`} className="flex gap-4 pt-1" value={priority} onValueChange={(v) => setPriority(v as "Normal" | "Urgent")}>
                {(["Normal", "Urgent"] as const).map((p) => (
                  <div key={p} className="flex items-center gap-1.5"><RadioGroupItem value={p} id={`p-${p}`} /><Label htmlFor={`p-${p}`} className="cursor-pointer font-normal">{p}</Label></div>
                ))}
              </RadioGroup>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={`${uid}-clinical-notes`}>Clinical Notes</Label>
              <Textarea id={`${uid}-clinical-notes`} rows={2} value={clinicalNotes} onChange={(e) => setClinicalNotes(e.target.value)} />
            </div>

            {selected.size > 0 && (
              <div className="grid grid-cols-1 gap-4 rounded-md border border-border bg-muted/30 p-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor={`${uid}-sample-type`}>Sample Type</Label>
                  <Select value={sampleType} onValueChange={setSampleType}>
                    <SelectTrigger id={`${uid}-sample-type`}><SelectValue /></SelectTrigger>
                    <SelectContent>{["Blood", "Urine", "Stool", "Swab", "Sputum", "Other"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5"><Label htmlFor={`${uid}-sample-id`}>Sample ID</Label><Input id={`${uid}-sample-id`} readOnly value="Auto-generated on save" className="font-mono text-xs" /></div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5"><Label htmlFor={`${uid}-flat-discount-rs`}>Flat Discount (Rs.)</Label><Input id={`${uid}-flat-discount-rs`} type="number" value={flatDiscount} onChange={(e) => setFlatDiscount(Number(e.target.value))} /></div>
              <div className="space-y-1.5">
                <Label htmlFor={`${uid}-payment-mode`}>Payment Mode</Label>
                <Select value={mode} onValueChange={(v) => setMode(v as PaymentMode)}>
                  <SelectTrigger id={`${uid}-payment-mode`}><SelectValue /></SelectTrigger>
                  <SelectContent>{MODES.map((m) => <SelectItem key={m} value={m}>{MODE_LABELS[m] ?? m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardContent className="space-y-3 p-6">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Select Tests</h3>
              <Button type="button" variant="outline" size="sm" onClick={() => setTestDialogOpen(true)}>
                <Plus className="mr-1 h-3.5 w-3.5" /> New Test
              </Button>
            </div>
            {catalog.loading && <div role="status" className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">Loading tests…</div>}
            {Boolean(catalog.error) && !catalog.loading && (
              <div role="alert" className="space-y-2 rounded-md border border-dashed border-red-200 p-3 text-xs text-red-600">
                <p>Couldn&apos;t load the test catalogue: {errorSummary(catalog.error)}</p>
                <Button type="button" variant="outline" size="sm" onClick={catalog.reload}>Try again</Button>
              </div>
            )}
            {!catalog.loading && !catalog.error && catalog.items.length === 0 && (
              <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">No tests in the catalogue yet.</div>
            )}
            <Accordion type="multiple" defaultValue={[...LAB_TEST_CATEGORIES]}>
              {LAB_TEST_CATEGORIES.map((cat) => {
                const tests = catalog.items.filter((t) => t.category === cat)
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
              <div className="sticky bottom-0 space-y-2 rounded-md border border-border bg-white p-3 shadow-sm">
                <p className="text-xs font-semibold text-muted-foreground">Selected ({selected.size})</p>
                {selectedTests.map((t) => {
                  const s = settingsOf(t.id)
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
                <div className="space-y-0.5 border-t border-border pt-1.5 text-xs text-muted-foreground">
                  <div className="flex justify-between"><span>Gross Total</span><span>{formatCurrency(grossTotal)}</span></div>
                  {flatDiscount > 0 && <div className="flex justify-between"><span>Flat Discount</span><span>-{formatCurrency(flatDiscount)}</span></div>}
                </div>
                <div className="flex justify-between border-t border-border pt-1 text-sm font-semibold">
                  <span>Total</span><span className="text-secondary">{formatCurrency(total)}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {saveError && <p role="alert" className="mt-4 rounded-md border border-red-100 bg-red-50 p-3 text-sm font-medium text-red-600">{saveError}</p>}

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={() => router.back()}>Cancel</Button>
        <Button disabled={!patient || selected.size === 0 || !doctorId || saving} onClick={save}>{saving ? "Saving…" : "Save Order"}</Button>
      </div>

      <QuickAddDoctorDialog open={doctorDialogOpen} onClose={() => setDoctorDialogOpen(false)} onCreatedRecord={(d) => { doctors.reload(); setChosenDoctorId(d.id) }} />
      <QuickAddLabTestDialog open={testDialogOpen} onClose={() => setTestDialogOpen(false)} onCreatedRecord={(t) => { catalog.reload(); toggleTest(t.id) }} />
    </>
  )
}

export default function LabOrderFormPage() {
  return (
    <div>
      <PageHeader
        title="New Lab Order"
        subtitle={dataSource === "mock" ? nextLabNo() : "Order number assigned on save"}
      />
      <Suspense fallback={<div className="p-10 text-center">Loading form...</div>}>
        <LabOrderFormContent />
      </Suspense>
    </div>
  )
}
