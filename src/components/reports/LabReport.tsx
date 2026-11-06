"use client"
import { AlertTriangle } from "lucide-react"
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import { formatMoneyString, reportsService, type LabReportData } from "@/lib/services"
import { cn } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"
import { ReportBody, useReportData } from "./ReportState"

const loadLab = (signal: AbortSignal) => reportsService.laboratory({ signal })

export function LabReport() {
  const state = useReportData(loadLab)
  return <ReportBody state={state} label="Laboratory report" testId="report-lab-pending">{(r) => <LabView r={r} />}</ReportBody>
}

function LabView({ r }: { r: LabReportData }) {
  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-5">
          <h3 className="mb-3 text-sm font-semibold">Test Volume by Category</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={r.categoryVolume} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" horizontal={false} />
              <XAxis type="number" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="category" width={100} fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip />
              <Bar dataKey="count" fill="#0891B2" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {r.pendingOver24h.length > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-danger-100 bg-danger-50 p-3 text-sm text-danger-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {r.pendingOver24h.length} order(s) pending &gt;24h: {r.pendingOver24h.map((o) => o.labNo).join(", ")}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="p-5">
            <h3 className="mb-3 text-sm font-semibold">Top Ordered Tests</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground"><tr><th className="pb-2 text-left">Test</th><th className="pb-2 text-right">Count</th><th className="pb-2 text-right">Revenue</th></tr></thead>
                <tbody>
                  {r.topTests.map((t) => (
                    <tr key={t.testName} className="border-t border-border"><td className="py-1.5">{t.testName}</td><td className="py-1.5 text-right">{t.count}</td><td className="py-1.5 text-right">{formatMoneyString(t.revenue)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <h3 className="mb-3 text-sm font-semibold">Turnaround Time</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground"><tr><th className="pb-2 text-left">Category</th><th className="pb-2 text-right">Avg Hrs</th><th className="pb-2 text-right">Target</th><th className="pb-2 text-right">Status</th></tr></thead>
                <tbody>
                  {r.turnaround.map((t) => (
                    <tr key={t.category} className="border-t border-border">
                      <td className="py-1.5">{t.category}</td><td className="py-1.5 text-right">{t.averageHours}h</td><td className="py-1.5 text-right">{t.targetHours}h</td>
                      <td className={cn("py-1.5 text-right font-medium", t.onTime ? "text-success-600" : "text-danger-600")}>{t.onTime ? "On Time" : "Delayed"}</td>
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
