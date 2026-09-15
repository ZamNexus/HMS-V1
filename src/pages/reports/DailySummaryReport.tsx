import { ArrowUp } from "lucide-react"

import { ENCOUNTERS } from "@/data/encounters"
import { CONSULTATION_INVOICES } from "@/data/billing"
import { LAB_ORDERS } from "@/data/lab"
import { DISPENSE_RECORDS } from "@/data/pharmacy"
import { DOCTORS } from "@/data/doctors"
import { formatCurrency } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"

function Tile({ label, value, trendUp = true }: { label: string; value: string; trendUp?: boolean }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="mt-1 text-xl font-bold text-navy-700">{value}</div>
        <div className={`mt-1 flex items-center gap-1 text-xs ${trendUp ? "text-success-600" : "text-danger-600"}`}>
          <ArrowUp className={`h-3 w-3 ${trendUp ? "" : "rotate-180"}`} /> vs last period
        </div>
      </CardContent>
    </Card>
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
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="New Patients" value={String(newPatients)} />
        <Tile label="OPD Encounters" value={String(opdCount)} />
        <Tile label="IPD Admissions" value={String(ipdCount)} />
        <Tile label="Discharges" value={String(discharges)} />
        <Tile label="Consultation Revenue" value={formatCurrency(consultRevenue)} />
        <Tile label="Lab Revenue" value={formatCurrency(labRevenue)} />
        <Tile label="Pharmacy Revenue" value={formatCurrency(pharmacyRevenue)} />
        <Tile label="Total Revenue" value={formatCurrency(totalRevenue)} />
      </div>

      <Card>
        <CardContent className="p-5">
          <h3 className="mb-3 text-sm font-semibold">Doctor-wise OPD</h3>
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-muted-foreground"><tr><th className="pb-2 text-left">Doctor</th><th className="pb-2 text-right">Patients</th><th className="pb-2 text-right">Consultations (Rs.)</th></tr></thead>
            <tbody>
              {doctorWise.map((d) => (
                <tr key={d.name} className="border-t border-border"><td className="py-1.5">{d.name}</td><td className="py-1.5 text-right">{d.patients}</td><td className="py-1.5 text-right">{formatCurrency(d.revenue)}</td></tr>
              ))}
              <tr className="border-t border-border font-bold"><td className="py-1.5">Total</td><td className="py-1.5 text-right">{doctorWise.reduce((s, d) => s + d.patients, 0)}</td><td className="py-1.5 text-right">{formatCurrency(doctorWise.reduce((s, d) => s + d.revenue, 0))}</td></tr>
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5">
          <h3 className="mb-3 text-sm font-semibold">Payment Mode Breakdown</h3>
          <div className="flex h-8 w-full overflow-hidden rounded-md">
            <div className="bg-teal-600" style={{ width: `${cash}%` }} title={`Cash ${cash}%`} />
            <div className="bg-navy-700" style={{ width: `${card}%` }} title={`Card ${card}%`} />
            <div className="bg-slate-400" style={{ width: `${insurance}%` }} title={`Insurance ${insurance}%`} />
          </div>
          <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-teal-600" /> Cash {cash}%</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-navy-700" /> Card {card}%</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-slate-400" /> Insurance {insurance}%</span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
