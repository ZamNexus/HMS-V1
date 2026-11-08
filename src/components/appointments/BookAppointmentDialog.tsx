"use client"
import * as React from "react"

import { CreateErrorNote } from "@/components/shared/CreateErrorNote"
import { PatientRecordPicker } from "@/components/shared/PatientPicker"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/use-toast"
import { invalidateFamily } from "@/lib/query/invalidate"
import { appointmentsService, APPOINTMENT_LIMITS, type AppointmentRecord, type PatientRecord } from "@/lib/services"
import { classifyCreateError, SAVED_REFRESHING_MESSAGE, type CreateFailure } from "@/lib/services/createOutcome"
import { useHospitalToday } from "@/lib/usePatientToday"
import { useSubmitGuard } from "@/lib/useSubmitGuard"
import { SchedulingFields, type SchedulingValue } from "./SchedulingFields"

type Failure = Extract<CreateFailure, { kind: "failed" }>

/**
 * Book from the slot grid (handoff 8.4). The time is always a FREE slot start chosen from the grid. If another desk wins the slot (409 SLOT_TAKEN)
 * the grid is reloaded, the choice is cleared and the typed notes stay. Nothing is charged at booking. One request per click; an answer that cannot
 * be read is announced as booked and never re-sent.
 */
export function BookAppointmentDialog({ open, onClose, onBooked, initialPatient }: { open: boolean; onClose: () => void; onBooked: (a: AppointmentRecord | null) => void; initialPatient?: PatientRecord | null }) {
  const today = useHospitalToday()
  const { toast } = useToast()
  const { pending, run } = useSubmitGuard()
  const [patient, setPatient] = React.useState<PatientRecord | null>(initialPatient ?? null)
  // the date stays empty until the user picks one: until then it is the hospital's today (which may arrive after the dialog opens)
  const [chosen, setWhen] = React.useState<SchedulingValue>({ doctorId: "", date: "", time: null })
  const when: SchedulingValue = { ...chosen, date: chosen.date || (today ?? "") }
  const [notes, setNotes] = React.useState("")
  const [confirmed, setConfirmed] = React.useState(false)
  const [failure, setFailure] = React.useState<Failure | null>(null)

  const deceased = !!patient?.deceasedOn
  const canBook = !!patient && !patient.archived && !deceased && !!when.doctorId && !!when.date && when.time !== null && !pending
  const submit = async () => {
    if (!patient || !when.time) return
    setFailure(null)
    await run(async () => {
      try {
        const saved = await appointmentsService.book({ patientId: patient.id, doctorId: when.doctorId, date: when.date, time: when.time as string, notes, confirmed })
        toast({ title: `Appointment ${saved.appointmentNo} booked` })
        onBooked(saved)
        onClose()
      } catch (err) {
        const outcome = classifyCreateError(err)
        if (outcome.kind === "saved-unreadable") {
          toast({ title: outcome.message === SAVED_REFRESHING_MESSAGE ? "Booked. Refreshing the list." : outcome.message })
          onBooked(null)
          onClose()
          return
        }
        // another desk took the slot (or it is no longer bookable): reload the grid and make the user choose again; the typed notes stay
        if (outcome.code === "SLOT_TAKEN" || outcome.code === "NOT_A_SLOT" || outcome.code === "SLOT_PASSED") {
          void invalidateFamily("slots")
          setWhen((w) => ({ ...w, time: null }))
        }
        setFailure(outcome)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !pending && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-[1.5rem] sm:max-w-2xl" data-testid="book-appointment-dialog">
        <DialogHeader>
          <DialogTitle className="text-xl">Book Appointment</DialogTitle>
          <DialogDescription>Choose the patient, the doctor and a free time. Nothing is charged until the patient checks in.</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="book-patient" className="text-xs font-bold uppercase tracking-wider text-slate-500">Patient *</Label>
            <PatientRecordPicker id="book-patient" value={patient} onChange={setPatient} />
            {patient?.archived && <p role="alert" className="text-xs font-bold text-destructive">This patient is archived. Restore the patient before booking.</p>}
            {deceased && <p role="alert" className="text-xs font-bold text-destructive">This patient is deceased: no appointment can be booked.</p>}
          </div>
          <SchedulingFields value={when} onChange={setWhen} idPrefix="book" />
          <div className="space-y-1.5">
            <Label htmlFor="book-notes" className="text-xs font-bold uppercase tracking-wider text-slate-500">Notes</Label>
            <Textarea id="book-notes" rows={2} maxLength={APPOINTMENT_LIMITS.notes} value={notes} onChange={(e) => setNotes(e.target.value)} className="rounded-xl bg-slate-50 border-slate-200" />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="book-confirmed" checked={confirmed} onCheckedChange={(v) => setConfirmed(v === true)} />
            <Label htmlFor="book-confirmed" className="cursor-pointer text-sm font-medium text-slate-700">Confirm it now (otherwise it is booked as &quot;requested&quot;)</Label>
          </div>
          {failure && <CreateErrorNote failure={failure} />}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" className="h-11 rounded-xl font-bold" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button className="h-11 rounded-xl bg-[#0F2A4D] px-6 font-bold text-white hover:bg-[#16375F]" disabled={!canBook} onClick={() => void submit()}>{pending ? "Booking…" : "Book Appointment"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
