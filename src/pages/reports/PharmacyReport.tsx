import { differenceInDays } from "date-fns"
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import { MEDICINES } from "@/data/medicines"
import { DISPENSE_RECORDS } from "@/data/pharmacy"
import { cn, formatCurrency } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"

export function PharmacyReport() {
  const dispensedCounts = new Map<string, { qty: number; revenue: number }>()
  DISPENSE_RECORDS.forEach((d) => d.lines.forEach((l) => {
    const existing = dispensedCounts.get(l.medicineName) ?? { qty: 0, revenue: 0 }
    dispensedCounts.set(l.medicineName, { qty: existing.qty + l.dispensedQty, revenue: existing.revenue + l.total })
  }))
  const top10 = [...dispensedCounts.entries()].sort((a, b) => b[1].qty - a[1].qty).slice(0, 10)
  const chartData = top10.map(([name, d]) => ({ name, qty: d.qty }))

  const lowStock = MEDICINES.filter((m) => m.stock < m.reorderLevel)
  const expiring = MEDICINES
    .map((m) => ({ ...m, daysLeft: Math.floor((new Date(m.expiry).getTime() - Date.now()) / 86400000) }))
    .filter((m) => m.daysLeft <= 60 && m.daysLeft >= 0)
    .sort((a, b) => a.daysLeft - b.daysLeft)

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
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-muted-foreground"><tr><th className="pb-2 text-left">Medicine</th><th className="pb-2 text-right">Dispensed Qty</th><th className="pb-2 text-right">Revenue</th></tr></thead>
            <tbody>
              {top10.map(([name, d]) => (
                <tr key={name} className="border-t border-border"><td className="py-1.5">{name}</td><td className="py-1.5 text-right">{d.qty}</td><td className="py-1.5 text-right">{formatCurrency(d.revenue)}</td></tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="p-5">
            <h3 className="mb-3 text-sm font-semibold">Low Stock</h3>
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground"><tr><th className="pb-2 text-left">Medicine</th><th className="pb-2 text-right">Current</th><th className="pb-2 text-right">Reorder</th><th className="pb-2 text-right">Shortfall</th></tr></thead>
              <tbody>
                {lowStock.map((m) => (
                  <tr key={m.id} className="border-t border-border">
                    <td className="py-1.5">{m.name}</td><td className="py-1.5 text-right">{m.stock}</td><td className="py-1.5 text-right">{m.reorderLevel}</td>
                    <td className={cn("py-1.5 text-right font-semibold", m.stock === 0 && "text-danger-600")}>{m.reorderLevel - m.stock}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <h3 className="mb-3 text-sm font-semibold">Expiring Soon</h3>
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground"><tr><th className="pb-2 text-left">Medicine</th><th className="pb-2 text-left">Batch</th><th className="pb-2 text-right">Stock</th><th className="pb-2 text-right">Days Left</th></tr></thead>
              <tbody>
                {expiring.map((m) => (
                  <tr key={m.id} className="border-t border-border">
                    <td className="py-1.5">{m.name}</td><td className="py-1.5 font-mono text-xs">{m.batchNo}</td><td className="py-1.5 text-right">{m.stock}</td>
                    <td className={cn("py-1.5 text-right font-medium", m.daysLeft < 14 ? "text-danger-600" : "text-warning-700")}>{differenceInDays(new Date(m.expiry), new Date())}d</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
