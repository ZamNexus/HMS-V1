"use client"
import * as React from "react"
import { format } from "date-fns"
import { Receipt } from "lucide-react"

import { formatMoneyString, reportsService, type DailyTransactionType, type DailyTransactionsReportData, type PatientRecord } from "@/lib/services"
import { useDoctors, useOrganisations, usePatients } from "@/lib/useReferenceData"
import { PatientRecordPicker } from "@/components/shared/PatientPicker"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { EmptyState } from "@/components/shared/EmptyState"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ReportBody, useReportData } from "./ReportState"

type DataType = "All" | DailyTransactionType
const DATA_TYPES: DataType[] = ["All", "Checkup", "Admission/Services", "Lab Slips", "X-Rays", "Pharmacy"]

/**
 * Mirrors the desktop "Daily Checkup/Bills Report" criteria screen — a single filterable register
 * across every transaction type (Checkup/Admission/Lab/X-Ray/Pharmacy) by date, cash/credit, doctor,
 * patient and organization. Unlike the desktop's two-step "set criteria then run" dialog, this renders
 * live as filters change, consistent with every other report in this app.
 *
 * The register, its filtering and its totals come from the report service (the backend owns them); this component only holds the
 * criteria and renders the result. Whether the backend filters by each criterion is CONTRACT REQUIRED.
 */
export function DailyTransactionsReport() {
  const uid = React.useId()
  const [today] = React.useState(() => new Date().toISOString().slice(0, 10))
  const [from, setFrom] = React.useState(today)
  const [to, setTo] = React.useState(today)
  const [dataType, setDataType] = React.useState<DataType>("All")
  const [cashCredit, setCashCredit] = React.useState<"All" | "Cash" | "Credit">("All")
  const [doctorId, setDoctorId] = React.useState("all")
  const [patient, setPatient] = React.useState<PatientRecord | null>(null)
  const [panelId, setPanelId] = React.useState("all")
  const doctors = useDoctors()
  const organisations = useOrganisations()

  const patientId = patient?.id
  const load = React.useCallback(
    (signal: AbortSignal) =>
      reportsService.dailyTransactions({
        dateFrom: from, dateTo: to, dataType, cashCredit, signal,
        doctorId: doctorId === "all" ? undefined : doctorId, patientId, organisationId: panelId === "all" ? undefined : panelId,
      }),
    [from, to, dataType, cashCredit, doctorId, patientId, panelId]
  )
  const state = useReportData(load)
  // While the report is not connected a filter cannot do anything meaningful, so the controls are disabled rather than suggesting
  // that a query ran.
  const off = state.pending

  return (
    <div className="space-y-4">
      <Card className="no-print">
        <CardContent className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5"><Label htmlFor={`${uid}-from`}>From</Label><Input id={`${uid}-from`} type="date" value={from} disabled={off} onChange={(e) => setFrom(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor={`${uid}-to`}>To</Label><Input id={`${uid}-to`} type="date" value={to} disabled={off} onChange={(e) => setTo(e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label htmlFor={`${uid}-data-type`}>Data Type</Label>
            <Select value={dataType} onValueChange={(v) => setDataType(v as DataType)} disabled={off}>
              <SelectTrigger id={`${uid}-data-type`}><SelectValue /></SelectTrigger>
              <SelectContent>{DATA_TYPES.map((t) => <SelectItem key={t} value={t}>{t === "All" ? "All" : `${t} Only`}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${uid}-cash-credit`}>Cash / Credit</Label>
            <Select value={cashCredit} onValueChange={(v) => setCashCredit(v as typeof cashCredit)} disabled={off}>
              <SelectTrigger id={`${uid}-cash-credit`}><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="All">All</SelectItem><SelectItem value="Cash">Cash</SelectItem><SelectItem value="Credit">Credit</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${uid}-doctor`}>Doctor</Label>
            <Select value={doctorId} onValueChange={setDoctorId} disabled={off}>
              <SelectTrigger id={`${uid}-doctor`}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Doctors</SelectItem>
                {doctors.items.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${uid}-organization`}>Organization</Label>
            <Select value={panelId} onValueChange={setPanelId} disabled={off}>
              <SelectTrigger id={`${uid}-organization`}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {organisations.items.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 lg:col-span-2">
            <Label htmlFor={`${uid}-patient`}>Patient</Label>
            {off ? <Input id={`${uid}-patient`} disabled placeholder="Unavailable until the report is connected" /> : <PatientRecordPicker id={`${uid}-patient`} value={patient} onChange={setPatient} />}
          </div>
        </CardContent>
      </Card>

      <ReportBody state={state} label="Daily Transactions report" testId="report-daily-transactions-pending">{(r) => <RegisterView r={r} doctors={doctors} />}</ReportBody>
    </div>
  )
}

function RegisterView({ r, doctors }: { r: DailyTransactionsReportData; doctors: ReturnType<typeof useDoctors> }) {
  const patients = usePatients(r.rows.map((x) => x.patientId))
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Transactions</div><div className="text-lg font-bold">{r.totals.count}</div></CardContent></Card>
        <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Total Value</div><div className="text-lg font-bold">{formatMoneyString(r.totals.total)}</div></CardContent></Card>
        <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Cash</div><div className="text-lg font-bold text-success-600">{formatMoneyString(r.totals.cash)}</div></CardContent></Card>
        <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Credit</div><div className="text-lg font-bold text-warning-700">{formatMoneyString(r.totals.credit)}</div></CardContent></Card>
      </div>

      {r.rows.length === 0 ? (
        <div className="mt-4"><EmptyState icon={Receipt} title="No transactions match these filters" /></div>
      ) : (
        <Card className="mt-4"><CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>Ref No.</TableHead>
              <TableHead>Patient</TableHead><TableHead>Doctor</TableHead><TableHead className="text-right">Amount</TableHead>
              <TableHead>Mode</TableHead><TableHead>Status</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {r.rows.map((row) => (
                <TableRow key={row.key}>
                  <TableCell>{format(new Date(row.date), "dd MMM yyyy")}</TableCell>
                  <TableCell>{row.type}</TableCell>
                  <TableCell className="font-mono text-secondary">{row.refNo}</TableCell>
                  <TableCell>{patients.lookup.get(row.patientId)?.name ?? (patients.loading ? "…" : "—")}</TableCell>
                  <TableCell>{row.doctorId ? doctors.lookup.get(row.doctorId)?.name ?? "—" : "—"}</TableCell>
                  <TableCell className="text-right">{formatMoneyString(row.amount)}</TableCell>
                  <TableCell>{row.mode}</TableCell>
                  <TableCell><StatusBadge status={row.status} /></TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/40 font-bold">
                <TableCell colSpan={5}>Total</TableCell>
                <TableCell className="text-right">{formatMoneyString(r.totals.total)}</TableCell>
                <TableCell colSpan={2} />
              </TableRow>
            </TableBody>
          </Table>
        </CardContent></Card>
      )}
    </>
  )
}
