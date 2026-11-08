"use client"
import * as React from "react"
import { AlertCircle, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { describeFailure } from "@/lib/errorState"

const subscribeToSecond = (notify: () => void) => {
  const timer = setInterval(notify, 1000)
  return () => clearInterval(timer)
}
const currentSecond = () => Math.floor(Date.now() / 1000)

/**
 * Seconds left of a wait the server asked for (429, lockout), counting down once a second; null when there is no wait. The deadline is taken
 * from the first second this error is shown.
 */
function useWaitSeconds(total: number | null): number | null {
  const now = React.useSyncExternalStore(subscribeToSecond, currentSecond, () => 0)
  const [startedAt] = React.useState(currentSecond)
  if (total === null) return null
  return Math.max(0, total - Math.max(0, now - startedAt))
}

/**
 * A failed READ: what happened in plain words, a "Try again" when that can help, and the request id on its own line so the user can quote it
 * to support. Never shows the response body. After a 429 the button stays disabled until the wait is over. (A failed create uses
 * CreateErrorNote instead: it must not invite a blind retry.)
 */
export function ErrorState({ error, onRetry, className = "" }: { error: unknown; onRetry?: () => void; className?: string }) {
  const view = describeFailure(error)
  const left = useWaitSeconds(view.retryAfterSeconds)
  const waiting = left !== null && left > 0
  return (
    <div role="alert" data-testid="error-state" data-kind={view.kind} className={`flex flex-col items-center gap-3 rounded-xl border border-red-100 bg-red-50 p-6 text-center text-sm text-red-700 ${className}`}>
      <AlertCircle className="h-8 w-8" aria-hidden />
      <p className="text-base font-bold">{view.title}</p>
      <p>{view.message}</p>
      {waiting && <p data-testid="retry-wait">Please wait {left} seconds before trying again.</p>}
      {view.requestId && (
        <p data-testid="support-reference" className="text-[11px] text-red-600/80">
          Support reference: <span className="font-mono">{view.requestId}</span>
        </p>
      )}
      {view.canRetry && onRetry && (
        <Button type="button" variant="outline" onClick={onRetry} disabled={waiting} className="h-11">
          <RefreshCw className="mr-2 h-4 w-4" aria-hidden /> Try again
        </Button>
      )}
    </div>
  )
}
