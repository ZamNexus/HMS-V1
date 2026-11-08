"use client"
import * as React from "react"
import { useSearchParams } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Plus, Search, X } from "lucide-react"

import { InvoiceDetailDialog } from "@/components/billing/InvoicesTab"
import { CreateErrorNote } from "@/components/shared/CreateErrorNote"
import { PatientRecordPicker } from "@/components/shared/PatientPicker"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/use-toast"
import { isApiError } from "@/lib/api/client"
import { isUlid } from "@/lib/api/convert"
import { usePickerOptions } from "@/lib/query/usePickerOptions"
import { scopedKey } from "@/lib/query/scope"
import { useScopedKey } from "@/lib/query/useScopedKey"
import { PM_LIMITS, PM_PAY_MODES, patientsService, pharmacyApiService, visitsService, type PatientRecord, type PmDispense, type PmMedicine, type PmPayMode, type PmPrescription } from "@/lib/services"
import { classifyCreateError, SAVED_REFRESHING_MESSAGE, type CreateFailure } from "@/lib/services/createOutcome"
import { formatInstant } from "@/lib/session/hospital"
import { useAccess } from "@/lib/session/useAccess"
import { useHospital } from "@/lib/session/useHospital"
import { useSubmitGuard } from "@/lib/useSubmitGuard"
import { SlipDialog } from "./SlipAndReturn"
import { PayBill } from "./PayBill"
import { PM_LEVEL_LABEL, draftForRx, draftProblem, emptyDraft, isSubstitute, levelClass, linesToSend, outOfStockNames, shortages, type DraftLine } from "./pmUi"
import { cn } from "@/lib/utils"

type Failure = Extract<CreateFailure, { kind: "failed" }>
const MODE_LABEL: Record<PmPayMode, string> = { cash: "Cash", card: "Card", bank_transfer: "Bank transfer" }

/** Choose a medicine by name: searched from 2 characters after 300 ms, active medicines only, with the server's on-hand figure and level beside each. */
function MedicinePicker({ ariaLabel, onPick }: { ariaLabel: string; onPick: (m: PmMedicine) => void }) {
  const picker = usePickerOptions<PmMedicine>("pharmacyApi", async ({ search, perPage, signal }) => (search ? (await pharmacyApiService.listMedicines({ search, pageSize: perPage, active: true }, signal)).items : []))
  return (
    <div className="space-y-1">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input aria-label={ariaLabel} autoComplete="off" placeholder="Type 2 or more letters of the medicine…" className="h-10 rounded-lg pl-9" value={picker.input} onChange={(e) => picker.onInputChange(e.target.value)} />
      </div>
      {picker.searching && (
        <div className="max-h-40 space-y-0.5 overflow-y-auto rounded-lg border border-slate-200 p-1" data-testid="medicine-options">
          {picker.options.length === 0 ? <p className="p-2 text-xs text-slate-500">{picker.loading ? "Searching…" : "No medicine matches."}</p> : picker.options.map((m) => (
            <button key={m.id} type="button" onClick={() => { onPick(m); picker.onInputChange("") }} className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-slate-50">
              <span className="truncate font-semibold">{m.name}{m.unit ? <span className="ml-1 text-xs font-normal text-slate-500">{m.unit}</span> : null}</span>
              <span className="flex shrink-0 items-center gap-2 text-xs"><span className="tabular-nums text-slate-600">{m.stock.onHand} on hand</span><span className={cn("rounded px-1.5 py-0.5 font-bold", levelClass(m.stock.level))}>{PM_LEVEL_LABEL[m.stock.level]}</span></span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Dispense (PH5, PH6): to a patient, optionally from a visit's prescription ('Load Rx': prescribed, dispensed so far, remaining), or as a counter sale paid in the same step. A line takes
 * what is available: afterwards `requested` is shown against `dispensed`. A line with nothing at all refuses the whole dispense (OUT_OF_STOCK) and names it. First-expire-first-out is the
 * server's job. ONE POST per click. A patient's payment goes through billing (the invoice opens from the result).
 */
export function DispenseScreen() {
  const params = useSearchParams()
  const qc = useQueryClient()
  const { toast } = useToast()
  const { can } = useAccess()
  const { settings } = useHospital()
  const { pending, run, blocked } = useSubmitGuard()
  const canDispense = can("pharmacy.dispense")
  const presetPatient = params.get("patientId")
  const presetVisit = params.get("encounterId")
  const presetKey = useScopedKey("patient", presetPatient ?? null)
  const presetQ = useQuery({ queryKey: presetKey, queryFn: ({ signal }) => patientsService.get(presetPatient as string, signal), enabled: !!presetPatient })
  const [mode, setMode] = React.useState<"patient" | "counter">("patient")
  const [picked, setPicked] = React.useState<PatientRecord | null | undefined>(undefined)
  const patient = picked !== undefined ? picked : (presetQ.data ?? null)
  const [encounterId, setEncounterId] = React.useState(presetVisit && isUlid(presetVisit) ? presetVisit : "")
  const [rx, setRx] = React.useState<PmPrescription | null>(null)
  const [rxProblem, setRxProblem] = React.useState<string | null>(null)
  const [drafts, setDrafts] = React.useState<DraftLine[]>([emptyDraft(1)])
  const next = React.useRef(2)
  const [customer, setCustomer] = React.useState("")
  const [payMode, setPayMode] = React.useState<PmPayMode>("cash")
  const [reference, setReference] = React.useState("")
  const [remarks, setRemarks] = React.useState("")
  const [failure, setFailure] = React.useState<{ failure: Failure; names: string[] } | null>(null)
  const [done, setDone] = React.useState<PmDispense | null>(null)
  const [slip, setSlip] = React.useState(false)
  const [invoice, setInvoice] = React.useState(false)

  const visitsKey = useScopedKey("visits", "forDispense", patient?.id ?? null)
  const visits = useQuery({ queryKey: visitsKey, queryFn: ({ signal }) => visitsService.forPatient(patient?.id as string, { pageSize: 5, signal }), enabled: mode === "patient" && !!patient && can("encounters.read") })

  const loadRx = async (id: string) => {
    setRxProblem(null)
    try {
      const loaded = await qc.fetchQuery({ queryKey: scopedKey("pharmacyApi", "rx", id), queryFn: ({ signal }) => pharmacyApiService.prescription(id, signal), staleTime: 0 })
      setRx(loaded)
      setDrafts(loaded.lines.map((l) => draftForRx(l, next.current++)))
    } catch (err) {
      setRx(null)
      setRxProblem(isApiError(err) ? err.message : "The prescription could not be loaded.")
    }
  }
  const setDraft = (key: number, patch: Partial<DraftLine>) => setDrafts((cur) => cur.map((d) => (d.key === key ? { ...d, ...patch } : d)))
  const problems = drafts.map(draftProblem)
  const lines = linesToSend(drafts)
  const ready = canDispense && lines.length > 0 && problems.every((p) => p === null) && (mode === "counter" ? customer.trim() !== "" : !!patient)
  // a prescription's lines carry its line ids: drop them whenever the patient, the visit or the mode changes, or they would be sent for the wrong patient
  const dropRxLinks = () => { setRx(null); setDrafts((cur) => (cur.some((d) => d.prescriptionLineId || d.rx) ? [emptyDraft(next.current++)] : cur)) }
  const reset = () => { setDone(null); setFailure(null); setRx(null); setDrafts([emptyDraft(next.current++)]); setEncounterId(""); setCustomer(""); setReference(""); setRemarks(""); setPicked(null) }

  const submit = async () => {
    setFailure(null)
    await run(async () => {
      try {
        const saved = await pharmacyApiService.dispense(mode === "counter"
          ? { counterCustomer: customer, lines: lines.map((l) => { const c = { ...l }; delete c.prescriptionLineId; return c }), payment: { mode: payMode, reference }, remarks }
          : { patientId: (patient as PatientRecord).id, encounterId: rx ? rx.encounter.id : (encounterId || undefined), doctorId: rx ? rx.doctor.id : undefined, lines, remarks })
        toast({ title: `${saved.dispenseNo} dispensed` })
        setDone(saved)
      } catch (err) {
        if (err instanceof RangeError || err instanceof TypeError) { setFailure({ failure: { kind: "failed", heading: "Check the dispense", message: err.message, details: [], requestId: null, code: "VALIDATION", status: 0 } as Failure, names: [] }); return }
        const outcome = classifyCreateError(err)
        if (outcome.kind === "saved-unreadable") {
          // the medicines were handed out but the answer could not be read: never send it again; the history, read fresh, shows it
          toast({ title: outcome.message === SAVED_REFRESHING_MESSAGE ? "Saved. Check the history for the slip." : outcome.message })
          reset()
          return
        }
        setFailure({ failure: outcome, names: outcome.code === "OUT_OF_STOCK" && isApiError(err) ? outOfStockNames(err.body?.details) : [] })
      }
    })
  }

  if (!canDispense) return <div className="rounded-2xl bg-white p-10 text-center text-sm text-slate-500 shadow-sm ring-1 ring-black/5" data-testid="no-dispense">Dispensing is not shown to your role.</div>

  if (done) {
    const short = shortages(done)
    return (
      <div className="space-y-4 rounded-[1.5rem] bg-white p-6 shadow-sm ring-1 ring-black/5" data-testid="dispense-result">
        <h2 className="text-xl font-black text-[#0D1B2E]">Dispensed <span className="font-mono text-[#0891B2]" data-testid="result-no">{done.dispenseNo}</span></h2>
        <p className="text-sm text-slate-600">{done.patient ? `${done.patient.name} · ${done.patient.mrNo}` : `${done.counterCustomer ?? "Counter customer"} (counter sale, paid)`} · {settings?.timezone ? formatInstant(done.dispensedAt, settings.timezone) : done.dispensedAt}</p>
        {short.length > 0 && <div role="status" data-testid="short-stock" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-900">Short stock, only part was given: {short.map((s) => `${s.name} ${s.dispensed} of ${s.requested}`).join("; ")}.</div>}
        <ul className="space-y-1 text-sm" data-testid="result-lines">
          {done.lines.map((l) => (
            <li key={l.id} className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
              <span className="font-semibold">{l.name}</span>
              <span className="tabular-nums">{l.dispensed} of {l.requested}<span className="ml-2 text-xs text-slate-500">{l.batches.map((b) => `batch ${b.batchNo} exp ${b.expiryDate}`).join(", ")}</span></span>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <Button className="rounded-xl bg-[#0F2A4D] font-bold text-white hover:bg-[#16375F]" onClick={() => setSlip(true)}>Print slip</Button>
          {done.patient && done.invoice && !can("billing.read") && can("billing.collect_payment") && <PayBill patient={done.patient} invoice={done.invoice} />}
          {done.patient && done.invoice && can("billing.read") && <Button variant="outline" className="rounded-xl font-bold" onClick={() => setInvoice(true)}>Open the bill ({done.invoice.invoiceNo})</Button>}
          <Button variant="ghost" className="rounded-xl font-bold" onClick={reset}>New dispense</Button>
        </div>
        {done.patient && <p className="text-xs text-slate-500">The patient pays for medicines through billing; a counter sale was paid in this step.</p>}
        {slip && <SlipDialog id={done.id} onClose={() => setSlip(false)} />}
        {invoice && done.invoice && <InvoiceDetailDialog id={done.invoice.id} onClose={() => setInvoice(false)} />}
      </div>
    )
  }

  return (
    <div className="space-y-5 rounded-[1.5rem] bg-white p-6 shadow-sm ring-1 ring-black/5" data-testid="dispense-form">
      <div className="flex gap-2" role="tablist" aria-label="Dispense to">
        {(["patient", "counter"] as const).map((m) => <Button key={m} role="tab" aria-selected={mode === m} variant={mode === m ? "default" : "outline"} className="h-10 rounded-xl px-5 font-bold" onClick={() => { setMode(m); setFailure(null); if (m === "counter") { dropRxLinks(); setEncounterId("") } }}>{m === "patient" ? "To a patient" : "Counter sale"}</Button>)}
      </div>

      {mode === "patient" ? (
        <div className="space-y-3">
          <div className="space-y-1.5"><Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Patient *</Label><PatientRecordPicker value={patient} onChange={(p) => { setPicked(p); dropRxLinks(); setEncounterId("") }} id="pm-patient" /></div>
          {patient && can("encounters.read") && (
            <div className="flex flex-wrap items-end gap-2" data-testid="load-rx">
              <div className="space-y-1.5">
                <Label htmlFor="pm-visit" className="text-xs font-bold uppercase tracking-wider text-slate-500">Visit with a prescription</Label>
                <Select value={encounterId || "none"} onValueChange={(v) => { const id = v === "none" ? "" : v; setEncounterId(id); if (rx && rx.encounter.id !== id) dropRxLinks() }}>
                  <SelectTrigger id="pm-visit" aria-label="Visit" className="h-10 w-72 rounded-xl"><SelectValue placeholder="Choose a visit" /></SelectTrigger>
                  <SelectContent><SelectItem value="none">No visit (walk-in for this patient)</SelectItem>{(visits.data?.items ?? []).map((v) => <SelectItem key={v.id} value={v.id}>{v.encId} · {v.date}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <Button type="button" variant="outline" className="h-10 rounded-xl font-bold" disabled={!encounterId} onClick={() => void loadRx(encounterId)}>Load Rx</Button>
            </div>
          )}
          {rxProblem && <p role="alert" data-testid="rx-problem" className="text-sm font-bold text-destructive">{rxProblem}</p>}
          {rx && (
            <div className="rounded-xl border border-teal-200 bg-teal-50/60 p-3 text-sm" data-testid="rx-panel">
              <div className="font-bold">Prescription {rx.encounter.encId} · {rx.doctor.name}</div>
              <ul className="mt-1 space-y-0.5 text-xs">
                {rx.lines.map((l) => <li key={l.id} data-testid={`rx-${l.id}`}>{l.medicineText}{l.dose ? `, ${l.dose}` : ""}{l.frequency ? ` ${l.frequency}` : ""}{l.duration ? ` for ${l.duration}` : ""}: prescribed {l.prescribed ?? "—"}, dispensed so far {l.dispensed}, remaining {l.remaining ?? "—"}{l.medicine && !l.medicine.active ? " (that medicine is deactivated: choose another)" : ""}</li>)}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5 sm:col-span-1"><Label htmlFor="pm-customer" className="text-xs font-bold uppercase tracking-wider text-slate-500">Customer&apos;s name *</Label><Input id="pm-customer" maxLength={PM_LIMITS.counterCustomer} className="h-11 rounded-xl" value={customer} onChange={(e) => setCustomer(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="pm-paymode" className="text-xs font-bold uppercase tracking-wider text-slate-500">Paid by *</Label>
            <Select value={payMode} onValueChange={(v) => setPayMode(v as PmPayMode)}><SelectTrigger id="pm-paymode" aria-label="Payment mode" className="h-11 rounded-xl"><SelectValue /></SelectTrigger><SelectContent>{PM_PAY_MODES.map((m) => <SelectItem key={m} value={m}>{MODE_LABEL[m]}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label htmlFor="pm-reference" className="text-xs font-bold uppercase tracking-wider text-slate-500">Reference</Label><Input id="pm-reference" maxLength={PM_LIMITS.reference} className="h-11 rounded-xl" value={reference} onChange={(e) => setReference(e.target.value)} /></div>
        </div>
      )}

      <div className="space-y-3" data-testid="dispense-lines">
        <div className="flex items-center justify-between"><h2 className="text-sm font-black uppercase tracking-wider text-slate-500">Medicines</h2>
          <Button type="button" variant="outline" size="sm" className="h-9 rounded-lg font-bold" onClick={() => setDrafts((cur) => [...cur, emptyDraft(next.current++)])}><Plus className="mr-1 h-4 w-4" /> Add medicine</Button></div>
        {drafts.map((d, i) => (
          <div key={d.key} className="rounded-xl border border-slate-200 p-3" data-testid={`draft-${i}`}>
            {d.rx && <p className="mb-2 text-xs text-slate-500">Prescription line: {d.rx.text}{d.rx.remaining !== null ? ` (remaining ${d.rx.remaining})` : ""}{isSubstitute(d) && <span className="ml-2 font-bold text-amber-700" data-testid={`substitute-${i}`}>Substitute: sent as an unlinked line</span>}</p>}
            <div className="grid gap-3 sm:grid-cols-[1fr_7rem_1fr_auto]">
              <div>
                {d.medicineId ? (
                  <div className="flex h-10 items-center justify-between rounded-lg bg-slate-50 px-3 text-sm"><span className="font-semibold" data-testid={`draft-name-${i}`}>{d.medicineName}</span><span className="text-xs text-slate-500">{d.onHand !== null ? `${d.onHand} on hand` : ""}</span>
                    <button type="button" aria-label={`Change medicine ${i + 1}`} className="ml-2 text-xs font-bold text-[#0891B2]" onClick={() => setDraft(d.key, { medicineId: "", medicineName: "", onHand: null })}>Change</button></div>
                ) : <MedicinePicker ariaLabel={`Medicine ${i + 1}`} onPick={(m) => setDraft(d.key, { medicineId: m.id, medicineName: m.name, onHand: m.stock.onHand })} />}
              </div>
              <Input aria-label={`Quantity ${i + 1}`} inputMode="numeric" placeholder="Qty" className="h-10 rounded-lg tabular-nums" value={d.quantity} onChange={(e) => setDraft(d.key, { quantity: e.target.value })} />
              <Input aria-label={`Instructions ${i + 1}`} maxLength={PM_LIMITS.instructions} placeholder="Instructions" className="h-10 rounded-lg" value={d.instructions} onChange={(e) => setDraft(d.key, { instructions: e.target.value })} />
              <Button type="button" variant="ghost" size="icon" aria-label={`Remove line ${i + 1}`} className="h-10 w-10" onClick={() => setDrafts((cur) => (cur.length === 1 ? [emptyDraft(next.current++)] : cur.filter((x) => x.key !== d.key)))}><X className="h-4 w-4" /></Button>
            </div>
            {problems[i] && <p role="alert" className="mt-1 text-xs font-bold text-destructive">{problems[i]}</p>}
          </div>
        ))}
      </div>

      <div className="space-y-1.5"><Label htmlFor="pm-remarks" className="text-xs font-bold uppercase tracking-wider text-slate-500">Remarks</Label><Textarea id="pm-remarks" maxLength={PM_LIMITS.remarks} rows={2} className="rounded-xl" value={remarks} onChange={(e) => setRemarks(e.target.value)} /></div>

      {failure && (
        <div className="space-y-2" data-testid="dispense-failure">
          <CreateErrorNote failure={failure.failure} />
          {failure.names.length > 0 && <div data-testid="out-of-stock-names" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-900">Nothing at all in stock for: {failure.names.join(", ")}.</div>}
        </div>
      )}
      <div className="flex justify-end"><Button className="h-11 rounded-xl bg-[#0F2A4D] px-8 font-bold text-white hover:bg-[#16375F]" disabled={!ready || pending || blocked} onClick={() => void submit()}>{pending ? "Dispensing…" : "Dispense"}</Button></div>
    </div>
  )
}
