import * as React from "react"
import { format } from "date-fns"

import { PATIENTS } from "@/data/patients"
import { PAYMENTS, RECEIPTS, bankRunningBalance } from "@/data/billing"
import { patientBillBreakdown } from "@/lib/billingAggregate"
import { formatCurrency, cn } from "@/lib/utils"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card, CardContent } from "@/components/ui/card"

const TABS = ["Payments", "Receipts", "Bank Statement", "Patient Account Summary"] as const
type Tab = (typeof TABS)[number]

function patientName(id: number) {
  return PATIENTS.find((p) => p.id === id)?.name ?? "—"
}

export function AccountsReport() {
  const [active, setActive] = React.useState<Tab>("Payments")

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-1 rounded-md bg-muted p-1 no-print">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setActive(t)}
            className={cn("shrink-0 rounded-sm px-3 py-1.5 text-xs font-medium transition-colors", active === t ? "bg-background text-secondary shadow-sm" : "text-muted-foreground")}
          >
            {t}
          </button>
        ))}
      </div>

      <p className="mb-3 hidden text-sm font-semibold print:block">{active}</p>

      {active === "Payments" && (() => {
        const total = PAYMENTS.reduce((s, p) => s + p.amount, 0)
        return (
          <Card><CardContent className="p-0">
            <div className="flex items-center justify-between border-b border-border p-4 text-sm">
              <span className="font-semibold">Total Payments Received</span>
              <span className="font-mono font-bold text-secondary">{formatCurrency(total)}</span>
            </div>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Receipt No.</TableHead><TableHead>Date</TableHead><TableHead>Patient</TableHead>
                <TableHead>Against</TableHead><TableHead>Amount</TableHead><TableHead>Mode</TableHead><TableHead>Received By</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {PAYMENTS.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-secondary">{p.receiptNo}</TableCell>
                    <TableCell>{format(new Date(p.date), "dd MMM yyyy")}</TableCell>
                    <TableCell className="font-medium">{patientName(p.patientId)}</TableCell>
                    <TableCell>{p.against}</TableCell>
                    <TableCell className="font-semibold">{formatCurrency(p.amount)}</TableCell>
                    <TableCell>{p.mode}</TableCell>
                    <TableCell>{p.receivedBy}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        )
      })()}

      {active === "Receipts" && (() => {
        const total = RECEIPTS.reduce((s, r) => s + r.amount, 0)
        return (
          <Card><CardContent className="p-0">
            <div className="flex items-center justify-between border-b border-border p-4 text-sm">
              <span className="font-semibold">Total Receipts</span>
              <span className="font-mono font-bold text-secondary">{formatCurrency(total)}</span>
            </div>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Receipt No.</TableHead><TableHead>Date</TableHead><TableHead>Patient</TableHead>
                <TableHead>Type</TableHead><TableHead>Amount</TableHead><TableHead>Balance Remaining</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {RECEIPTS.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-secondary">{r.receiptNo}</TableCell>
                    <TableCell>{format(new Date(r.date), "dd MMM yyyy")}</TableCell>
                    <TableCell className="font-medium">{patientName(r.patientId)}</TableCell>
                    <TableCell><StatusBadge status={r.type} /></TableCell>
                    <TableCell className="font-semibold">{formatCurrency(r.amount)}</TableCell>
                    <TableCell>{formatCurrency(r.balanceRemaining)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        )
      })()}

      {active === "Bank Statement" && (
        <Card><CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Date</TableHead><TableHead>Description</TableHead><TableHead>Bank</TableHead>
              <TableHead>Debit</TableHead><TableHead>Credit</TableHead><TableHead>Running Balance</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {bankRunningBalance().map(({ transaction: t, balance }) => (
                <TableRow key={t.id}>
                  <TableCell>{format(new Date(t.date), "dd MMM yyyy")}</TableCell>
                  <TableCell>{t.description}</TableCell>
                  <TableCell className="text-muted-foreground">{t.bank}</TableCell>
                  <TableCell className="tabular-nums text-danger-600">{t.debit > 0 ? formatCurrency(t.debit) : "—"}</TableCell>
                  <TableCell className="tabular-nums text-success-600">{t.credit > 0 ? formatCurrency(t.credit) : "—"}</TableCell>
                  <TableCell className="font-semibold tabular-nums">{formatCurrency(balance)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent></Card>
      )}

      {active === "Patient Account Summary" && (() => {
        const rows = PATIENTS.map((p) => ({ patient: p, bill: patientBillBreakdown(p.id) }))
          .filter((r) => r.bill.total > 0)
          .sort((a, b) => b.bill.balance - a.bill.balance)
        const totals = rows.reduce((acc, r) => ({ total: acc.total + r.bill.total, received: acc.received + r.bill.received, balance: acc.balance + r.bill.balance }), { total: 0, received: 0, balance: 0 })
        return (
          <Card><CardContent className="p-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead>MR No.</TableHead><TableHead>Patient</TableHead><TableHead>Total Billed</TableHead>
                <TableHead>Received</TableHead><TableHead>Balance</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.patient.id}>
                    <TableCell className="font-mono text-secondary">{r.patient.mrNo}</TableCell>
                    <TableCell className="font-medium">{r.patient.name}</TableCell>
                    <TableCell>{formatCurrency(r.bill.total)}</TableCell>
                    <TableCell className="text-success-600">{formatCurrency(r.bill.received)}</TableCell>
                    <TableCell className={cn("font-semibold", r.bill.balance > 0 && "text-danger-600")}>{formatCurrency(r.bill.balance)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/40 font-bold">
                  <TableCell colSpan={2}>Total</TableCell>
                  <TableCell>{formatCurrency(totals.total)}</TableCell>
                  <TableCell className="text-success-600">{formatCurrency(totals.received)}</TableCell>
                  <TableCell className="text-danger-600">{formatCurrency(totals.balance)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent></Card>
        )
      })()}
    </div>
  )
}
