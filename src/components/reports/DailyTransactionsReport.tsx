import * as React from "react"
import { format } from "date-fns"
import { Receipt } from "lucide-react"

import { getPatient } from "@/data/patients"
import { DOCTORS } from "@/data/doctors"
import { PANELS } from "@/data/organisations"
import { ENCOUNTERS } from "@/data/encounters"
import { CONSULTATION_INVOICES, SERVICES_INVOICES } from "@/data/billing"
import { LAB_ORDERS } from "@/data/lab"
import { IMAGING_ORDERS } from "@/data/imaging"
import { DISPENSE_RECORDS } from "@/data/pharmacy"
import type { Patient, PaymentMode } from "@/types"
import { formatCurrency } from "@/lib/utils"
import { PatientPicker } from "@/components/shared/PatientPicker"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { EmptyState } from "@/components/shared/EmptyState"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

type RowType = "Checkup" | "Admission/Services" | "Lab Slips" | "X-Rays" | "Pharmacy"
type DataType = "All" | RowType
const DATA_TYPES: DataType[] = ["All", "Checkup", "Admission/Services", "Lab Slips", "X-Rays", "Pharmacy"]

interface Row {
  key: string
  date: string
  type: RowType
  refNo: string
  patientId: number
  doctorId: number | null
  amount: number
  mode: PaymentMode
  status: string
}

/**
 * Mirrors the desktop "Daily Checkup/Bills Report" criteria screen — a single filterable register
 * across every transaction type (Checkup/Admission/Lab/X-Ray/Pharmacy) by date, cash/credit, doctor,
 * patient and organization. Unlike the desktop's two-step "set criteria then run" dialog, this renders
 * live as filters change, consistent with every other report in this app.
 */
export function DailyTransactionsReport() {
  const today = new Date().toISOString().slice(0, 10)
  const [from, setFrom] = React.useState(today)
  const [to, setTo] = React.useState(today)
  const [dataType, setDataType] = React.useState<DataType>("All")
  const [cashCredit, setCashCredit] = React.useState<"All" | "Cash" | "Credit">("All")
  const [doctorId, setDoctorId] = React.useState("all")
  const [patient, setPatient] = React.useState<Patient | null>(null)
  const [panelId, setPanelId] = React.useState("all")

  const rows: Row[] = React.useMemo(() => {
    // Checkup revenue can land on a standalone Consultation Invoice, or directly on the Encounter
    // itself when billed through the New Encounter wizard's own Billing step — same fallback used by
    // encounterBillBreakdown, so totals here match the Dashboard and Patient Summary exactly.
    const checkups: Row[] = ENCOUNTERS.flatMap((e) => {
      const linked = CONSULTATION_INVOICES.filter((c) => c.encounterId === e.id)
      if (linked.length > 0) {
        return linked.map((c) => ({ key: `c-${c.id}`, date: c.date, type: "Checkup" as const, refNo: c.invoiceNo, patientId: c.patientId, doctorId: c.doctorId, amount: c.netTotal, mode: c.paymentMode, status: c.status }))
      }
      return [{ key: `e-${e.id}`, date: e.date, type: "Checkup" as const, refNo: e.encId, patientId: e.patientId, doctorId: e.doctorId, amount: e.netTotal, mode: e.paymentMode, status: e.paymentStatus }]
    })
    const standaloneConsults: Row[] = CONSULTATION_INVOICES.filter((c) => c.encounterId === null)
      .map((c) => ({ key: `c-${c.id}`, date: c.date, type: "Checkup" as const, refNo: c.invoiceNo, patientId: c.patientId, doctorId: c.doctorId, amount: c.netTotal, mode: c.paymentMode, status: c.status }))

    const services: Row[] = SERVICES_INVOICES.map((s) => ({ key: `s-${s.id}`, date: s.date, type: "Admission/Services" as const, refNo: s.invoiceNo, patientId: s.patientId, doctorId: s.doctorId, amount: s.netTotal, mode: s.paymentMode, status: s.status }))
    const lab: Row[] = LAB_ORDERS.map((o) => ({ key: `l-${o.id}`, date: o.date, type: "Lab Slips" as const, refNo: o.labNo, patientId: o.patientId, doctorId: o.doctorId, amount: o.total, mode: o.paymentMode, status: o.paymentStatus }))
    const xrays: Row[] = IMAGING_ORDERS.map((o) => ({ key: `x-${o.id}`, date: o.date, type: "X-Rays" as const, refNo: o.xrNo, patientId: o.patientId, doctorId: o.doctorId, amount: o.total, mode: o.paymentMode, status: o.paymentMode === "On Account" ? "unpaid" : "paid" }))
    const pharmacy: Row[] = DISPENSE_RECORDS.map((d) => ({ key: `p-${d.id}`, date: d.date, type: "Pharmacy" as const, refNo: d.disNo, patientId: d.patientId, doctorId: null, amount: d.netPayable, mode: d.paymentMode, status: d.paymentMode === "On Account" ? "unpaid" : "paid" }))

    return [...checkups, ...standaloneConsults, ...services, ...lab, ...xrays, ...pharmacy]
  }, [])

  const filtered = rows
    .filter((r) => {
      const day = r.date.slice(0, 10)
      if (day < from || day > to) return false
      if (dataType !== "All" && r.type !== dataType) return false
      if (cashCredit === "Cash" && r.mode !== "Cash") return false
      if (cashCredit === "Credit" && r.mode === "Cash") return false
      if (doctorId !== "all" && r.doctorId !== Number(doctorId)) return false
      if (patient && r.patientId !== patient.id) return false
      if (panelId !== "all") {
        const p = getPatient(r.patientId)
        if (!p || p.panelId !== Number(panelId)) return false
      }
      return true
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  const total = filtered.reduce((s, r) => s + r.amount, 0)
  const cashTotal = filtered.filter((r) => r.mode === "Cash").reduce((s, r) => s + r.amount, 0)
  const creditTotal = total - cashTotal

  return (
    <div className="space-y-4">
      <Card className="no-print">
        <CardContent className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5"><Label>From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label>Data Type</Label>
            <Select value={dataType} onValueChange={(v) => setDataType(v as DataType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{DATA_TYPES.map((t) => <SelectItem key={t} value={t}>{t === "All" ? "All" : `${t} Only`}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Cash / Credit</Label>
            <Select value={cashCredit} onValueChange={(v) => setCashCredit(v as typeof cashCredit)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="All">All</SelectItem><SelectItem value="Cash">Cash</SelectItem><SelectItem value="Credit">Credit</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Doctor</Label>
            <Select value={doctorId} onValueChange={setDoctorId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Doctors</SelectItem>
                {DOCTORS.map((d) => <SelectItem key={d.userId} value={String(d.userId)}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Organization</Label>
            <Select value={panelId} onValueChange={setPanelId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {PANELS.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 lg:col-span-2">
            <Label>Patient</Label>
            <PatientPicker value={patient} onChange={setPatient} />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Transactions</div><div className="text-lg font-bold">{filtered.length}</div></CardContent></Card>
        <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Total Value</div><div className="text-lg font-bold">{formatCurrency(total)}</div></CardContent></Card>
        <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Cash</div><div className="text-lg font-bold text-success-600">{formatCurrency(cashTotal)}</div></CardContent></Card>
        <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Credit</div><div className="text-lg font-bold text-warning-700">{formatCurrency(creditTotal)}</div></CardContent></Card>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Receipt} title="No transactions match these filters" />
      ) : (
        <Card><CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>Ref No.</TableHead>
              <TableHead>Patient</TableHead><TableHead>Doctor</TableHead><TableHead className="text-right">Amount</TableHead>
              <TableHead>Mode</TableHead><TableHead>Status</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.key}>
                  <TableCell>{format(new Date(r.date), "dd MMM yyyy")}</TableCell>
                  <TableCell>{r.type}</TableCell>
                  <TableCell className="font-mono text-secondary">{r.refNo}</TableCell>
                  <TableCell>{getPatient(r.patientId)?.name ?? "—"}</TableCell>
                  <TableCell>{r.doctorId ? DOCTORS.find((d) => d.userId === r.doctorId)?.name ?? "—" : "—"}</TableCell>
                  <TableCell className="text-right">{formatCurrency(r.amount)}</TableCell>
                  <TableCell>{r.mode}</TableCell>
                  <TableCell><StatusBadge status={r.status} /></TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/40 font-bold">
                <TableCell colSpan={5}>Total</TableCell>
                <TableCell className="text-right">{formatCurrency(total)}</TableCell>
                <TableCell colSpan={2} />
              </TableRow>
            </TableBody>
          </Table>
        </CardContent></Card>
      )}
    </div>
  )
}
