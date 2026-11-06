"use client"
import { format } from "date-fns"
import { ArrowDown, ArrowUp } from "lucide-react"
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import { formatMoneyString, reportsService, type RevenueReportData } from "@/lib/services"
import { usePatients } from "@/lib/useReferenceData"
import { cn, formatCurrency } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ReportBody, useReportData } from "./ReportState"

const loadRevenue = (signal: AbortSignal) => reportsService.revenue({ signal })

export function RevenueReport() {
  const state = useReportData(loadRevenue)
  return <ReportBody state={state} label="Revenue report" testId="report-revenue-pending">{(r) => <RevenueView r={r} />}</ReportBody>
}

function RevenueView({ r }: { r: RevenueReportData }) {
  const patients = usePatients(r.unpaid.map((u) => u.patientId))
  // Display only: the chart library needs numbers. Every total and balance below comes from the service as a money string.
  const trendData = r.trend.map((t) => ({ label: format(new Date(t.date), "dd MMM"), Consultation: Number(t.consultation), Lab: Number(t.lab), Pharmacy: Number(t.pharmacy) }))

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-5">
          <h3 className="mb-3 text-sm font-semibold">Revenue Trend — Last 7 Days</h3>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
              <XAxis dataKey="label" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis fontSize={11} tickLine={false} axisLine={false} width={40} />
              <Tooltip formatter={(v) => formatCurrency(Number(v))} />
              <Legend />
              <Area type="monotone" dataKey="Consultation" stackId="1" stroke="#0891B2" fill="#0891B2" fillOpacity={0.3} />
              <Area type="monotone" dataKey="Lab" stackId="1" stroke="#059669" fill="#059669" fillOpacity={0.3} />
              <Area type="monotone" dataKey="Pharmacy" stackId="1" stroke="#D97706" fill="#D97706" fillOpacity={0.3} />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5">
          <h3 className="mb-3 text-sm font-semibold">Breakdown Comparison</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground"><tr><th className="pb-2 text-left">Category</th><th className="pb-2 text-right">This Period</th><th className="pb-2 text-right">Previous Period</th><th className="pb-2 text-right">Change%</th></tr></thead>
              <tbody>
                {r.breakdown.map((row) => {
                  const change = row.changePct === null ? 0 : Number(row.changePct) // display only (sign and one decimal come from the service)
                  return (
                    <tr key={row.label} className="border-t border-border">
                      <td className="py-1.5">{row.label}</td>
                      <td className="py-1.5 text-right tabular-nums">{formatMoneyString(row.current)}</td>
                      <td className="py-1.5 text-right tabular-nums">{formatMoneyString(row.previous)}</td>
                      <td className={cn("py-1.5 text-right font-medium tabular-nums", change >= 0 ? "text-success-600" : "text-danger-600")}>
                        <span className="inline-flex items-center gap-0.5">{change >= 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}{Math.abs(change).toFixed(1)}%</span>
                      </td>
                    </tr>
                  )
                })}
                <tr className="border-t border-border font-bold"><td className="py-1.5">Total</td><td className="py-1.5 text-right">{formatMoneyString(r.total)}</td><td colSpan={2} /></tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Unpaid &amp; Partial Invoices</h3>
            <Badge variant="danger">{formatMoneyString(r.totalOutstanding)}</Badge>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground"><tr><th className="pb-2 text-left">Patient</th><th className="pb-2 text-left">Invoice No.</th><th className="pb-2 text-left">Type</th><th className="pb-2 text-right">Amount</th><th className="pb-2 text-right">Paid</th><th className="pb-2 text-right">Balance</th><th className="pb-2 text-right">Days Overdue</th></tr></thead>
              <tbody>
                {r.unpaid.map((u) => {
                  const patient = patients.lookup.get(u.patientId)
                  return (
                    <tr key={u.invoiceNo} className="border-t border-border">
                      <td className="py-1.5">{patient?.name ?? (patients.loading ? "…" : "—")}</td>
                      <td className="py-1.5 font-mono text-secondary">{u.invoiceNo}</td>
                      <td className="py-1.5">{u.type}</td>
                      <td className="py-1.5 text-right">{formatMoneyString(u.amount)}</td>
                      <td className="py-1.5 text-right">{formatMoneyString(u.paid)}</td>
                      <td className="py-1.5 text-right font-semibold">{formatMoneyString(u.balance)}</td>
                      <td className={cn("py-1.5 text-right", u.daysOverdue > 30 ? "text-danger-600" : u.daysOverdue > 7 ? "text-warning-700" : "text-muted-foreground")}>{u.daysOverdue}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5">
          <h3 className="mb-3 text-sm font-semibold">Aged Receivables</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {r.aged.map((b) => (
              <div key={b.bucket} className="rounded-md bg-muted/40 p-3 text-center">
                <div className="text-xs text-muted-foreground">{b.bucket}d</div>
                <div className="text-sm font-bold">{formatMoneyString(b.amount)}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
