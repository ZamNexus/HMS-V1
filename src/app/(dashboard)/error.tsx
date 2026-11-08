"use client"
import { RouteError } from "@/components/shared/RouteError"

// Last line of defence for the signed-in area; each module folder has its own error.tsx so a failure stays inside its segment.
export default function DashboardError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError {...props} area="dashboard-layout" />
}
