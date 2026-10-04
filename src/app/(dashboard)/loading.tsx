import * as React from "react"
import { Loader2 } from "lucide-react"

export default function DashboardLoading() {
  return (
    <div className="flex h-[70vh] w-full flex-col items-center justify-center space-y-4">
      <Loader2 className="h-10 w-10 animate-spin text-[#1CC0CE]" />
      <p className="text-sm font-medium text-slate-500 animate-pulse">Loading module...</p>
    </div>
  )
}
