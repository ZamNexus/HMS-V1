"use client"
import * as React from "react"
import { useRouter } from "next/navigation"

import { ActionDialog } from "./ActionDialog"
import { CheckInExtras, emptyExtras } from "./CheckInExtras"
import { time12 } from "@/components/appointments/appointmentUi"
import { visitsService, type AppointmentRecord, type VisitDetail } from "@/lib/services"

/**
 * Check in from an appointment (AP5): ONE call, POST /encounters/opd with the appointment's id. It opens the visit, issues the number and a token,
 * charges the consultation and completes the appointment. The patient and doctor come from the appointment. APPOINTMENT_NOT_TODAY / NOT_OPEN /
 * MISMATCH and the patient and doctor refusals are explained; "changed as it was checked in" reloads the appointment.
 */
export function CheckInFromAppointmentDialog({ appointment, onClose, onDone }: { appointment: AppointmentRecord; onClose: () => void; onDone: (saved: VisitDetail | null) => void }) {
  const router = useRouter()
  const [extras, setExtras] = React.useState(emptyExtras())
  return (
    <ActionDialog
      title="Check in" confirmLabel="Check in" pendingLabel="Checking in…" wide changedWhat="appointment" canConfirm={extras.startedProblem === null}
      description={`${appointment.patient.name} (${appointment.patient.mrNo}) with ${appointment.doctor.name}, ${time12(appointment.time)} on ${appointment.date}. This opens the visit, issues the number and a token, charges the consultation and completes the appointment.`}
      onConfirm={() => visitsService.checkInOpd({
        patientId: appointment.patient.id, doctorId: appointment.doctor.id, appointmentId: appointment.id,
        priority: extras.priority, advisedBy: extras.advisedBy, referredBy: extras.referredBy, reason: extras.reason, startedAt: extras.startedAt,
      })}
      onDone={(saved) => { onDone(saved); if (saved) router.push(`/encounters/${saved.id}`) }}
      onReload={() => onDone(null)} onClose={onClose}
    >
      <CheckInExtras value={extras} onChange={setExtras} idPrefix="appt-checkin" />
    </ActionDialog>
  )
}
