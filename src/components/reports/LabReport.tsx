import { differenceInHours } from "date-fns"
import { AlertTriangle } from "lucide-react"
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import { LAB_ORDERS } from "@/data/lab"
import { LAB_TEST_CATEGORIES, getLabTest } from "@/data/labTests"
import { cn, formatCurrency } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"

export function LabReport() {
  const categoryVolume = LAB_TEST_CATEGORIES.map((cat) => ({
    category: cat,
    count: LAB_ORDERS.flatMap((o) => o.tests).filter((t) => getLabTest(t.testId)?.category === cat).length,
  })).filter((c) => c.count > 0)

  const testCounts = new Map<string, { count: number; revenue: number }>()
  LAB_ORDERS.forEach((o) => o.tests.forEach((t) => {
    const existing = testCounts.get(t.testName) ?? { count: 0, revenue: 0 }
    testCounts.set(t.testName, { count: existing.count + 1, revenue: existing.revenue + t.charges })
  }))
  const topTests = [...testCounts.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 8)

  const turnaround = LAB_TEST_CATEGORIES.map((cat) => {
    const tests = LAB_ORDERS.flatMap((o) => o.tests).map((t) => getLabTest(t.testId)).filter((t) => t?.category === cat)
    if (tests.length === 0) return null
    const target = tests[0]!.turnaroundHours
    return { category: cat, avgHours: target, target, onTime: true }
  }).filter(Boolean) as { category: string; avgHours: number; target: number; onTime: boolean }[]

  const pendingOver24h = LAB_ORDERS.filter((o) => (o.status === "Pending" || o.status === "Collected") && differenceInHours(new Date(), new Date(o.date)) > 24)

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-5">
          <h3 className="mb-3 text-sm font-semibold">Test Volume by Category</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={categoryVolume} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" horizontal={false} />
              <XAxis type="number" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="category" width={100} fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip />
              <Bar dataKey="count" fill="#0891B2" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {pendingOver24h.length > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-danger-100 bg-danger-50 p-3 text-sm text-danger-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {pendingOver24h.length} order(s) pending &gt;24h: {pendingOver24h.map((o) => o.labNo).join(", ")}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="p-5">
            <h3 className="mb-3 text-sm font-semibold">Top Ordered Tests</h3>
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground"><tr><th className="pb-2 text-left">Test</th><th className="pb-2 text-right">Count</th><th className="pb-2 text-right">Revenue</th></tr></thead>
              <tbody>
                {topTests.map(([name, d]) => (
                  <tr key={name} className="border-t border-border"><td className="py-1.5">{name}</td><td className="py-1.5 text-right">{d.count}</td><td className="py-1.5 text-right">{formatCurrency(d.revenue)}</td></tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <h3 className="mb-3 text-sm font-semibold">Turnaround Time</h3>
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground"><tr><th className="pb-2 text-left">Category</th><th className="pb-2 text-right">Avg Hrs</th><th className="pb-2 text-right">Target</th><th className="pb-2 text-right">Status</th></tr></thead>
              <tbody>
                {turnaround.map((t) => (
                  <tr key={t.category} className="border-t border-border">
                    <td className="py-1.5">{t.category}</td><td className="py-1.5 text-right">{t.avgHours}h</td><td className="py-1.5 text-right">{t.target}h</td>
                    <td className={cn("py-1.5 text-right font-medium", t.onTime ? "text-success-600" : "text-danger-600")}>{t.onTime ? "On Time" : "Delayed"}</td>
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
