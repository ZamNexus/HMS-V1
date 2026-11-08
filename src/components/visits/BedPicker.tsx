"use client"
import { ErrorState } from "@/components/shared/ErrorState"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { useBedBoard } from "./useBedBoard"

/**
 * Choose a bed from the live board (admission and transfer). Only an AVAILABLE bed can be chosen; occupied and under-maintenance beds are shown but off,
 * because a bed is taken from this board and not typed in. If another desk takes the chosen bed meanwhile, the next refresh switches it off and the
 * server answers BED_OCCUPIED if the request still goes out.
 */
export function BedPicker({ value, onChange, excludeBedId }: { value: string | null; onChange: (bedId: string | null) => void; excludeBedId?: string }) {
  const board = useBedBoard()
  if (board.isError && !board.data) return <ErrorState error={board.error} onRetry={() => void board.refetch()} />
  if (board.isPending) return <Skeleton className="h-24 w-full rounded-xl" role="status" aria-label="Loading beds" />
  const wards = board.data ?? []
  const availableNow = wards.flatMap((w) => w.beds).filter((b) => b.state === "available" && b.id !== excludeBedId)
  return (
    <div className="space-y-3" data-testid="bed-picker" role="radiogroup" aria-label="Choose a bed">
      {availableNow.length === 0 && <p role="status" className="rounded-xl border border-dashed border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">No bed is available right now.</p>}
      {wards.map((w) => (
        <div key={w.id}>
          <div className="mb-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">{w.name} <span className="font-normal normal-case text-slate-400">({w.type})</span></div>
          <div className="flex flex-wrap gap-2">
            {w.beds.map((b) => {
              const free = b.state === "available" && b.id !== excludeBedId
              const selected = value === b.id
              return (
                <button
                  key={b.id} type="button" role="radio" aria-checked={selected} disabled={!free} data-state={b.state}
                  aria-label={`Bed ${b.bedNo} in ${w.name}, ${b.id === excludeBedId ? "current bed" : b.state}`}
                  onClick={() => onChange(selected ? null : b.id)}
                  className={cn(
                    "h-10 min-w-[3.5rem] rounded-lg border px-3 text-sm font-bold transition-colors",
                    selected ? "border-[#0891B2] bg-[#0891B2] text-white" : free ? "border-emerald-200 bg-emerald-50 text-emerald-800 hover:border-[#1CC0CE]"
                    : b.state === "occupied" ? "cursor-not-allowed border-red-100 bg-red-50 text-red-300 line-through" : "cursor-not-allowed border-amber-100 bg-amber-50 text-amber-300"
                  )}
                >
                  {b.bedNo}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
