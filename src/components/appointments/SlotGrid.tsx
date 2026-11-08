"use client"
import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { CalendarX2 } from "lucide-react"

import { ErrorState } from "@/components/shared/ErrorState"
import { Skeleton } from "@/components/ui/skeleton"
import { CACHE_CLASSES } from "@/lib/query/cacheClasses"
import { useScopedKey } from "@/lib/query/useScopedKey"
import { doctorScheduleService, freeSlotTimes } from "@/lib/services"
import { cn } from "@/lib/utils"
import { time12 } from "./appointmentUi"

/**
 * The day's slots for one doctor (GET /doctors/{id}/slots?date=), each free, booked or passed. Only a FREE slot can be chosen: the booking sends that
 * slot's start as `time`. The grid is a worklist (15 s, refreshed every 30 s while open) because another desk may take a slot at any moment; if the
 * chosen slot stops being free the choice is cleared. A day the doctor does not work has no slots.
 */
export function SlotGrid({ doctorId, date, selected, onSelect }: { doctorId: string; date: string; selected: string | null; onSelect: (time: string | null) => void }) {
  const key = useScopedKey("slots", doctorId, date)
  const q = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => doctorScheduleService.slots(doctorId, date, signal),
    ...CACHE_CLASSES.worklist,
  })
  const slots = q.data?.slots
  const free = React.useMemo(() => (slots ? freeSlotTimes(slots) : null), [slots])
  // the chosen slot was taken (or passed) in the meantime: clear it, never book a time the grid no longer offers
  React.useEffect(() => {
    if (selected !== null && free !== null && !free.includes(selected)) onSelect(null)
  }, [selected, free, onSelect])

  if (q.isError && !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />
  if (q.isPending) return <div className="grid grid-cols-3 gap-2 sm:grid-cols-5" role="status" aria-label="Loading slots">{Array.from({ length: 10 }, (_, i) => <Skeleton key={i} className="h-10 rounded-lg" />)}</div>
  if (slots && slots.length === 0) {
    return (
      <div data-testid="no-slots" className="flex items-center gap-3 rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
        <CalendarX2 className="h-5 w-5 shrink-0" aria-hidden /> This doctor has no appointment slots on this day.
      </div>
    )
  }
  return (
    <div data-testid="slot-grid" role="radiogroup" aria-label="Available times" className="grid grid-cols-3 gap-2 sm:grid-cols-5">
      {slots?.map((s) => {
        const isFree = s.state === "free"
        const isSelected = selected === s.time
        return (
          <button
            key={s.time}
            type="button"
            role="radio"
            aria-checked={isSelected}
            aria-label={`${time12(s.time)} ${isFree ? "free" : s.state}`}
            data-state={s.state}
            disabled={!isFree}
            onClick={() => onSelect(s.time)}
            className={cn(
              "h-10 rounded-lg border text-sm font-bold transition-colors",
              isSelected ? "border-[#0891B2] bg-[#0891B2] text-white"
                : isFree ? "border-slate-200 bg-white text-slate-700 hover:border-[#1CC0CE] hover:bg-[#1CC0CE]/10"
                : s.state === "booked" ? "cursor-not-allowed border-red-100 bg-red-50 text-red-300 line-through"
                : "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300"
            )}
          >
            {time12(s.time)}
          </button>
        )
      })}
    </div>
  )
}
