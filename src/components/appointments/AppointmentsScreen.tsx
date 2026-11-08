"use client"
import * as React from "react"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { format, parseISO } from "date-fns"
import { CalendarDays, CalendarPlus, Search } from "lucide-react"

import { EmptyState } from "@/components/shared/EmptyState"
import { ErrorState } from "@/components/shared/ErrorState"
import { Pagination } from "@/components/shared/Pagination"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { CACHE_CLASSES } from "@/lib/query/cacheClasses"
import { useDebouncedSearch } from "@/lib/query/useDebouncedSearch"
import { useScopedKey } from "@/lib/query/useScopedKey"
import { pageFromUrl, useUrlFilters } from "@/lib/query/useUrlFilters"
import { APPOINTMENT_STATUSES, appointmentsService, formatPhone, type AppointmentListOptions, type AppointmentRecord, type AppointmentStatus } from "@/lib/services"
import { useAccess } from "@/lib/session/useAccess"
import { useHospital } from "@/lib/session/useHospital"
import { useHospitalToday } from "@/lib/usePatientToday"
import { useDoctors } from "@/lib/useReferenceData"
import { cn } from "@/lib/utils"
import { AppointmentActions } from "./AppointmentActions"
import { AppointmentDetailDialog } from "./AppointmentDetailDialog"
import { BookAppointmentDialog } from "./BookAppointmentDialog"
import { STATUS_LABEL, addDays, dateFilterQuery, time12 } from "./appointmentUi"

const PAGE_SIZE = 10
// What is kept in the address bar: the page and non-identifying filters (never a name, phone or MR number; the search box is not one of them).
const URL_KEYS = ["page", "date", "doctor", "status"] as const
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Appointments (handoff 8.4). A worklist: today by default, refreshed every 30 s while open. Filters (day, doctor, status, search) go to the server;
 * the buttons on each row are exactly the appointment's `allowedActions`.
 */
export function AppointmentsScreen() {
  const { can } = useAccess()
  const today = useHospitalToday()
  const hospital = useHospital()
  const doctors = useDoctors()
  const url = useUrlFilters(URL_KEYS)
  const search = useDebouncedSearch()
  const [booking, setBooking] = React.useState(false)
  const [openId, setOpenId] = React.useState<string | null>(null)

  const page = pageFromUrl(url.get("page"))
  const dateChoice = url.get("date")
  const doctorId = url.get("doctor")
  const status = APPOINTMENT_STATUSES.find((s) => s === url.get("status"))
  const options: AppointmentListOptions = { search: search.term, page, pageSize: PAGE_SIZE, doctorId, status, ...(today ? dateFilterQuery(dateChoice, today) : {}) }
  const key = useScopedKey("appointments", "list", { ...options, search: search.term ?? null })
  const list = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => appointmentsService.list({ ...options, signal }),
    ...CACHE_CLASSES.worklist,
    placeholderData: keepPreviousData,
    enabled: today !== null, // the default day is the hospital's today
  })
  const items = list.data?.items ?? []
  const opened = items.find((x) => x.id === openId) ?? null
  const filtered = !!search.term || !!doctorId || !!status
  const setFilter = (patch: Partial<Record<(typeof URL_KEYS)[number], string | undefined>>) => url.set({ ...patch, page: undefined })
  const chosenDay = dateChoice && DATE_RE.test(dateChoice) ? dateChoice : undefined
  const chip = (id: "today" | "tomorrow" | "upcoming" | "all", label: string) => {
    const value = id === "today" ? undefined : id === "tomorrow" && today ? addDays(today, 1) : id === "tomorrow" ? undefined : id
    const active = id === "today" ? !dateChoice || dateChoice === today : id === "tomorrow" ? !!today && dateChoice === addDays(today, 1) : dateChoice === id
    return (
      <button key={id} role="tab" aria-selected={active} onClick={() => setFilter({ date: value })} className={cn("whitespace-nowrap rounded-lg px-4 py-2 text-xs font-bold transition-all", active ? "bg-white text-[#0891B2] shadow-sm ring-1 ring-black/5" : "text-slate-500 hover:bg-slate-200/50 hover:text-slate-700")}>
        {label}
      </button>
    )
  }

  return (
    <div className="space-y-6 pb-10" data-testid="appointments-screen">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-[#0D1B2E]">Appointments</h1>
          <p className="mt-1 text-sm font-medium text-slate-500" data-testid="appointments-count">
            {list.isError && !list.data ? "Appointments unavailable" : list.data ? `${list.data.total} ${filtered ? "matching" : ""} appointments`.replace("  ", " ") : "Loading appointments…"}
          </p>
        </div>
        {can("appointments.write") && (
          <Button className="h-11 rounded-xl border-0 bg-[#0F2A4D] px-6 font-bold text-white shadow-lg shadow-[#0F2A4D]/20 hover:bg-[#16375F]" onClick={() => setBooking(true)}>
            <CalendarPlus className="mr-2 h-5 w-5" /> Book Appointment
          </Button>
        )}
      </div>

      <div className="space-y-3 rounded-[1.25rem] bg-white p-3 shadow-sm ring-1 ring-black/5">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div className="relative w-full max-w-md">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text" aria-label="Search appointments" placeholder="Search by patient name, MR No. or phone..." value={search.input} maxLength={100} autoComplete="off"
              onChange={(e) => { search.onChange(e.target.value); url.set({ page: undefined }) }}
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-4 text-sm font-medium text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-[#1CC0CE] focus:bg-white focus:ring-2 focus:ring-[#1CC0CE]/20"
            />
          </div>
          <div className="flex h-11 items-center gap-1 overflow-x-auto rounded-xl bg-slate-100/80 p-1" role="tablist" aria-label="Day">
            {chip("today", "Today")}{chip("tomorrow", "Tomorrow")}{chip("upcoming", "Upcoming")}{chip("all", "All dates")}
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Day
            <Input type="date" aria-label="Day" className="mt-1 h-10 w-44 rounded-xl border-slate-200 bg-slate-50" value={chosenDay ?? (dateChoice ? "" : today ?? "")} onChange={(e) => setFilter({ date: e.target.value || undefined })} />
          </label>
          <Select value={doctorId ?? "any"} onValueChange={(v) => setFilter({ doctor: v === "any" ? undefined : v })}>
            <SelectTrigger aria-label="Doctor" className="h-10 w-56 rounded-xl border-slate-200 bg-slate-50"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any doctor</SelectItem>
              {doctors.active.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={status ?? "any"} onValueChange={(v) => setFilter({ status: v === "any" ? undefined : v })}>
            <SelectTrigger aria-label="Status" className="h-10 w-44 rounded-xl border-slate-200 bg-slate-50"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any status</SelectItem>
              {APPOINTMENT_STATUSES.map((s: AppointmentStatus) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}
            </SelectContent>
          </Select>
          {filtered && <Button variant="ghost" className="h-10 rounded-xl font-bold text-slate-500" onClick={() => { search.onChange(""); url.set({ doctor: undefined, status: undefined, page: undefined }) }}>Clear filters</Button>}
        </div>
      </div>

      <div className="overflow-hidden rounded-[1.5rem] bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-black/5">
        {today === null && hospital.error ? (
          <div className="p-6"><ErrorState error={hospital.error} onRetry={hospital.reload} /></div>
        ) : list.isError && !list.data ? (
          <div className="p-6"><ErrorState error={list.error} onRetry={() => void list.refetch()} /></div>
        ) : list.isPending ? (
          <div className="space-y-3 p-6" role="status" aria-label="Loading appointments">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}</div>
        ) : items.length === 0 ? (
          <div className="p-10"><EmptyState icon={CalendarDays} title="No appointments" subtitle={filtered ? "Try different filters." : "Nothing is booked for this selection."} /></div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-slate-100 bg-slate-50/50 hover:bg-slate-50/50">
                  <TableHead className="h-auto px-6 py-4 font-bold text-slate-500">When</TableHead>
                  <TableHead className="h-auto py-4 font-bold text-slate-500">Patient</TableHead>
                  <TableHead className="h-auto py-4 font-bold text-slate-500">Doctor</TableHead>
                  <TableHead className="h-auto py-4 font-bold text-slate-500">Status</TableHead>
                  <TableHead className="h-auto px-6 py-4 text-right font-bold text-slate-500">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((a) => <AppointmentRow key={a.id} a={a} onOpen={() => setOpenId(a.id)} onChanged={() => void list.refetch()} />)}
              </TableBody>
            </Table>
          </div>
        )}
        {list.data && (items.length > 0 || page > 1) && (
          <div className="border-t border-slate-100 bg-slate-50/50 p-4">
            <Pagination page={page} pageSize={PAGE_SIZE} total={list.data.total} onPageChange={(n) => url.set({ page: n === 1 ? undefined : String(n) })} itemLabel="appointments" />
          </div>
        )}
      </div>

      {booking && (
        <BookAppointmentDialog open onClose={() => setBooking(false)} onBooked={(saved) => { if (saved) setFilter({ date: saved.date }); else void list.refetch() }} />
      )}
      {opened && <AppointmentDetailDialog appointment={opened} onClose={() => setOpenId(null)} onChanged={() => void list.refetch()} />}
    </div>
  )
}

function AppointmentRow({ a, onOpen, onChanged }: { a: AppointmentRecord; onOpen: () => void; onChanged: () => void }) {
  return (
    <TableRow data-testid={`appointment-row-${a.id}`} className="cursor-pointer border-b border-slate-50 transition-colors last:border-0 hover:bg-slate-50" onClick={onOpen}>
      <TableCell className="px-6 py-4">
        <div className="font-bold text-[#0D1B2E]">{time12(a.time)}</div>
        <div className="text-xs text-slate-500">{format(parseISO(a.date), "EEE dd MMM")} · {a.durationMinutes} min</div>
      </TableCell>
      <TableCell className="py-4">
        <button type="button" className="text-left font-bold text-[#0D1B2E] hover:underline focus-visible:underline" onClick={(e) => { e.stopPropagation(); onOpen() }}>{a.patient.name}</button>
        <div className="text-xs text-slate-500"><span className="font-mono text-[#0891B2]">{a.patient.mrNo}</span> · {formatPhone(a.patient.phone)}</div>
      </TableCell>
      <TableCell className="py-4 text-sm font-medium text-slate-600">{a.doctor.name}</TableCell>
      <TableCell className="py-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge status={STATUS_LABEL[a.status]} />
          {a.outsideSchedule && <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800" title="The doctor's hours changed and no longer cover this time">Outside hours</span>}
        </div>
      </TableCell>
      <TableCell className="px-6 py-4 text-right"><div className="flex justify-end"><AppointmentActions appointment={a} compact onChanged={onChanged} /></div></TableCell>
    </TableRow>
  )
}
