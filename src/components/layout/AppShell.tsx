import { Sidebar } from "@/components/layout/Sidebar"
import { Topbar } from "@/components/layout/Topbar"
import { Toaster } from "@/components/ui/toaster"

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <div className="pl-60">
        <Topbar />
        <main className="mx-auto max-w-7xl p-6">{children}</main>
      </div>
      <Toaster />
    </div>
  )
}
