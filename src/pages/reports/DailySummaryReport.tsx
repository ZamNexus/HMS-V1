import { ArrowUp, Users, Stethoscope, BedDouble, LogOut, Wallet, Activity, Pill, IndianRupee } from "lucide-react"

import { ENCOUNTERS } from "@/data/encounters"
import { CONSULTATION_INVOICES } from "@/data/billing"
import { LAB_ORDERS } from "@/data/lab"
import { DISPENSE_RECORDS } from "@/data/pharmacy"
import { DOCTORS } from "@/data/doctors"
import { cn, formatCurrency } from "@/lib/utils"

function Tile({ label, value, icon: Icon, trendUp = true }: { label: string; value: string; icon: any; trendUp?: boolean }) {
  return (
    <div className="rounded-[1.5rem] bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-black/5 relative overflow-hidden group">
      <div className="absolute -right-4 -top-4 rounded-full bg-slate-50 p-8 transition-transform group-hover:scale-110">
        <Icon className="h-8 w-8 text-slate-200" strokeWidth={1.5} />
      </div>
      <div className="relative z-10">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1CC0CE]/10 text-[#0891B2]">
            <Icon className="h-5 w-5" />
          </div>
          <div className="text-[11px] font-black uppercase tracking-wider text-slate-500">{label}</div>
        </div>
        <div className="mt-2 text-2xl font-black text-[#0D1B2E] tracking-tight">{value}</div>
        <div className={cn("mt-2 flex items-center gap-1 text-[11px] font-bold", trendUp ? "text-emerald-600" : "text-rose-600")}>
          <ArrowUp className={cn("h-3 w-3", !trendUp && "rotate-180")} /> vs last period
        </div>
      </div>
    </div>
  )
}

export function DailySummaryReport() {
  const newPatients = 5
  const opdCount = ENCOUNTERS.filter((e) => e.type === "OPD").length
  const ipdCount = ENCOUNTERS.filter((e) => e.type === "IPD").length
  const discharges = ENCOUNTERS.filter((e) => e.status === "discharged").length

  const consultRevenue = CONSULTATION_INVOICES.reduce((s, c) => s + c.netTotal, 0)
  const labRevenue = LAB_ORDERS.reduce((s, o) => s + o.total, 0)
  const pharmacyRevenue = DISPENSE_RECORDS.reduce((s, d) => s + d.netPayable, 0)
  const totalRevenue = consultRevenue + labRevenue + pharmacyRevenue

  const doctorWise = DOCTORS.map((d) => {
    const enc = ENCOUNTERS.filter((e) => e.doctorId === d.userId)
    return { name: d.name, patients: enc.length, revenue: enc.reduce((s, e) => s + e.netTotal, 0) }
  }).filter((d) => d.patients > 0).sort((a, b) => b.patients - a.patients)

  const cash = 68, card = 18, insurance = 14

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <Tile label="New Patients" value={String(newPatients)} icon={Users} />
        <Tile label="OPD Encounters" value={String(opdCount)} icon={Stethoscope} />
        <Tile label="IPD Admissions" value={String(ipdCount)} icon={BedDouble} />
        <Tile label="Discharges" value={String(discharges)} icon={LogOut} />
        <Tile label="Consultation Rev." value={formatCurrency(consultRevenue)} icon={Wallet} />
        <Tile label="Lab Revenue" value={formatCurrency(labRevenue)} icon={Activity} />
        <Tile label="Pharmacy Rev." value={formatCurrency(pharmacyRevenue)} icon={Pill} />
        <Tile label="Total Revenue" value={formatCurrency(totalRevenue)} icon={IndianRupee} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="rounded-[1.5rem] bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-black/5 overflow-hidden flex flex-col">
          <div className="p-6 border-b border-slate-100">
            <h3 className="text-base font-black text-[#0D1B2E] tracking-tight">Doctor-wise OPD</h3>
          </div>
          <div className="p-0 overflow-x-auto flex-1 bg-slate-50/50">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/80 border-b border-slate-100">
                <tr>
                  <th className="py-4 px-6 text-left text-[11px] font-black uppercase tracking-wider text-slate-500">Doctor</th>
                  <th className="py-4 px-6 text-right text-[11px] font-black uppercase tracking-wider text-slate-500">Patients</th>
                  <th className="py-4 px-6 text-right text-[11px] font-black uppercase tracking-wider text-slate-500">Revenue</th>
                </tr>
              </thead>
              <tbody className="bg-white">
                {doctorWise.map((d) => (
                  <tr key={d.name} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/80 transition-colors">
                    <td className="py-4 px-6 font-bold text-[#0D1B2E]">{d.name}</td>
                    <td className="py-4 px-6 text-right font-semibold text-slate-600">{d.patients}</td>
                    <td className="py-4 px-6 text-right font-black text-[#0891B2]">{formatCurrency(d.revenue)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 border-t border-slate-200">
                <tr>
                  <td className="py-4 px-6 font-black text-[#0D1B2E] uppercase text-[11px] tracking-wider">Total</td>
                  <td className="py-4 px-6 text-right font-black text-[#0D1B2E]">{doctorWise.reduce((s, d) => s + d.patients, 0)}</td>
                  <td className="py-4 px-6 text-right font-black text-[#0891B2]">{formatCurrency(doctorWise.reduce((s, d) => s + d.revenue, 0))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <div className="rounded-[1.5rem] bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-black/5 p-6 flex flex-col">
          <h3 className="text-base font-black text-[#0D1B2E] tracking-tight mb-8">Payment Mode Breakdown</h3>
          <div className="flex-1 flex flex-col justify-center">
            <div className="flex h-12 w-full overflow-hidden rounded-2xl ring-1 ring-inset ring-slate-200/50">
              <div className="bg-[#0F2A4D] transition-all duration-1000 ease-in-out" style={{ width: `${cash}%` }} title={`Cash ${cash}%`} />
              <div className="bg-[#1CC0CE] transition-all duration-1000 ease-in-out border-l border-white/20" style={{ width: `${card}%` }} title={`Card ${card}%`} />
              <div className="bg-slate-200 transition-all duration-1000 ease-in-out border-l border-white/20" style={{ width: `${insurance}%` }} title={`Insurance ${insurance}%`} />
            </div>
            
            <div className="mt-8 grid grid-cols-3 gap-4">
              <div className="flex flex-col items-center p-4 rounded-xl bg-slate-50">
                <span className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#0F2A4D] shadow-sm" /> Cash
                </span>
                <span className="text-2xl font-black text-[#0D1B2E]">{cash}%</span>
              </div>
              <div className="flex flex-col items-center p-4 rounded-xl bg-slate-50">
                <span className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#1CC0CE] shadow-sm" /> Card
                </span>
                <span className="text-2xl font-black text-[#0D1B2E]">{card}%</span>
              </div>
              <div className="flex flex-col items-center p-4 rounded-xl bg-slate-50">
                <span className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-slate-500 mb-1">
                  <span className="h-2.5 w-2.5 rounded-full bg-slate-200 shadow-sm" /> Insurance
                </span>
                <span className="text-2xl font-black text-[#0D1B2E]">{insurance}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
