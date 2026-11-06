"use client"
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import { formatMoneyString, reportsService, type PharmacyReportData } from "@/lib/services"
import { cn } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"
import { ReportBody, useReportData } from "./ReportState"

const loadPharmacy = (signal: AbortSignal) => reportsService.pharmacy({ signal })

export function PharmacyReport() {
  const state = useReportData(loadPharmacy)
  return <ReportBody state={state} label="Pharmacy report" testId="report-pharmacy-pending">{(r) => <PharmacyView r={r} />}</ReportBody>
}

function PharmacyView({ r }: { r: PharmacyReportData }) {
  const chartData = r.topDispensed.map((t) => ({ name: t.medicineName, qty: t.quantity }))

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-5">
          <h3 className="mb-3 text-sm font-semibold">Top 10 Dispensed Medicines</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" horizontal={false} />
              <XAxis type="number" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="name" width={130} fontSize={10} tickLine={false} axisLine={false} />
              <Tooltip />
              <Bar dataKey="qty" fill="#059669" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5">
          <h3 className="mb-3 text-sm font-semibold">Dispensed Summary</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground"><tr><th className="pb-2 text-left">Medicine</th><th className="pb-2 text-right">Dispensed Qty</th><th className="pb-2 text-right">Revenue</th></tr></thead>
              <tbody>
                {r.topDispensed.map((t) => (
                  <tr key={t.medicineName} className="border-t border-border"><td className="py-1.5">{t.medicineName}</td><td className="py-1.5 text-right">{t.quantity}</td><td className="py-1.5 text-right">{formatMoneyString(t.revenue)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="p-5">
            <h3 className="mb-3 text-sm font-semibold">Low Stock</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground"><tr><th className="pb-2 text-left">Medicine</th><th className="pb-2 text-right">Current</th><th className="pb-2 text-right">Reorder</th><th className="pb-2 text-right">Shortfall</th></tr></thead>
                <tbody>
                  {r.lowStock.map((m) => (
                    <tr key={m.medicineId} className="border-t border-border">
                      <td className="py-1.5">{m.name}</td><td className="py-1.5 text-right">{m.stock}</td><td className="py-1.5 text-right">{m.reorderLevel}</td>
                      <td className={cn("py-1.5 text-right font-semibold", m.stock === 0 && "text-danger-600")}>{m.reorderLevel - m.stock}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <h3 className="mb-3 text-sm font-semibold">Expiring Soon</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground"><tr><th className="pb-2 text-left">Medicine</th><th className="pb-2 text-left">Batch</th><th className="pb-2 text-right">Stock</th><th className="pb-2 text-right">Days Left</th></tr></thead>
                <tbody>
                  {r.expiringSoon.map((m) => (
                    <tr key={m.medicineId} className="border-t border-border">
                      <td className="py-1.5">{m.name}</td><td className="py-1.5 font-mono text-xs">{m.batchNo}</td><td className="py-1.5 text-right">{m.stock}</td>
                      <td className={cn("py-1.5 text-right font-medium", m.daysLeft < 14 ? "text-danger-600" : "text-warning-700")}>{m.daysLeft}d</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
