"use client"
import * as React from "react"

import { AppointmentsScreen } from "@/components/appointments/AppointmentsScreen"
import { ComingSoon } from "@/components/shared/ComingSoon"
import { dataSource } from "@/lib/services"

// Against the real API this is the appointment list, booking and actions (Phase 6). The demo has no appointments: it keeps its placeholder.
export default function AppointmentsPage() {
  if (dataSource !== "api") return <ComingSoon title="Appointments are available when the app is connected to the backend" />
  // useSearchParams (filters in the address bar) needs a Suspense boundary
  return (
    <React.Suspense fallback={<div className="p-10 text-center text-sm text-slate-500">Loading appointments…</div>}>
      <AppointmentsScreen />
    </React.Suspense>
  )
}
