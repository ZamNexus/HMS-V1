"use client"
import type { SeriesPoint } from "@/lib/services/http/series"

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/
const shortDay = (label: string): string => {
  if (!ISO_DAY.test(label)) return label
  const d = new Date(`${label}T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? label : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" })
}

/**
 * A small bar chart of a series. The height of a bar is only drawing; the figure under it is the text the server sent (money in the hospital's currency format), never a
 * recomputed or rounded value. A series of zeros draws flat bars rather than a divide-by-zero.
 */
export function SeriesBars({ points, name, format, testId }: { points: readonly SeriesPoint[]; name: string; format?: (v: string) => string; testId?: string }) {
  const sizes = points.map((p) => Math.max(0, Number(p.value)))
  const tallest = Math.max(...sizes, 0)
  return (
    <figure data-testid={testId} className="space-y-2">
      <div role="img" aria-label={`${name}: ${points.map((p) => `${shortDay(p.label)} ${format ? format(p.value) : p.value}`).join(", ")}`} className="flex h-40 items-end gap-2 rounded-2xl bg-white p-4 ring-1 ring-black/5">
        {points.map((p, i) => (
          <div key={`${p.label}-${i}`} className="flex h-full min-w-0 flex-1 flex-col justify-end gap-1" data-testid={testId ? `${testId}-bar-${i}` : undefined}>
            <div className="w-full rounded-t-md bg-[#1CC0CE]" style={{ height: tallest === 0 ? "2px" : `${Math.max(2, (sizes[i] / tallest) * 100)}%` }} />
          </div>
        ))}
      </div>
      <ul className="grid gap-2 text-center text-[11px] text-slate-500" style={{ gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` }}>
        {points.map((p, i) => (
          <li key={`${p.label}-${i}`} className="min-w-0"><div className="truncate font-semibold">{shortDay(p.label)}</div><div className="truncate font-black tabular-nums text-[#0D1B2E]" data-testid={testId ? `${testId}-value-${i}` : undefined}>{format ? format(p.value) : p.value}</div></li>
        ))}
      </ul>
    </figure>
  )
}
