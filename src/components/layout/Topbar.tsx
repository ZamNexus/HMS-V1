import * as React from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { Bell, LogOut, Search, User as UserIcon, KeyRound } from "lucide-react"
import { format } from "date-fns"

import { useAuth } from "@/lib/auth"
import { PATIENTS } from "@/data/patients"
import { MEDICINES } from "@/data/medicines"
import { LAB_ORDERS } from "@/data/lab"
import { initials } from "@/lib/utils"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useToast } from "@/components/ui/use-toast"

function firstName(name?: string) {
  if (!name) return ""
  const parts = name.split(" ").filter(Boolean)
  const idx = parts[0] === "Dr." || parts[0] === "Nurse" ? 1 : 0
  return parts[idx] ?? parts[0]
}

const BREADCRUMB_LABELS: Record<string, string> = { opd: "OPD", ipd: "IPD" }

function useBreadcrumb() {
  const { pathname } = useLocation()
  const segments = pathname.split("/").filter(Boolean)
  return segments.map((s, i) => ({
    label: BREADCRUMB_LABELS[s] ?? s.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    to: "/" + segments.slice(0, i + 1).join("/"),
  }))
}

function useNotifications() {
  return React.useMemo(() => {
    const items: { id: string; title: string; detail: string; to: string; tone: "warning" | "danger" | "info" }[] = []

    const resultsReady = LAB_ORDERS.filter((o) => o.status === "Completed")
    if (resultsReady.length > 0) {
      items.push({
        id: "lab-ready",
        title: `${resultsReady.length} lab result${resultsReady.length > 1 ? "s" : ""} ready for review`,
        detail: resultsReady.slice(0, 3).map((o) => PATIENTS.find((p) => p.id === o.patientId)?.name).filter(Boolean).join(", "),
        to: "/lab/orders",
        tone: "info",
      })
    }

    const outOfStock = MEDICINES.filter((m) => m.stock === 0)
    if (outOfStock.length > 0) {
      items.push({
        id: "out-of-stock",
        title: `${outOfStock.length} medicine${outOfStock.length > 1 ? "s" : ""} out of stock`,
        detail: outOfStock.slice(0, 3).map((m) => m.name).join(", "),
        to: "/pharmacy/inventory",
        tone: "danger",
      })
    }

    const lowStock = MEDICINES.filter((m) => m.stock > 0 && m.stock < m.reorderLevel)
    if (lowStock.length > 0) {
      items.push({
        id: "low-stock",
        title: `${lowStock.length} medicine${lowStock.length > 1 ? "s" : ""} running low`,
        detail: lowStock.slice(0, 3).map((m) => m.name).join(", "),
        to: "/pharmacy/inventory",
        tone: "warning",
      })
    }

    const urgentLab = LAB_ORDERS.filter((o) => o.priority === "Urgent" && o.status !== "Delivered")
    if (urgentLab.length > 0) {
      items.push({
        id: "urgent-lab",
        title: `${urgentLab.length} urgent lab order${urgentLab.length > 1 ? "s" : ""} in progress`,
        detail: urgentLab.slice(0, 3).map((o) => PATIENTS.find((p) => p.id === o.patientId)?.name).filter(Boolean).join(", "),
        to: "/lab/orders",
        tone: "warning",
      })
    }

    return items
  }, [])
}

export function Topbar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()
  const crumbs = useBreadcrumb()
  const notifications = useNotifications()
  const [now, setNow] = React.useState(new Date())
  const [searchOpen, setSearchOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const searchRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  React.useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(false)
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [])

  const results = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q.length < 2) return []
    return PATIENTS.filter((p) => p.name.toLowerCase().includes(q) || p.mrNo.toLowerCase().includes(q) || p.phone.includes(q)).slice(0, 6)
  }, [query])

  const goToPatient = (id: number) => {
    navigate(`/patients/${id}`)
    setQuery("")
    setSearchOpen(false)
  }

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-border bg-white px-6">
      <nav className="flex min-w-0 items-center gap-1 text-[13px] text-muted-foreground">
        {crumbs.length === 0 ? (
          <span>Dashboard</span>
        ) : (
          crumbs.map((c, i) => (
            <span key={c.to} className="flex items-center gap-1">
              {i > 0 && <span className="text-muted-foreground/50">/</span>}
              {i === crumbs.length - 1 ? (
                <span className="font-medium text-foreground">{c.label}</span>
              ) : (
                <button onClick={() => navigate(c.to)} className="transition-colors hover:text-secondary hover:underline">
                  {c.label}
                </button>
              )}
            </span>
          ))
        )}
      </nav>

      <div ref={searchRef} className="relative w-full max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setSearchOpen(true) }}
          onFocus={() => setSearchOpen(true)}
          placeholder="Search patient by name, MR No. or phone..."
          className="h-9 w-full rounded-md border border-border bg-muted/40 pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-secondary focus:bg-white"
        />
        {searchOpen && query.trim().length >= 2 && (
          <div className="absolute z-30 mt-1.5 w-full space-y-0.5 rounded-md border border-border bg-white p-1.5 shadow-lg">
            {results.length === 0 ? (
              <div className="p-2.5 text-xs text-muted-foreground">No matching patients.</div>
            ) : (
              results.map((p) => (
                <button
                  key={p.id}
                  onClick={() => goToPatient(p.id)}
                  className="flex w-full items-center gap-2.5 rounded-md p-2 text-left transition-colors hover:bg-accent-50"
                >
                  <Avatar className="h-7 w-7"><AvatarFallback className="bg-navy-100 text-[11px] text-navy-700">{initials(p.name)}</AvatarFallback></Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-foreground">{p.name}</div>
                    <div className="text-xs text-muted-foreground"><span className="font-mono text-secondary">{p.mrNo}</span> · {p.phone}</div>
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="relative rounded-md p-1.5 transition-colors hover:bg-muted">
              <Bell className="h-5 w-5 text-muted-foreground" />
              {notifications.length > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-danger-600 text-[10px] font-semibold text-white">
                  {notifications.length}
                </span>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel>Notifications</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {notifications.length === 0 ? (
              <div className="p-3 text-sm text-muted-foreground">You're all caught up.</div>
            ) : (
              notifications.map((n) => (
                <DropdownMenuItem key={n.id} onClick={() => navigate(n.to)} className="flex-col items-start gap-0.5 py-2">
                  <span className="text-sm font-medium text-foreground">{n.title}</span>
                  {n.detail && <span className="text-xs text-muted-foreground">{n.detail}</span>}
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="hidden font-mono text-xs text-muted-foreground sm:block">
          {format(now, "dd MMM yyyy · HH:mm:ss")}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-md p-1 pr-2 transition-colors hover:bg-muted">
              <Avatar className="h-7 w-7"><AvatarFallback className="bg-navy-700 text-[11px] text-white">{initials(user?.name ?? "")}</AvatarFallback></Avatar>
              <span className="text-sm font-medium text-foreground">{firstName(user?.name)}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel>{user?.name}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => toast({ title: "Profile", description: "Full profile editing arrives in a later phase." })}>
              <UserIcon className="h-4 w-4" /> Profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => toast({ title: "Change Password", description: "Not wired up in this prototype." })}>
              <KeyRound className="h-4 w-4" /> Change Password
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout} className="text-danger-600 focus:text-danger-600">
              <LogOut className="h-4 w-4" /> Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
