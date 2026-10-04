"use client"
import * as React from "react"
import { AlertCircle, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  React.useEffect(() => {
    // Log the error to an error reporting service
    console.error("Dashboard caught an error:", error)
  }, [error])

  return (
    <div className="flex h-[80vh] flex-col items-center justify-center space-y-4 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-red-100">
        <AlertCircle className="h-10 w-10 text-red-600" />
      </div>
      <div className="space-y-2">
        <h2 className="text-2xl font-bold tracking-tight">Something went wrong!</h2>
        <p className="text-muted-foreground text-sm max-w-md mx-auto">
          {error.message || "An unexpected error occurred in this module."}
        </p>
      </div>
      <div className="pt-4 flex gap-4">
        <Button onClick={() => window.history.back()} variant="outline" className="h-11 rounded-xl">
          Go Back
        </Button>
        <Button onClick={() => reset()} className="h-11 rounded-xl bg-[#0F2A4D]">
          <RefreshCw className="mr-2 h-4 w-4" /> Try Again
        </Button>
      </div>
    </div>
  )
}
