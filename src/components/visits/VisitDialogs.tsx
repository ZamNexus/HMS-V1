"use client"
import * as React from "react"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { DISCHARGE_CONDITIONS, VISIT_LIMITS, visitsService, type AdmissionKind, type CheckInCorrection, type DischargeCondition, type VisitDetail, type VisitPriority } from "@/lib/services"
import { ActionDialog } from "./ActionDialog"
import { BedPicker } from "./BedPicker"
import { DiagnosisEditor } from "./DiagnosisEditor"
import { DoctorSelect } from "./DoctorSelect"
import { LateEntryField } from "./LateEntryField"
import { CONDITION_LABEL, diagnosisInputsOf, diagnosisRowsOf, type DiagnosisRow } from "./visitUi"

interface Common { visit: VisitDetail; onClose: () => void; onDone: (saved: VisitDetail | null) => void; onReload: () => void }
const area = "rounded-xl bg-slate-50 border-slate-200"

/** Close an OPD visit. The server needs a chief complaint and a primary diagnosis; if either is missing it says which (shown as a list). */
export function CloseVisitDialog({ visit, unsaved = false, ...c }: Common & { unsaved?: boolean }) {
  return (
    <ActionDialog canConfirm={!unsaved} title="Close visit" description={`Close ${visit.encId} for ${visit.patient.name}? A closed visit is final; only an administrator can reopen it.`} confirmLabel="Close visit" pendingLabel="Closing…" onConfirm={() => visitsService.close(visit.id)} {...c}>
      {unsaved && <p role="status" data-testid="close-unsaved" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-900">The clinical record has changes that are not saved. A visit closes from the SAVED record, so save it first (Clinical record tab), then close.</p>}
    </ActionDialog>
  )
}

/** Cancel or reopen: both need a reason of 3 to 300 characters. */
export function ReasonDialog({ visit, kind, ...c }: Common & { kind: "cancel" | "reopen" }) {
  const [reason, setReason] = React.useState("")
  const cancel = kind === "cancel"
  const { min, max } = VISIT_LIMITS.cancelReason
  return (
    <ActionDialog
      title={cancel ? "Cancel visit" : "Reopen visit"} destructive={cancel} confirmLabel={cancel ? "Cancel visit" : "Reopen visit"} pendingLabel={cancel ? "Cancelling…" : "Reopening…"} canConfirm={reason.trim().length >= min}
      description={cancel ? `Cancel ${visit.encId}? Only possible before the doctor has begun the record. The visit stays on file as cancelled.` : `Reopen ${visit.encId} for correction. The reason is kept on file.`}
      onConfirm={() => (cancel ? visitsService.cancel(visit.id, reason) : visitsService.reopen(visit.id, reason))} {...c}
    >
      <div className="space-y-1.5">
        <Label htmlFor="visit-reason" className="text-xs font-bold uppercase tracking-wider text-slate-500">Reason *</Label>
        <Textarea id="visit-reason" rows={3} maxLength={max} value={reason} onChange={(e) => setReason(e.target.value)} className={area} />
        <p className="text-xs text-slate-500">{min} to {max} characters.</p>
      </div>
    </ActionDialog>
  )
}

/** Archive (entered by mistake) or restore. Nothing is deleted. */
export function ArchiveDialog({ visit, restore, ...c }: Common & { restore: boolean }) {
  return (
    <ActionDialog
      title={restore ? "Restore visit" : "Archive visit"} destructive={!restore} confirmLabel={restore ? "Restore" : "Archive"} pendingLabel={restore ? "Restoring…" : "Archiving…"}
      description={restore ? `Bring ${visit.encId} back into the lists.` : `Archive ${visit.encId}? Use this for a visit entered by mistake. It is hidden from the lists but kept in full, and can be restored.`}
      onConfirm={() => (restore ? visitsService.restore(visit.id) : visitsService.archive(visit.id))} {...c}
    />
  )
}

/** Move an admitted patient to another bed, chosen from the live bed board. */
export function TransferDialog({ visit, ...c }: Common) {
  const [bedId, setBedId] = React.useState<string | null>(null)
  return (
    <ActionDialog title="Transfer to another bed" confirmLabel="Transfer" pendingLabel="Transferring…" canConfirm={bedId !== null} wide
      description={visit.bed ? `${visit.patient.name} is in ${visit.bed.wardName}, bed ${visit.bed.bedNo}. Choose a free bed.` : `Choose a free bed for ${visit.patient.name}.`}
      onConfirm={() => visitsService.transfer(visit.id, bedId as string)} {...c}>
      <BedPicker value={bedId} onChange={setBedId} excludeBedId={visit.bed?.id} />
    </ActionDialog>
  )
}

/** Discharge an admitted patient: diagnoses (exactly one primary), condition, summary, follow-up. "Expired" records a death. */
export function DischargeDialog({ visit, ...c }: Common) {
  const [rows, setRows] = React.useState<DiagnosisRow[]>(() => diagnosisRowsOf(visit.clinical?.diagnoses ?? []))
  const [condition, setCondition] = React.useState<DischargeCondition | "">("")
  const [summary, setSummary] = React.useState("")
  const [followUpDate, setFollowUpDate] = React.useState("")
  const [followUpInstructions, setFollowUpInstructions] = React.useState("")
  const [at, setAt] = React.useState<{ instant: string | undefined; problem: string | null }>({ instant: undefined, problem: null })
  const expired = condition === "expired"
  return (
    <ActionDialog title="Discharge patient" confirmLabel={expired ? "Record death and discharge" : "Discharge"} pendingLabel="Discharging…" destructive={expired} wide
      canConfirm={condition !== "" && rows.length > 0 && at.problem === null}
      description={`Discharge ${visit.patient.name} from ${visit.bed ? `${visit.bed.wardName}, bed ${visit.bed.bedNo}` : visit.encId}. The bed becomes free.`}
      onConfirm={() => {
        if (condition === "") throw new TypeError("Choose the condition on discharge.")
        return visitsService.discharge(visit.id, {
          dischargedAt: at.instant, diagnoses: diagnosisInputsOf(rows), conditionOnDischarge: condition, dischargeSummary: summary, followUpDate: followUpDate || undefined, followUpInstructions,
        })
      }} {...c}>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Discharge diagnoses *</Label>
          <DiagnosisEditor rows={rows} onChange={setRows} idPrefix="discharge" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="discharge-condition" className="text-xs font-bold uppercase tracking-wider text-slate-500">Condition on discharge *</Label>
          <Select value={condition || undefined} onValueChange={(v) => setCondition(v as DischargeCondition)}>
            <SelectTrigger id="discharge-condition" className="h-11 rounded-xl bg-slate-50"><SelectValue placeholder="Choose the condition" /></SelectTrigger>
            <SelectContent>{DISCHARGE_CONDITIONS.map((x) => <SelectItem key={x} value={x}>{CONDITION_LABEL[x]}</SelectItem>)}</SelectContent>
          </Select>
          {expired && <p role="status" data-testid="expired-note" className="text-xs font-bold text-red-700">Choosing &quot;Expired&quot; records the patient&apos;s death.</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="discharge-summary" className="text-xs font-bold uppercase tracking-wider text-slate-500">Discharge summary</Label>
          <Textarea id="discharge-summary" rows={4} maxLength={VISIT_LIMITS.dischargeSummary} value={summary} onChange={(e) => setSummary(e.target.value)} className={area} />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="discharge-follow-date" className="text-xs font-bold uppercase tracking-wider text-slate-500">Follow-up date</Label>
            <Input id="discharge-follow-date" type="date" className="h-11 rounded-xl" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="discharge-follow-instr" className="text-xs font-bold uppercase tracking-wider text-slate-500">Follow-up instructions</Label>
            <Input id="discharge-follow-instr" className="h-11 rounded-xl" maxLength={VISIT_LIMITS.followUpInstructions} value={followUpInstructions} onChange={(e) => setFollowUpInstructions(e.target.value)} />
          </div>
        </div>
        <LateEntryField label="Discharged earlier than now" idPrefix="discharge-at" onChange={(instant, problem) => setAt({ instant, problem })} />
        {at.problem && <p role="alert" className="text-xs font-bold text-destructive">{at.problem}</p>}
      </div>
    </ActionDialog>
  )
}

/** Correct the check-in or admission details. Only what changes is sent, with the version this screen loaded (ENCOUNTER_CHANGED if someone else saved first). */
export function CorrectCheckInDialog({ visit, ...c }: Common) {
  const [doctorId, setDoctorId] = React.useState(visit.doctor.id)
  const [priority, setPriority] = React.useState<VisitPriority>(visit.priority)
  const [advisedBy, setAdvisedBy] = React.useState(visit.advisedBy ?? "")
  const [referredBy, setReferredBy] = React.useState(visit.referredBy ?? "")
  const [reason, setReason] = React.useState(visit.reason ?? "")
  const [admission, setAdmission] = React.useState<AdmissionKind | "">(visit.admissionType ?? "")
  const [at, setAt] = React.useState<{ instant: string | undefined; problem: string | null }>({ instant: undefined, problem: null })
  const patch = (): CheckInCorrection => {
    const p: CheckInCorrection = {}
    if (doctorId !== visit.doctor.id) p.doctorId = doctorId
    if (priority !== visit.priority) p.priority = priority
    const text = (now: string, was: string | null): string | null | undefined => (now.trim() === (was ?? "") ? undefined : now.trim() === "" ? null : now)
    const a = text(advisedBy, visit.advisedBy); if (a !== undefined) p.advisedBy = a
    const r = text(referredBy, visit.referredBy); if (r !== undefined) p.referredBy = r
    const why = text(reason, visit.reason); if (why !== undefined) p.reason = why
    if (visit.type === "ipd" && admission && admission !== visit.admissionType) p.admissionType = admission
    if (at.instant) p.startedAt = at.instant
    return p
  }
  return (
    <ActionDialog title={visit.type === "ipd" ? "Correct admission details" : "Correct check-in"} confirmLabel="Save correction" pendingLabel="Saving…" wide canConfirm={at.problem === null}
      description={`${visit.encId} for ${visit.patient.name}. Only what you change is saved.`}
      onConfirm={() => visitsService.correctCheckIn(visit.id, patch(), visit.updatedAt)} {...c}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Doctor</Label>
          <DoctorSelect value={doctorId} onChange={setDoctorId} ariaLabel="Doctor" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fix-priority" className="text-xs font-bold uppercase tracking-wider text-slate-500">Priority</Label>
          <Select value={priority} onValueChange={(v) => setPriority(v as VisitPriority)}>
            <SelectTrigger id="fix-priority" className="h-11 rounded-xl bg-slate-50"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="normal">Normal</SelectItem><SelectItem value="urgent">Urgent</SelectItem></SelectContent>
          </Select>
        </div>
        {visit.type === "ipd" && (
          <div className="space-y-1.5">
            <Label htmlFor="fix-admission" className="text-xs font-bold uppercase tracking-wider text-slate-500">Admission type</Label>
            <Select value={admission || undefined} onValueChange={(v) => setAdmission(v as AdmissionKind)}>
              <SelectTrigger id="fix-admission" className="h-11 rounded-xl bg-slate-50"><SelectValue placeholder="Choose" /></SelectTrigger>
              <SelectContent><SelectItem value="emergency">Emergency</SelectItem><SelectItem value="planned">Planned</SelectItem></SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-1.5"><Label htmlFor="fix-advised" className="text-xs font-bold uppercase tracking-wider text-slate-500">Advised by</Label><Input id="fix-advised" className="h-11 rounded-xl" maxLength={VISIT_LIMITS.advisedBy} value={advisedBy} onChange={(e) => setAdvisedBy(e.target.value)} /></div>
        <div className="space-y-1.5"><Label htmlFor="fix-referred" className="text-xs font-bold uppercase tracking-wider text-slate-500">Referred by</Label><Input id="fix-referred" className="h-11 rounded-xl" maxLength={VISIT_LIMITS.referredBy} value={referredBy} onChange={(e) => setReferredBy(e.target.value)} /></div>
        <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="fix-reason" className="text-xs font-bold uppercase tracking-wider text-slate-500">Reason for the visit</Label><Textarea id="fix-reason" rows={2} maxLength={VISIT_LIMITS.reason} value={reason} onChange={(e) => setReason(e.target.value)} className={area} /></div>
        <div className="sm:col-span-2"><LateEntryField label="Change the check-in time" idPrefix="fix-at" onChange={(instant, problem) => setAt({ instant, problem })} /></div>
        {at.problem && <p role="alert" className="text-xs font-bold text-destructive sm:col-span-2">{at.problem}</p>}
      </div>
    </ActionDialog>
  )
}
