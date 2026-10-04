import { format } from "date-fns"
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import { ENCOUNTERS } from "@/data/encounters"
import { DOCTORS } from "@/data/doctors"
import { formatCurrency } from "@/lib/utils"

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
  const COLORS = ["#1CC0CE", "#0F2A4D"]

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      
      {/* ─── MAIN BAR CHART ─────────────────────────────────────── */}
      <div className="rounded-[1.5rem] bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-black/5 p-6">
        <h3 className="text-base font-black text-[#0D1B2E] tracking-tight mb-6">Daily Patient Count</h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={dailyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
            <XAxis dataKey="date" fontSize={11} tickLine={false} axisLine={false} tick={{ fill: "#94A3B8", fontWeight: 700 }} dy={10} />
            <YAxis fontSize={11} tickLine={false} axisLine={false} tick={{ fill: "#94A3B8", fontWeight: 700 }} />
            <Tooltip 
              cursor={{ fill: "#F8FAFC" }}
              contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)", fontWeight: 700, color: "#0D1B2E" }}
              formatter={(v) => [`${v} patients`, "Volume"]} 
            />
            <Bar dataKey="count" fill="#1CC0CE" radius={[6, 6, 0, 0]} barSize={40} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* ─── TOP DIAGNOSES ─────────────────────────────────────── */}
        <div className="rounded-[1.5rem] bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-black/5 p-6">
          <h3 className="text-base font-black text-[#0D1B2E] tracking-tight mb-6">Top Diagnoses</h3>
          <div className="space-y-4">
            {topDx.map(([dx, count], i) => (
              <div key={dx} className="flex items-center gap-3">
                <span className="w-5 text-center text-xs font-black text-slate-300">{i + 1}</span>
                <span className="w-32 truncate text-sm font-bold text-slate-700">{dx}</span>
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-100 ring-1 ring-inset ring-slate-200/50">
                  <div className="h-full rounded-full bg-[#0891B2] transition-all duration-1000" style={{ width: `${(count / maxDx) * 100}%` }} />
                </div>
                <span className="w-8 text-right text-sm font-black text-[#0D1B2E]">{count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ─── NEW VS RETURNING ─────────────────────────────────────── */}
        <div className="rounded-[1.5rem] bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-black/5 p-6 flex flex-col">
          <h3 className="text-base font-black text-[#0D1B2E] tracking-tight mb-2">New vs Returning</h3>
          <div className="flex-1 flex flex-col items-center justify-center relative">
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={pieData} dataKey="value" innerRadius={70} outerRadius={100} paddingAngle={4} stroke="none">
                  {pieData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                </Pie>
                <Tooltip 
                  contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)", fontWeight: 700, color: "#0D1B2E" }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center mt-2">
                <div className="text-3xl font-black text-[#0D1B2E] leading-none">{ENCOUNTERS.length}</div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-1">Total</div>
              </div>
            </div>
          </div>
          <div className="flex justify-center gap-6 mt-2">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-[#1CC0CE] shadow-sm" />
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">New <span className="text-[#0D1B2E] ml-1">{newCount}</span></span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-[#0F2A4D] shadow-sm" />
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">Returning <span className="text-[#0D1B2E] ml-1">{returningCount}</span></span>
            </div>
          </div>
        </div>
      </div>

      {/* ─── DOCTOR PERFORMANCE ─────────────────────────────────────── */}
      <div className="rounded-[1.5rem] bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-black/5 overflow-hidden flex flex-col">
        <div className="p-6 border-b border-slate-100">
          <h3 className="text-base font-black text-[#0D1B2E] tracking-tight">Doctor Performance</h3>
        </div>
        <div className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50/80 border-b border-slate-100">
              <tr>
                <th className="py-4 px-6 text-left text-[11px] font-black uppercase tracking-wider text-slate-500">Doctor</th>
                <th className="py-4 px-6 text-right text-[11px] font-black uppercase tracking-wider text-slate-500">Patients</th>
                <th className="py-4 px-6 text-right text-[11px] font-black uppercase tracking-wider text-slate-500">Avg Fee</th>
                <th className="py-4 px-6 text-right text-[11px] font-black uppercase tracking-wider text-slate-500">Total Revenue</th>
              </tr>
            </thead>
            <tbody className="bg-white">
              {doctorPerf.map((d) => (
                <tr key={d.name} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/80 transition-colors">
                  <td className="py-4 px-6 font-bold text-[#0D1B2E]">{d.name}</td>
                  <td className="py-4 px-6 text-right font-semibold text-slate-600">{d.patients}</td>
                  <td className="py-4 px-6 text-right font-medium text-slate-500">{formatCurrency(d.avgFee)}</td>
                  <td className="py-4 px-6 text-right font-black text-[#0891B2]">{formatCurrency(d.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
