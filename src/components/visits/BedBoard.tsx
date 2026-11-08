"use client"
import * as React from "react"
import Link from "next/link"
import { BedDouble, Wrench } from "lucide-react"

import { EmptyState } from "@/components/shared/EmptyState"
import { ErrorState } from "@/components/shared/ErrorState"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/components/ui/use-toast"
import { bedBoardService, errorSummary, type BoardBed, type BoardWard } from "@/lib/services"
import { formatInstant, formatMoney } from "@/lib/session/hospital"
import { useAccess } from "@/lib/session/useAccess"
import { useHospital } from "@/lib/session/useHospital"
import { cn } from "@/lib/utils"
import { useBedBoard } from "./useBedBoard"

const STATE_STYLE: Record<BoardBed["state"], string> = {
  available: "border-emerald-200 bg-emerald-50 text-emerald-800",
  occupied: "border-red-200 bg-red-50 text-red-800",
  maintenance: "border-amber-200 bg-amber-50 text-amber-800",
}
const STATE_LABEL: Record<BoardBed["state"], string> = { available: "Available", occupied: "Occupied", maintenance: "Under maintenance" }

/**
 * The bed board (E8): every active bed of every active ward, available / occupied (with the patient and a link to the admission) / under maintenance.
 * Read-only for everyone with ipd.read; ipd.write adds "Take out of use" / "Return to use" (E13) for a bed nobody occupies. Refreshes every 30 s.
 */
export function BedBoard() {
  const board = useBedBoard()
  const { can } = useAccess()
  const { settings } = useHospital()
  const { toast } = useToast()
  const [busy, setBusy] = React.useState<string | null>(null)
  const canMaintain = can("ipd.write")

  const toggle = async (bed: BoardBed) => {
    if (busy) return
    setBusy(bed.id)
    const out = bed.state !== "maintenance"
    try {
      await bedBoardService.setMaintenance(bed.id, out)
      toast({ title: `Bed ${bed.bedNo} ${out ? "taken out of use" : "returned to use"}` })
    } catch (err) {
      toast({ variant: "destructive", title: `Could not ${out ? "take bed " + bed.bedNo + " out of use" : "return bed " + bed.bedNo}`, description: errorSummary(err) })
    } finally {
      setBusy(null)
    }
  }

  if (board.isError && !board.data) return <ErrorState error={board.error} onRetry={() => void board.refetch()} />
  if (board.isPending) return <div className="grid gap-4 sm:grid-cols-2" role="status" aria-label="Loading the bed board">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}</div>
  const wards = board.data ?? []
  if (wards.length === 0) return <EmptyState icon={BedDouble} title="No wards or beds yet" subtitle="Add wards and beds under Admin > Master Data > Wards." />
  const count = (state: BoardBed["state"]) => wards.reduce((n, w) => n + w.beds.filter((b) => b.state === state).length, 0)
  return (
    <div className="space-y-5" data-testid="bed-board">
      <p className="text-sm font-medium text-slate-600" data-testid="bed-counts">{count("available")} available · {count("occupied")} occupied · {count("maintenance")} under maintenance</p>
      <div className="grid gap-4 lg:grid-cols-2">
        {wards.map((w: BoardWard) => (
          <section key={w.id} data-testid={`ward-${w.id}`} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
            <header className="mb-3 flex items-baseline justify-between gap-2">
              <h3 className="text-base font-black text-[#0D1B2E]">{w.name} <span className="text-xs font-bold uppercase tracking-wider text-slate-400">{w.type}</span></h3>
              <span className="text-xs text-slate-500">{settings ? formatMoney(w.dailyRate, settings.currencyCode) : w.dailyRate} / day</span>
            </header>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {w.beds.map((b) => (
                <div key={b.id} data-testid={`bed-${b.id}`} data-state={b.state} className={cn("rounded-xl border p-2.5 text-xs", STATE_STYLE[b.state])}>
                  <div className="flex items-center justify-between gap-1 text-sm font-black"><span>{b.bedNo}</span>{b.state === "maintenance" && <Wrench className="h-3.5 w-3.5" aria-hidden />}</div>
                  <div className="font-bold">{STATE_LABEL[b.state]}</div>
                  {b.occupant && (
                    <div className="mt-1 space-y-0.5">
                      <Link href={`/patients/${b.occupant.patient.id}`} className="block truncate font-bold hover:underline">{b.occupant.patient.name}</Link>
                      <Link href={`/encounters/${b.occupant.encounterId}`} className="block font-mono hover:underline">{b.occupant.encId}</Link>
                      {settings && <div className="text-[10px] opacity-80">since {formatInstant(b.occupant.since, settings.timezone, { dateStyle: "medium", timeStyle: "short" })}</div>}
                    </div>
                  )}
                  {canMaintain && b.state !== "occupied" && (
                    <Button type="button" size="sm" variant="outline" disabled={busy !== null} aria-label={`${b.state === "maintenance" ? "Return to use" : "Take out of use"} bed ${b.bedNo}`} className="mt-2 h-7 w-full rounded-lg bg-white/70 px-2 text-[11px] font-bold" onClick={() => void toggle(b)}>
                      {b.state === "maintenance" ? "Return to use" : "Take out of use"}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
