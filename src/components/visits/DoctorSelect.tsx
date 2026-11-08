"use client"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { errorSummary } from "@/lib/services"
import { useDoctors } from "@/lib/useReferenceData"

const triggerClass = "h-11 rounded-xl bg-slate-50 border-slate-200 focus:bg-white focus:ring-2 focus:ring-[#1CC0CE]/20 focus:border-[#1CC0CE] transition-all"

/** The active doctors (GET /doctors, reference data) as a selector. `value` is the doctor's id ("" = none chosen). */
export function DoctorSelect({ value, onChange, id, ariaLabel }: { value: string; onChange: (id: string) => void; id?: string; ariaLabel?: string }) {
  const doctors = useDoctors()
  // the visit's current doctor may have been deactivated since: keep showing them rather than an empty box
  return (
    <div className="space-y-1">
      <Select value={value} onValueChange={onChange} disabled={doctors.loading}>
        <SelectTrigger id={id} aria-label={ariaLabel} className={triggerClass}><SelectValue placeholder={doctors.loading ? "Loading doctors…" : "Choose a doctor"} /></SelectTrigger>
        <SelectContent>
          {doctors.active.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}{d.specialization ? ` — ${d.specialization}` : ""}</SelectItem>)}
        </SelectContent>
      </Select>
      {Boolean(doctors.error) && <p role="alert" className="text-xs text-red-600">Doctors unavailable: {errorSummary(doctors.error)}</p>}
    </div>
  )
}
