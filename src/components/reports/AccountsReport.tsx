"use client"
import * as React from "react"
import { format } from "date-fns"

import {
  bankTransactionsService, formatMoneyString, isPositiveMoney, reportsService, DEFAULT_PAGE_SIZE,
  type AccountsPaymentsReportData, type AccountsReceiptsReportData, type PatientAccountSummaryReportData,
} from "@/lib/services"
import { usePatients } from "@/lib/useReferenceData"
import { cn } from "@/lib/utils"
import { Pagination } from "@/components/shared/Pagination"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card, CardContent } from "@/components/ui/card"
import { ReportBody, useReportData } from "./ReportState"

const TABS = ["Payments", "Receipts", "Bank Statement", "Patient Account Summary"] as const
type Tab = (typeof TABS)[number]

const loadAccountSummary = (signal: AbortSignal) => reportsService.patientAccountSummary({ signal })

// Payments, receipts and the patient account summary come from the report service; the bank statement is the Phase 4H statement
// service, whose running balance is the backend's. Nothing here adds records up.
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

      {active === "Payments" && <PaymentsTab />}
      {active === "Receipts" && <ReceiptsTab />}
      {active === "Bank Statement" && <StatementTab />}
      {active === "Patient Account Summary" && <AccountSummaryTab />}
    </div>
  )
}

function PaymentsTab() {
  const [page, setPage] = React.useState(1)
  const load = React.useCallback((signal: AbortSignal) => reportsService.accountsPayments({ page, pageSize: DEFAULT_PAGE_SIZE, signal }), [page])
  const state = useReportData(load)
  return <ReportBody state={state} label="Accounts — payments report" testId="report-accounts-payments-pending">{(r) => <PaymentsTable r={r} page={page} onPage={setPage} />}</ReportBody>
}

function PaymentsTable({ r, page, onPage }: { r: AccountsPaymentsReportData; page: number; onPage: (p: number) => void }) {
  const patients = usePatients(r.rows.map((p) => p.patientId))
  return (
    <Card><CardContent className="p-0">
      <div className="flex items-center justify-between border-b border-border p-4 text-sm">
        <span className="font-semibold">Total Payments Received</span>
        <span className="font-mono font-bold text-secondary">{formatMoneyString(r.total)}</span>
      </div>
      <Table>
        <TableHeader><TableRow>
          <TableHead>Receipt No.</TableHead><TableHead>Date</TableHead><TableHead>Patient</TableHead>
          <TableHead>Against</TableHead><TableHead>Amount</TableHead><TableHead>Mode</TableHead><TableHead>Received By</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {r.rows.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="font-mono text-secondary">{p.receiptNo}</TableCell>
              <TableCell>{format(new Date(p.date), "dd MMM yyyy")}</TableCell>
              <TableCell className="font-medium">{patients.lookup.get(p.patientId)?.name ?? (patients.loading ? "…" : "—")}</TableCell>
              <TableCell>{p.against}</TableCell>
              <TableCell className="font-semibold">{formatMoneyString(p.amount)}</TableCell>
              <TableCell>{p.mode}</TableCell>
              <TableCell>{p.receivedBy}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {r.count > DEFAULT_PAGE_SIZE && <Pagination page={page} pageSize={DEFAULT_PAGE_SIZE} total={r.count} onPageChange={onPage} itemLabel="payments" />}
    </CardContent></Card>
  )
}

function ReceiptsTab() {
  const [page, setPage] = React.useState(1)
  const load = React.useCallback((signal: AbortSignal) => reportsService.accountsReceipts({ page, pageSize: DEFAULT_PAGE_SIZE, signal }), [page])
  const state = useReportData(load)
  return <ReportBody state={state} label="Accounts — receipts report" testId="report-accounts-receipts-pending">{(r) => <ReceiptsTable r={r} page={page} onPage={setPage} />}</ReportBody>
}

function ReceiptsTable({ r, page, onPage }: { r: AccountsReceiptsReportData; page: number; onPage: (p: number) => void }) {
  const patients = usePatients(r.rows.map((x) => x.patientId))
  return (
    <Card><CardContent className="p-0">
      <div className="flex items-center justify-between border-b border-border p-4 text-sm">
        <span className="font-semibold">Total Receipts</span>
        <span className="font-mono font-bold text-secondary">{formatMoneyString(r.total)}</span>
      </div>
      <Table>
        <TableHeader><TableRow>
          <TableHead>Receipt No.</TableHead><TableHead>Date</TableHead><TableHead>Patient</TableHead>
          <TableHead>Type</TableHead><TableHead>Amount</TableHead><TableHead>Balance Remaining</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {r.rows.map((x) => (
            <TableRow key={x.id}>
              <TableCell className="font-mono text-secondary">{x.receiptNo}</TableCell>
              <TableCell>{format(new Date(x.date), "dd MMM yyyy")}</TableCell>
              <TableCell className="font-medium">{patients.lookup.get(x.patientId)?.name ?? (patients.loading ? "…" : "—")}</TableCell>
              <TableCell><StatusBadge status={x.type} /></TableCell>
              <TableCell className="font-semibold">{formatMoneyString(x.amount)}</TableCell>
              <TableCell>{formatMoneyString(x.balanceRemaining)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {r.count > DEFAULT_PAGE_SIZE && <Pagination page={page} pageSize={DEFAULT_PAGE_SIZE} total={r.count} onPageChange={onPage} itemLabel="receipts" />}
    </CardContent></Card>
  )
}

function StatementTab() {
  const [page, setPage] = React.useState(1)
  const load = React.useCallback((signal: AbortSignal) => bankTransactionsService.statement({ page, pageSize: DEFAULT_PAGE_SIZE, signal }), [page])
  const state = useReportData(load)
  return (
    <ReportBody state={state} label="Bank statement" testId="report-accounts-statement-pending">
      {(s) => (
        <Card><CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Date</TableHead><TableHead>Description</TableHead><TableHead>Bank</TableHead>
              <TableHead>Debit</TableHead><TableHead>Credit</TableHead><TableHead>Running Balance</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {s.items.map(({ transaction: t, balance }) => (
                <TableRow key={t.id}>
                  <TableCell>{format(new Date(t.date), "dd MMM yyyy")}</TableCell>
                  <TableCell>{t.description}</TableCell>
                  <TableCell className="text-muted-foreground">{t.bank}</TableCell>
                  <TableCell className="tabular-nums text-danger-600">{isPositiveMoney(t.debit) ? formatMoneyString(t.debit) : "—"}</TableCell>
                  <TableCell className="tabular-nums text-success-600">{isPositiveMoney(t.credit) ? formatMoneyString(t.credit) : "—"}</TableCell>
                  <TableCell className="font-semibold tabular-nums">{formatMoneyString(balance)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {s.total > DEFAULT_PAGE_SIZE && <Pagination page={page} pageSize={DEFAULT_PAGE_SIZE} total={s.total} onPageChange={setPage} itemLabel="transactions" />}
        </CardContent></Card>
      )}
    </ReportBody>
  )
}

function AccountSummaryTab() {
  const state = useReportData(loadAccountSummary)
  return <ReportBody state={state} label="Patient Account Summary report" testId="report-accounts-summary-pending">{(r) => <AccountSummaryTable r={r} />}</ReportBody>
}

function AccountSummaryTable({ r }: { r: PatientAccountSummaryReportData }) {
  const patients = usePatients(r.rows.map((x) => x.patientId))
  return (
    <Card><CardContent className="p-0">
      <Table>
        <TableHeader><TableRow>
          <TableHead>MR No.</TableHead><TableHead>Patient</TableHead><TableHead>Total Billed</TableHead>
          <TableHead>Received</TableHead><TableHead>Balance</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {r.rows.map((row) => {
            const patient = patients.lookup.get(row.patientId)
            return (
              <TableRow key={row.patientId}>
                <TableCell className="font-mono text-secondary">{patient?.mrNo ?? "—"}</TableCell>
                <TableCell className="font-medium">{patient?.name ?? (patients.loading ? "…" : "—")}</TableCell>
                <TableCell>{formatMoneyString(row.totalBilled)}</TableCell>
                <TableCell className="text-success-600">{formatMoneyString(row.received)}</TableCell>
                <TableCell className={cn("font-semibold", isPositiveMoney(row.balance) && "text-danger-600")}>{formatMoneyString(row.balance)}</TableCell>
              </TableRow>
            )
          })}
          <TableRow className="bg-muted/40 font-bold">
            <TableCell colSpan={2}>Total</TableCell>
            <TableCell>{formatMoneyString(r.totals.totalBilled)}</TableCell>
            <TableCell className="text-success-600">{formatMoneyString(r.totals.received)}</TableCell>
            <TableCell className="text-danger-600">{formatMoneyString(r.totals.balance)}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </CardContent></Card>
  )
}
