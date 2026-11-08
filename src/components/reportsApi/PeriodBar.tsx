"use client"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { RP_RANGES, RP_RANGE_LABEL, type RpRange } from "./rpUi"

/**
 * The period of a report (handoff 8.11): Today / Yesterday / This Week / This Month / Last Month, or two typed dates. The presets come from the hospital's date, never the
 * browser's clock; while that is still loading they are off. A problem with the dates (missing, reversed, over 366 days) is said here and nothing is sent.
 */
export function PeriodBar({ range, from, to, problem, period, loading, onRange, onDates }: {
  range: RpRange; from?: string; to?: string; problem: string | null; period: { dateFrom: string; dateTo: string } | null; loading: boolean
  onRange: (r: RpRange) => void; onDates: (patch: { from?: string; to?: string }) => void
}) {
  return (
    <div className="no-print space-y-2" data-testid="period-bar">
      <div className="flex flex-wrap items-end gap-3 rounded-[1.25rem] bg-white p-3 shadow-sm ring-1 ring-black/5">
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50/80 p-1 ring-1 ring-slate-100" role="group" aria-label="Period">
          {RP_RANGES.map((r) => (
            <button key={r} type="button" onClick={() => onRange(r)} disabled={loading && r !== "custom"} aria-pressed={range === r}
              className={cn("whitespace-nowrap rounded-lg px-4 py-2 text-xs font-bold transition-all disabled:cursor-not-allowed disabled:opacity-50",
                range === r ? "bg-white text-[#0891B2] shadow-sm ring-1 ring-black/5" : "text-slate-500 hover:bg-slate-100/50 hover:text-slate-700")}>
              {RP_RANGE_LABEL[r]}
            </button>
          ))}
        </div>
        {range === "custom" && (
          <>
            <label className="flex flex-col text-[11px] font-bold uppercase tracking-wider text-slate-500">From
              <Input type="date" aria-label="From date" className="mt-1 h-10 w-40 rounded-xl" value={from ?? ""} max={to} onChange={(e) => onDates({ from: e.target.value || undefined })} /></label>
            <label className="flex flex-col text-[11px] font-bold uppercase tracking-wider text-slate-500">To
              <Input type="date" aria-label="To date" className="mt-1 h-10 w-40 rounded-xl" value={to ?? ""} min={from} onChange={(e) => onDates({ to: e.target.value || undefined })} /></label>
          </>
        )}
        {period && <p className="pb-2 text-xs font-semibold text-slate-500" data-testid="period-text">{period.dateFrom === period.dateTo ? period.dateFrom : `${period.dateFrom} to ${period.dateTo}`}</p>}
      </div>
      {problem && <p role="alert" data-testid="period-problem" className="px-1 text-sm font-semibold text-rose-700">{problem}</p>}
    </div>
  )
}
