import { Link } from "react-router-dom"
import { ShieldAlert } from "lucide-react"

import { Button } from "@/components/ui/button"

export function Forbidden() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-danger-100">
        <ShieldAlert className="h-8 w-8 text-danger-600" />
      </div>
      <h1 className="text-2xl font-bold text-foreground">403 — Access Denied</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        You do not have permission to view this page. Contact your administrator if you believe this is a mistake.
      </p>
      <Button asChild>
        <Link to="/dashboard">Go to Dashboard</Link>
      </Button>
    </div>
  )
}
