"use client"
import type { ReactNode } from "react"
import { AlertTriangle } from "lucide-react"

import { errorSummary, isNotConnectedError } from "@/lib/services"
import { useResource } from "@/lib/useResource"
import { ContractPending } from "@/components/shared/ContractPending"
import { EmptyState } from "@/components/shared/EmptyState"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

/**
 * One report's data through its service. `pending` means the backend contract for it is not connected (the adapter threw
 * NotConnectedError before any request) — which is NOT the same as a report that ran and found nothing.
 * `load` must be stable (module-level, or wrapped in useCallback); a new `load` re-runs the report.
 */
export function useReportData<T>(load: (signal: AbortSignal) => Promise<T>) {
  const resource = useResource(load)
  return { ...resource, pending: isNotConnectedError(resource.error) }
}

export type ReportData<T> = ReturnType<typeof useReportData<T>>

/** Renders the contract-pending panel, an error with retry, a loading skeleton, or — once there is data — the report itself. */
export function ReportBody<T>({ state, label, testId, noun = "report", children }: { state: ReportData<T>; label: string; testId?: string; noun?: string; children: (data: T) => ReactNode }) {
  if (state.data !== null) return <>{children(state.data)}</>
  if (state.pending) {
    return <ContractPending title={`${label} is unavailable`} awaiting={[label]} testId={testId ?? "report-pending"} noun={noun} />
  }
  if (state.error) {
    return (
      <div className="rounded-[1.5rem] bg-white p-6 ring-1 ring-black/5" role="alert">
        <EmptyState
          icon={AlertTriangle}
          title={`Couldn't run the ${label}`}
          subtitle={errorSummary(state.error)}
          action={<Button variant="outline" className="rounded-xl font-bold" onClick={state.reload}>Try again</Button>}
        />
      </div>
    )
  }
  return (
    <div className="space-y-3" role="status" aria-label={`Loading ${label}`}>
      <Skeleton className="h-24 w-full rounded-2xl" /><Skeleton className="h-64 w-full rounded-2xl" />
    </div>
  )
}
