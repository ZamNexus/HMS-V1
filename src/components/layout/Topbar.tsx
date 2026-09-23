import * as React from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { format } from "date-fns"
import { 
  Bell, LogOut, Menu, User as UserIcon, KeyRound, Clock, 
  ChevronRight, AlertCircle, CheckCircle2
} from "lucide-react"

import { useAuth } from "@/lib/auth"
import { MEDICINES } from "@/data/medicines"
import { LAB_ORDERS } from "@/data/lab"
import { initials } from "@/lib/utils"
import { ROLE_LABELS } from "@/data/users"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, 
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useToast } from "@/components/ui/use-toast"

function firstName(name?: string) {
  if (!name) return ""
  const parts = name.split(" ").filter(Boolean)
  const idx = parts[0] === "Dr." || parts[0] === "Nurse" ? 1 : 0
  return parts[idx] ?? parts[0]
}

const BREADCRUMB_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  patients: "Patients",
  encounters: "Encounters",
  billing: "Billing",
  lab: "Laboratory",
  orders: "Orders",
  imaging: "Imaging",
  pharmacy: "Pharmacy",
  inventory: "Inventory",
  admin: "Administration",
  users: "Users",
  doctors: "Doctors",
  "master-data": "Master Data",
  reports: "Reports",
  opd: "OPD",
  ipd: "IPD",
}

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
        title: `${resultsReady.length} Lab orders completed`, 
        detail: "Reports available for verification", 
        to: "/lab/orders", 
        tone: "info" 
      })
    }

    const outOfStock = MEDICINES.filter((m) => m.stock === 0)
    if (outOfStock.length > 0) {
      items.push({ 
        id: "out-of-stock", 
        title: `${outOfStock.length} Medicines out of stock`, 
        detail: "Requires pharmacy reordering", 
        to: "/pharmacy/inventory", 
        tone: "danger" 
      })
    }

    const lowStock = MEDICINES.filter((m) => m.stock > 0 && m.stock <= m.reorderLevel)
    if (lowStock.length > 0) {
      items.push({
        id: "low-stock",
        title: `${lowStock.length} Medicines running low`,
        detail: "Restock before depletion",
        to: "/pharmacy/inventory",
        tone: "warning"
      })
    }

    return items
  }, [])
}

export function Topbar({ onMenuClick }: { onMenuClick?: () => void }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()
  const crumbs = useBreadcrumb()
  const notifications = useNotifications()

  const [now, setNow] = React.useState(new Date())

  React.useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  if (!user) return null

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-[#E2E8F0] bg-white/80 px-4 sm:px-6 lg:px-8 backdrop-blur-md">
      {/* Left Section: Mobile Toggle & Breadcrumbs */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onMenuClick}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 lg:hidden"
          aria-label="Open sidebar"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Breadcrumb Trail */}
        <nav aria-label="Breadcrumb" className="hidden sm:flex items-center gap-1.5 text-xs text-slate-500 font-medium overflow-hidden">
          <button 
            onClick={() => navigate("/dashboard")} 
            className="text-slate-500 hover:text-[#0891B2] transition-colors leading-none mt-[1px]"
          >
            Citi Clinic
          </button>
          {crumbs.length === 0 ? (
            <>
              <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
              <span className="font-semibold text-slate-900 leading-none mt-[1px]">Dashboard</span>
            </>
          ) : (
            crumbs.map((c, i) => (
              <React.Fragment key={c.to}>
                <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                {i === crumbs.length - 1 ? (
                  <span className="font-semibold text-slate-900 truncate leading-none mt-[1px]">{c.label}</span>
                ) : (
                  <button 
                    onClick={() => navigate(c.to)} 
                    className="hover:text-[#0891B2] transition-colors truncate leading-none mt-[1px]"
                  >
                    {c.label}
                  </button>
                )}
              </React.Fragment>
            ))
          )}
        </nav>
      </div>

      <div className="flex-1" /> {/* Spacer */}

      {/* Right Section: Time, Notifications & Profile */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Live Clock Badge */}
        <div className="hidden xl:flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50/80 px-3 py-1.5 text-xs font-medium text-slate-600">
          <Clock className="h-3.5 w-3.5 text-[#0891B2]" />
          <span className="leading-none mt-[1px]">{format(now, "dd MMM · HH:mm:ss")}</span>
        </div>

        {/* Notifications Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="relative flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 outline-none">
              <Bell className="h-4 w-4" />
              {notifications.length > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white ring-2 ring-white">
                  {notifications.length}
                </span>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80 rounded-xl p-2 shadow-xl border-slate-200">
            <div className="flex items-center justify-between px-2 py-1.5">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">System Alerts</span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                {notifications.length} New
              </span>
            </div>
            <DropdownMenuSeparator />
            {notifications.length === 0 ? (
               <div className="p-4 text-center text-xs text-slate-500">
                All systems optimal. No alerts.
              </div>
            ) : (
              <div className="space-y-1">
                {notifications.map((n) => (
                  <DropdownMenuItem
                    key={n.id}
                    onClick={() => navigate(n.to)}
                    className="flex cursor-pointer items-start gap-2.5 rounded-lg p-2.5 hover:bg-slate-50"
                  >
                    {n.tone === "danger" ? (
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                    ) : (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#0891B2]" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-slate-900">{n.title}</div>
                      <div className="text-[11px] text-slate-500 truncate">{n.detail}</div>
                    </div>
                  </DropdownMenuItem>
                ))}
              </div>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* User Profile Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2.5 rounded-full border border-slate-200 bg-white p-1 pr-2.5 transition-all hover:border-slate-300 hover:shadow-sm outline-none">
              <Avatar className="h-7 w-7 ring-1 ring-[#1CC0CE]/30 flex items-center justify-center">
                <AvatarFallback className="bg-gradient-to-br from-[#0F2A4D] to-[#16375F] text-[11px] font-bold text-white flex items-center justify-center w-full h-full">
                  {initials(user.name)}
                </AvatarFallback>
              </Avatar>
              <div className="hidden flex-col justify-center text-left md:flex">
                <div className="text-xs font-bold text-slate-900 leading-none mb-1">{firstName(user.name)}</div>
                <div className="text-[9px] font-medium text-slate-500 uppercase tracking-wider leading-none">{ROLE_LABELS[user.role]}</div>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 rounded-xl p-2 shadow-xl border-slate-200">
            <DropdownMenuLabel className="font-normal p-2">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-semibold leading-none text-slate-900">{user.name}</p>
                <p className="text-xs text-slate-500 truncate">{user.email}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              className="rounded-lg p-2 cursor-pointer hover:bg-slate-50"
              onClick={() => navigate("/profile")}
            >
              <UserIcon className="mr-2 h-4 w-4 text-slate-400" />
              <span>Profile Settings</span>
            </DropdownMenuItem>
            <DropdownMenuItem 
              className="rounded-lg p-2 cursor-pointer hover:bg-slate-50"
              onClick={() => navigate("/profile")}
            >
              <KeyRound className="mr-2 h-4 w-4 text-slate-400" />
              <span>Change Password</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              className="rounded-lg p-2 cursor-pointer text-red-600 hover:bg-red-50 hover:text-red-700" 
              onClick={logout}
            >
              <LogOut className="mr-2 h-4 w-4" />
              <span>Sign Out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
