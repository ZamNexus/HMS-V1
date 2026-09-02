import { format, subMonths } from "date-fns"
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts"

import { PATIENTS } from "@/data/patients"
import { PANELS } from "@/data/organisations"
import { Card, CardContent } from "@/components/ui/card"

const GENDER_COLORS: Record<string, string> = { Male: "#0891B2", Female: "#EC4899", Other: "#64748B" }
const PANEL_COLORS = ["#0891B2", "#1A3C6E", "#059669", "#D97706", "#7C3AED", "#64748B"]

export function PatientDemographicsReport() {
  const genderCounts = ["Male", "Female", "Other"].map((g) => ({ name: g, value: PATIENTS.filter((p) => p.gender === g).length })).filter((g) => g.value > 0)

  const ageGroups = [
    { label: "0–12", min: 0, max: 12 }, { label: "13–18", min: 13, max: 18 }, { label: "19–30", min: 19, max: 30 },
    { label: "31–45", min: 31, max: 45 }, { label: "46–60", min: 46, max: 60 }, { label: "60+", min: 61, max: 200 },
  ]
  const ageData = ageGroups.map((g) => ({ label: g.label, count: PATIENTS.filter((p) => p.age >= g.min && p.age <= g.max).length }))

  const selfPay = PATIENTS.filter((p) => p.panelId === null).length
  const panelData = [
    { name: "Self-Pay", value: selfPay },
    ...PANELS.map((panel) => ({ name: panel.name, value: PATIENTS.filter((p) => p.panelId === panel.id).length })).filter((p) => p.value > 0),
  ]

  const areaCounts = new Map<string, number>()
  PATIENTS.forEach((p) => { const area = p.area ?? "Other"; areaCounts.set(area, (areaCounts.get(area) ?? 0) + 1) })
  const areaData = [...areaCounts.entries()].sort((a, b) => b[1] - a[1])
  const maxArea = areaData[0]?.[1] ?? 1

  const months = [...Array(6)].map((_, i) => subMonths(new Date(), 5 - i))
  const monthlyData = months.map((m) => {
    const label = format(m, "MMM")
    const count = PATIENTS.filter((p) => {
      const d = new Date(p.registrationDate)
      return d.getMonth() === m.getMonth() && d.getFullYear() === m.getFullYear()
    }).length
    return { month: label, count }
  })

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="p-5">
            <h3 className="mb-3 text-sm font-semibold">Gender Distribution</h3>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={genderCounts} dataKey="value" innerRadius={55} outerRadius={85} paddingAngle={2} label={({ value }) => value}>
                  {genderCounts.map((g) => <Cell key={g.name} fill={GENDER_COLORS[g.name]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <p className="text-center text-xs text-muted-foreground">{PATIENTS.length} Patients</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <h3 className="mb-3 text-sm font-semibold">Age Distribution</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={ageData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                <XAxis dataKey="label" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis fontSize={11} tickLine={false} axisLine={false} width={24} />
                <Tooltip />
                <Bar dataKey="count" fill="#1A3C6E" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="p-5">
            <h3 className="mb-3 text-sm font-semibold">Panel vs Self-Pay</h3>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={panelData} dataKey="value" nameKey="name" outerRadius={80}>
                  {panelData.map((_, i) => <Cell key={i} fill={PANEL_COLORS[i % PANEL_COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {panelData.map((p, i) => (
                <span key={p.name} className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: PANEL_COLORS[i % PANEL_COLORS.length] }} />
                  {p.name} ({((p.value / PATIENTS.length) * 100).toFixed(0)}%)
                </span>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <h3 className="mb-3 text-sm font-semibold">City / Area</h3>
            <div className="space-y-2">
              {areaData.map(([area, count]) => (
                <div key={area} className="flex items-center gap-2 text-sm">
                  <span className="w-28 truncate">{area}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-secondary" style={{ width: `${(count / maxArea) * 100}%` }} /></div>
                  <span className="w-16 text-right text-xs text-muted-foreground">{count} ({((count / PATIENTS.length) * 100).toFixed(0)}%)</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-5">
          <h3 className="mb-3 text-sm font-semibold">Monthly Registrations</h3>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={monthlyData}>
              <defs>
                <linearGradient id="regGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0891B2" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#0891B2" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="month" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis fontSize={11} tickLine={false} axisLine={false} width={24} />
              <Tooltip />
              <Area type="monotone" dataKey="count" stroke="#0891B2" strokeWidth={2} fill="url(#regGrad)" dot={{ r: 3 }} />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  )
}
