"use client"
import * as React from "react"
import { Plus, X } from "lucide-react"

import { ConflictBanner } from "@/components/shared/ConflictBanner"
import { CreateErrorNote } from "@/components/shared/CreateErrorNote"
import { RestoredNote } from "@/components/shared/RestoredNote"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/use-toast"
import { isApiError } from "@/lib/api/client"
import { isConflictChanged } from "@/lib/forms/fieldErrors"
import { VISIT_LIMITS, visitsService, type ClinicalRecord, type VisitDetail } from "@/lib/services"
import { classifyCreateError, type CreateFailure } from "@/lib/services/createOutcome"
import { useDraftState } from "@/lib/session/useDraftState"
import { useSubmitGuard } from "@/lib/useSubmitGuard"
import { DiagnosisEditor } from "./DiagnosisEditor"
import { diagnosisInputsOf, diagnosisRowsOf, emptyRx, rxInputsOf, rxRowsOf, vitalsSummary, type DiagnosisRow, type RxRow } from "./visitUi"

type Failure = Extract<CreateFailure, { kind: "failed" }>
const area = "rounded-xl bg-slate-50 border-slate-200 focus:bg-white"

/** What the user had typed when they chose "Load latest": shown once so it can be copied into the fresh record. */
export type TypedSnapshot = { label: string; value: string }[]

/**
 * The doctor's record (E4), saved WHOLE with the version this screen loaded. Chief complaint, history, examination, notes and instructions are long
 * text (a session that ends mid-write keeps them in memory and gives them back after sign-in). Diagnoses are ICD-10 codes or text with exactly one
 * primary. Prescription lines keep their id on every save: a line without one is new and a line left out is removed. Medicine names are typed as text
 * until the pharmacy catalogue is connected (the contract allows it). 409 ENCOUNTER_CHANGED keeps everything typed and offers "Load latest".
 */
export function ClinicalRecordForm({ visit, clinical, editable, onSaved, onReload, onDirty }: {
  visit: VisitDetail
  clinical: ClinicalRecord
  editable: boolean
  onSaved: (saved: VisitDetail) => void
  onReload: (typed: { label: string; value: string }[]) => void
  /** Told whether the form holds changes that are not saved (the visit closes from the SAVED record, so Close must not discard them silently). */
  onDirty?: (dirty: boolean) => void
}) {
  const { toast } = useToast()
  const { pending, run } = useSubmitGuard()
  const id = visit.id
  const [chief, setChief, chiefRestored] = useDraftState(`visit-${id}-chief`, clinical.chiefComplaint ?? "")
  const [history, setHistory, historyRestored] = useDraftState(`visit-${id}-history`, clinical.historyOfIllness ?? "")
  const [exam, setExam, examRestored] = useDraftState(`visit-${id}-exam`, clinical.examinationFindings ?? "")
  const [notes, setNotes, notesRestored] = useDraftState(`visit-${id}-notes`, clinical.clinicalNotes ?? "")
  const [instructions, setInstructions, instrRestored] = useDraftState(`visit-${id}-instr`, clinical.generalInstructions ?? "")
  const [followUp, setFollowUp] = React.useState(clinical.followUpDate ?? "")
  const [diagnoses, setDiagnoses] = React.useState<DiagnosisRow[]>(() => diagnosisRowsOf(clinical.diagnoses))
  const [rx, setRx] = React.useState<RxRow[]>(() => rxRowsOf(clinical.prescription))
  const [problem, setProblem] = React.useState<string | null>(null)
  const [failure, setFailure] = React.useState<Failure | null>(null)
  const [stale, setStale] = React.useState<{ requestId: string | null } | null>(null)

  // Unsaved means: any text, the follow-up date, a diagnosis row or a prescription row differs from the saved record (row keys are ignored).
  const sig = (parts: unknown[]) => JSON.stringify(parts, (k, v) => (k === "key" ? undefined : v))
  const savedSig = React.useMemo(() => sig([clinical.chiefComplaint ?? "", clinical.historyOfIllness ?? "", clinical.examinationFindings ?? "", clinical.clinicalNotes ?? "", clinical.generalInstructions ?? "", clinical.followUpDate ?? "", diagnosisRowsOf(clinical.diagnoses), rxRowsOf(clinical.prescription)]), [clinical])
  const dirty = editable && sig([chief, history, exam, notes, instructions, followUp, diagnoses, rx]) !== savedSig
  React.useEffect(() => { onDirty?.(dirty); return () => onDirty?.(false) }, [dirty, onDirty])
  const rowsText = (rows: readonly object[]) => rows.map((r) => Object.entries(r).filter(([k, v]) => k !== "key" && k !== "id" && k !== "icdCodeId" && k !== "medicineId" && typeof v === "string" && v.trim() !== "").map(([, v]) => v).join(" · ")).filter(Boolean).join("\n")
  // what "Load latest" would discard, shown to the user afterwards: the five texts AND the diagnosis and prescription rows
  const typed = () => [
    { label: "Chief complaint", value: chief }, { label: "History of illness", value: history }, { label: "Examination findings", value: exam },
    { label: "Clinical notes", value: notes }, { label: "General instructions", value: instructions },
    { label: "Diagnoses", value: rowsText(diagnoses) }, { label: "Prescription", value: rowsText(rx) },
  ].filter((t) => t.value.trim() !== "")
  const setRxField = (key: string, field: keyof RxRow, value: string) => setRx((rows) => rows.map((r) => (r.key === key ? { ...r, [field]: value } : r)))

  const save = async () => {
    setProblem(null); setFailure(null); setStale(null)
    await run(async () => {
      try {
        const saved = await visitsService.saveClinicalRecord(id, {
          chiefComplaint: chief, historyOfIllness: history, examinationFindings: exam, clinicalNotes: notes, generalInstructions: instructions, followUpDate: followUp || null,
          diagnoses: diagnosisInputsOf(diagnoses), prescription: rxInputsOf(rx),
        }, visit.updatedAt)
        toast({ title: "Clinical record saved" })
        onSaved(saved)
      } catch (err) {
        if (err instanceof RangeError || err instanceof TypeError) { setProblem(err.message); return }
        if (isConflictChanged(err)) { setStale({ requestId: isApiError(err) ? err.requestId : null }); return }
        const outcome = classifyCreateError(err)
        if (outcome.kind === "saved-unreadable") { toast({ title: outcome.message }); onReload([]); return }
        setFailure(outcome)
      }
    })
  }

  const needs = [...(chief.trim() ? [] : ["a chief complaint"]), ...(diagnosisInputsOf(diagnoses).length > 0 ? [] : ["a primary diagnosis"])]
  return (
    <form className="space-y-6" data-testid="clinical-form" onSubmit={(e) => { e.preventDefault(); if (editable) void save() }} noValidate>
      {stale && <ConflictBanner what="clinical record" requestId={stale.requestId} onReload={() => onReload(typed())} />}
      {clinical.latestVitals && (
        <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700" data-testid="latest-vitals"><span className="mr-2 text-xs font-bold uppercase tracking-wider text-slate-500">Latest vitals</span>{vitalsSummary(clinical.latestVitals).join(" · ") || "No measurements"}</div>
      )}
      <fieldset disabled={!editable || pending} className="space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="rec-chief" className="text-xs font-bold uppercase tracking-wider text-slate-500">Chief complaint *</Label>
          <Textarea id="rec-chief" rows={2} maxLength={VISIT_LIMITS.chiefComplaint} value={chief} onChange={(e) => setChief(e.target.value)} className={area} />
          <RestoredNote show={chiefRestored} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rec-history" className="text-xs font-bold uppercase tracking-wider text-slate-500">History of illness</Label>
          <Textarea id="rec-history" rows={3} maxLength={VISIT_LIMITS.historyOfIllness} value={history} onChange={(e) => setHistory(e.target.value)} className={area} />
          <RestoredNote show={historyRestored} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rec-exam" className="text-xs font-bold uppercase tracking-wider text-slate-500">Examination findings</Label>
          <Textarea id="rec-exam" rows={3} maxLength={VISIT_LIMITS.examinationFindings} value={exam} onChange={(e) => setExam(e.target.value)} className={area} />
          <RestoredNote show={examRestored} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Diagnoses (exactly one primary) *</Label>
          <DiagnosisEditor rows={diagnoses} onChange={setDiagnoses} disabled={!editable} idPrefix="record" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rec-notes" className="text-xs font-bold uppercase tracking-wider text-slate-500">Clinical notes</Label>
          <Textarea id="rec-notes" rows={3} maxLength={VISIT_LIMITS.clinicalNotes} value={notes} onChange={(e) => setNotes(e.target.value)} className={area} />
          <RestoredNote show={notesRestored} />
        </div>

        <div className="space-y-2" data-testid="prescription">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Prescription</Label>
            {editable && rx.length < VISIT_LIMITS.prescription && <Button type="button" variant="outline" size="sm" className="rounded-lg" onClick={() => setRx((rows) => [...rows, emptyRx()])}><Plus className="mr-1 h-4 w-4" /> Add medicine</Button>}
          </div>
          {rx.length === 0 && <p className="text-sm text-slate-500">No medicine prescribed.</p>}
          {rx.map((r, i) => (
            <div key={r.key} data-testid={`rx-row-${i}`} className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-6">
              <Input aria-label={`Medicine ${i + 1}`} placeholder="Medicine name" maxLength={VISIT_LIMITS.medicineText} className="col-span-2 h-10 rounded-lg bg-white sm:col-span-2" value={r.medicineText} onChange={(e) => setRxField(r.key, "medicineText", e.target.value)} />
              <Input aria-label={`Dose ${i + 1}`} placeholder="Dose" maxLength={VISIT_LIMITS.lineText} className="h-10 rounded-lg bg-white" value={r.dose} onChange={(e) => setRxField(r.key, "dose", e.target.value)} />
              <Input aria-label={`Route ${i + 1}`} placeholder="Route" maxLength={VISIT_LIMITS.lineText} className="h-10 rounded-lg bg-white" value={r.route} onChange={(e) => setRxField(r.key, "route", e.target.value)} />
              <Input aria-label={`Frequency ${i + 1}`} placeholder="Frequency" maxLength={VISIT_LIMITS.lineText} className="h-10 rounded-lg bg-white" value={r.frequency} onChange={(e) => setRxField(r.key, "frequency", e.target.value)} />
              <Input aria-label={`Duration ${i + 1}`} placeholder="Duration" maxLength={VISIT_LIMITS.lineText} className="h-10 rounded-lg bg-white" value={r.duration} onChange={(e) => setRxField(r.key, "duration", e.target.value)} />
              <Input aria-label={`Quantity ${i + 1}`} type="number" min={1} max={10000} placeholder="Qty" className="h-10 rounded-lg bg-white" value={r.quantity} onChange={(e) => setRxField(r.key, "quantity", e.target.value)} />
              <Input aria-label={`Instructions ${i + 1}`} placeholder="Instructions" maxLength={VISIT_LIMITS.instructions} className="col-span-2 h-10 rounded-lg bg-white sm:col-span-4" value={r.instructions} onChange={(e) => setRxField(r.key, "instructions", e.target.value)} />
              {editable && <Button type="button" variant="ghost" size="sm" aria-label={`Remove medicine ${i + 1}`} className="col-span-2 h-10 justify-self-end text-slate-500 hover:text-red-600 sm:col-span-1" onClick={() => setRx((rows) => rows.filter((x) => x.key !== r.key))}><X className="mr-1 h-4 w-4" /> Remove</Button>}
            </div>
          ))}
          {editable && <p className="text-xs text-slate-500">Medicine names are typed for now; the pharmacy list is connected with the pharmacy module.</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="rec-instr" className="text-xs font-bold uppercase tracking-wider text-slate-500">General instructions</Label>
          <Textarea id="rec-instr" rows={2} maxLength={VISIT_LIMITS.generalInstructions} value={instructions} onChange={(e) => setInstructions(e.target.value)} className={area} />
          <RestoredNote show={instrRestored} />
        </div>
        <div className="space-y-1.5 sm:max-w-xs">
          <Label htmlFor="rec-follow" className="text-xs font-bold uppercase tracking-wider text-slate-500">Follow-up date</Label>
          <Input id="rec-follow" type="date" className="h-11 rounded-xl" value={followUp} onChange={(e) => setFollowUp(e.target.value)} />
        </div>
      </fieldset>

      {problem && <p role="alert" data-testid="record-problem" className="text-sm font-bold text-destructive">{problem}</p>}
      {failure && <CreateErrorNote failure={failure} />}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
        <p className="text-sm" data-testid="record-status">
          {clinical.recordComplete ? <span className="font-bold text-emerald-700">The saved record is complete: the visit can be closed.</span> : <span className="text-slate-600">Not complete yet{needs.length ? `: needs ${needs.join(" and ")}` : ""}.</span>}
        </p>
        {editable && <Button type="submit" className="h-11 rounded-xl bg-[#0F2A4D] px-8 font-bold text-white hover:bg-[#16375F]" disabled={pending}>{pending ? "Saving…" : "Save record"}</Button>}
      </div>
    </form>
  )
}
