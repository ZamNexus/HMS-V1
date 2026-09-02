import * as React from "react"
import { format } from "date-fns"
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import { ENCOUNTERS } from "@/data/encounters"
import { SERVICES_INVOICES, PAYMENTS, RECEIPTS, EXPENSES, bankRunningBalance } from "@/data/billing"
import { LAB_ORDERS } from "@/data/lab"
import { IMAGING_ORDERS } from "@/data/imaging"
import { DISPENSE_RECORDS } from "@/data/pharmacy"
import { PATIENTS } from "@/data/patients"
import { DOCTORS } from "@/data/doctors"
import { cn, formatCurrency } from "@/lib/utils"
import { PageHeader } from "@/components/shared/PageHeader"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { EmptyState } from "@/components/shared/EmptyState"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card, CardContent } from "@/components/ui/card"
import { Layers } from "lucide-react"

const TABS = [
  "Summary", "Services", "Checkups", "Lab Tests", "Medicine", "X-Rays",
  "ECG/Ultrasound", "Receipts", "Payments", "Expenses", "Bank", "Graphs", "OPD/IPD",
] as const
type Tab = (typeof TABS)[number]

function encounterType(encounterId: number | null): "OPD" | "IPD" {
  if (encounterId === null) return "OPD"
  return ENCOUNTERS.find((e) => e.id === encounterId)?.type ?? "OPD"
}

function patientName(id: number) {
  return PATIENTS.find((p) => p.id === id)?.name ?? "—"
}

export function DashboardStatsPage() {
  const [tab, setTab] = React.useState<Tab>("Summary")

  const consultation = ENCOUNTERS.map((e) => ({ value: e.netTotal, cash: e.paymentMode === "Cash" ? e.amountReceived ?? 0 : 0, credit: e.paymentStatus !== "paid" ? e.balance ?? 0 : 0, type: e.type }))
  const services = SERVICES_INVOICES.map((s) => ({ value: s.netTotal, cash: s.paymentMode === "Cash" ? s.amountReceived : 0, credit: s.balance, type: encounterType(s.encounterId) }))
  const lab = LAB_ORDERS.map((o) => ({ value: o.total, cash: o.paymentStatus === "paid" ? o.total : 0, credit: o.paymentStatus === "paid" ? 0 : o.total, type: encounterType(o.encounterId) }))
  const medicine = DISPENSE_RECORDS.map((d) => ({ value: d.netPayable, cash: d.paymentMode === "Cash" ? d.netPayable : 0, credit: d.paymentMode === "On Account" ? d.netPayable : 0, type: encounterType(d.encounterId) }))
  const xrays = IMAGING_ORDERS.map((o) => ({ value: o.total, cash: o.paymentMode === "Cash" ? o.total : 0, credit: o.paymentMode !== "Cash" ? o.total : 0, type: encounterType(o.encounterId) }))
  const ecg: typeof consultation = []

  const rows = [
    { label: "Services", data: services },
    { label: "Laboratory", data: lab },
    { label: "Consultation", data: consultation },
    { label: "Medicines", data: medicine },
    { label: "X-Rays", data: xrays },
    { label: "ECG, Ultra-Sound", data: ecg },
  ]

  const summarize = (data: typeof consultation) => ({
    value: data.reduce((s, d) => s + d.value, 0),
    count: data.length,
    cash: data.reduce((s, d) => s + d.cash, 0),
    credit: data.reduce((s, d) => s + d.credit, 0),
    opd: data.filter((d) => d.type === "OPD").reduce((s, d) => s + d.value, 0),
    ipd: data.filter((d) => d.type === "IPD").reduce((s, d) => s + d.value, 0),
  })

  const totalSales = rows.reduce(
    (acc, r) => {
      const s = summarize(r.data)
      return { value: acc.value + s.value, count: acc.count + s.count, cash: acc.cash + s.cash, credit: acc.credit + s.credit, opd: acc.opd + s.opd, ipd: acc.ipd + s.ipd }
    },
    { value: 0, count: 0, cash: 0, credit: 0, opd: 0, ipd: 0 }
  )

  const paymentsTotal = { value: PAYMENTS.reduce((s, p) => s + p.amount, 0), count: PAYMENTS.length }
  const receiptsTotal = { value: RECEIPTS.reduce((s, r) => s + r.amount, 0), count: RECEIPTS.length }
  const expensesTotal = { value: EXPENSES.reduce((s, e) => s + e.amount, 0), count: EXPENSES.length }
  const bankRows = bankRunningBalance()
  const bankTotal = { value: bankRows.reduce((s, b) => s + b.transaction.credit - b.transaction.debit, 0), count: bankRows.length }

  const opening = 45000
  const cashIn = totalSales.cash + receiptsTotal.value
  const cashOut = expensesTotal.value + paymentsTotal.value
  const closing = opening + cashIn - cashOut

  const dailyRevenue = React.useMemo(() => {
    const map = new Map<string, number>()
    ENCOUNTERS.forEach((e) => {
      const key = format(new Date(e.date), "dd MMM")
      map.set(key, (map.get(key) ?? 0) + e.netTotal)
    })
    return [...map.entries()].map(([date, value]) => ({ date, value }))
  }, [])

  return (
    <div>
      <PageHeader title="Financial Statistics" subtitle="Dashboard Summary — replaces the desktop OPD/IPD Summary window" />

      <div className="mb-4 flex gap-1 overflow-x-auto rounded-md bg-muted p-1">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn("shrink-0 rounded-sm px-3 py-1.5 text-xs font-medium transition-colors", tab === t ? "bg-background text-secondary shadow-sm" : "text-muted-foreground")}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Summary" && (
        <div className="space-y-6">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Transaction Type</TableHead><TableHead className="text-right">Total Value</TableHead>
                  <TableHead className="text-right">Total Count</TableHead><TableHead className="text-right">Cash Received</TableHead>
                  <TableHead className="text-right">Total Credit</TableHead><TableHead className="text-right">OPD Value</TableHead>
                  <TableHead className="text-right">IPD Value</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const s = summarize(r.data)
                    return (
                      <TableRow key={r.label}>
                        <TableCell className="font-medium">{r.label}</TableCell>
                        <TableCell className="text-right">{formatCurrency(s.value)}</TableCell>
                        <TableCell className="text-right">{s.count}</TableCell>
                        <TableCell className="text-right text-success-600">{formatCurrency(s.cash)}</TableCell>
                        <TableCell className="text-right text-warning-700">{formatCurrency(s.credit)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(s.opd)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(s.ipd)}</TableCell>
                      </TableRow>
                    )
                  })}
                  <TableRow className="bg-muted/40 font-semibold">
                    <TableCell>Total Sales</TableCell>
                    <TableCell className="text-right">{formatCurrency(totalSales.value)}</TableCell>
                    <TableCell className="text-right">{totalSales.count}</TableCell>
                    <TableCell className="text-right text-success-600">{formatCurrency(totalSales.cash)}</TableCell>
                    <TableCell className="text-right text-warning-700">{formatCurrency(totalSales.credit)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(totalSales.opd)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(totalSales.ipd)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Payments</TableCell>
                    <TableCell className="text-right">{formatCurrency(paymentsTotal.value)}</TableCell>
                    <TableCell className="text-right">{paymentsTotal.count}</TableCell>
                    <TableCell colSpan={4} />
                  </TableRow>
                  <TableRow>
                    <TableCell>Receipts</TableCell>
                    <TableCell className="text-right">{formatCurrency(receiptsTotal.value)}</TableCell>
                    <TableCell className="text-right">{receiptsTotal.count}</TableCell>
                    <TableCell colSpan={4} />
                  </TableRow>
                  <TableRow>
                    <TableCell>Expenses</TableCell>
                    <TableCell className="text-right">{formatCurrency(expensesTotal.value)}</TableCell>
                    <TableCell className="text-right">{expensesTotal.count}</TableCell>
                    <TableCell colSpan={4} />
                  </TableRow>
                  <TableRow>
                    <TableCell>Banks</TableCell>
                    <TableCell className="text-right">{formatCurrency(bankTotal.value)}</TableCell>
                    <TableCell className="text-right">{bankTotal.count}</TableCell>
                    <TableCell colSpan={4} />
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <h3 className="mb-3 text-sm font-semibold">Cash Flow</h3>
              <div className="grid grid-cols-2 gap-4 text-center sm:grid-cols-4">
                <div><div className="text-xs text-muted-foreground">Opening</div><div className="text-lg font-bold">{formatCurrency(opening)}</div></div>
                <div><div className="text-xs text-muted-foreground">Cash-In</div><div className="text-lg font-bold text-success-600">{formatCurrency(cashIn)}</div></div>
                <div><div className="text-xs text-muted-foreground">Cash-Out</div><div className="text-lg font-bold text-danger-600">{formatCurrency(cashOut)}</div></div>
                <div><div className="text-xs text-muted-foreground">Closing</div><div className="text-lg font-bold">{formatCurrency(closing)}</div></div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "Services" && <CategoryTable rows={SERVICES_INVOICES.map((s) => ({ id: s.invoiceNo, date: s.date, name: patientName(s.patientId), amount: s.netTotal, status: s.status }))} />}
      {tab === "Checkups" && <CategoryTable rows={ENCOUNTERS.map((e) => ({ id: e.encId, date: e.date, name: patientName(e.patientId), amount: e.netTotal, status: e.paymentStatus }))} />}
      {tab === "Lab Tests" && <CategoryTable rows={LAB_ORDERS.map((o) => ({ id: o.labNo, date: o.date, name: patientName(o.patientId), amount: o.total, status: o.paymentStatus }))} />}
      {tab === "Medicine" && <CategoryTable rows={DISPENSE_RECORDS.map((d) => ({ id: d.disNo, date: d.date, name: patientName(d.patientId), amount: d.netPayable, status: "paid" }))} />}
      {tab === "X-Rays" && <CategoryTable rows={IMAGING_ORDERS.map((o) => ({ id: o.xrNo, date: o.date, name: patientName(o.patientId), amount: o.total, status: "paid" }))} />}
      {tab === "ECG/Ultrasound" && <EmptyState icon={Layers} title="ECG / Ultrasound invoicing" subtitle="Master data only in this phase — invoicing is planned for a later release." />}
      {tab === "Receipts" && <CategoryTable rows={RECEIPTS.map((r) => ({ id: r.receiptNo, date: r.date, name: patientName(r.patientId), amount: r.amount, status: r.type }))} />}
      {tab === "Payments" && <CategoryTable rows={PAYMENTS.map((p) => ({ id: p.receiptNo, date: p.date, name: patientName(p.patientId), amount: p.amount, status: p.mode }))} />}
      {tab === "Expenses" && <CategoryTable rows={EXPENSES.map((e) => ({ id: String(e.id), date: e.date, name: e.description, amount: e.amount, status: e.category }))} />}
      {tab === "Bank" && (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Description</TableHead><TableHead className="text-right">Debit</TableHead><TableHead className="text-right">Credit</TableHead><TableHead className="text-right">Balance</TableHead></TableRow></TableHeader>
              <TableBody>
                {bankRows.map(({ transaction: t, balance }) => (
                  <TableRow key={t.id}>
                    <TableCell>{format(new Date(t.date), "dd MMM yyyy")}</TableCell>
                    <TableCell>{t.description}</TableCell>
                    <TableCell className="text-right text-danger-600">{t.debit > 0 ? formatCurrency(t.debit) : "—"}</TableCell>
                    <TableCell className="text-right text-success-600">{t.credit > 0 ? formatCurrency(t.credit) : "—"}</TableCell>
                    <TableCell className="text-right font-semibold">{formatCurrency(balance)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      {tab === "Graphs" && (
        <Card>
          <CardContent className="p-5">
            <h3 className="mb-3 text-sm font-semibold">Daily Checkup Revenue</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={dailyRevenue}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                <XAxis dataKey="date" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis fontSize={11} tickLine={false} axisLine={false} width={50} />
                <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                <Bar dataKey="value" fill="#0891B2" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
      {tab === "OPD/IPD" && (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Encounter ID</TableHead><TableHead>Patient</TableHead><TableHead>Type</TableHead>
                <TableHead>Doctor</TableHead><TableHead className="text-right">Net Total</TableHead><TableHead>Status</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {ENCOUNTERS.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-mono text-secondary">{e.encId}</TableCell>
                    <TableCell>{patientName(e.patientId)}</TableCell>
                    <TableCell><StatusBadge status={e.type} /></TableCell>
                    <TableCell>{DOCTORS.find((d) => d.userId === e.doctorId)?.name ?? "—"}</TableCell>
                    <TableCell className="text-right">{formatCurrency(e.netTotal)}</TableCell>
                    <TableCell><StatusBadge status={e.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function CategoryTable({ rows }: { rows: { id: string; date: string; name: string; amount: number; status: string }[] }) {
  if (rows.length === 0) return <EmptyState icon={Layers} title="No records for this category" />
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader><TableRow><TableHead>ID</TableHead><TableHead>Date</TableHead><TableHead>Patient / Description</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-secondary">{r.id}</TableCell>
                <TableCell>{format(new Date(r.date), "dd MMM yyyy")}</TableCell>
                <TableCell>{r.name}</TableCell>
                <TableCell className="text-right">{formatCurrency(r.amount)}</TableCell>
                <TableCell><StatusBadge status={r.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
