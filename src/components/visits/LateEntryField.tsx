"use client"
import * as React from "react"

import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { hospitalInstant, hospitalWallClock } from "@/lib/services"
import { useHospital } from "@/lib/session/useHospital"
import { addDays } from "@/components/appointments/appointmentUi"

/**
 * "It happened earlier" (handoff 8.5: check-in, vitals and discharge times default to now and may be entered at most 7 days back, never in the future).
 * The user types a date and a time on the HOSPITAL's clock; the value handed up is the exact ISO instant, or undefined meaning "now". The limits are
 * the hospital's: the date runs from 7 days before its today up to its today, and today's time cannot be later than the hospital's clock now.
 */
export function LateEntryField({ label, onChange, idPrefix }: { label: string; onChange: (instant: string | undefined, problem: string | null) => void; idPrefix: string }) {
  const { settings } = useHospital()
  const [earlier, setEarlier] = React.useState(false)
  const [date, setDate] = React.useState("")
  const [time, setTime] = React.useState("")
  const today = settings?.today
  const zone = settings?.timezone
  const emit = (on: boolean, d: string, t: string) => {
    if (!on) { onChange(undefined, null); return }
    if (!d || !t) { onChange(undefined, `Enter the date and the time, or untick "${label}".`); return }
    if (!zone || !today) { onChange(undefined, "The hospital's clock is not known yet."); return }
    const instant = hospitalInstant(d, t, zone)
    if (!instant) { onChange(undefined, "That date and time are not valid."); return }
    const now = hospitalWallClock(new Date().toISOString(), zone)
    if (d > today || (now && d === now.date && t > now.time)) { onChange(undefined, "That time is in the future."); return }
    if (d < addDays(today, -7)) { onChange(undefined, "It can be entered at most 7 days late."); return }
    onChange(instant, null)
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Checkbox id={`${idPrefix}-earlier`} checked={earlier} onCheckedChange={(v) => { const on = v === true; setEarlier(on); emit(on, date, time) }} />
        <Label htmlFor={`${idPrefix}-earlier`} className="cursor-pointer text-sm font-medium text-slate-700">{label}</Label>
      </div>
      {earlier && (
        <div className="grid grid-cols-2 gap-3">
          <Input id={`${idPrefix}-date`} aria-label={`${label}: date`} type="date" className="h-11 rounded-xl" value={date} min={today ? addDays(today, -7) : undefined} max={today} onChange={(e) => { setDate(e.target.value); emit(true, e.target.value, time) }} />
          <Input id={`${idPrefix}-time`} aria-label={`${label}: time`} type="time" className="h-11 rounded-xl" value={time} onChange={(e) => { setTime(e.target.value); emit(true, date, e.target.value) }} />
        </div>
      )}
    </div>
  )
}
