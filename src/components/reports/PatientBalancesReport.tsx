import * as React from "react"

import { PATIENTS } from "@/data/patients"
import { PANELS } from "@/data/organisations"
import { patientBillBreakdown } from "@/lib/billingAggregate"
import { formatCurrency, cn } from "@/lib/utils"
import { EmptyState } from "@/components/shared/EmptyState"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card, CardContent } from "@/components/ui/card"
import { Wallet } from "lucide-react"

const TABS = ["Patient Balance", "Organization Wise Balances"] as const
type Tab = (typeof TABS)[number]

export function PatientBalancesReport() {
  const [active, setActive] = React.useState<Tab>("Patient Balance")

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

      {active === "Patient Balance" && (() => {
        const rows = PATIENTS.map((p) => ({ patient: p, bill: patientBillBreakdown(p.id) }))
          .filter((r) => r.bill.balance > 0)
          .sort((a, b) => b.bill.balance - a.bill.balance)
        const totalOutstanding = rows.reduce((s, r) => s + r.bill.balance, 0)
        return rows.length === 0 ? (
          <EmptyState icon={Wallet} title="No outstanding balances" subtitle="Every patient account is fully settled." />
        ) : (
          <Card><CardContent className="p-0">
            <div className="flex items-center justify-between border-b border-border p-4 text-sm">
              <span className="font-semibold">Total Outstanding</span>
              <span className="font-mono font-bold text-danger-600">{formatCurrency(totalOutstanding)}</span>
            </div>
            <Table>
              <TableHeader><TableRow>
                <TableHead>MR No.</TableHead><TableHead>Patient</TableHead><TableHead>Phone</TableHead>
                <TableHead>Total Billed</TableHead><TableHead>Received</TableHead><TableHead>Balance</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.patient.id}>
                    <TableCell className="font-mono text-secondary">{r.patient.mrNo}</TableCell>
                    <TableCell className="font-medium">{r.patient.name}</TableCell>
                    <TableCell className="text-muted-foreground">{r.patient.phone}</TableCell>
                    <TableCell>{formatCurrency(r.bill.total)}</TableCell>
                    <TableCell className="text-success-600">{formatCurrency(r.bill.received)}</TableCell>
                    <TableCell className="font-semibold text-danger-600">{formatCurrency(r.bill.balance)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        )
      })()}

      {active === "Organization Wise Balances" && (() => {
        const groups = [
          { id: null as number | null, name: "Self-Pay" },
          ...PANELS.map((p) => ({ id: p.id as number | null, name: p.name })),
        ].map((g) => {
          const patients = PATIENTS.filter((p) => p.panelId === g.id)
          const bills = patients.map((p) => patientBillBreakdown(p.id))
          return {
            ...g,
            patientCount: patients.length,
            total: bills.reduce((s, b) => s + b.total, 0),
            received: bills.reduce((s, b) => s + b.received, 0),
            balance: bills.reduce((s, b) => s + b.balance, 0),
          }
        }).filter((g) => g.total > 0)

        return (
          <Card><CardContent className="p-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Organization</TableHead><TableHead>Patients</TableHead>
                <TableHead>Total Billed</TableHead><TableHead>Received</TableHead><TableHead>Balance</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {groups.map((g) => (
                  <TableRow key={g.name}>
                    <TableCell className="font-medium">{g.name}</TableCell>
                    <TableCell>{g.patientCount}</TableCell>
                    <TableCell>{formatCurrency(g.total)}</TableCell>
                    <TableCell className="text-success-600">{formatCurrency(g.received)}</TableCell>
                    <TableCell className={cn("font-semibold", g.balance > 0 && "text-danger-600")}>{formatCurrency(g.balance)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        )
      })()}
    </div>
  )
}
