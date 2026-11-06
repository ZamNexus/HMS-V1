import { format } from "date-fns"
import { AlertTriangle, History } from "lucide-react"

import type { DataSource } from "@/lib/services/dataSource"
import { CROSS_MODULE_OPERATION_LABELS } from "@/lib/services/crossModuleContract"
import { errorSummary, isNotConnectedError } from "@/lib/services/errors"
import { formatMoneyString } from "@/lib/services/moneyMath"
import type { ItemHistoryEntry, ServiceUsageEntry } from "@/lib/services/types"
import { ContractPending } from "@/components/shared/ContractPending"
import { EmptyState } from "@/components/shared/EmptyState"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

// Two deliberately separate views of a catalogue service, kept apart so one can never be mistaken for the other:
//  * ItemHistoryView — the AUDIT LOG (T12): backend events describing changes to the item. Contract-pending in API mode; the demo has no
//    audit events for catalogue items, so mock mode says so instead of inventing events or implying the item was never changed.
//  * ServiceUsageView — INVOICE USAGE: the invoice lines that carry the service. A mock-only demo view; it is not audit history, has no actor
//    and no action, and is never offered in API mode.
// Presentational only (no data fetching), so every state can be rendered and tested without a browser.

export interface ViewState<T> {
  /** null until a result has arrived. */
  entries: readonly T[] | null
  error: unknown
  loading: boolean
  onRetry: () => void
}

function Loading({ label }: { label: string }) {
  return (
    <div className="space-y-3" role="status" aria-label={label}>
      {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-10 w-full rounded-xl" />)}
    </div>
  )
}

function LoadError({ error, onRetry, testId, title }: { error: unknown; onRetry: () => void; testId: string; title: string }) {
  return (
    <div role="alert" data-testid={testId}>
      <EmptyState icon={AlertTriangle} title={title} subtitle={errorSummary(error)} action={<Button variant="outline" className="rounded-xl font-bold" onClick={onRetry}>Try again</Button>} />
    </div>
  )
}

export function ItemHistoryView({ source, state }: { source: DataSource; state: ViewState<ItemHistoryEntry> }) {
  const { entries, error, loading, onRetry } = state
  if (isNotConnectedError(error)) {
    return <ContractPending title="Item History (audit log) is unavailable" awaiting={[CROSS_MODULE_OPERATION_LABELS["itemHistory.list"]]} testId="item-history-pending" noun="audit history" />
  }
  if (error && !entries) return <LoadError error={error} onRetry={onRetry} testId="item-history-error" title="Couldn't load the audit history" />
  if (loading && !entries) return <Loading label="Loading audit history" />
  if (!entries || entries.length === 0) {
    return source === "mock" ? (
      <div className="py-10" data-testid="item-history-mock-empty">
        <EmptyState icon={History} title="No audit log in mock mode" subtitle="The demo data has no audit events for catalogue items, so none can be shown here. This does not mean the item was never changed. Real audit history comes from the backend once its contract is connected." />
      </div>
    ) : (
      <div className="py-10" data-testid="item-history-empty">
        <EmptyState icon={History} title="No audit entries" subtitle="The audit log returned no entries for this item." />
      </div>
    )
  }
  return (
    <div className="rounded-xl border border-slate-100 overflow-hidden" data-testid="item-history-table">
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50/50">
            <TableHead className="font-bold text-slate-500 h-auto py-3">When</TableHead>
            <TableHead className="font-bold text-slate-500 h-auto py-3">Action</TableHead>
            <TableHead className="font-bold text-slate-500 h-auto py-3">By</TableHead>
            <TableHead className="font-bold text-slate-500 h-auto py-3">Details</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((e) => (
            <TableRow key={e.id}>
              <TableCell className="text-sm font-medium whitespace-nowrap">{format(new Date(e.at), "dd MMM yyyy, HH:mm")}</TableCell>
              <TableCell className="font-bold">{e.action}</TableCell>
              <TableCell className="font-medium text-slate-600">{e.actor ?? "—"}</TableCell>
              <TableCell className="font-medium text-slate-600">{e.details}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

export function ServiceUsageView({ state }: { state: ViewState<ServiceUsageEntry> }) {
  const { entries, error, loading, onRetry } = state
  return (
    <div className="space-y-3">
      <p data-testid="service-usage-notice" role="note" className="rounded-xl bg-amber-50 p-3 text-xs font-medium text-amber-900 ring-1 ring-amber-500/30">
        Demo data — invoice usage, not an audit log. These are the invoice lines that carry this service; they do not record who changed the
        catalogue item or what was changed.
      </p>
      {isNotConnectedError(error) ? (
        <ContractPending title="Invoice usage is unavailable" awaiting={["invoice usage of a service (no document describes it)"]} testId="service-usage-pending" noun="usage list" />
      ) : error && !entries ? (
        <LoadError error={error} onRetry={onRetry} testId="service-usage-error" title="Couldn't load the invoice usage" />
      ) : loading && !entries ? (
        <Loading label="Loading invoice usage" />
      ) : !entries || entries.length === 0 ? (
        <div className="py-8" data-testid="service-usage-empty"><EmptyState icon={History} title="Not invoiced yet" subtitle="No demo invoice carries this service." /></div>
      ) : (
        <div className="rounded-xl border border-slate-100 overflow-hidden" data-testid="service-usage-table">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/50">
                <TableHead className="font-bold text-slate-500 h-auto py-3">Invoice date</TableHead>
                <TableHead className="font-bold text-slate-500 h-auto py-3">Invoice</TableHead>
                <TableHead className="font-bold text-slate-500 h-auto py-3">Patient</TableHead>
                <TableHead className="font-bold text-slate-500 h-auto py-3">Qty</TableHead>
                <TableHead className="font-bold text-slate-500 h-auto py-3">Rate</TableHead>
                <TableHead className="font-bold text-slate-500 h-auto py-3">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="text-sm font-medium whitespace-nowrap">{format(new Date(e.at), "dd MMM yyyy")}</TableCell>
                  <TableCell className="font-mono text-xs font-bold">{e.invoiceNo}</TableCell>
                  <TableCell className="font-medium text-slate-600">{e.patient}</TableCell>
                  <TableCell className="font-medium text-slate-600">{e.quantity}</TableCell>
                  <TableCell className="font-medium text-slate-600">{formatMoneyString(e.rate)}</TableCell>
                  <TableCell className="font-bold">{formatMoneyString(e.amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
