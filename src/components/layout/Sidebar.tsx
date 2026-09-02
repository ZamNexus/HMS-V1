import { NavLink } from "react-router-dom"
import {
  LayoutDashboard, Users, ClipboardList, Receipt, FlaskConical, Pill, ScanLine,
  UserCog, Stethoscope, Settings, BarChart3, LogOut, Activity,
} from "lucide-react"

import { cn, initials } from "@/lib/utils"
import { useAuth, canSee } from "@/lib/auth"
import { ROLE_LABELS, ROLE_BADGE_CLASSES } from "@/data/users"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"

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
  { label: "Main", items: [{ key: "dashboard", label: "Dashboard", to: "/dashboard", icon: LayoutDashboard }] },
  {
    label: "Clinical",
    items: [
      { key: "patients", label: "Patients", to: "/patients", icon: Users },
      { key: "encounters", label: "Encounters", to: "/encounters", icon: ClipboardList },
    ],
  },
  { label: "Financial", items: [{ key: "billing", label: "Billing", to: "/billing", icon: Receipt }] },
  {
    label: "Services",
    items: [
      { key: "laboratory", label: "Laboratory", to: "/lab/orders", icon: FlaskConical },
      { key: "imaging", label: "Imaging", to: "/imaging/orders", icon: ScanLine },
      { key: "pharmacy", label: "Pharmacy", to: "/pharmacy/inventory", icon: Pill },
    ],
  },
  {
    label: "Administration",
    items: [
      { key: "users", label: "Users", to: "/admin/users", icon: UserCog },
      { key: "doctors", label: "Doctors", to: "/admin/doctors", icon: Stethoscope },
      { key: "master-data", label: "Master Data", to: "/admin/master-data", icon: Settings },
      { key: "reports", label: "Reports", to: "/reports", icon: BarChart3 },
    ],
  },
]

export function Sidebar() {
  const { user, logout } = useAuth()
  if (!user) return null

  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-60 flex-col bg-navy-900 text-white">
      <div className="flex h-16 items-center gap-2 px-5">
        <Activity className="h-5 w-5 text-teal-600" />
        <span className="text-[15px] font-bold text-teal-600">Citi Clinic</span>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-4">
        {SECTIONS.map((section) => {
          const items = section.items.filter((item) => canSee(user.role, item.key))
          if (items.length === 0) return null
          return (
            <div key={section.label} className="mb-3">
              <div className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-white/35">
                {section.label}
              </div>
              {items.map((item) => (
                <NavLink
                  key={item.key}
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      isActive ? "bg-teal-600 text-white" : "text-white/70 hover:bg-teal-600/10 hover:text-white"
                    )
                  }
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </NavLink>
              ))}
            </div>
          )
        })}
      </nav>

      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-2.5 rounded-md px-1 py-1.5">
          <Avatar className="h-9 w-9 shrink-0">
            <AvatarFallback className="bg-navy-700 text-white">{initials(user.name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold text-white">{user.name}</div>
            <Badge className={cn("mt-0.5 text-[10px]", ROLE_BADGE_CLASSES[user.role])}>
              {ROLE_LABELS[user.role]}
            </Badge>
          </div>
        </div>
        <button
          onClick={logout}
          className="mt-2 flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-white/70 transition-colors hover:bg-danger-600/20 hover:text-white"
        >
          <LogOut className="h-4 w-4" />
          Logout
        </button>
      </div>
    </aside>
  )
}
