"use client"
import * as React from "react"
import { useQuery } from "@tanstack/react-query"

import { BillingActionDialog } from "@/components/billing/BillingActionDialog"
import { ErrorState } from "@/components/shared/ErrorState"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { CACHE_CLASSES } from "@/lib/query/cacheClasses"
import { useScopedKey } from "@/lib/query/useScopedKey"
import { DX_LIMITS, labApiService, type DxLabOrder, type DxLabTest } from "@/lib/services"
import { resultRows, rowsToParameters, type ResultRow } from "./dxUi"

/**
 * Enter a result (L4) or amend a verified one (L5). The rows come from the test's definition (its parameters with units and reference ranges for this patient's
 * sex; GET /lab-tests/{id}, catalogs.read), or a single narrative for a narrative test. The server flags each value against the reference ranges: nothing is judged
 * here. Amending needs a reason (3 to 500) and another doctor verifies it again.
 */
export function ResultDialog({ order, test, amend, onClose, onDone }: { order: DxLabOrder; test: DxLabTest; amend: boolean; onClose: () => void; onDone: (saved: DxLabOrder | null) => void }) {
  const key = useScopedKey("labApi", "definition", test.testId)
  const def = useQuery({ queryKey: key, queryFn: ({ signal }) => labApiService.testDefinition(test.testId, signal), ...CACHE_CLASSES.reference })
  const existing = test.result
  const [rows, setRows] = React.useState<ResultRow[] | null>(null)
  const [narrative, setNarrative] = React.useState(existing?.narrative ?? "")
  const [reason, setReason] = React.useState("")
  const specs = def.data?.specs
  const isNarrative = def.data ? def.data.narrative === true || (specs?.length ?? 0) === 0 : (existing?.parameters.length ?? 0) === 0
  // the rows start from the definition (or, if it cannot be read, from the keys the current result already has)
  const shown: ResultRow[] = rows ?? (specs && specs.length > 0
    ? resultRows(specs, existing?.parameters ?? null, order.patient.gender)
    : (existing?.parameters ?? []).map((p) => ({ key: p.key, name: p.name, unit: p.unit, value: p.value, range: p.normalRange })))
  const set = (k: string, value: string) => setRows(shown.map((r) => (r.key === k ? { ...r, value } : r)))
  const loading = def.isPending && !existing
  // the definition could not be read and there is no earlier result to start from: a parameter test must NOT quietly become a free-text box (a typed "Hb 12" would be saved unflagged)
  const defFailed = def.isError && !def.data && (existing?.parameters.length ?? 0) === 0
  const input = isNarrative ? { narrative } : { parameters: rowsToParameters(shown) }
  const canConfirm = !loading && !defFailed && (isNarrative ? narrative.trim() !== "" : rowsToParameters(shown).length > 0) && (!amend || reason.trim().length >= DX_LIMITS.reason.min)
  return (
    <BillingActionDialog
      wide title={amend ? `Amend result: ${test.name}` : `Enter result: ${test.name}`} confirmLabel={amend ? "Save amendment" : "Save result"} pendingLabel="Saving…" canConfirm={canConfirm} onClose={onClose} onDone={onDone}
      description={amend ? "The corrected values replace the verified ones; the old values stay on file beside them, and another doctor must verify it again." : `${order.orderNo} for ${order.patient.name}. Values are flagged by the server against the reference ranges.`}
      onConfirm={() => (amend ? labApiService.amend(order.id, test.id, { ...input, reason }) : labApiService.enterResult(order.id, test.id, input))}
    >
      {loading ? <Skeleton className="h-40 w-full rounded-xl" role="status" aria-label="Loading the test definition" /> : (
        <>
          {defFailed && <ErrorState error={def.error} onRetry={() => void def.refetch()} />}
          {defFailed ? null : isNarrative ? (
            <div className="space-y-1.5">
              <Label htmlFor="result-narrative" className="text-xs font-bold uppercase tracking-wider text-slate-500">Result *</Label>
              <Textarea id="result-narrative" maxLength={DX_LIMITS.narrative} rows={6} className="rounded-xl" value={narrative} onChange={(e) => setNarrative(e.target.value)} />
            </div>
          ) : (
            <div className="space-y-2" data-testid="result-rows">
              {shown.map((r) => (
                <div key={r.key} className="grid grid-cols-[1fr_9rem] items-center gap-3">
                  <Label htmlFor={`result-${r.key}`} className="text-sm font-semibold">{r.name}{r.unit ? <span className="ml-1 text-xs font-normal text-slate-500">({r.unit})</span> : null}{r.range ? <span className="block text-[11px] font-normal text-slate-500">Reference {r.range}</span> : null}</Label>
                  <Input id={`result-${r.key}`} aria-label={r.name} autoComplete="off" maxLength={DX_LIMITS.parameterValue} className="h-10 rounded-lg tabular-nums" value={r.value} onChange={(e) => set(r.key, e.target.value)} />
                </div>
              ))}
            </div>
          )}
          {amend && (
            <div className="space-y-1.5">
              <Label htmlFor="amend-reason" className="text-xs font-bold uppercase tracking-wider text-slate-500">Reason for the amendment *</Label>
              <Textarea id="amend-reason" maxLength={DX_LIMITS.reason.max} rows={2} className="rounded-xl" value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
          )}
        </>
      )}
    </BillingActionDialog>
  )
}

/** The pathologist's remarks on the whole order (diagnostics.verify). Emptying the box clears them. */
export function RemarksDialog({ order, onClose, onDone }: { order: DxLabOrder; onClose: () => void; onDone: (saved: DxLabOrder | null) => void }) {
  const [text, setText] = React.useState(order.pathologistRemarks ?? "")
  return (
    <BillingActionDialog
      title="Pathologist's remarks" confirmLabel="Save remarks" pendingLabel="Saving…" onClose={onClose} onDone={onDone} description={`On ${order.orderNo}. They print on the report.`}
      onConfirm={() => labApiService.writeRemarks(order.id, text)}
    >
      <div className="space-y-1.5">
        <Label htmlFor="remarks-text" className="text-xs font-bold uppercase tracking-wider text-slate-500">Remarks</Label>
        <Textarea id="remarks-text" maxLength={DX_LIMITS.remarks} rows={5} className="rounded-xl" value={text} onChange={(e) => setText(e.target.value)} />
      </div>
    </BillingActionDialog>
  )
}
