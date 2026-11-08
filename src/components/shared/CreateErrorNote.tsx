import type { CreateFailure } from "@/lib/services/createOutcome"

/**
 * A failed save: the backend's own message (and per-field details), with its request id on a separate, small "Support reference" line so a
 * user can quote it to support. Only for failures where nothing is known to be saved; an unreadable-but-accepted create is NOT shown here
 * (it is announced as "Saved").
 */
export function CreateErrorNote({ failure, className = "" }: { failure: Extract<CreateFailure, { kind: "failed" }>; className?: string }) {
  return (
    <div role="alert" data-testid="create-error" className={`rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700 ${className}`}>
      <p className="font-bold">{failure.heading}</p>
      <p>{failure.message}</p>
      {failure.details.length > 0 && (
        <ul className="mt-1 list-disc pl-5 text-xs">
          {failure.details.map((d) => <li key={d}>{d}</li>)}
        </ul>
      )}
      {failure.requestId && (
        <p data-testid="support-reference" className="mt-1.5 text-[11px] font-normal text-red-600/80">
          Support reference: <span className="font-mono">{failure.requestId}</span>
        </p>
      )}
    </div>
  )
}
