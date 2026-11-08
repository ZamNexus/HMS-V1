"use client"
import * as React from "react"
import { Ban, CalendarClock, CheckCircle2, LogIn, UserX } from "lucide-react"

import { ConflictBanner } from "@/components/shared/ConflictBanner"
import { CreateErrorNote } from "@/components/shared/CreateErrorNote"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/use-toast"
import { isApiError } from "@/lib/api/client"
import { isConflictChanged } from "@/lib/forms/fieldErrors"
import { invalidateFamily } from "@/lib/query/invalidate"
import { APPOINTMENT_LIMITS, appointmentsService, errorSummary, type AppointmentAction, type AppointmentRecord } from "@/lib/services"
import { classifyCreateError, type CreateFailure } from "@/lib/services/createOutcome"
import { useAccess } from "@/lib/session/useAccess"
import { useSubmitGuard } from "@/lib/useSubmitGuard"
import { cn } from "@/lib/utils"
import { CheckInFromAppointmentDialog } from "@/components/visits/CheckInFromAppointmentDialog"
import { ACTION_LABEL, time12, visibleActions } from "./appointmentUi"
import { SchedulingFields, type SchedulingValue } from "./SchedulingFields"

type Failure = Extract<CreateFailure, { kind: "failed" }>
/** Failures that mean "the appointment is no longer what this screen showed": the row is reloaded instead of leaving stale buttons on screen. */
const STALE_CODES = new Set(["APPOINTMENT_NOT_OPEN", "APPOINTMENT_NOT_TODAY", "APPOINTMENT_MISMATCH"])
const ICON: Record<AppointmentAction, React.ComponentType<{ className?: string }>> = { confirm: CheckCircle2, reschedule: CalendarClock, cancel: Ban, no_show: UserX, check_in: LogIn }

/**
 * EXACTLY the buttons in the appointment's `allowedActions` (handoff 8.4: confirm, reschedule, cancel, no_show, check_in), each also needing its
 * permission. Nothing the API would refuse is offered. Check-in (encounters.check_in) opens the visit and completes the appointment in one call.
 */
export function AppointmentActions({ appointment, onChanged, compact = false }: { appointment: AppointmentRecord; onChanged: (saved: AppointmentRecord | null) => void; compact?: boolean }) {
  const { can } = useAccess()
  const { toast } = useToast()
  const { pending, run } = useSubmitGuard()
  const [dialog, setDialog] = React.useState<"reschedule" | "cancel" | "no_show" | "check_in" | null>(null)
  const actions = visibleActions(appointment, can)
  if (actions.length === 0) return null
  const name = appointment.patient.name

  const direct = async (call: () => Promise<AppointmentRecord>, done: string) => {
    await run(async () => {
      try {
        const saved = await call()
        toast({ title: done })
        onChanged(saved)
      } catch (err) {
        const outcome = classifyCreateError(err)
        toast({ variant: "destructive", title: outcome.kind === "failed" ? outcome.heading : "Could not update the appointment", description: errorSummary(err) })
        if (isConflictChanged(err) || (outcome.kind === "failed" && outcome.code && STALE_CODES.has(outcome.code))) onChanged(null) // show what it is now
      }
    })
  }

  const btn = compact ? "h-8 rounded-lg px-2.5 text-xs font-bold" : "h-10 rounded-xl px-4 font-bold"
  return (
    <div className="flex flex-wrap gap-1.5" data-testid={`appointment-actions-${appointment.id}`} onClick={(e) => e.stopPropagation()}>
      {actions.map((a) => {
        const Icon = ICON[a]
        const label = ACTION_LABEL[a]
        const onClick =
          a === "check_in" ? () => setDialog("check_in")
          : a === "confirm" ? () => void direct(() => appointmentsService.confirm(appointment.id), `Appointment ${appointment.appointmentNo} confirmed`)
          : a === "reschedule" ? () => setDialog("reschedule")
          : a === "cancel" ? () => setDialog("cancel")
          : () => setDialog("no_show")
        return (
          <Button key={a} type="button" variant="outline" disabled={pending} aria-label={`${label} ${name}`} onClick={onClick} className={cn(btn, "gap-1.5", a === "cancel" && "text-red-600 hover:bg-red-50")}>
            <Icon className="h-3.5 w-3.5" aria-hidden /> {label}
          </Button>
        )
      })}
      {dialog === "check_in" && <CheckInFromAppointmentDialog appointment={appointment} onClose={() => setDialog(null)} onDone={() => onChanged(null)} />}
      {dialog === "reschedule" && <RescheduleDialog appointment={appointment} onClose={() => setDialog(null)} onChanged={onChanged} />}
      {dialog === "cancel" && <CancelDialog appointment={appointment} onClose={() => setDialog(null)} onChanged={onChanged} />}
      {dialog === "no_show" && (
        <Dialog open onOpenChange={(v) => !v && !pending && setDialog(null)}>
          <DialogContent className="rounded-[1.5rem] sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Mark {name} as a no-show?</DialogTitle>
              <DialogDescription>{time12(appointment.time)} on {appointment.date} with {appointment.doctor.name}. This can only be done once the appointment time has started.</DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2">
              <Button variant="ghost" className="rounded-xl font-bold" disabled={pending} onClick={() => setDialog(null)}>Cancel</Button>
              <Button variant="destructive" className="rounded-xl font-bold" disabled={pending} onClick={() => { setDialog(null); void direct(() => appointmentsService.noShow(appointment.id), "Marked as a no-show") }}>Mark no-show</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

function CancelDialog({ appointment, onClose, onChanged }: { appointment: AppointmentRecord; onClose: () => void; onChanged: (saved: AppointmentRecord | null) => void }) {
  const { toast } = useToast()
  const { pending, run } = useSubmitGuard()
  const [reason, setReason] = React.useState("")
  const [problem, setProblem] = React.useState<string | null>(null)
  const [failure, setFailure] = React.useState<Failure | null>(null)
  const { min, max } = APPOINTMENT_LIMITS.reason
  const submit = async () => {
    const r = reason.trim()
    if (r.length < min || r.length > max) { setProblem(`Give a reason of ${min} to ${max} characters`); return }
    setProblem(null); setFailure(null)
    await run(async () => {
      try {
        const saved = await appointmentsService.cancel(appointment.id, r)
        toast({ title: `Appointment ${appointment.appointmentNo} cancelled` })
        onChanged(saved)
        onClose()
      } catch (err) {
        const outcome = classifyCreateError(err)
        if (outcome.kind === "saved-unreadable") { toast({ title: outcome.message }); onChanged(null); onClose(); return }
        setFailure(outcome)
        if (isConflictChanged(err) || (outcome.code && STALE_CODES.has(outcome.code))) onChanged(null)
      }
    })
  }
  return (
    <Dialog open onOpenChange={(v) => !v && !pending && onClose()}>
      <DialogContent className="rounded-[1.5rem] sm:max-w-md" data-testid="cancel-appointment-dialog">
        <DialogHeader>
          <DialogTitle>Cancel the appointment of {appointment.patient.name}?</DialogTitle>
          <DialogDescription>{time12(appointment.time)} on {appointment.date} with {appointment.doctor.name}. The slot becomes free again.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="cancel-reason" className="text-xs font-bold uppercase tracking-wider text-slate-500">Reason *</Label>
          <Textarea id="cancel-reason" rows={3} maxLength={max} value={reason} onChange={(e) => setReason(e.target.value)} className="rounded-xl bg-slate-50 border-slate-200" />
          {problem && <p role="alert" className="text-xs font-bold text-destructive">{problem}</p>}
        </div>
        {failure && <CreateErrorNote failure={failure} />}
        <DialogFooter className="gap-2">
          <Button variant="ghost" className="rounded-xl font-bold" disabled={pending} onClick={onClose}>Keep it</Button>
          <Button variant="destructive" className="rounded-xl font-bold" disabled={pending} onClick={() => void submit()}>{pending ? "Cancelling…" : "Cancel appointment"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RescheduleDialog({ appointment, onClose, onChanged }: { appointment: AppointmentRecord; onClose: () => void; onChanged: (saved: AppointmentRecord | null) => void }) {
  const { toast } = useToast()
  const { pending, run } = useSubmitGuard()
  const [when, setWhen] = React.useState<SchedulingValue>({ doctorId: appointment.doctor.id, date: appointment.date, time: null })
  const [notes, setNotes] = React.useState(appointment.notes)
  const [failure, setFailure] = React.useState<Failure | null>(null)
  const [stale, setStale] = React.useState<{ requestId: string | null } | null>(null)

  const submit = async () => {
    if (!when.time) return
    setFailure(null)
    await run(async () => {
      try {
        // only what changes is sent; a new day or doctor always comes with the new time
        const saved = await appointmentsService.reschedule(appointment.id, {
          ...(when.doctorId !== appointment.doctor.id ? { doctorId: when.doctorId } : {}),
          ...(when.date !== appointment.date ? { date: when.date } : {}),
          time: when.time as string,
          ...(notes.trim() !== appointment.notes.trim() ? { notes } : {}),
        })
        toast({ title: `Appointment ${appointment.appointmentNo} moved to ${time12(saved.time)} on ${saved.date}` })
        onChanged(saved)
        onClose()
      } catch (err) {
        if (isConflictChanged(err)) { setStale({ requestId: isApiError(err) ? err.requestId : null }); return }
        const outcome = classifyCreateError(err)
        if (outcome.kind === "saved-unreadable") { toast({ title: outcome.message }); onChanged(null); onClose(); return }
        if (outcome.code === "SLOT_TAKEN" || outcome.code === "NOT_A_SLOT" || outcome.code === "SLOT_PASSED") {
          void invalidateFamily("slots")
          setWhen((w) => ({ ...w, time: null }))
        }
        if (outcome.code && STALE_CODES.has(outcome.code)) onChanged(null)
        setFailure(outcome)
      }
    })
  }
  const unchanged = when.time === appointment.time && when.date === appointment.date && when.doctorId === appointment.doctor.id
  return (
    <Dialog open onOpenChange={(v) => !v && !pending && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-[1.5rem] sm:max-w-2xl" data-testid="reschedule-appointment-dialog">
        <DialogHeader>
          <DialogTitle>Reschedule {appointment.patient.name}</DialogTitle>
          <DialogDescription>Now {time12(appointment.time)} on {appointment.date} with {appointment.doctor.name}. Choose a new free time.</DialogDescription>
        </DialogHeader>
        {stale && <ConflictBanner what="appointment" requestId={stale.requestId} onReload={() => { onChanged(null); onClose() }} />}
        <SchedulingFields value={when} onChange={setWhen} idPrefix="resched" />
        <div className="space-y-1.5">
          <Label htmlFor="resched-notes" className="text-xs font-bold uppercase tracking-wider text-slate-500">Notes</Label>
          <Textarea id="resched-notes" rows={2} maxLength={APPOINTMENT_LIMITS.notes} value={notes} onChange={(e) => setNotes(e.target.value)} className="rounded-xl bg-slate-50 border-slate-200" />
        </div>
        {failure && <CreateErrorNote failure={failure} />}
        <DialogFooter className="gap-2">
          <Button variant="ghost" className="rounded-xl font-bold" disabled={pending} onClick={onClose}>Close</Button>
          <Button className="rounded-xl bg-[#0F2A4D] px-6 font-bold text-white hover:bg-[#16375F]" disabled={pending || !when.time || unchanged} onClick={() => void submit()}>{pending ? "Moving…" : "Reschedule"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
