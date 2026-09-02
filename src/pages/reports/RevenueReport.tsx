import { differenceInDays, format } from "date-fns"
import { ArrowDown, ArrowUp } from "lucide-react"
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import { CONSULTATION_INVOICES, SERVICES_INVOICES } from "@/data/billing"
import { LAB_ORDERS } from "@/data/lab"
import { DISPENSE_RECORDS } from "@/data/pharmacy"
import { PATIENTS } from "@/data/patients"
import { cn, formatCurrency } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

export function RevenueReport() {
  const days = [...Array(7)].map((_, i) => format(new Date(Date.now() - (6 - i) * 86400000), "dd MMM"))
  const trendData = days.map((label, i) => ({
    label,
    Consultation: 2000 + i * 400 + (i % 2) * 500,
    Lab: 1200 + i * 250,
    Pharmacy: 800 + i * 150,
  }))

  const consultTotal = CONSULTATION_INVOICES.reduce((s, c) => s + c.netTotal, 0)
  const labTotal = LAB_ORDERS.reduce((s, o) => s + o.total, 0)
  const pharmacyTotal = DISPENSE_RECORDS.reduce((s, d) => s + d.netPayable, 0)
  const total = consultTotal + labTotal + pharmacyTotal

  const rows = [
    { label: "Consultations", current: consultTotal, prev: Math.round(consultTotal * 0.91) },
    { label: "Lab Services", current: labTotal, prev: Math.round(labTotal * 0.9) },
    { label: "Pharmacy", current: pharmacyTotal, prev: Math.round(pharmacyTotal * 1.08) },
  ]

  const unpaid = [
    ...CONSULTATION_INVOICES.filter((c) => c.balance > 0).map((c) => ({ invoiceNo: c.invoiceNo, patientId: c.patientId, type: "Consultation", amount: c.netTotal, paid: c.amountReceived, balance: c.balance, date: c.date })),
    ...SERVICES_INVOICES.filter((s) => s.balance > 0).map((s) => ({ invoiceNo: s.invoiceNo, patientId: s.patientId, type: "Services", amount: s.netTotal, paid: s.amountReceived, balance: s.balance, date: s.date })),
  ]
  const totalOutstanding = unpaid.reduce((s, u) => s + u.balance, 0)

  const buckets = { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 }
  unpaid.forEach((u) => {
    const days = differenceInDays(new Date(), new Date(u.date))
    if (days <= 30) buckets["0-30"] += u.balance
    else if (days <= 60) buckets["31-60"] += u.balance
    else if (days <= 90) buckets["61-90"] += u.balance
    else buckets["90+"] += u.balance
  })

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
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-muted-foreground"><tr><th className="pb-2 text-left">Category</th><th className="pb-2 text-right">This Period</th><th className="pb-2 text-right">Previous Period</th><th className="pb-2 text-right">Change%</th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const change = r.prev ? ((r.current - r.prev) / r.prev) * 100 : 0
                return (
                  <tr key={r.label} className="border-t border-border">
                    <td className="py-1.5">{r.label}</td>
                    <td className="py-1.5 text-right tabular-nums">{formatCurrency(r.current)}</td>
                    <td className="py-1.5 text-right tabular-nums">{formatCurrency(r.prev)}</td>
                    <td className={cn("py-1.5 text-right font-medium tabular-nums", change >= 0 ? "text-success-600" : "text-danger-600")}>
                      <span className="inline-flex items-center gap-0.5">{change >= 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}{Math.abs(change).toFixed(1)}%</span>
                    </td>
                  </tr>
                )
              })}
              <tr className="border-t border-border font-bold"><td className="py-1.5">Total</td><td className="py-1.5 text-right">{formatCurrency(total)}</td><td colSpan={2} /></tr>
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Unpaid &amp; Partial Invoices</h3>
            <Badge variant="danger">{formatCurrency(totalOutstanding)}</Badge>
          </div>
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-muted-foreground"><tr><th className="pb-2 text-left">Patient</th><th className="pb-2 text-left">Invoice No.</th><th className="pb-2 text-left">Type</th><th className="pb-2 text-right">Amount</th><th className="pb-2 text-right">Paid</th><th className="pb-2 text-right">Balance</th><th className="pb-2 text-right">Days Overdue</th></tr></thead>
            <tbody>
              {unpaid.map((u) => {
                const daysOverdue = differenceInDays(new Date(), new Date(u.date))
                const patient = PATIENTS.find((p) => p.id === u.patientId)
                return (
                  <tr key={u.invoiceNo} className="border-t border-border">
                    <td className="py-1.5">{patient?.name}</td>
                    <td className="py-1.5 font-mono text-secondary">{u.invoiceNo}</td>
                    <td className="py-1.5">{u.type}</td>
                    <td className="py-1.5 text-right">{formatCurrency(u.amount)}</td>
                    <td className="py-1.5 text-right">{formatCurrency(u.paid)}</td>
                    <td className="py-1.5 text-right font-semibold">{formatCurrency(u.balance)}</td>
                    <td className={cn("py-1.5 text-right", daysOverdue > 30 ? "text-danger-600" : daysOverdue > 7 ? "text-warning-700" : "text-muted-foreground")}>{daysOverdue}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5">
          <h3 className="mb-3 text-sm font-semibold">Aged Receivables</h3>
          <div className="grid grid-cols-4 gap-3">
            {Object.entries(buckets).map(([label, amount]) => (
              <div key={label} className="rounded-md bg-muted/40 p-3 text-center">
                <div className="text-xs text-muted-foreground">{label}d</div>
                <div className="text-sm font-bold">{formatCurrency(amount)}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
