"use client"
import * as React from "react"
import { useQuery } from "@tanstack/react-query"

import { CreateErrorNote } from "@/components/shared/CreateErrorNote"
import { ErrorState } from "@/components/shared/ErrorState"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/components/ui/use-toast"
import { CACHE_CLASSES } from "@/lib/query/cacheClasses"
import { useScopedKey } from "@/lib/query/useScopedKey"
import { APPOINTMENT_LIMITS, doctorScheduleService, WEEK_DAYS, type ScheduleRecord, type WeekDay } from "@/lib/services"
import { classifyCreateError, type CreateFailure } from "@/lib/services/createOutcome"
import { useAccess } from "@/lib/session/useAccess"
import { useSubmitGuard } from "@/lib/useSubmitGuard"

type Failure = Extract<CreateFailure, { kind: "failed" }>
const DAY_LABEL: Record<WeekDay, string> = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" }
const DEFAULTS = { from: "09:00", to: "17:00", slotMinutes: 15 }
const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))

/**
 * A doctor's weekly appointment hours (GET / PUT /doctors/{id}/schedule): the days they see patients, when they start and stop, and how long a slot is.
 * Saving REPLACES the whole schedule. No days takes the doctor off appointments. Appointments already booked are never moved or cancelled; any the new
 * hours no longer cover are flagged "Outside hours". Everyone with doctors.read can look; changing needs users.write.
 */
export function DoctorScheduleDialog({ doctorId, doctorName, onClose }: { doctorId: string; doctorName: string; onClose: () => void }) {
  const key = useScopedKey("schedule", doctorId)
  const q = useQuery({ queryKey: key, queryFn: ({ signal }) => doctorScheduleService.get(doctorId, signal), ...CACHE_CLASSES.record })
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-[1.5rem] sm:max-w-lg" data-testid="doctor-schedule-dialog">
        <DialogHeader>
          <DialogTitle className="text-xl">Appointment hours: {doctorName}</DialogTitle>
          <DialogDescription>The days and hours patients can be booked, and the length of one slot.</DialogDescription>
        </DialogHeader>
        {q.isError && !q.data ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        ) : !q.data ? (
          <div className="space-y-3" role="status" aria-label="Loading schedule"><Skeleton className="h-8 w-full" /><Skeleton className="h-11 w-full" /><Skeleton className="h-11 w-full" /></div>
        ) : (
          <ScheduleForm key={`${q.data.doctorId}:${q.data.days.join()}:${q.data.from}:${q.data.to}:${q.data.slotMinutes}`} doctorId={doctorId} loaded={q.data} onClose={onClose} />
        )}
      </DialogContent>
    </Dialog>
  )
}

function ScheduleForm({ doctorId, loaded, onClose }: { doctorId: string; loaded: ScheduleRecord; onClose: () => void }) {
  const { can } = useAccess()
  const { toast } = useToast()
  const { pending, run } = useSubmitGuard()
  const canWrite = can("users.write")
  const [days, setDays] = React.useState<WeekDay[]>(loaded.days)
  const [from, setFrom] = React.useState(loaded.from ?? DEFAULTS.from)
  const [to, setTo] = React.useState(loaded.to ?? DEFAULTS.to)
  const [slot, setSlot] = React.useState(String(loaded.slotMinutes || DEFAULTS.slotMinutes))
  const [problem, setProblem] = React.useState<string | null>(null)
  const [failure, setFailure] = React.useState<Failure | null>(null)

  const slotMinutes = Number(slot)
  const slotsPerDay = days.length > 0 && Number.isInteger(slotMinutes) && slotMinutes > 0 && minutes(to) > minutes(from) ? Math.floor((minutes(to) - minutes(from)) / slotMinutes) : 0
  const dirty = days.join() !== loaded.days.join() || from !== (loaded.from ?? DEFAULTS.from) || to !== (loaded.to ?? DEFAULTS.to) || slotMinutes !== (loaded.slotMinutes || DEFAULTS.slotMinutes)
  const toggle = (d: WeekDay, on: boolean) => setDays((cur) => WEEK_DAYS.filter((x) => (x === d ? on : cur.includes(x))))

  const save = async () => {
    setFailure(null)
    await run(async () => {
      try {
        await doctorScheduleService.set(doctorId, { days, from, to, slotMinutes })
        toast({ title: days.length === 0 ? "The doctor is now off appointments" : "Appointment hours saved" })
        onClose()
      } catch (err) {
        const outcome = classifyCreateError(err)
        if (outcome.kind === "saved-unreadable") { toast({ title: outcome.message }); onClose(); return }
        // a rule the form checks itself (hours, slot length) comes back as a RangeError before any request
        setProblem(err instanceof RangeError ? err.message : null)
        setFailure(err instanceof RangeError ? null : outcome)
      }
    })
  }
  const { min, max } = APPOINTMENT_LIMITS.slotMinutes
  return (
    <div className="space-y-5">
      <fieldset className="space-y-2" disabled={!canWrite}>
        <legend className="text-xs font-bold uppercase tracking-wider text-slate-500">Days</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {WEEK_DAYS.map((d) => (
            <div key={d} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <Checkbox id={`day-${d}`} checked={days.includes(d)} onCheckedChange={(v) => toggle(d, v === true)} />
              <Label htmlFor={`day-${d}`} className="cursor-pointer text-sm font-medium text-slate-700">{DAY_LABEL[d]}</Label>
            </div>
          ))}
        </div>
      </fieldset>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="sched-from" className="text-xs font-bold uppercase tracking-wider text-slate-500">Opens</Label>
          <Input id="sched-from" type="time" className="h-11 rounded-xl" value={from} disabled={!canWrite} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sched-to" className="text-xs font-bold uppercase tracking-wider text-slate-500">Closes</Label>
          <Input id="sched-to" type="time" className="h-11 rounded-xl" value={to} disabled={!canWrite} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sched-slot" className="text-xs font-bold uppercase tracking-wider text-slate-500">Slot (minutes)</Label>
          <Input id="sched-slot" type="number" inputMode="numeric" min={min} max={max} className="h-11 rounded-xl" value={slot} disabled={!canWrite} onChange={(e) => setSlot(e.target.value)} />
        </div>
      </div>
      <p className="text-sm text-slate-600" data-testid="schedule-summary">
        {days.length === 0
          ? "No days chosen: this doctor is off appointments and no slot can be booked."
          : slotsPerDay > 0 ? `${slotsPerDay} slot${slotsPerDay === 1 ? "" : "s"} of ${slotMinutes} minutes on each chosen day.` : "Check the hours and the slot length."}
      </p>
      {canWrite && <p className="text-xs text-slate-500">Saving replaces the whole schedule. Appointments already booked are not moved or cancelled; any the new hours no longer cover are marked &quot;Outside hours&quot;.</p>}
      {!canWrite && <p className="text-xs text-slate-500">You can look at the hours but not change them.</p>}
      {problem && <p role="alert" className="text-xs font-bold text-destructive">{problem}</p>}
      {failure && <CreateErrorNote failure={failure} />}
      <DialogFooter className="gap-2">
        <Button variant="ghost" className="h-11 rounded-xl font-bold" onClick={onClose} disabled={pending}>{canWrite ? "Cancel" : "Close"}</Button>
        {canWrite && <Button className="h-11 rounded-xl bg-[#0F2A4D] px-6 font-bold text-white hover:bg-[#16375F]" disabled={pending || !dirty} onClick={() => void save()}>{pending ? "Saving…" : "Save hours"}</Button>}
      </DialogFooter>
    </div>
  )
}
