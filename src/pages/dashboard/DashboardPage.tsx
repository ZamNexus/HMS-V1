import * as React from "react"
import { Link, useNavigate } from "react-router-dom"
import { format, formatDistanceToNow } from "date-fns"
import {
  Users, Banknote, FlaskConical, BedDouble, ArrowUpRight, AlertTriangle, Pill,
} from "lucide-react"
import {
  Bar, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Area, AreaChart,
} from "recharts"

import { useAuth } from "@/lib/auth"
import { PATIENTS } from "@/data/patients"
import { MEDICINES } from "@/data/medicines"
import { ENCOUNTERS } from "@/data/encounters"
import { formatCurrency, initials, cn } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
  { time: "11:30", patient: "Nadia Hussain", mr: "MR-2024-0188", doctor: "Dr. Nadia Rehman", type: "Gynae", status: "Scheduled" },
  { time: "14:00", patient: "Rashid Anwar", mr: "MR-2024-0099", doctor: "Dr. Imran Siddiqui", type: "Follow-up", status: "Scheduled" },
  { time: "15:00", patient: "Uzma Shah", mr: "MR-2024-0277", doctor: "Dr. Sarah Khan", type: "OPD", status: "Scheduled" },
]

function greet() {
  const h = new Date().getHours()
  if (h < 12) return "Good morning"
  if (h < 17) return "Good afternoon"
  return "Good evening"
}

function KpiTile({
  label, value, icon: Icon, iconClass, trend, onClick,
}: {
  label: string; value: string; icon: React.ComponentType<{ className?: string }>; iconClass: string; trend?: string; onClick?: () => void
}) {
  return (
    <Card className={cn(onClick && "cursor-pointer transition-shadow hover:shadow-md")} onClick={onClick}>
      <CardContent className="flex items-start justify-between p-5">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="mt-1 text-[28px] font-bold leading-none text-navy-700">{value}</div>
          {trend && (
            <div className="mt-2 flex items-center gap-1 text-xs text-success-600">
              <ArrowUpRight className="h-3.5 w-3.5" /> {trend}
            </div>
          )}
        </div>
        <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full", iconClass)}>
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
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

  const diagnosisCounts = ENCOUNTERS.reduce<Record<string, number>>((acc, e) => {
    acc[e.diagnosis] = (acc[e.diagnosis] ?? 0) + 1
    return acc
  }, {})
  const topDiagnoses = Object.entries(diagnosisCounts).sort((a, b) => b[1] - a[1]).slice(0, 5)

  const showRevenue = user.role === "admin" || user.role === "billing"
  const canAddPatient = user.role === "admin" || user.role === "receptionist"

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {greet()}, {user.name.replace(/^Dr\.\s|^Nurse\s/, "").split(" ")[0]}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{format(new Date(), "EEEE, dd MMMM yyyy")}</p>
        </div>
        <div className="flex gap-2">
          {showRevenue && (
            <Button variant="outline" asChild>
              <Link to="/dashboard/stats">Financial Statistics</Link>
            </Button>
          )}
          {canAddPatient && (
            <Button asChild>
              <Link to="/patients/new">+ New Patient</Link>
            </Button>
          )}
        </div>
      </div>

      {/* KPI ROW */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {user.role === "pharmacist" ? (
          <>
            <KpiTile label="Dispensed Today" value="18" icon={Pill} iconClass="bg-success-100 text-success-700" trend="+4 from yesterday" />
            <KpiTile label="Low Stock Items" value={String(lowStock.length)} icon={AlertTriangle} iconClass="bg-warning-100 text-warning-700" onClick={() => {}} />
          </>
        ) : user.role === "lab_tech" ? (
          <>
            <KpiTile label="Pending Orders" value="7" icon={FlaskConical} iconClass="bg-warning-100 text-warning-700" />
            <KpiTile label="Completed Today" value="12" icon={Users} iconClass="bg-success-100 text-success-700" />
          </>
        ) : (
          <>
            <KpiTile
              label="Today's OPD Patients"
              value="24"
              icon={Users}
              iconClass="bg-accent-100 text-teal-600"
              trend="+3 from yesterday"
            />
            {user.role === "doctor" ? (
              <KpiTile label="My Patients Today" value="11" icon={Users} iconClass="bg-accent-100 text-teal-600" />
            ) : showRevenue ? (
              <KpiTile label="Today's Revenue" value={formatCurrency(42500)} icon={Banknote} iconClass="bg-success-100 text-success-700" trend="+12% vs yesterday" />
            ) : null}
            <KpiTile label="Pending Lab Reports" value="7" icon={FlaskConical} iconClass="bg-warning-100 text-warning-700" />
            <KpiTile label="Active IPD Patients" value="3" icon={BedDouble} iconClass="bg-navy-100 text-navy-700" trend="2 male · 1 female" />
          </>
        )}
      </div>

      {/* CHARTS ROW */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Patient Visits This Week</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={WEEKLY_VISITS}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickLine={false} axisLine={false} fontSize={12} width={28} />
                <Tooltip formatter={(v) => [`${v} patients`, ""]} />
                <Bar dataKey="count" fill="#0891B2" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {showRevenue ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Revenue — Last 7 Days</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={revenueData}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0891B2" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="#0891B2" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                  <YAxis tickLine={false} axisLine={false} fontSize={12} width={40} />
                  <Tooltip formatter={(v) => [formatCurrency(Number(v)), "Revenue"]} />
                  <Area type="monotone" dataKey="value" stroke="#0891B2" strokeWidth={2} fill="url(#revGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Top Diagnoses</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {topDiagnoses.map(([dx, count]) => (
                <div key={dx} className="flex items-center justify-between text-sm">
                  <span className="text-foreground">{dx}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">{count}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      {/* BOTTOM ROW */}
      {user.role !== "lab_tech" && user.role !== "pharmacist" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Today's Appointments</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="p-3 text-left">Time</th>
                    <th className="p-3 text-left">Patient</th>
                    <th className="p-3 text-left">MR No.</th>
                    <th className="p-3 text-left">Doctor</th>
                    <th className="p-3 text-left">Type</th>
                    <th className="p-3 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {APPOINTMENTS.map((a) => {
                    const patient = PATIENTS.find((p) => p.name === a.patient)
                    return (
                      <tr
                        key={a.time + a.patient}
                        className="cursor-pointer border-b last:border-0 hover:bg-muted/40"
                        onClick={() => patient && navigate(`/patients/${patient.id}`)}
                      >
                        <td className="p-3 font-mono text-xs">{a.time}</td>
                        <td className="p-3">{a.patient}</td>
                        <td className="p-3 font-mono text-xs text-secondary">{a.mr}</td>
                        <td className="p-3">{a.doctor}</td>
                        <td className="p-3">{a.type}</td>
                        <td className="p-3">
                          <StatusBadge status={a.status} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Recently Registered</CardTitle>
              <Link to="/patients" className="text-xs font-medium text-secondary hover:underline">
                View all →
              </Link>
            </CardHeader>
            <CardContent className="space-y-1">
              {recentPatients.map((p) => (
                <Link
                  key={p.id}
                  to={`/patients/${p.id}`}
                  className="flex items-center gap-3 rounded-md p-2 transition-colors hover:bg-accent-50"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy-700 text-xs font-semibold text-white">
                    {initials(p.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-foreground">{p.name}</div>
                    <div className="font-mono text-[11px] text-secondary">{p.mrNo}</div>
                  </div>
                  <div className="shrink-0 text-right text-[11px] text-muted-foreground">
                    <div>{p.phone}</div>
                    <div>{formatDistanceToNow(new Date(p.registrationDate), { addSuffix: true })}</div>
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {lowStock.length > 0 && user.role !== "lab_tech" && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-warning-100 bg-warning-50 p-3 text-sm text-warning-700">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>
              Low stock alert — {lowStock.slice(0, 3).map((m) => `${m.name}: ${m.stock} units`).join(" · ")}
              {criticalStock.length > 0 && ` · ${criticalStock.length} out of stock`}
            </span>
          </div>
          <Link to="/pharmacy/inventory" className="shrink-0 font-medium hover:underline">
            View Pharmacy →
          </Link>
        </div>
      )}
    </div>
  )
}
