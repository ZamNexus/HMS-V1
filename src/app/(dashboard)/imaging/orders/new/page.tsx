"use client"
import * as React from "react"
import { Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Plus, X } from "lucide-react"

import { demo } from "@hms/demo"
import {
  DEFAULT_PAGE_SIZE, dataSource, encountersService, errorSummary, imagingOrdersService, isImagingTest, labLineTotal, labOrderTotals, type PatientRecord,
} from "@/lib/services"
import { useDoctors, useLabTests, usePatient } from "@/lib/useReferenceData"
import { useResource } from "@/lib/useResource"
import type { PaymentMode } from "@/types"
import { formatCurrency } from "@/lib/utils"
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent } from "@/components/ui/card"
import { useToast } from "@/components/ui/use-toast"
import { OrderForm } from "@/components/diagnostics/OrderForm"
import { dataSource as dxDataSource } from "@/lib/services"

const MODES: PaymentMode[] = ["Cash", "Card", "Bank Transfer", "Insurance", "On Account"]
const MODE_LABELS: Partial<Record<PaymentMode, string>> = { "On Account": "Credit" }

interface TestSettings {
  discountPct: number
  gstPct: number
  includedInPackage: boolean
}

function ImagingOrderFormContent() {
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
  const [mode, setMode] = React.useState<PaymentMode>("Cash")
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [testSettings, setTestSettings] = React.useState<Record<string, TestSettings>>({})
  const [flatDiscount, setFlatDiscount] = React.useState(0)
  const [notes, setNotes] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  const [saveError, setSaveError] = React.useState("")

  // The patient's encounters (optional link) and the test catalogue come from the services / shared hooks.
  const loadEncounters = React.useCallback(
    (signal: AbortSignal) =>
      patient ? encountersService.list({ patientId: patient.id, pageSize: DEFAULT_PAGE_SIZE, signal }) : Promise.resolve({ items: [], total: 0 }),
    [patient]
  )
  const encountersQuery = useResource(loadEncounters)
  const patientEncounters = patient ? (encountersQuery.data?.items ?? []).filter((e) => e.patientId === patient.id) : []
  // A linked encounter that isn't one of this patient's is dropped, as before.
  const chosenEncounter = encounterChoice !== "none" ? patientEncounters.find((e) => e.id === encounterChoice) : undefined

  // Imaging orders pick from the lab catalogue's Radiology/Cardiology tests (the UI's existing rule; whether imaging has
  // its own catalogue is CONTRACT REQUIRED).
  const catalog = useLabTests()
  const imagingTests = catalog.items.filter(isImagingTest)
  const selectedTests = imagingTests.filter((t) => selected.has(t.id))
  const settingsOf = (id: string): TestSettings => testSettings[id] ?? { discountPct: 0, gstPct: 0, includedInPackage: false }
  const lineTotal = (t: (typeof imagingTests)[number]) => labLineTotal(t.rate, settingsOf(t.id))
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
    if (!patient || selectedTests.length === 0 || !doctorId) return
    setSaveError("")
    setSaving(true)
    try {
      const record = await imagingOrdersService.create({
        patientId: patient.id,
        encounterId: chosenEncounter?.id,
        doctorId,
        tests: selectedTests.map((t) => ({ testId: t.id, ...settingsOf(t.id) })),
        flatDiscount,
        paymentMode: mode,
        notes: notes || undefined,
      })
      toast({ title: `Imaging Order ${record.xrNo} saved` })
      router.push(`/imaging/orders/${record.id}`)
    } catch (err) {
      setSaveError(errorSummary(err))
      toast({ variant: "destructive", title: "Could not save the imaging order", description: errorSummary(err) })
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
            <PatientRecordPicker id={`${uid}-patient`} value={patient ?? null} onChange={(p) => { setPicked(p); setEncounterChoice("none") }} />
          </div>

          <PatientInfoPanel patient={patient} />

          {patient && (
            <div className="space-y-1.5">
              <Label htmlFor={`${uid}-opd-ipd-encounter`}>OPD/IPD Encounter</Label>
              <Select value={encounterChoice} onValueChange={setEncounterChoice}>
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
              <Label htmlFor={`${uid}-date-time`}>Date/Time</Label>
              <Input id={`${uid}-date-time`} type="datetime-local" defaultValue={new Date().toISOString().slice(0, 16)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${uid}-payment-mode`}>Payment Mode</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as PaymentMode)}>
                <SelectTrigger id={`${uid}-payment-mode`}><SelectValue /></SelectTrigger>
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
            {catalog.loading && <div role="status" className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">Loading tests…</div>}
            {Boolean(catalog.error) && !catalog.loading && (
              <div role="alert" className="space-y-2 rounded-md border border-dashed border-red-200 p-3 text-xs text-red-600">
                <p>Couldn&apos;t load the test catalogue: {errorSummary(catalog.error)}</p>
                <Button type="button" variant="outline" size="sm" onClick={catalog.reload}>Try again</Button>
              </div>
            )}
            {!catalog.loading && !catalog.error && imagingTests.length === 0 && (
              <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">No imaging tests in the catalogue yet.</div>
            )}
            <div className="space-y-1.5">
              {imagingTests.map((t) => (
                <label key={t.id} className="flex cursor-pointer items-center gap-2 rounded-md border border-border p-2.5 text-sm hover:bg-muted/40">
                  <Checkbox checked={selected.has(t.id)} onCheckedChange={() => toggleTest(t.id)} />
                  <span className="flex-1">{t.name}</span>
                  <span className="font-mono text-[10px] text-secondary">{t.code}</span>
                  <span className="w-20 text-right text-xs font-medium">{formatCurrency(t.rate)}</span>
                </label>
              ))}
            </div>
          </div>

          {selectedTests.length > 0 && (
            <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
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
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor={`${uid}-flat-discount-rs`}>Flat Discount (Rs.)</Label>
              <Input id={`${uid}-flat-discount-rs`} type="number" value={flatDiscount} onChange={(e) => setFlatDiscount(Number(e.target.value))} />
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
            <Label htmlFor={`${uid}-remarks-notes`}>Remarks / Notes</Label>
            <Textarea id={`${uid}-remarks-notes`} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {saveError && <p role="alert" className="mt-4 rounded-md border border-red-100 bg-red-50 p-3 text-sm font-medium text-red-600">{saveError}</p>}

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={() => router.back()}>Cancel</Button>
        <Button disabled={!patient || selectedTests.length === 0 || !doctorId || saving} onClick={save}>{saving ? "Saving…" : "Save Order"}</Button>
      </div>

      <QuickAddDoctorDialog open={doctorDialogOpen} onClose={() => setDoctorDialogOpen(false)} onCreatedRecord={(d) => { doctors.reload(); setChosenDoctorId(d.id) }} />
      <QuickAddLabTestDialog
        open={testDialogOpen}
        onClose={() => setTestDialogOpen(false)}
        defaultCategory="Radiology"
        onCreatedRecord={(t) => {
          catalog.reload()
          if (isImagingTest(t)) toggleTest(t.id)
          else toast({ title: `${t.name} was added under ${t.category}`, description: "Imaging orders list Radiology and Cardiology tests only." })
        }}
      />
    </div>
  )
}

function MockImagingOrderFormPage() {
  return (
    <div>
      <PageHeader title="New Imaging Order" subtitle={dataSource === "mock" ? demo.data.nextXrNo() : "Order number assigned on save"} />
      <Suspense fallback={<div className="p-10 text-center">Loading form...</div>}>
        <ImagingOrderFormContent />
      </Suspense>
    </div>
  )
}

// useSearchParams (the filters in the address bar) needs a Suspense boundary
export default function ImagingOrderFormPage() {
  if (dxDataSource === "api") return <Suspense fallback={<div className="p-10 text-center text-sm text-slate-500">Loading…</div>}><OrderForm kind="imaging" /></Suspense>
  return <MockImagingOrderFormPage />
}
