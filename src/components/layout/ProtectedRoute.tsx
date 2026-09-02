import { Navigate, Outlet } from "react-router-dom"

import { useAuth } from "@/lib/auth"
import { AppShell } from "@/components/layout/AppShell"

export function ProtectedRoute() {
  const { user } = useAuth()

  if (!user) return <Navigate to="/login" replace />

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  )
}
