"use client"
import * as React from "react"
import { Archive, HeartOff, RotateCcw, Undo2 } from "lucide-react"

import { CreateErrorNote } from "@/components/shared/CreateErrorNote"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/use-toast"
import { dataSource, patientsService, type PatientRecord } from "@/lib/services"
import { classifyCreateError, SAVED_REFRESHING_MESSAGE, type CreateFailure } from "@/lib/services/createOutcome"
import { useAccess } from "@/lib/session/useAccess"
import { usePatientToday } from "@/lib/usePatientToday"
import { useSubmitGuard } from "@/lib/useSubmitGuard"
import { cn } from "@/lib/utils"

type Failure = Extract<CreateFailure, { kind: "failed" }>
type Open = "archive" | "death" | "revoke" | null

/**
 * Archive / Restore (patients.archive) and Record / Revoke death (patients.record_death), handoff 8.3. Nothing is deleted: archiving hides the
 * record from default searches and keeps it in full. A user only sees the buttons their permissions allow. Each action asks first where it is
 * hard to undo, is sent once, and shows the backend's own message when refused (PATIENT_ADMITTED: discharge first, or record the death through
 * the discharge). Real API only: the demo has no archive or death states.
 */
export function PatientLifecycleActions({
  patient, onChanged, className, buttonClassName,
}: {
  patient: PatientRecord
  /** Called after a successful change with the saved record (the screen reloads, or leaves the page after an archive). */
  onChanged: (action: "archived" | "restored" | "death-recorded" | "death-revoked", saved: PatientRecord | null) => void
  className?: string
  buttonClassName?: string
}) {
  const { can } = useAccess()
  const { toast } = useToast()
  const today = usePatientToday()
  const { pending, run } = useSubmitGuard()
  const [open, setOpen] = React.useState<Open>(null)
  const [failure, setFailure] = React.useState<Failure | null>(null)
  const [deceasedOn, setDeceasedOn] = React.useState("")
  const [dateProblem, setDateProblem] = React.useState<string | null>(null)
  if (dataSource === "mock") return null

  const archived = patient.archived === true
  const deceased = !!patient.deceasedOn
  const canArchive = can("patients.archive")
  const canDeath = can("patients.record_death")
  if (!canArchive && !canDeath) return null

  const close = () => { if (!pending) { setOpen(null); setFailure(null); setDateProblem(null) } }

  async function act(action: "archived" | "restored" | "death-recorded" | "death-revoked", call: () => Promise<PatientRecord | void>, done: string) {
    setFailure(null)
    await run(async () => {
      try {
        const saved = await call()
        toast({ title: done })
        setOpen(null)
        onChanged(action, saved ?? null)
      } catch (err) {
        const outcome = classifyCreateError(err)
        if (outcome.kind === "saved-unreadable") {
          // the server did it but its answer could not be read: say so and let the screen reload (never repeat the action)
          toast({ title: outcome.message === SAVED_REFRESHING_MESSAGE ? "Done. Refreshing the patient." : outcome.message })
          setOpen(null)
          onChanged(action, null)
          return
        }
        setFailure(outcome)
      }
    })
  }

  const restore = async () => {
    setOpen(null)
    await act("restored", () => patientsService.restore(patient.id), `${patient.name} restored`)
  }
  const recordDeath = async () => {
    const d = deceasedOn.trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) { setDateProblem("Enter the date of death"); return }
    if (today !== null && d > today) { setDateProblem("The date of death cannot be in the future"); return }
    if (d < patient.dob) { setDateProblem("The date of death cannot be before the date of birth"); return }
    setDateProblem(null)
    await act("death-recorded", () => patientsService.recordDeath(patient.id, d), "Death recorded")
  }

  const btn = cn("h-10 rounded-xl font-bold", buttonClassName)
  return (
    <div className={cn("flex flex-wrap gap-2", className)} data-testid="patient-lifecycle-actions">
      {canArchive && (archived ? (
        <Button type="button" variant="outline" className={btn} disabled={pending} onClick={() => void restore()}>
          <RotateCcw className="mr-2 h-4 w-4" aria-hidden /> Restore Patient
        </Button>
      ) : (
        <Button type="button" variant="outline" className={btn} disabled={pending} onClick={() => { setFailure(null); setOpen("archive") }}>
          <Archive className="mr-2 h-4 w-4" aria-hidden /> Archive Patient
        </Button>
      ))}
      {canDeath && (deceased ? (
        <Button type="button" variant="outline" className={btn} disabled={pending} onClick={() => { setFailure(null); setOpen("revoke") }}>
          <Undo2 className="mr-2 h-4 w-4" aria-hidden /> Revoke Death
        </Button>
      ) : (
        <Button type="button" variant="outline" className={btn} disabled={pending || archived} title={archived ? "Restore the patient first" : undefined} onClick={() => { setFailure(null); setDeceasedOn(today ?? ""); setDateProblem(null); setOpen("death") }}>
          <HeartOff className="mr-2 h-4 w-4" aria-hidden /> Record Death
        </Button>
      ))}

      <Dialog open={open === "archive"} onOpenChange={(v) => !v && close()}>
        <DialogContent className="sm:max-w-[440px] rounded-[1.5rem]">
          <DialogHeader>
            <DialogTitle>Archive {patient.name}?</DialogTitle>
            <DialogDescription>The record is hidden from default searches and new appointments but kept in full. It can be restored at any time. Nothing is deleted.</DialogDescription>
          </DialogHeader>
          {failure && <CreateErrorNote failure={failure} />}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" className="rounded-xl font-bold" onClick={close} disabled={pending}>Cancel</Button>
            <Button variant="destructive" className="rounded-xl font-bold" disabled={pending} onClick={() => void act("archived", async () => { await patientsService.remove(patient.id) }, `${patient.name} archived`)}>
              {pending ? "Archiving…" : "Archive"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={open === "death"} onOpenChange={(v) => !v && close()}>
        <DialogContent className="sm:max-w-[440px] rounded-[1.5rem]">
          <DialogHeader>
            <DialogTitle>Record the death of {patient.name}</DialogTitle>
            <DialogDescription>The record stays fully viewable, but no new visit can be opened for this patient. A patient who is admitted is recorded through the discharge instead.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="deceased-on" className="text-xs font-bold uppercase tracking-wider text-slate-500">Date of death *</Label>
            <Input id="deceased-on" type="date" className="h-11 rounded-xl" value={deceasedOn} min={patient.dob} max={today ?? undefined} onChange={(e) => setDeceasedOn(e.target.value)} />
            {dateProblem && <p role="alert" className="text-xs font-bold text-destructive">{dateProblem}</p>}
          </div>
          {failure && <CreateErrorNote failure={failure} />}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" className="rounded-xl font-bold" onClick={close} disabled={pending}>Cancel</Button>
            <Button variant="destructive" className="rounded-xl font-bold" disabled={pending} onClick={() => void recordDeath()}>{pending ? "Recording…" : "Record Death"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={open === "revoke"} onOpenChange={(v) => !v && close()}>
        <DialogContent className="sm:max-w-[440px] rounded-[1.5rem]">
          <DialogHeader>
            <DialogTitle>Revoke the recorded death of {patient.name}?</DialogTitle>
            <DialogDescription>Use this only when the death was recorded by mistake. The patient becomes alive again and can be given new visits.</DialogDescription>
          </DialogHeader>
          {failure && <CreateErrorNote failure={failure} />}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" className="rounded-xl font-bold" onClick={close} disabled={pending}>Cancel</Button>
            <Button className="rounded-xl font-bold" disabled={pending} onClick={() => void act("death-revoked", () => patientsService.revokeDeath(patient.id), "Death record revoked")}>{pending ? "Revoking…" : "Revoke Death"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
