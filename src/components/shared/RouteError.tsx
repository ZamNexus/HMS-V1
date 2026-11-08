"use client"
import * as React from "react"
import { AlertCircle, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { logRouteError } from "@/lib/errorLog"
import { describeFailure } from "@/lib/errorState"

/**
 * The body of every route-segment error.tsx. Logs only the error's name, code and ids (never its message, body or URL: it can carry patient
 * data) and shows the request id when there is one.
 */
export function RouteError({ error, reset, area }: { error: Error & { digest?: string }; reset: () => void; area: string }) {
  React.useEffect(() => {
    logRouteError(area, error)
  }, [error, area])
  const view = describeFailure(error)
  const reference = view.requestId ?? error.digest ?? null
  return (
    <div role="alert" className="flex h-[70vh] flex-col items-center justify-center space-y-4 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-red-100">
        <AlertCircle className="h-10 w-10 text-red-600" aria-hidden />
      </div>
      <div className="space-y-2">
        <h2 className="text-2xl font-bold tracking-tight">{view.kind === "other" ? "Something went wrong" : view.title}</h2>
        <p className="mx-auto max-w-md text-sm text-muted-foreground">
          {view.kind === "other" ? "An unexpected error occurred in this module. Try again, or go back." : view.message}
        </p>
        {reference && (
          <p data-testid="support-reference" className="text-[11px] text-muted-foreground">
            Support reference: <span className="font-mono">{reference}</span>
          </p>
        )}
      </div>
      <div className="flex gap-4 pt-2">
        <Button onClick={() => window.history.back()} variant="outline" className="h-11 rounded-xl">
          Go Back
        </Button>
        <Button onClick={() => reset()} className="h-11 rounded-xl bg-[#0F2A4D]">
          <RefreshCw className="mr-2 h-4 w-4" aria-hidden /> Try Again
        </Button>
      </div>
    </div>
  )
}
