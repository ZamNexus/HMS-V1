import * as React from "react"
import { NavLink } from "react-router-dom"
import {
  LayoutDashboard, Users, ClipboardList, Receipt, FlaskConical, Pill, ScanLine,
  UserCog, Stethoscope, Settings, BarChart3, LogOut, Activity, X, ShieldCheck
} from "lucide-react"

import { cn, initials } from "@/lib/utils"
import { useAuth, canSee } from "@/lib/auth"
import { ROLE_LABELS } from "@/data/users"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"

interface NavItem {
  key: string
  label: string
  to: string
  icon: React.ComponentType<{ className?: string }>
}

interface NavSection {
  label: string
  items: NavItem[]
}

const SECTIONS: NavSection[] = [
  { 
    label: "Overview", 
    items: [
      { key: "dashboard", label: "Dashboard", to: "/dashboard", icon: LayoutDashboard }
    ] 
  },
  {
    label: "Clinical Care",
    items: [
      { key: "patients", label: "Patients", to: "/patients", icon: Users },
      { key: "encounters", label: "Encounters", to: "/encounters", icon: ClipboardList },
    ],
  },
  { 
    label: "Finance", 
    items: [
      { key: "billing", label: "Billing & Invoices", to: "/billing", icon: Receipt }
    ] 
  },
  {
    label: "Diagnostics & Pharmacy",
    items: [
      { key: "laboratory", label: "Laboratory", to: "/lab/orders", icon: FlaskConical },
      { key: "imaging", label: "Imaging & Radiology", to: "/imaging/orders", icon: ScanLine },
      { key: "pharmacy", label: "Pharmacy Inventory", to: "/pharmacy/inventory", icon: Pill },
    ],
  },
  {
    label: "Administration",
    items: [
      { key: "users", label: "User Access", to: "/admin/users", icon: UserCog },
      { key: "doctors", label: "Medical Staff", to: "/admin/doctors", icon: Stethoscope },
      { key: "master-data", label: "Master Data", to: "/admin/master-data", icon: Settings },
      { key: "reports", label: "Analytics & Reports", to: "/reports", icon: BarChart3 },
    ],
  },
]

export function Sidebar({ open = false, onClose }: { open?: boolean; onClose?: () => void }) {
  const { user, logout } = useAuth()
  if (!user) return null

  return (
    <>
      {/* Mobile Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-[#0A1B33]/80 backdrop-blur-sm transition-opacity duration-300 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Main Sidebar Container */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-gradient-to-b from-[#0A1B33] via-[#0F2A4D] to-[#0A1B33] border-r border-white/10 text-white shadow-2xl transition-transform duration-300 ease-in-out lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Brand Header */}
        <div className="flex h-18 items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#1CC0CE] to-[#0891B2] shadow-lg shadow-[#1CC0CE]/25 ring-1 ring-white/20">
              <Activity className="h-5 w-5 text-white" />
            </div>
            <div className="flex flex-col justify-center">
              <div className="flex items-center gap-1.5">
                <span className="text-base font-extrabold tracking-tight text-white leading-none">Citi Clinic</span>
                <span className="rounded-full bg-[#1CC0CE]/20 px-1.5 py-0.5 text-[9px] font-bold text-[#1CC0CE] leading-none">v1.0</span>
              </div>
              <p className="mt-1 text-[10px] font-medium tracking-wider uppercase text-[#7FA3C8] leading-none">
                Hospital System
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white transition-colors lg:hidden"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Nav Links List */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
          {SECTIONS.map((section) => {
            const items = section.items.filter((item) => canSee(user.role, item.key))
            if (items.length === 0) return null

            return (
              <div key={section.label} className="space-y-1.5">
                <div className="px-3 text-[10px] font-bold uppercase tracking-wider text-[#7FA3C8]">
                  {section.label}
                </div>
                <div className="space-y-1">
                  {items.map((item) => (
                    <NavLink
                      key={item.key}
                      to={item.to}
                      onClick={onClose}
                      className={({ isActive }) =>
                        cn(
                          "group relative flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all duration-200",
                          isActive
                            ? "bg-gradient-to-r from-[#1CC0CE] to-[#0891B2] text-white font-semibold shadow-lg shadow-[#1CC0CE]/20"
                            : "text-slate-300 hover:text-white hover:bg-white/[0.08] hover:translate-x-0.5"
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <item.icon
                            className={cn(
                              "h-4 w-4 shrink-0 transition-transform duration-200 group-hover:scale-110",
                              isActive ? "text-white" : "text-[#7FA3C8] group-hover:text-[#1CC0CE]"
                            )}
                          />
                          <span className="truncate leading-none mt-[1px]">{item.label}</span>
                        </>
                      )}
                    </NavLink>
                  ))}
                </div>
              </div>
            )
          })}
        </nav>

        {/* User Identity & Logout Card */}
        <div className="border-t border-white/10 bg-black/20 p-3.5 backdrop-blur-md">
          <div className="rounded-xl border border-white/10 bg-white/[0.06] p-3 shadow-inner">
            <div className="flex items-center gap-3">
              <Avatar className="h-9 w-9 shrink-0 ring-2 ring-[#1CC0CE]/40 shadow-sm flex items-center justify-center">
                <AvatarFallback className="bg-gradient-to-br from-[#1CC0CE] to-[#0891B2] text-xs font-bold text-white flex items-center justify-center w-full h-full">
                  {initials(user.name)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1 flex flex-col justify-center">
                <div className="truncate text-xs font-bold text-white leading-none mb-1.5">{user.name}</div>
                <div className="flex items-center gap-1 text-[10px] font-medium text-[#7FA3C8] leading-none">
                  <ShieldCheck className="h-3 w-3 text-[#1CC0CE]" />
                  <span className="truncate leading-none mt-[1px]">{ROLE_LABELS[user.role]}</span>
                </div>
              </div>
            </div>

            <button
              onClick={logout}
              className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-lg border border-white/5 bg-white/[0.05] px-2.5 py-1.5 text-xs font-medium text-slate-300 transition-all hover:border-red-500/30 hover:bg-red-500/20 hover:text-red-300"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}
