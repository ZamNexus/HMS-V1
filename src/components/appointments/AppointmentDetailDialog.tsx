"use client"
import * as React from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { format, parseISO } from "date-fns"
import { AlertTriangle } from "lucide-react"

import { StatusBadge } from "@/components/shared/StatusBadge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { CACHE_CLASSES } from "@/lib/query/cacheClasses"
import { useScopedKey } from "@/lib/query/useScopedKey"
import { appointmentsService, formatPhone, type AppointmentActorRef, type AppointmentRecord } from "@/lib/services"
import { formatInstant } from "@/lib/session/hospital"
import { useHospital } from "@/lib/session/useHospital"
import { AppointmentActions } from "./AppointmentActions"
import { STATUS_LABEL, time12 } from "./appointmentUi"

/** One appointment in full. It is re-read when opened (a record being worked on is never served from the cache) and shows the list row meanwhile. */
export function AppointmentDetailDialog({ appointment, onClose, onChanged }: { appointment: AppointmentRecord; onClose: () => void; onChanged: (saved: AppointmentRecord | null) => void }) {
  const { settings } = useHospital()
  const key = useScopedKey("appointments", "detail", appointment.id)
  const q = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => appointmentsService.get(appointment.id, signal),
    ...CACHE_CLASSES.record,
    placeholderData: appointment,
  })
  const a = q.data ?? appointment
  const when = (iso: string | null) => (iso && settings ? formatInstant(iso, settings.timezone) : "—")
  const step = (label: string, at: string | null, by: AppointmentActorRef | null, extra?: string) =>
    at ? (
      <li className="flex flex-wrap justify-between gap-2 text-sm" key={label}>
        <span className="font-bold text-slate-700">{label}{extra ? <span className="font-normal text-slate-500"> — {extra}</span> : null}</span>
        <span className="text-slate-500">{when(at)}{by ? ` · ${by.name}` : ""}</span>
      </li>
    ) : null
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-[1.5rem] sm:max-w-xl" data-testid="appointment-detail">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2 text-xl">
            <span className="font-mono text-base text-[#0891B2]">{a.appointmentNo}</span>
            <StatusBadge status={STATUS_LABEL[a.status]} />
          </DialogTitle>
        </DialogHeader>
        {a.outsideSchedule && (
          <div role="status" data-testid="outside-schedule" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>The doctor&apos;s hours changed after this was booked and no longer cover this time. It has not been moved or cancelled.</span>
          </div>
        )}
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <div><dt className="text-xs font-bold uppercase tracking-wider text-slate-500">Patient</dt><dd className="font-bold text-[#0D1B2E]"><Link className="hover:underline" href={`/patients/${a.patient.id}`}>{a.patient.name}</Link><div className="font-mono text-xs text-[#0891B2]">{a.patient.mrNo}</div><div className="text-xs text-slate-500">{formatPhone(a.patient.phone)}</div></dd></div>
          <div><dt className="text-xs font-bold uppercase tracking-wider text-slate-500">Doctor</dt><dd className="font-bold text-[#0D1B2E]">{a.doctor.name}</dd></div>
          <div><dt className="text-xs font-bold uppercase tracking-wider text-slate-500">When</dt><dd className="font-bold text-[#0D1B2E]" data-testid="detail-when">{format(parseISO(a.date), "EEE dd MMM yyyy")}, {time12(a.time)} <span className="font-normal text-slate-500">({a.durationMinutes} min)</span></dd></div>
          <div><dt className="text-xs font-bold uppercase tracking-wider text-slate-500">Visit</dt><dd className="font-bold text-[#0D1B2E]">{a.encounter ? <Link className="font-mono hover:underline" href={`/encounters/${a.encounter.id}`}>{a.encounter.encId}</Link> : <span className="font-normal text-slate-500">Not checked in</span>}</dd></div>
          {a.notes && <div className="sm:col-span-2"><dt className="text-xs font-bold uppercase tracking-wider text-slate-500">Notes</dt><dd className="whitespace-pre-line text-slate-700">{a.notes}</dd></div>}
        </dl>
        <ul className="space-y-1.5 border-t border-slate-100 pt-3" aria-label="History of this appointment">
          {step("Booked", a.bookedAt, a.bookedBy)}
          {step("Confirmed", a.confirmedAt, a.confirmedBy)}
          {step("Cancelled", a.cancelledAt, a.cancelledBy, a.cancelReason ?? undefined)}
          {step("No-show", a.noShowAt, a.noShowBy)}
        </ul>
        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          <AppointmentActions appointment={a} onChanged={(saved) => { onChanged(saved); if (saved) onClose() }} />
          <Button variant="ghost" className="h-10 rounded-xl font-bold" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
