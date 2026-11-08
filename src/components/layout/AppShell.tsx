"use client"
import * as React from "react"
import { usePathname, useRouter } from "next/navigation"
import { Sidebar } from "@/components/layout/Sidebar"
import { Topbar } from "@/components/layout/Topbar"
import { Toaster } from "@/components/ui/toaster"
import { ForcedPasswordChange } from "@/components/auth/ForcedPasswordChange"
import { ErrorState } from "@/components/shared/ErrorState"
import { Forbidden } from "@/components/shared/Forbidden"
import { dateInZone } from "@/lib/session/hospital"
import { useHospital } from "@/lib/session/useHospital"
import { useAuth } from "@/lib/auth"
import { useAccess } from "@/lib/session/useAccess"

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = React.useState(false)
  const pathname = usePathname()
  const router = useRouter()
  const { user, isInitialized } = useAuth()
  const { routeStatus } = useAccess()
  const hospital = useHospital()

  // "Today" is read from GET /settings once per sign-in. A desk that stays signed in past the hospital's midnight must not keep working on yesterday (report periods, the
  // appointments day, the queue): when the hospital's day has moved on, read the settings (and department switches) again. Checked each minute and when the tab regains focus.
  const { settings, reload } = hospital
  const lastDayCheck = React.useRef(0) // kept across effect runs: a settings read that changes the object must not start the throttle again
  React.useEffect(() => {
    if (!settings) return
    const check = () => {
      if (dateInZone(new Date(), settings.timezone) > settings.today && Date.now() - lastDayCheck.current > 5 * 60_000) { lastDayCheck.current = Date.now(); reload() }
    }
    const id = window.setInterval(check, 60_000)
    window.addEventListener("focus", check)
    check()
    return () => { window.clearInterval(id); window.removeEventListener("focus", check) }
  }, [settings, reload])

  // Protect the dashboard: if the user signs out and hits 'back',
  // this will immediately redirect them to login without showing the page.
  React.useEffect(() => {
    if (isInitialized && !user) {
      router.replace("/login")
    }
  }, [isInitialized, user, router])

  // Automatically close mobile sidebar on navigation
  React.useEffect(() => {
    setSidebarOpen(false)
  }, [pathname])

  // Still checking whether the browser has a session (boot refresh): a neutral splash, never the sign-in form
  if (!isInitialized) {
    return (
      <div role="status" aria-live="polite" className="flex min-h-screen items-center justify-center bg-[#F8FAFC] text-sm text-slate-500">
        Loading…
      </div>
    )
  }
  // Not signed in: the effect above sends the visitor to /login
  if (!user) return null
  // A temporary password must be replaced first; nothing else works until then (MD section 3)
  if (user.mustChangePassword) return <ForcedPasswordChange />
  const access = routeStatus(pathname)

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* Sidebar Navigation */}
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main Content Area offset by Sidebar width on desktop */}
      <div className="flex min-h-screen flex-col lg:pl-64">
        <Topbar onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-7xl">
            {access === "allowed" ? children : access === "loading" ? <p role="status" className="py-24 text-center text-sm text-slate-500">Loading…</p> : access === "unknown" ? <ErrorState error={hospital.error} onRetry={hospital.reload} className="mx-auto mt-16 max-w-lg" /> : <Forbidden />}
          </div>
        </main>
      </div>

      <Toaster />
    </div>
  )
}
