import { format } from "date-fns"
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import { ENCOUNTERS } from "@/data/encounters"
import { DOCTORS } from "@/data/doctors"
import { formatCurrency } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"

export function OpdStatisticsReport() {
  const byDate = new Map<string, number>()
  ENCOUNTERS.forEach((e) => {
    const key = format(new Date(e.date), "dd MMM")
    byDate.set(key, (byDate.get(key) ?? 0) + 1)
  })
  const dailyData = [...byDate.entries()].map(([date, count]) => ({ date, count }))

  const diagnosisCounts = new Map<string, number>()
  ENCOUNTERS.forEach((e) => diagnosisCounts.set(e.diagnosis, (diagnosisCounts.get(e.diagnosis) ?? 0) + 1))
  const topDx = [...diagnosisCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
  const maxDx = topDx[0]?.[1] ?? 1

  const doctorPerf = DOCTORS.map((d) => {
    const enc = ENCOUNTERS.filter((e) => e.doctorId === d.userId)
    const total = enc.reduce((s, e) => s + e.netTotal, 0)
    return { name: d.name, patients: enc.length, avgFee: enc.length ? Math.round(total / enc.length) : 0, total }
  }).filter((d) => d.patients > 0)

  const newCount = Math.round(ENCOUNTERS.length * 0.65)
  const returningCount = ENCOUNTERS.length - newCount
  const pieData = [{ name: "New", value: newCount }, { name: "Returning", value: returningCount }]
  const COLORS = ["#0891B2", "#1A3C6E"]

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-5">
          <h3 className="mb-3 text-sm font-semibold">Daily Patient Count</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={dailyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
              <XAxis dataKey="date" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis fontSize={11} tickLine={false} axisLine={false} width={28} />
              <Tooltip formatter={(v) => [`${v} patients`, ""]} />
              <Bar dataKey="count" fill="#0891B2" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="p-5">
            <h3 className="mb-3 text-sm font-semibold">Top Diagnoses</h3>
            <div className="space-y-2">
              {topDx.map(([dx, count], i) => (
                <div key={dx} className="flex items-center gap-2 text-sm">
                  <span className="w-4 text-xs text-muted-foreground">{i + 1}</span>
                  <span className="w-32 truncate">{dx}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-secondary" style={{ width: `${(count / maxDx) * 100}%` }} />
                  </div>
                  <span className="w-6 text-right text-xs font-semibold">{count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <h3 className="mb-3 text-sm font-semibold">New vs Returning</h3>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={pieData} dataKey="value" innerRadius={50} outerRadius={80} paddingAngle={2}>
                  {pieData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex justify-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-secondary" /> New {newCount}</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-primary-700" /> Returning {returningCount}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-5">
          <h3 className="mb-3 text-sm font-semibold">Doctor Performance</h3>
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-muted-foreground"><tr><th className="pb-2 text-left">Doctor</th><th className="pb-2 text-right">Patients</th><th className="pb-2 text-right">Avg Fee</th><th className="pb-2 text-right">Total</th></tr></thead>
            <tbody>
              {doctorPerf.map((d) => (
                <tr key={d.name} className="border-t border-border"><td className="py-1.5">{d.name}</td><td className="py-1.5 text-right">{d.patients}</td><td className="py-1.5 text-right">{formatCurrency(d.avgFee)}</td><td className="py-1.5 text-right">{formatCurrency(d.total)}</td></tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
