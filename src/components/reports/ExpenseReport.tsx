"use client"
import * as React from "react"
import { format } from "date-fns"
import { Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts"

import { expensesService, formatMoneyString, ratioPercent, reportsService, type ExpenseTotals, type ExpenseTrendPoint } from "@/lib/services"
import { formatCurrency } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Pagination } from "@/components/shared/Pagination"
import { ReportBody, useReportData } from "./ReportState"

const COLORS = ["#0891B2", "#1A3C6E", "#059669", "#D97706", "#DC2626", "#7C3AED", "#0F2544", "#64748B"]
const PAGE_SIZE = 10

const loadTotals = (signal: AbortSignal) => expensesService.totals({ signal })
const loadTrend = (signal: AbortSignal) => reportsService.expenseTrend({ signal })

// Built on the Phase 4H expense services: totals by head and the list come from `expensesService` (the backend owns both), the daily
// trend from the report service. The screen adds nothing up itself.
export function ExpenseReport() {
  const [page, setPage] = React.useState(1)
  const totals = useReportData(loadTotals)
  const trend = useReportData(loadTrend)
  const loadPage = React.useCallback((signal: AbortSignal) => expensesService.list({ page, pageSize: PAGE_SIZE, signal }), [page])
  const list = useReportData(loadPage)

  return (
    <div className="space-y-6">
      <ReportBody state={totals} label="Expense totals" testId="report-expense-totals-pending">{(t) => <TotalsView t={t} />}</ReportBody>

      <ReportBody state={trend} label="Expense daily trend" testId="report-expense-trend-pending">{(points) => <TrendView points={points} />}</ReportBody>

      <ReportBody state={list} label="Expense list" testId="report-expense-list-pending">
        {(l) => (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Date</TableHead><TableHead>Category</TableHead><TableHead>Description</TableHead>
                  <TableHead>Amount</TableHead><TableHead>Mode</TableHead><TableHead>Entered By</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {l.items.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell>{format(new Date(e.date), "dd MMM yyyy")}</TableCell>
                      <TableCell>{e.categoryName}</TableCell><TableCell>{e.description}</TableCell>
                      <TableCell className="font-semibold">{formatMoneyString(e.amount)}</TableCell>
                      <TableCell>{e.mode}</TableCell><TableCell>{e.enteredBy}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Pagination page={page} pageSize={PAGE_SIZE} total={l.total} onPageChange={setPage} itemLabel="expenses" />
            </CardContent>
          </Card>
        )}
      </ReportBody>
    </div>
  )
}

function TotalsView({ t }: { t: ExpenseTotals }) {
  // Display only: the chart library needs numbers.
  const byCategory = t.byCategory.map((c) => ({ name: c.categoryName, value: Number(c.total), money: c.total }))
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardContent className="p-5">
          <h3 className="mb-3 text-sm font-semibold">By Category</h3>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={byCategory} dataKey="value" nameKey="name" outerRadius={90}>
                {byCategory.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v) => formatCurrency(Number(v))} />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {byCategory.map((c, i) => (
              <span key={c.name} className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                {c.name} {formatMoneyString(c.money)} ({Number(ratioPercent(c.money, t.total) ?? "0").toFixed(0)}%)
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5">
          <h3 className="mb-3 text-sm font-semibold">Summary</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground"><tr><th className="pb-2 text-left">Category</th><th className="pb-2 text-right">Amount</th><th className="pb-2 text-right">% of Total</th></tr></thead>
              <tbody>
                {byCategory.map((c) => (
                  <tr key={c.name} className="border-t border-border"><td className="py-1.5">{c.name}</td><td className="py-1.5 text-right">{formatMoneyString(c.money)}</td><td className="py-1.5 text-right">{ratioPercent(c.money, t.total) ?? "0.0"}%</td></tr>
                ))}
                <tr className="border-t border-border font-bold"><td className="py-1.5">Total</td><td className="py-1.5 text-right">{formatMoneyString(t.total)}</td><td className="py-1.5 text-right">100%</td></tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function TrendView({ points }: { points: ExpenseTrendPoint[] }) {
  const dailyTrend = points.map((p) => ({ date: format(new Date(p.date), "dd MMM"), amount: Number(p.amount) })) // display only
  return (
    <Card>
      <CardContent className="p-5">
        <h3 className="mb-3 text-sm font-semibold">Daily Trend</h3>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={dailyTrend}>
            <Tooltip formatter={(v) => formatCurrency(Number(v))} />
            <Line type="monotone" dataKey="amount" stroke="#64748B" strokeWidth={2} dot={{ r: 2 }} />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
