import * as React from "react"
import { format } from "date-fns"
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import { ENCOUNTERS } from "@/data/encounters"
import { SERVICES_INVOICES, PAYMENTS, RECEIPTS, EXPENSES, BANK_TRANSACTIONS, bankRunningBalance } from "@/data/billing"
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

  // Cash Flow only counts money that actually moved through the drawer — cash-mode sales/expenses/payments,
  // plus cash physically moved to/from the bank — not card, cheque or bank-transfer settled amounts.
  const cashSales = totalSales.cash
  const cashReceipts = receiptsTotal.value
  const cashDrawnFromBank = BANK_TRANSACTIONS.filter((t) => t.cashMovement === "withdrawal").reduce((s, t) => s + t.debit, 0)
  const cashExpenses = EXPENSES.filter((e) => e.mode === "Cash").reduce((s, e) => s + e.amount, 0)
  const cashPayments = PAYMENTS.filter((p) => p.mode === "Cash").reduce((s, p) => s + p.amount, 0)
  const cashDepositInBank = BANK_TRANSACTIONS.filter((t) => t.cashMovement === "deposit").reduce((s, t) => s + t.credit, 0)

  const CASH_DRAWER_OPENING = 5000 // petty-cash float carried in the drawer at start of day
  const cashIn = cashSales + cashReceipts + cashDrawnFromBank
  const cashOut = cashExpenses + cashPayments + cashDepositInBank
  const closing = CASH_DRAWER_OPENING + cashIn - cashOut

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

      {/* Replaced overflow-x-auto (slider) with flex-wrap so tabs stack cleanly on mobile */}
      <div className="mb-4 flex flex-wrap gap-1.5 rounded-xl bg-muted/40 p-1.5">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "rounded-lg px-3.5 py-1.5 text-[13px] font-medium transition-all duration-200",
              tab === t 
                ? "bg-white text-primary shadow-sm ring-1 ring-border/50" 
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Summary" && (
        <div className="space-y-6">
          <Card className="shadow-sm">
            {/* Added responsive hidden classes to dense columns to prevent horizontal scrolling */}
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead className="font-semibold">Transaction Type</TableHead>
                    <TableHead className="text-right font-semibold">Total Value</TableHead>
                    <TableHead className="hidden text-right font-semibold md:table-cell">Count</TableHead>
                    <TableHead className="hidden text-right font-semibold sm:table-cell">Cash</TableHead>
                    <TableHead className="hidden text-right font-semibold sm:table-cell">Credit</TableHead>
                    <TableHead className="hidden text-right font-semibold lg:table-cell">OPD</TableHead>
                    <TableHead className="hidden text-right font-semibold lg:table-cell">IPD</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const s = summarize(r.data)
                    return (
                      <TableRow key={r.label} className="transition-colors hover:bg-muted/20">
                        <TableCell className="font-medium">{r.label}</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(s.value)}</TableCell>
                        <TableCell className="hidden text-right md:table-cell text-muted-foreground">{s.count}</TableCell>
                        <TableCell className="hidden text-right text-success-600 sm:table-cell">{formatCurrency(s.cash)}</TableCell>
                        <TableCell className="hidden text-right text-warning-700 sm:table-cell">{formatCurrency(s.credit)}</TableCell>
                        <TableCell className="hidden text-right lg:table-cell">{formatCurrency(s.opd)}</TableCell>
                        <TableCell className="hidden text-right lg:table-cell">{formatCurrency(s.ipd)}</TableCell>
                      </TableRow>
                    )
                  })}
                  <TableRow className="bg-muted/40 font-semibold shadow-inner">
                    <TableCell>Total Sales</TableCell>
                    <TableCell className="text-right">{formatCurrency(totalSales.value)}</TableCell>
                    <TableCell className="hidden text-right md:table-cell">{totalSales.count}</TableCell>
                    <TableCell className="hidden text-right text-success-600 sm:table-cell">{formatCurrency(totalSales.cash)}</TableCell>
                    <TableCell className="hidden text-right text-warning-700 sm:table-cell">{formatCurrency(totalSales.credit)}</TableCell>
                    <TableCell className="hidden text-right lg:table-cell">{formatCurrency(totalSales.opd)}</TableCell>
                    <TableCell className="hidden text-right lg:table-cell">{formatCurrency(totalSales.ipd)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-muted-foreground">Payments</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(paymentsTotal.value)}</TableCell>
                    <TableCell className="hidden text-right md:table-cell text-muted-foreground">{paymentsTotal.count}</TableCell>
                    <TableCell colSpan={4} className="hidden sm:table-cell" />
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-muted-foreground">Receipts</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(receiptsTotal.value)}</TableCell>
                    <TableCell className="hidden text-right md:table-cell text-muted-foreground">{receiptsTotal.count}</TableCell>
                    <TableCell colSpan={4} className="hidden sm:table-cell" />
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-muted-foreground">Expenses</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(expensesTotal.value)}</TableCell>
                    <TableCell className="hidden text-right md:table-cell text-muted-foreground">{expensesTotal.count}</TableCell>
                    <TableCell colSpan={4} className="hidden sm:table-cell" />
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-muted-foreground">Banks</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(bankTotal.value)}</TableCell>
                    <TableCell className="hidden text-right md:table-cell text-muted-foreground">{bankTotal.count}</TableCell>
                    <TableCell colSpan={4} className="hidden sm:table-cell" />
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardContent className="p-6">
              <h3 className="mb-4 text-base font-semibold text-foreground">Cash Flow</h3>
              <div className="mb-6 grid grid-cols-2 gap-4 text-center sm:grid-cols-2">
                <div className="rounded-xl border border-border/50 bg-gradient-to-br from-white to-muted/20 p-4 shadow-sm">
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Opening</div>
                  <div className="text-2xl font-extrabold text-foreground">{formatCurrency(CASH_DRAWER_OPENING)}</div>
                </div>
                <div className="rounded-xl border border-border/50 bg-gradient-to-br from-white to-muted/20 p-4 shadow-sm">
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Closing</div>
                  <div className="text-2xl font-extrabold text-foreground">{formatCurrency(closing)}</div>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div className="rounded-xl border border-border/50 bg-white shadow-sm overflow-hidden">
                  <div className="bg-success-50/50 border-b border-border/50 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-success-700">Cash-In</div>
                  <div className="space-y-2.5 p-4 text-[13px]">
                    <div className="flex justify-between"><span className="text-muted-foreground">Total Cash Sale</span><span className="font-medium">{formatCurrency(cashSales)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Total Cash Receipts</span><span className="font-medium">{formatCurrency(cashReceipts)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Drawn From Bank</span><span className="font-medium">{formatCurrency(cashDrawnFromBank)}</span></div>
                    <div className="flex justify-between border-t border-border pt-3 text-sm font-bold"><span>Total Cash In</span><span className="text-success-600">{formatCurrency(cashIn)}</span></div>
                  </div>
                </div>
                <div className="rounded-xl border border-border/50 bg-white shadow-sm overflow-hidden">
                  <div className="bg-danger-50/50 border-b border-border/50 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-danger-700">Cash-Out</div>
                  <div className="space-y-2.5 p-4 text-[13px]">
                    <div className="flex justify-between"><span className="text-muted-foreground">Total Cash Expenses</span><span className="font-medium">{formatCurrency(cashExpenses)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Total Cash Payments</span><span className="font-medium">{formatCurrency(cashPayments)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Deposit In Bank</span><span className="font-medium">{formatCurrency(cashDepositInBank)}</span></div>
                    <div className="flex justify-between border-t border-border pt-3 text-sm font-bold"><span>Total Cash Out</span><span className="text-danger-600">{formatCurrency(cashOut)}</span></div>
                  </div>
                </div>
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
        <Card className="shadow-sm">
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead className="hidden sm:table-cell font-semibold">Date</TableHead>
                  <TableHead className="font-semibold">Description</TableHead>
                  <TableHead className="text-right font-semibold">Debit</TableHead>
                  <TableHead className="text-right font-semibold">Credit</TableHead>
                  <TableHead className="hidden md:table-cell text-right font-semibold">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bankRows.map(({ transaction: t, balance }) => (
                  <TableRow key={t.id} className="transition-colors hover:bg-muted/20">
                    <TableCell className="hidden sm:table-cell text-muted-foreground">{format(new Date(t.date), "dd MMM yyyy")}</TableCell>
                    <TableCell className="font-medium">{t.description}</TableCell>
                    <TableCell className="text-right text-danger-600 font-medium">{t.debit > 0 ? formatCurrency(t.debit) : "—"}</TableCell>
                    <TableCell className="text-right text-success-600 font-medium">{t.credit > 0 ? formatCurrency(t.credit) : "—"}</TableCell>
                    <TableCell className="hidden md:table-cell text-right font-bold">{formatCurrency(balance)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      {tab === "Graphs" && (
        <Card className="shadow-sm">
          <CardContent className="p-6">
            <h3 className="mb-4 text-base font-semibold text-foreground">Daily Checkup Revenue</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={dailyRevenue} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                <XAxis dataKey="date" fontSize={12} tickLine={false} axisLine={false} tick={{ fill: "#64748B" }} dy={10} />
                <YAxis fontSize={12} tickLine={false} axisLine={false} width={60} tick={{ fill: "#64748B" }} />
                <Tooltip 
                  cursor={{ fill: "#F8FAFC" }}
                  contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.08)", fontSize: "13px" }}
                  formatter={(v) => [formatCurrency(Number(v)), "Revenue"]} 
                />
                <Bar dataKey="value" fill="#1CC0CE" radius={[6, 6, 0, 0]} />
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
    <Card className="shadow-sm">
      <CardContent className="p-0">
        <Table>
          <TableHeader className="bg-muted/30">
            <TableRow>
              <TableHead className="hidden sm:table-cell font-semibold">ID</TableHead>
              <TableHead className="hidden md:table-cell font-semibold">Date</TableHead>
              <TableHead className="font-semibold">Patient / Description</TableHead>
              <TableHead className="text-right font-semibold">Amount</TableHead>
              <TableHead className="font-semibold text-center">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id} className="transition-colors hover:bg-muted/20">
                <TableCell className="hidden sm:table-cell font-mono text-[13px] text-muted-foreground">{r.id}</TableCell>
                <TableCell className="hidden md:table-cell text-muted-foreground">{format(new Date(r.date), "dd MMM yyyy")}</TableCell>
                <TableCell className="font-medium text-foreground">{r.name}</TableCell>
                <TableCell className="text-right font-semibold text-foreground">{formatCurrency(r.amount)}</TableCell>
                <TableCell className="text-center"><StatusBadge status={r.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
