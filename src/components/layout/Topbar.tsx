import * as React from "react"
import { useLocation } from "react-router-dom"
import { Bell } from "lucide-react"
import { format } from "date-fns"

import { useAuth } from "@/lib/auth"

function firstName(name?: string) {
  if (!name) return ""
  const parts = name.split(" ").filter(Boolean)
  const idx = parts[0] === "Dr." || parts[0] === "Nurse" ? 1 : 0
  return parts[idx] ?? parts[0]
}

function useBreadcrumb() {
  const { pathname } = useLocation()
  const segments = pathname.split("/").filter(Boolean)
  if (segments.length === 0) return "Dashboard"
  return segments
    .map((s) =>
      s
        .replace(/-/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase())
    )
    .join(" / ")
}

export function Topbar() {
  const { user } = useAuth()
  const breadcrumb = useBreadcrumb()
  const [now, setNow] = React.useState(new Date())

  React.useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border bg-white px-6">
      <div className="text-[13px] text-muted-foreground">{breadcrumb}</div>
      <div className="flex items-center gap-5">
        <div className="relative">
          <Bell className="h-5 w-5 text-muted-foreground" />
          <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-danger-600 text-[10px] font-semibold text-white">
            3
          </span>
        </div>
        <div className="hidden font-mono text-xs text-muted-foreground sm:block">
          {format(now, "dd MMM yyyy · HH:mm:ss")}
        </div>
        <div className="text-sm font-medium text-foreground">{firstName(user?.name)}</div>
      </div>
    </header>
  )
}
