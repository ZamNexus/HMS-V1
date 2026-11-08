"use client"
import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { HeartPulse } from "lucide-react"

import { CreateErrorNote } from "@/components/shared/CreateErrorNote"
import { EmptyState } from "@/components/shared/EmptyState"
import { ErrorState } from "@/components/shared/ErrorState"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/components/ui/use-toast"
import { CACHE_CLASSES } from "@/lib/query/cacheClasses"
import { useScopedKey } from "@/lib/query/useScopedKey"
import { VITALS_RANGES, visitsService, type VisitDetail, type VitalsInput } from "@/lib/services"
import { classifyCreateError, SAVED_REFRESHING_MESSAGE, type CreateFailure } from "@/lib/services/createOutcome"
import { formatInstant } from "@/lib/session/hospital"
import { useHospital } from "@/lib/session/useHospital"
import { useSubmitGuard } from "@/lib/useSubmitGuard"
import { LateEntryField } from "./LateEntryField"
import { vitalsSummary } from "./visitUi"

type Failure = Extract<CreateFailure, { kind: "failed" }>
const FIELDS: Array<{ key: keyof typeof VITALS_RANGES; label: string; unit: string }> = [
  { key: "bpSystolic", label: "BP top", unit: "mmHg" }, { key: "bpDiastolic", label: "BP bottom", unit: "mmHg" }, { key: "pulse", label: "Pulse", unit: "bpm" }, { key: "temperatureF", label: "Temperature", unit: "°F" },
  { key: "spo2", label: "SpO₂", unit: "%" }, { key: "weightKg", label: "Weight", unit: "kg" }, { key: "heightCm", label: "Height", unit: "cm" }, { key: "rbs", label: "RBS", unit: "mg/dL" },
]

/**
 * Vitals (E3): every reading newest first (the server derives the BMI), and a form to record one more. One reading per save; at least one number,
 * each inside the contract's range. Recording needs encounters.record_vitals and an open visit. A reading cannot be edited or deleted: it is a record.
 */
export function VitalsPanel({ visit, canRecord }: { visit: VisitDetail; canRecord: boolean }) {
  const { settings } = useHospital()
  const { toast } = useToast()
  const { pending, run } = useSubmitGuard()
  const key = useScopedKey("visits", "vitals", visit.id)
  const q = useQuery({ queryKey: key, queryFn: ({ signal }) => visitsService.vitals(visit.id, signal), ...CACHE_CLASSES.record })
  const [values, setValues] = React.useState<Record<string, string>>({})
  const [at, setAt] = React.useState<{ instant: string | undefined; problem: string | null }>({ instant: undefined, problem: null })
  const [problem, setProblem] = React.useState<string | null>(null)
  const [failure, setFailure] = React.useState<Failure | null>(null)

  const save = async () => {
    setProblem(null); setFailure(null)
    const input: VitalsInput = { recordedAt: at.instant }
    for (const f of FIELDS) {
      const raw = (values[f.key] ?? "").trim()
      if (raw !== "") (input as Record<string, number>)[f.key] = Number(raw)
    }
    await run(async () => {
      try {
        await visitsService.recordVitals(visit.id, input)
        toast({ title: "Vitals recorded" })
        setValues({})
      } catch (err) {
        if (err instanceof RangeError || err instanceof TypeError) { setProblem(err.message); return }
        const outcome = classifyCreateError(err)
        if (outcome.kind === "saved-unreadable") { toast({ title: outcome.message === SAVED_REFRESHING_MESSAGE ? "Recorded. Refreshing." : outcome.message }); setValues({}); return }
        setFailure(outcome)
      }
    })
  }

  return (
    <div className="space-y-6" data-testid="vitals-panel">
      {canRecord && (
        <form className="space-y-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5" onSubmit={(e) => { e.preventDefault(); void save() }} noValidate>
          <h3 className="text-sm font-black text-[#0D1B2E]">Record a reading</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {FIELDS.map((f) => (
              <div key={f.key} className="space-y-1">
                <Label htmlFor={`vit-${f.key}`} className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{f.label} <span className="font-normal normal-case">({f.unit})</span></Label>
                <Input id={`vit-${f.key}`} type="number" inputMode="decimal" step={VITALS_RANGES[f.key].int ? 1 : 0.1} min={VITALS_RANGES[f.key].min} max={VITALS_RANGES[f.key].max} className="h-11 rounded-xl" value={values[f.key] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} />
              </div>
            ))}
          </div>
          <LateEntryField label="Taken earlier than now" idPrefix="vit-at" onChange={(instant, p) => setAt({ instant, problem: p })} />
          {at.problem && <p role="alert" className="text-xs font-bold text-destructive">{at.problem}</p>}
          {problem && <p role="alert" data-testid="vitals-problem" className="text-sm font-bold text-destructive">{problem}</p>}
          {failure && <CreateErrorNote failure={failure} />}
          <Button type="submit" className="h-11 rounded-xl bg-[#0F2A4D] px-6 font-bold text-white hover:bg-[#16375F]" disabled={pending || at.problem !== null}>{pending ? "Saving…" : "Record vitals"}</Button>
        </form>
      )}

      {q.isError && !q.data ? <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      : q.isPending ? <Skeleton className="h-24 w-full rounded-xl" role="status" aria-label="Loading vitals" />
      : q.data.length === 0 ? <EmptyState icon={HeartPulse} title="No vitals recorded yet" subtitle={canRecord ? "Record the first reading above." : undefined} />
      : (
        <ol className="space-y-2" aria-label="Vitals readings, newest first">
          {q.data.map((r) => (
            <li key={r.id} data-testid={`vitals-${r.id}`} className="rounded-xl bg-white p-3 text-sm shadow-sm ring-1 ring-black/5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-bold text-[#0D1B2E]">{settings ? formatInstant(r.recordedAt, settings.timezone) : r.recordedAt}</span>
                <span className="text-xs text-slate-500">{r.recordedBy.name}</span>
              </div>
              <div className="mt-1 text-slate-700">{vitalsSummary(r).join(" · ") || "No measurements"}</div>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
