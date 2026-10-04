"use client"
import * as React from "react"
import { usePathname, useRouter } from "next/navigation"
import { Sidebar } from "@/components/layout/Sidebar"
import { Topbar } from "@/components/layout/Topbar"
import { Toaster } from "@/components/ui/toaster"
import { useAuth } from "@/lib/auth"

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = React.useState(false)
  const pathname = usePathname()
  const router = useRouter()
  const { user, isInitialized } = useAuth()

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

  // Do not render the shell if the user is unauthenticated or still initializing
  if (!isInitialized || !user) {
    return null
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* Sidebar Navigation */}
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main Content Area offset by Sidebar width on desktop */}
      <div className="flex min-h-screen flex-col lg:pl-64">
        <Topbar onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-7xl">
            {children}
          </div>
        </main>
      </div>

      <Toaster />
    </div>
  )
}
