import { AlertTriangle } from "lucide-react"

/**
 * Shown in API mode in place of data and forms while the backend contract for an operation is unconfirmed. It says plainly
 * that nothing is connected, so a missing contract never looks like an empty list or a successful action.
 */
export function ContractPending({ title, awaiting, testId, noun = "list" }: { title: string; awaiting: readonly string[]; testId: string; noun?: string }) {
  return (
    <div role="status" data-testid={testId} className="flex items-start gap-3 rounded-xl bg-amber-50 p-5 text-sm text-amber-900 ring-1 ring-amber-500/30">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
      <div className="space-y-1">
        <p className="font-bold">{title}</p>
        <p>
          Not connected: the API contract for this has not been provided to the frontend. No request is sent and no demo data is shown, so there is
          nothing to display here — this is not an empty {noun}.
        </p>
        <p className="text-xs text-amber-800/80">Awaiting the contract for: {awaiting.join("; ")}.</p>
      </div>
    </div>
  )
}
