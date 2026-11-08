"use client"
import Link from "next/link"
import { format, parseISO } from "date-fns"
import { useQuery } from "@tanstack/react-query"
import { CalendarCheck, ChevronRight } from "lucide-react"

import { STATUS_LABEL } from "@/components/appointments/appointmentUi"
import { EmptyState } from "@/components/shared/EmptyState"
import { ErrorState } from "@/components/shared/ErrorState"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { CACHE_CLASSES } from "@/lib/query/cacheClasses"
import { useScopedKey } from "@/lib/query/useScopedKey"
import { appointmentsService, patientsService } from "@/lib/services"
import { useAccess } from "@/lib/session/useAccess"
import { useHospital } from "@/lib/session/useHospital"
import { useHospitalToday } from "@/lib/usePatientToday"
import { initials } from "@/lib/utils"

/** Enough for a day's list on the home screen; the full day is on the Appointments screen. */
export const UP_NEXT_ROWS = 8
/** The dashboard asks for just the five newest patients (handoff 8.11: GET /patients?perPage=5): the prototype fetched a page of 100 and sorted it in the browser. */
export const RECENT_PATIENTS_ROWS = 5

/** Today's appointments (D1b; handoff 8.11: GET /appointments?date=<today>, appointments.read) in the server's order, polled like any worklist. */
function UpNext() {
  const today = useHospitalToday()
  const hospital = useHospital()
  const key = useScopedKey("appointments", "dashboard-up-next", today)
  const q = useQuery({ queryKey: key, queryFn: ({ signal }) => appointmentsService.list({ date: today as string, page: 1, pageSize: UP_NEXT_ROWS, signal }), ...CACHE_CLASSES.worklist, enabled: today !== null })
  return (
    <div className="flex flex-col overflow-hidden rounded-[1.5rem] bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-black/5 lg:col-span-2" data-testid="dashboard-up-next">
      <div className="flex items-center justify-between border-b border-slate-100 p-6 pb-4">
        <div>
          <h2 className="text-xl font-black tracking-tight text-[#0D1B2E]">Up Next</h2>
          <p className="mt-0.5 text-sm font-bold uppercase tracking-wider text-slate-400">Today&apos;s scheduled appointments</p>
        </div>
        <Button variant="ghost" className="hidden rounded-xl px-4 font-black text-[#0891B2] hover:bg-[#1CC0CE]/10 sm:flex" asChild>
          <Link href="/appointments">View Full Schedule <ChevronRight className="ml-1 h-4 w-4" /></Link>
        </Button>
      </div>
      {today === null && hospital.error ? <div className="p-4"><ErrorState error={hospital.error} onRetry={hospital.reload} /></div>
        : q.isError ? <div className="p-4"><ErrorState error={q.error} onRetry={() => void q.refetch()} /></div>
        : q.isPending ? <div className="space-y-3 p-6" role="status" aria-label="Loading today's schedule">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}</div>
        : q.data.items.length === 0 ? <EmptyState icon={CalendarCheck} title="No appointments today" />
        : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100 bg-slate-50/80">
                <tr>
                  <th className="px-6 py-4 text-left text-[11px] font-black uppercase tracking-wider text-slate-500">Time</th>
                  <th className="px-6 py-4 text-left text-[11px] font-black uppercase tracking-wider text-slate-500">Patient</th>
                  <th className="hidden px-6 py-4 text-left text-[11px] font-black uppercase tracking-wider text-slate-500 sm:table-cell">Doctor</th>
                  <th className="px-6 py-4 text-right text-[11px] font-black uppercase tracking-wider text-slate-500">Status</th>
                </tr>
              </thead>
              <tbody>
                {q.data.items.map((a) => (
                  <tr key={a.id} data-testid={`up-next-${a.id}`} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                    <td className="px-6 py-4 font-mono font-bold text-[#0D1B2E]">{a.time}</td>
                    <td className="px-6 py-4">
                      <Link href={`/patients/${a.patient.id}`} className="block font-bold text-[#0D1B2E] hover:text-[#0891B2] hover:underline">{a.patient.name}</Link>
                      <div className="font-mono text-[11px] font-semibold text-slate-400">{a.patient.mrNo}</div>
                    </td>
                    <td className="hidden px-6 py-4 font-bold text-slate-600 sm:table-cell">{a.doctor.name}</td>
                    <td className="px-6 py-4 text-right"><StatusBadge status={STATUS_LABEL[a.status]} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {q.data.total > q.data.items.length && <p className="px-6 py-3 text-xs font-semibold text-slate-500" data-testid="up-next-more">Showing {q.data.items.length} of {q.data.total} appointments today</p>}
          </div>
        )}
    </div>
  )
}

/** The five newest patients (D1b; GET /patients?perPage=5, patients.read), in the server's newest-first order. */
function RecentPatients() {
  const key = useScopedKey("patients", "dashboard-recent")
  const q = useQuery({ queryKey: key, queryFn: ({ signal }) => patientsService.list({ page: 1, pageSize: RECENT_PATIENTS_ROWS, signal }), ...CACHE_CLASSES.worklist })
  return (
    <div className="flex flex-col overflow-hidden rounded-[1.5rem] bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-black/5" data-testid="dashboard-recent">
      <div className="border-b border-slate-100 p-6 pb-4"><h2 className="text-xl font-black tracking-tight text-[#0D1B2E]">Recently Registered</h2></div>
      <div className="flex-1 space-y-2 bg-slate-50/50 p-4">
        {q.isError ? <ErrorState error={q.error} onRetry={() => void q.refetch()} />
          : q.isPending ? <div className="space-y-3" role="status" aria-label="Loading recent patients">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-16 w-full rounded-2xl" />)}</div>
          : q.data.items.length === 0 ? <EmptyState icon={CalendarCheck} title="No patients yet" />
          : q.data.items.map((p) => (
            <Link key={p.id} href={`/patients/${p.id}`} data-testid={`recent-${p.id}`} className="group flex items-center gap-4 rounded-2xl bg-white p-3 ring-1 ring-slate-100 transition-all duration-300 hover:shadow-md hover:ring-black/5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-slate-100 text-sm font-black text-[#0D1B2E] shadow-inner group-hover:bg-[#0F2A4D] group-hover:text-white">{initials(p.name)}</div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-black text-[#0D1B2E] group-hover:text-[#0891B2]">{p.name}</div>
                <div className="mt-0.5 font-mono text-[11px] font-bold text-slate-400">{p.mrNo}</div>
              </div>
              <div className="shrink-0 text-right text-[11px] font-bold text-slate-400">{format(parseISO(p.registrationDate), "dd MMM yyyy")}</div>
            </Link>
          ))}
      </div>
      <div className="border-t border-slate-100 bg-white p-4"><Button variant="ghost" className="h-11 w-full rounded-xl font-black text-[#0F2A4D] hover:bg-slate-50" asChild><Link href="/patients">View All Patients</Link></Button></div>
    </div>
  )
}

/** The two home-screen widgets that come from their own lists (D1b). Each is shown only to a user who may read what it lists; with neither permission nothing is drawn. */
export function DashboardListsApi() {
  const { can } = useAccess()
  const schedule = can("appointments.read")
  const recent = can("patients.read")
  if (!schedule && !recent) return null
  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-3" data-testid="dashboard-lists">
      {schedule && <UpNext />}
      {recent && <RecentPatients />}
    </div>
  )
}
