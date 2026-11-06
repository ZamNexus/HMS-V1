"use client"
import * as React from "react"

import { formatMoneyString, isPositiveMoney, reportsService, type OrganisationBalancesReportData, type PatientBalancesReportData } from "@/lib/services"
import { usePatients } from "@/lib/useReferenceData"
import { cn } from "@/lib/utils"
import { EmptyState } from "@/components/shared/EmptyState"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card, CardContent } from "@/components/ui/card"
import { Wallet } from "lucide-react"
import { ReportBody, useReportData } from "./ReportState"

const TABS = ["Patient Balance", "Organization Wise Balances"] as const
type Tab = (typeof TABS)[number]

const loadPatientBalances = (signal: AbortSignal) => reportsService.patientBalances({ signal })
const loadOrganisationBalances = (signal: AbortSignal) => reportsService.organisationBalances({ signal })

// Balances are the BACKEND's to compute ("Patient Balances" is documented as already covered): the screen shows what the service
// returns and never derives a balance from invoices itself.
export function PatientBalancesReport() {
  const [active, setActive] = React.useState<Tab>("Patient Balance")
  const patientBalances = useReportData(loadPatientBalances)
  const organisationBalances = useReportData(loadOrganisationBalances)

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

      {active === "Patient Balance" && (
        <ReportBody state={patientBalances} label="Patient Balances report" testId="report-patient-balances-pending">{(r) => <PatientBalanceTable r={r} />}</ReportBody>
      )}
      {active === "Organization Wise Balances" && (
        <ReportBody state={organisationBalances} label="Organization Wise Balances report" testId="report-organisation-balances-pending">{(r) => <OrganisationTable r={r} />}</ReportBody>
      )}
    </div>
  )
}

function PatientBalanceTable({ r }: { r: PatientBalancesReportData }) {
  const patients = usePatients(r.rows.map((row) => row.patientId))
  if (r.rows.length === 0) return <EmptyState icon={Wallet} title="No outstanding balances" subtitle="Every patient account is fully settled." />
  return (
    <Card><CardContent className="p-0">
      <div className="flex items-center justify-between border-b border-border p-4 text-sm">
        <span className="font-semibold">Total Outstanding</span>
        <span className="font-mono font-bold text-danger-600">{formatMoneyString(r.totalOutstanding)}</span>
      </div>
      <Table>
        <TableHeader><TableRow>
          <TableHead>MR No.</TableHead><TableHead>Patient</TableHead><TableHead>Phone</TableHead>
          <TableHead>Total Billed</TableHead><TableHead>Received</TableHead><TableHead>Balance</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {r.rows.map((row) => {
            const patient = patients.lookup.get(row.patientId)
            return (
              <TableRow key={row.patientId}>
                <TableCell className="font-mono text-secondary">{patient?.mrNo ?? "—"}</TableCell>
                <TableCell className="font-medium">{patient?.name ?? (patients.loading ? "…" : "—")}</TableCell>
                <TableCell className="text-muted-foreground">{patient?.phone ?? "—"}</TableCell>
                <TableCell>{formatMoneyString(row.totalBilled)}</TableCell>
                <TableCell className="text-success-600">{formatMoneyString(row.received)}</TableCell>
                <TableCell className="font-semibold text-danger-600">{formatMoneyString(row.balance)}</TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </CardContent></Card>
  )
}

function OrganisationTable({ r }: { r: OrganisationBalancesReportData }) {
  return (
    <Card><CardContent className="p-0">
      <Table>
        <TableHeader><TableRow>
          <TableHead>Organization</TableHead><TableHead>Patients</TableHead>
          <TableHead>Total Billed</TableHead><TableHead>Received</TableHead><TableHead>Balance</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {r.rows.map((g) => (
            <TableRow key={g.name}>
              <TableCell className="font-medium">{g.name}</TableCell>
              <TableCell>{g.patientCount}</TableCell>
              <TableCell>{formatMoneyString(g.totalBilled)}</TableCell>
              <TableCell className="text-success-600">{formatMoneyString(g.received)}</TableCell>
              <TableCell className={cn("font-semibold", isPositiveMoney(g.balance) && "text-danger-600")}>{formatMoneyString(g.balance)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </CardContent></Card>
  )
}
