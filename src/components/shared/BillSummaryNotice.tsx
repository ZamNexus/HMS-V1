"use client"
import { AlertTriangle } from "lucide-react"

import { errorSummary } from "@/lib/services"
import type { BillSummaryState } from "@/lib/useBillSummary"
import { ContractPending } from "@/components/shared/ContractPending"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

/**
 * What a balance panel shows INSTEAD of figures while there are none: loading, the backend's error (with retry), or — in API mode, until
 * the contract is confirmed — an explicit "not connected" notice. It is deliberately never "Rs. 0" and never an empty-looking panel.
 * Renders nothing when there is data (the caller shows the figures) or when there is nothing to load.
 */
export function BillSummaryNotice({ state, awaiting, testId }: { state: BillSummaryState; awaiting: string; testId: string }) {
  if (state.data !== null || state.idle) return null
  if (state.pending) {
    return <ContractPending title="Bill summary is unavailable" awaiting={[awaiting]} testId={testId} noun="bill" />
  }
  if (state.error) {
    return (
      <div role="alert" data-testid={`${testId}-error`} className="flex items-start gap-3 rounded-xl bg-red-50 p-4 text-sm text-red-900 ring-1 ring-red-500/20">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
        <div className="space-y-2">
          <p className="font-bold">Couldn&apos;t load the bill summary</p>
          <p>{errorSummary(state.error)}</p>
          <Button variant="outline" size="sm" onClick={state.reload}>Try again</Button>
        </div>
      </div>
    )
  }
  return (
    <div className="space-y-2" role="status" aria-label="Loading bill summary" data-testid={`${testId}-loading`}>
      <Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" />
    </div>
  )
}
