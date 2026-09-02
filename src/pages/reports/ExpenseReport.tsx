import * as React from "react"
import { format } from "date-fns"
import { Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts"

import { EXPENSES, EXPENSE_CATEGORIES } from "@/data/billing"
import { formatCurrency } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Pagination } from "@/components/shared/Pagination"

const COLORS = ["#0891B2", "#1A3C6E", "#059669", "#D97706", "#DC2626", "#7C3AED", "#0F2544", "#64748B"]

export function ExpenseReport() {
  const [page, setPage] = React.useState(1)
  const total = EXPENSES.reduce((s, e) => s + e.amount, 0)

  const byCategory = EXPENSE_CATEGORIES.map((cat) => ({
    name: cat, value: EXPENSES.filter((e) => e.category === cat).reduce((s, e) => s + e.amount, 0),
  })).filter((c) => c.value > 0)

  const dailyTrend = React.useMemo(() => {
    const map = new Map<string, number>()
    ;[...EXPENSES].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).forEach((e) => {
      const key = format(new Date(e.date), "dd MMM")
      map.set(key, (map.get(key) ?? 0) + e.amount)
    })
    return [...map.entries()].map(([date, amount]) => ({ date, amount }))
  }, [])

  const pageSize = 10
  const paged = EXPENSES.slice((page - 1) * pageSize, page * pageSize)

  return (
    <div className="space-y-6">
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
                  {c.name} {formatCurrency(c.value)} ({((c.value / total) * 100).toFixed(0)}%)
                </span>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <h3 className="mb-3 text-sm font-semibold">Summary</h3>
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground"><tr><th className="pb-2 text-left">Category</th><th className="pb-2 text-right">Amount</th><th className="pb-2 text-right">% of Total</th></tr></thead>
              <tbody>
                {byCategory.map((c) => (
                  <tr key={c.name} className="border-t border-border"><td className="py-1.5">{c.name}</td><td className="py-1.5 text-right">{formatCurrency(c.value)}</td><td className="py-1.5 text-right">{((c.value / total) * 100).toFixed(1)}%</td></tr>
                ))}
                <tr className="border-t border-border font-bold"><td className="py-1.5">Total</td><td className="py-1.5 text-right">{formatCurrency(total)}</td><td className="py-1.5 text-right">100%</td></tr>
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

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

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Date</TableHead><TableHead>Category</TableHead><TableHead>Description</TableHead>
              <TableHead>Amount</TableHead><TableHead>Mode</TableHead><TableHead>Entered By</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {paged.map((e) => (
                <TableRow key={e.id}>
                  <TableCell>{format(new Date(e.date), "dd MMM yyyy")}</TableCell>
                  <TableCell>{e.category}</TableCell><TableCell>{e.description}</TableCell>
                  <TableCell className="font-semibold">{formatCurrency(e.amount)}</TableCell>
                  <TableCell>{e.mode}</TableCell><TableCell>{e.enteredBy}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination page={page} pageSize={pageSize} total={EXPENSES.length} onPageChange={setPage} itemLabel="expenses" />
        </CardContent>
      </Card>
    </div>
  )
}
