import * as React from "react"
import { Link, useNavigate } from "react-router-dom"
import { format, formatDistanceToNow } from "date-fns"
import {
  Users, Banknote, FlaskConical, BedDouble, ArrowUpRight, AlertTriangle, Pill,
  Activity, ArrowRight, Stethoscope, ChevronRight, CalendarCheck
} from "lucide-react"
import {
  Bar, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Area, AreaChart,
} from "recharts"

import { useAuth } from "@/lib/auth"
import { PATIENTS } from "@/data/patients"
import { MEDICINES } from "@/data/medicines"
import { formatCurrency, initials, cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/shared/StatusBadge"

const WEEKLY_VISITS = [
  { day: "Mon", count: 18 }, { day: "Tue", count: 22 }, { day: "Wed", count: 19 },
  { day: "Thu", count: 31 }, { day: "Fri", count: 28 }, { day: "Sat", count: 15 }, { day: "Sun", count: 8 },
]
const REVENUE_7D = [35000, 42000, 38000, 51000, 44000, 39000, 42500]
const revenueData = REVENUE_7D.map((v, i) => ({
  label: format(new Date(Date.now() - (6 - i) * 86400000), "dd MMM"),
  value: v,
}))

const APPOINTMENTS = [
  { time: "09:00", patient: "Kamran Iqbal", mr: "MR-2024-0091", doctor: "Dr. Sarah Khan", type: "OPD", status: "Completed" },
  { time: "09:30", patient: "Sana Butt", mr: "MR-2024-0145", doctor: "Dr. Sarah Khan", type: "OPD", status: "In Progress" },
  { time: "10:00", patient: "Muhammad Ali", mr: "MR-2024-0203", doctor: "Dr. Imran Siddiqui", type: "OPD", status: "Waiting" },
  { time: "10:30", patient: "Asma Nawaz", mr: "MR-2024-0067", doctor: "Dr. Sarah Khan", type: "OPD", status: "Waiting" },
  { time: "11:00", patient: "Tariq Mehmood", mr: "MR-2024-0312", doctor: "Dr. Imran Siddiqui", type: "Cardiology", status: "Waiting" },
]

function greet() {
  const h = new Date().getHours()
  if (h < 12) return "Good morning"
  if (h < 17) return "Good afternoon"
  return "Good evening"
}

// ─── PREMIUM KPI TILE ────────────────────────────────────────────
function KpiTile({
  label, value, icon: Icon, iconColor, bgStyle, trend, onClick,
}: {
  label: string; value: string; icon: any; iconColor: string; bgStyle: string; trend?: string; onClick?: () => void
}) {
  return (
    <div 
      className={cn(
        "relative overflow-hidden rounded-[1.5rem] bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-black/5 transition-all duration-300 group",
        onClick ? "cursor-pointer hover:shadow-[0_20px_40px_rgb(0,0,0,0.08)] hover:-translate-y-1" : ""
      )}
      onClick={onClick}
    >
      <div className={cn("absolute -right-6 -top-6 rounded-full p-10 transition-transform group-hover:scale-110", bgStyle)}>
        <Icon className={cn("h-10 w-10 opacity-20", iconColor)} strokeWidth={1.5} />
      </div>
      <div className="relative z-10">
        <div className="flex items-center gap-3 mb-3">
          <div className={cn("flex h-12 w-12 items-center justify-center rounded-[14px]", bgStyle)}>
            <Icon className={cn("h-6 w-6", iconColor)} />
          </div>
        </div>
        <div className="text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">{label}</div>
        <div className="text-3xl font-black text-[#0D1B2E] tracking-tight">{value}</div>
        {trend && (
          <div className="mt-2 flex items-center gap-1.5 text-[11px] font-bold text-emerald-600">
            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-100">
              <ArrowUpRight className="h-2.5 w-2.5" />
            </span>
            <span>{trend}</span>
          </div>
        )}
      </div>
    </div>
  )
}

export function DashboardPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  if (!user) return null

  const lowStock = MEDICINES.filter((m) => m.stock < m.reorderLevel)
  const criticalStock = MEDICINES.filter((m) => m.stock === 0)
  const recentPatients = [...PATIENTS]
    .sort((a, b) => new Date(b.registrationDate).getTime() - new Date(a.registrationDate).getTime())
    .slice(0, 5)

  const showRevenue = user.role === "admin" || user.role === "billing"
  const canAddPatient = user.role === "admin" || user.role === "receptionist"

  return (
    <div className="space-y-8 pb-10 max-w-[90rem] mx-auto animate-in fade-in duration-500">
      
      {/* ─── PREMIUM HERO BANNER ───────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-[1.5rem] bg-[#0A1B33] p-6 sm:p-8 shadow-2xl">
        <div className="absolute top-0 right-0 h-full w-full opacity-10 pointer-events-none">
          <svg className="absolute h-full w-full" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="grid-pattern" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="1"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid-pattern)" />
          </svg>
        </div>
        <div className="absolute -top-[50%] -right-[10%] h-[200%] w-[60%] rounded-full bg-gradient-to-bl from-[#1CC0CE]/20 to-transparent blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div>
            <div className="mb-3 flex items-center gap-2">
              <span className="flex items-center justify-center bg-white/10 rounded-lg p-1.5 backdrop-blur-sm">
                <CalendarCheck className="h-4 w-4 text-[#1CC0CE]" />
              </span>
              <span className="font-bold tracking-widest text-[11px] uppercase text-[#1CC0CE]">{format(new Date(), "EEEE, MMMM do, yyyy")}</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight leading-tight">
              {greet()}, <span className="text-[#1CC0CE]">{user.name.replace(/^Dr\.\s|^Nurse\s/, "").split(" ")[0]}</span>
            </h1>
            <p className="mt-2 text-slate-300 text-sm font-medium max-w-2xl">
              Here is what's happening at Citi Clinic today. You have <strong className="text-white bg-white/10 px-2 py-0.5 rounded-md mx-1">24</strong> OPD patients and <strong className="text-white bg-white/10 px-2 py-0.5 rounded-md mx-1">7</strong> pending lab reports.
            </p>
          </div>
          
          <div className="flex flex-wrap shrink-0 gap-3 mt-2 lg:mt-0">
            {showRevenue && (
              <Button variant="outline" className="rounded-xl h-11 px-5 font-bold bg-white/5 border-white/10 text-white hover:bg-white/10 backdrop-blur-sm" onClick={() => navigate("/dashboard/stats")}>
                <Activity className="h-4 w-4 mr-2" /> Financial Stats
              </Button>
            )}
            {canAddPatient && (
              <Button className="rounded-xl h-11 px-6 bg-[#0F2A4D] hover:bg-[#16375F] text-white font-black shadow-lg shadow-[#0F2A4D]/30 ring-1 ring-white/10" onClick={() => navigate("/patients/new")}>
                Register Patient <ArrowRight className="h-4 w-4 ml-2 text-white/70" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ─── ALERTS ────────────────────────────────────────────────────── */}
      {lowStock.length > 0 && user.role !== "lab_tech" && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-[1.5rem] bg-rose-50 p-5 ring-1 ring-rose-100 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rose-100 text-rose-600">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div>
              <h4 className="font-black text-rose-900 text-base">Critical Inventory Alert</h4>
              <p className="text-sm font-semibold text-rose-600 mt-0.5">
                {lowStock.slice(0, 3).map((m) => `${m.name} (${m.stock})`).join(" • ")}
                {criticalStock.length > 0 && ` • ${criticalStock.length} items completely out of stock`}
              </p>
            </div>
          </div>
          <Button className="rounded-xl font-bold bg-rose-600 hover:bg-rose-700 text-white shrink-0 shadow-sm h-11 px-6" onClick={() => navigate("/pharmacy/inventory")}>
            Restock Inventory
          </Button>
        </div>
      )}

      {/* ─── KPI ROW ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {user.role === "pharmacist" ? (
          <>
            <KpiTile label="Dispensed Today" value="18" icon={Pill} bgStyle="bg-emerald-50" iconColor="text-emerald-600" trend="+4 from yesterday" />
            <KpiTile label="Low Stock Items" value={String(lowStock.length)} icon={AlertTriangle} bgStyle="bg-rose-50" iconColor="text-rose-600" onClick={() => navigate("/pharmacy/inventory")} />
          </>
        ) : user.role === "lab_tech" ? (
          <>
            <KpiTile label="Pending Orders" value="7" icon={FlaskConical} bgStyle="bg-amber-50" iconColor="text-amber-600" />
            <KpiTile label="Completed Today" value="12" icon={Users} bgStyle="bg-emerald-50" iconColor="text-emerald-600" />
          </>
        ) : (
          <>
            <KpiTile
              label="Today's Patients"
              value="24"
              icon={Users}
              bgStyle="bg-[#1CC0CE]/10"
              iconColor="text-[#0891B2]"
              trend="+3 from yesterday"
            />
            {user.role === "doctor" ? (
              <KpiTile label="My Patients" value="11" icon={Stethoscope} bgStyle="bg-[#1CC0CE]/10" iconColor="text-[#0891B2]" />
            ) : showRevenue ? (
              <KpiTile label="Revenue Today" value={formatCurrency(42500)} icon={Banknote} bgStyle="bg-emerald-50" iconColor="text-emerald-600" trend="+12% vs yesterday" />
            ) : null}
            <KpiTile label="Pending Lab Reports" value="7" icon={FlaskConical} bgStyle="bg-amber-50" iconColor="text-amber-600" />
            <KpiTile label="Admitted (IPD)" value="3" icon={BedDouble} bgStyle="bg-indigo-50" iconColor="text-indigo-600" trend="2 male · 1 female" />
          </>
        )}
      </div>

      {/* ─── CHARTS ROW ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <div className="rounded-[1.5rem] bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-black/5 p-6 flex flex-col">
          <div className="mb-6">
            <h2 className="text-xl font-black text-[#0D1B2E] tracking-tight">Patient Flow This Week</h2>
            <p className="text-sm font-bold text-slate-400 mt-1 uppercase tracking-wider">Total 141 visits over the last 7 days</p>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={WEEKLY_VISITS} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
              <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={11} tick={{ fill: "#94A3B8", fontWeight: 700 }} dy={10} />
              <YAxis tickLine={false} axisLine={false} fontSize={11} tick={{ fill: "#94A3B8", fontWeight: 700 }} />
              <Tooltip 
                cursor={{ fill: "#F8FAFC" }}
                contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)", fontWeight: 700, color: "#0D1B2E" }}
                formatter={(v) => [`${v} patients`, "Visits"]}
              />
              <Bar dataKey="count" fill="#1CC0CE" radius={[6, 6, 0, 0]} barSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {showRevenue ? (
          <div className="rounded-[1.5rem] bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-black/5 p-6 flex flex-col">
            <div className="mb-6">
              <h2 className="text-xl font-black text-[#0D1B2E] tracking-tight">Revenue Trajectory</h2>
              <p className="text-sm font-bold text-slate-400 mt-1 uppercase tracking-wider">Cash flow across all departments</p>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={revenueData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0F2A4D" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#0F2A4D" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} tick={{ fill: "#94A3B8", fontWeight: 700 }} dy={10} />
                <YAxis tickLine={false} axisLine={false} fontSize={11} tick={{ fill: "#94A3B8", fontWeight: 700 }} />
                <Tooltip 
                  contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)", fontWeight: 700, color: "#0D1B2E" }}
                  formatter={(v) => [formatCurrency(Number(v)), "Revenue"]} 
                />
                <Area type="monotone" dataKey="value" stroke="#0F2A4D" strokeWidth={4} fill="url(#revGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : null}
      </div>

      {/* ─── BOTTOM ROW ────────────────────────────────────────────────── */}
      {user.role !== "lab_tech" && user.role !== "pharmacist" && (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          
          {/* APPOINTMENTS TABLE */}
          <div className="lg:col-span-2 rounded-[1.5rem] bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-black/5 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-6 pb-4 border-b border-slate-100">
              <div>
                <h2 className="text-xl font-black text-[#0D1B2E] tracking-tight">Up Next</h2>
                <p className="text-sm font-bold text-slate-400 mt-0.5 uppercase tracking-wider">Today's scheduled appointments</p>
              </div>
              <Button variant="ghost" className="text-[#0891B2] font-black hover:bg-[#1CC0CE]/10 rounded-xl px-4 hidden sm:flex">
                View Full Schedule <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
            
            <div className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50/80 border-b border-slate-100">
                  <tr>
                    <th className="py-4 px-6 text-left text-[11px] font-black uppercase tracking-wider text-slate-500">Time</th>
                    <th className="py-4 px-6 text-left text-[11px] font-black uppercase tracking-wider text-slate-500">Patient</th>
                    <th className="hidden py-4 px-6 text-left text-[11px] font-black uppercase tracking-wider text-slate-500 sm:table-cell">Doctor</th>
                    <th className="hidden py-4 px-6 text-left text-[11px] font-black uppercase tracking-wider text-slate-500 md:table-cell">Type</th>
                    <th className="py-4 px-6 text-right text-[11px] font-black uppercase tracking-wider text-slate-500">Status</th>
                  </tr>
                </thead>
                <tbody className="bg-white">
                  {APPOINTMENTS.map((a) => {
                    const patient = PATIENTS.find((p) => p.name === a.patient)
                    return (
                      <tr
                        key={a.time + a.patient}
                        className="cursor-pointer transition-colors hover:bg-slate-50 border-b border-slate-50 last:border-0 group"
                        onClick={() => patient && navigate(`/patients/${patient.id}`)}
                      >
                        <td className="py-4 px-6 font-mono font-bold text-[#0D1B2E]">{a.time}</td>
                        <td className="py-4 px-6">
                          <div className="font-bold text-[#0D1B2E] group-hover:text-[#0891B2] transition-colors">{a.patient}</div>
                          <div className="font-mono text-[11px] font-semibold text-slate-400 sm:hidden mt-0.5">{a.mr}</div>
                        </td>
                        <td className="hidden py-4 px-6 font-bold text-slate-600 sm:table-cell">{a.doctor}</td>
                        <td className="hidden py-4 px-6 md:table-cell">
                          <span className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-black text-slate-500 tracking-wide uppercase">
                            {a.type}
                          </span>
                        </td>
                        <td className="py-4 px-6 text-right">
                          <StatusBadge status={a.status} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* RECENT PATIENTS */}
          <div className="rounded-[1.5rem] bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-black/5 flex flex-col overflow-hidden">
            <div className="p-6 pb-4 border-b border-slate-100">
              <h2 className="text-xl font-black text-[#0D1B2E] tracking-tight">Recently Registered</h2>
            </div>
            <div className="p-4 space-y-2 flex-1 bg-slate-50/50">
              {recentPatients.map((p) => (
                <Link
                  key={p.id}
                  to={`/patients/${p.id}`}
                  className="flex items-center gap-4 rounded-2xl p-3 bg-white ring-1 ring-slate-100 transition-all duration-300 hover:shadow-md hover:ring-black/5 group"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-slate-100 text-[#0D1B2E] shadow-inner font-black text-sm group-hover:bg-[#0F2A4D] group-hover:text-white transition-colors">
                    {initials(p.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-black text-[#0D1B2E] group-hover:text-[#0891B2] transition-colors">{p.name}</div>
                    <div className="font-mono text-[11px] font-bold text-slate-400 mt-0.5">{p.mrNo}</div>
                  </div>
                  <div className="shrink-0 text-right text-[11px] font-bold text-slate-400">
                    <div>{formatDistanceToNow(new Date(p.registrationDate), { addSuffix: true })}</div>
                  </div>
                </Link>
              ))}
            </div>
            <div className="p-4 bg-white border-t border-slate-100">
              <Button variant="ghost" className="w-full rounded-xl font-black text-[#0F2A4D] hover:bg-slate-50 h-11" asChild>
                <Link to="/patients">View All Patients</Link>
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
