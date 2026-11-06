"use client"
import * as React from "react"

import { billSummaryService, isNotConnectedError, type BillSummary } from "@/lib/services"

/** Whose bill: one patient (all visits and standalone invoices) or one encounter. `null` = nothing to load yet. */
export type BillScope = { kind: "patient" | "encounter"; id: string } | null

interface Settled {
  key: string
  data: BillSummary | null
  error: unknown
}

/**
 * The bill summary behind the patient / encounter balance panels, through `billSummaryService`.
 *
 * - `pending`: the backend contract for it is not connected (the adapter threw NotConnectedError before any request) — NOT the same
 *   as a patient who owes nothing. The panels say so instead of showing a made-up zero.
 * - A result belongs to the scope it was loaded for: after the scope changes (all visits → one visit) the previous figures are never
 *   shown, `loading` is true until the new ones settle.
 */
export function useBillSummary(scope: BillScope) {
  const kind = scope?.kind
  const id = scope?.id
  const key = kind && id ? `${kind}:${id}` : ""
  const [settled, setSettled] = React.useState<Settled | null>(null)
  const [nonce, setNonce] = React.useState(0)

  React.useEffect(() => {
    if (!kind || !id) return
    const ctrl = new AbortController()
    let cancelled = false
    const run = kind === "patient" ? billSummaryService.forPatient(id, { signal: ctrl.signal }) : billSummaryService.forEncounter(id, { signal: ctrl.signal })
    run
      .then((data) => { if (!cancelled) setSettled({ key: `${kind}:${id}`, data, error: null }) })
      .catch((error: unknown) => { if (!cancelled) setSettled({ key: `${kind}:${id}`, data: null, error }) })
    return () => {
      cancelled = true
      ctrl.abort()
    }
  }, [kind, id, nonce])

  const current = key !== "" && settled?.key === key ? settled : null
  const reload = React.useCallback(() => {
    setSettled(null)
    setNonce((n) => n + 1)
  }, [])

  return {
    data: current?.data ?? null,
    error: current?.error ?? null,
    loading: key !== "" && current === null,
    pending: current !== null && isNotConnectedError(current.error),
    idle: key === "",
    reload,
  }
}

export type BillSummaryState = ReturnType<typeof useBillSummary>
