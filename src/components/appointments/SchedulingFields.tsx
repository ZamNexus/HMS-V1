"use client"
import * as React from "react"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { errorSummary } from "@/lib/services"
import { useDoctors } from "@/lib/useReferenceData"
import { useHospitalToday } from "@/lib/usePatientToday"
import { SlotGrid } from "./SlotGrid"

const inputClass = "h-11 rounded-xl bg-slate-50 border-slate-200 focus:bg-white focus:ring-2 focus:ring-[#1CC0CE]/20 focus:border-[#1CC0CE] transition-all"

export interface SchedulingValue { doctorId: string; date: string; time: string | null }

/**
 * Doctor, day and a free time: the three things a booking and a reschedule both need. The doctor list is reference data (active doctors,
 * GET /doctors); the day cannot be before the hospital's today; the time is chosen from that doctor's slot grid only.
 */
export function SchedulingFields({ value, onChange, idPrefix }: { value: SchedulingValue; onChange: (next: SchedulingValue) => void; idPrefix: string }) {
  const doctors = useDoctors()
  const today = useHospitalToday()
  const setTime = React.useCallback((time: string | null) => onChange({ ...value, time }), [onChange, value])
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-doctor`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Doctor *</Label>
          <Select value={value.doctorId || undefined} onValueChange={(v) => onChange({ ...value, doctorId: v, time: null })} disabled={doctors.loading}>
            <SelectTrigger id={`${idPrefix}-doctor`} className={inputClass}><SelectValue placeholder={doctors.loading ? "Loading doctors…" : "Choose a doctor"} /></SelectTrigger>
            <SelectContent>
              {doctors.active.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}{d.specialization ? ` — ${d.specialization}` : ""}</SelectItem>)}
            </SelectContent>
          </Select>
          {Boolean(doctors.error) && <p role="alert" className="text-xs text-red-600">Doctors unavailable: {errorSummary(doctors.error)}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-date`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Date *</Label>
          <Input id={`${idPrefix}-date`} type="date" className={inputClass} value={value.date} min={today ?? undefined} onChange={(e) => onChange({ ...value, date: e.target.value, time: null })} />
        </div>
      </div>
      <div className="space-y-1.5">
        <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Time *</div>
        {!value.doctorId || !/^\d{4}-\d{2}-\d{2}$/.test(value.date) ? (
          <p className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">Choose a doctor and a date to see the free times.</p>
        ) : (
          <SlotGrid doctorId={value.doctorId} date={value.date} selected={value.time} onSelect={setTime} />
        )}
      </div>
    </div>
  )
}
