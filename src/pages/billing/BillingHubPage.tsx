import * as React from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { format } from "date-fns"
import { Plus } from "lucide-react"
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import {
  CONSULTATION_INVOICES, SERVICES_INVOICES, PAYMENTS, RECEIPTS, EXPENSES, EXPENSE_CATEGORIES, bankRunningBalance,
} from "@/data/billing"
import { PATIENTS } from "@/data/patients"
import { DOCTORS } from "@/data/doctors"
import type { PaymentMode, ReceiptType } from "@/types"
import { cn, formatCurrency } from "@/lib/utils"
import { PageHeader } from "@/components/shared/PageHeader"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { EmptyState } from "@/components/shared/EmptyState"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { useToast } from "@/components/ui/use-toast"
import { Receipt as ReceiptIcon } from "lucide-react"

const TABS = [
  { key: "consultations", label: "Consultations" },
  { key: "services", label: "Services" },
  { key: "payments", label: "Payments" },
  { key: "receipts", label: "Receipts" },
  { key: "expenses", label: "Expenses" },
  { key: "bank", label: "Bank" },
] as const

const DATE_RANGES = ["Today", "Yesterday", "This Week", "This Month", "Custom"] as const

function patientName(id: number) {
  return PATIENTS.find((p) => p.id === id)?.name ?? "—"
}
function doctorName(id: number | null) {
  if (id === null) return "—"
  return DOCTORS.find((d) => d.userId === id)?.name ?? "—"
}

export function BillingHubPage() {
  const { tab = "consultations" } = useParams()
  const navigate = useNavigate()
  const { toast } = useToast()
  const [dateRange, setDateRange] = React.useState<(typeof DATE_RANGES)[number]>("This Month")
  const [paymentModalOpen, setPaymentModalOpen] = React.useState(false)
  const [receiptModalOpen, setReceiptModalOpen] = React.useState(false)
  const [transferModalOpen, setTransferModalOpen] = React.useState(false)

  const consultTotal = CONSULTATION_INVOICES.reduce((s, c) => s + c.netTotal, 0)
  const servicesTotal = SERVICES_INVOICES.reduce((s, c) => s + c.netTotal, 0)
  const expenseTotal = EXPENSES.reduce((s, e) => s + e.amount, 0)
  const net = consultTotal + servicesTotal - expenseTotal

  return (
    <div>
      <PageHeader title="Billing" />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-md bg-muted p-1">
          {DATE_RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setDateRange(r)}
              className={cn("rounded-sm px-3 py-1.5 text-xs font-medium transition-colors", dateRange === r ? "bg-background text-secondary shadow-sm" : "text-muted-foreground")}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4 rounded-md border-b border-accent-100 bg-accent-50 px-4 py-2.5 text-sm text-teal-800">
        Consultations {formatCurrency(consultTotal)} · Services {formatCurrency(servicesTotal)} · Expenses {formatCurrency(expenseTotal)} ·{" "}
        <span className="font-semibold">Net {formatCurrency(net)}</span>
      </div>

      <div className="mb-4 flex gap-1 overflow-x-auto rounded-md bg-muted p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => navigate(`/billing/${t.key}`)}
            className={cn(
              "shrink-0 rounded-sm px-4 py-1.5 text-sm font-medium transition-colors",
              tab === t.key ? "bg-background text-secondary shadow-sm" : "text-muted-foreground"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "consultations" && (
        <TabWrap actions={<Button asChild><Link to="/billing/consultations/new"><Plus className="h-4 w-4" /> New Consultation Invoice</Link></Button>}>
          {CONSULTATION_INVOICES.length === 0 ? <EmptyState icon={ReceiptIcon} title="No consultation invoices" /> : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Invoice No.</TableHead><TableHead>Date</TableHead><TableHead>Patient</TableHead>
                <TableHead>Doctor</TableHead><TableHead>Fee</TableHead><TableHead>Discount</TableHead>
                <TableHead>Net</TableHead><TableHead>Mode</TableHead><TableHead>Status</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {CONSULTATION_INVOICES.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono text-secondary">{c.invoiceNo}</TableCell>
                    <TableCell>{format(new Date(c.date), "dd MMM yyyy")}</TableCell>
                    <TableCell className="font-medium">{patientName(c.patientId)}</TableCell>
                    <TableCell>{doctorName(c.doctorId)}</TableCell>
                    <TableCell>{formatCurrency(c.fee)}</TableCell>
                    <TableCell>{c.discountType === "percent" ? `${c.discount}%` : formatCurrency(c.discount)}</TableCell>
                    <TableCell className="font-semibold">{formatCurrency(c.netTotal)}</TableCell>
                    <TableCell>{c.paymentMode}</TableCell>
                    <TableCell><StatusBadge status={c.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabWrap>
      )}

      {tab === "services" && (
        <TabWrap actions={<Button asChild><Link to="/billing/services/new"><Plus className="h-4 w-4" /> New Services Invoice</Link></Button>}>
          {SERVICES_INVOICES.length === 0 ? <EmptyState icon={ReceiptIcon} title="No services invoices" /> : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Invoice No.</TableHead><TableHead>Date</TableHead><TableHead>Patient</TableHead>
                <TableHead>Items</TableHead><TableHead>Net</TableHead><TableHead>Mode</TableHead><TableHead>Status</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {SERVICES_INVOICES.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono text-secondary">{s.invoiceNo}</TableCell>
                    <TableCell>{format(new Date(s.date), "dd MMM yyyy")}</TableCell>
                    <TableCell className="font-medium">{patientName(s.patientId)}</TableCell>
                    <TableCell>{s.lines.map((l) => l.name).join(", ")}</TableCell>
                    <TableCell className="font-semibold">{formatCurrency(s.netTotal)}</TableCell>
                    <TableCell>{s.paymentMode}</TableCell>
                    <TableCell><StatusBadge status={s.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabWrap>
      )}

      {tab === "payments" && (
        <TabWrap actions={<Button onClick={() => setPaymentModalOpen(true)}><Plus className="h-4 w-4" /> Record Payment</Button>}>
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
        </TabWrap>
      )}

      {tab === "receipts" && (
        <TabWrap actions={<Button onClick={() => setReceiptModalOpen(true)}><Plus className="h-4 w-4" /> New Receipt</Button>}>
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
        </TabWrap>
      )}

      {tab === "expenses" && <ExpensesTab />}

      {tab === "bank" && (
        <TabWrap actions={<Button onClick={() => setTransferModalOpen(true)}><Plus className="h-4 w-4" /> Record Transfer</Button>}>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Date</TableHead><TableHead>Description</TableHead><TableHead>Debit</TableHead>
              <TableHead>Credit</TableHead><TableHead>Running Balance</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {bankRunningBalance().map(({ transaction: t, balance }) => (
                <TableRow key={t.id}>
                  <TableCell>{format(new Date(t.date), "dd MMM yyyy")}</TableCell>
                  <TableCell>{t.description}</TableCell>
                  <TableCell className="text-danger-600 tabular-nums">{t.debit > 0 ? formatCurrency(t.debit) : "—"}</TableCell>
                  <TableCell className="text-success-600 tabular-nums">{t.credit > 0 ? formatCurrency(t.credit) : "—"}</TableCell>
                  <TableCell className="font-semibold tabular-nums">{formatCurrency(balance)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabWrap>
      )}

      <PaymentModal open={paymentModalOpen} onOpenChange={setPaymentModalOpen} onSaved={() => toast({ title: "Payment recorded" })} />
      <ReceiptModal open={receiptModalOpen} onOpenChange={setReceiptModalOpen} onSaved={() => toast({ title: "Receipt recorded" })} />
      <TransferModal open={transferModalOpen} onOpenChange={setTransferModalOpen} onSaved={() => toast({ title: "Bank transfer recorded" })} />
    </div>
  )
}

function TabWrap({ children, actions }: { children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div>
      <div className="mb-3 flex justify-end">{actions}</div>
      <div className="rounded-lg border border-border bg-card">{children}</div>
    </div>
  )
}

function ExpensesTab() {
  const chartData = EXPENSE_CATEGORIES.map((cat) => ({
    category: cat,
    amount: EXPENSES.filter((e) => e.category === cat).reduce((s, e) => s + e.amount, 0),
  })).filter((d) => d.amount > 0)
  const total = EXPENSES.reduce((s, e) => s + e.amount, 0)

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[65%_1fr]">
      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Date</TableHead><TableHead>Category</TableHead><TableHead>Description</TableHead>
            <TableHead>Amount</TableHead><TableHead>Mode</TableHead><TableHead>Entered By</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {EXPENSES.map((e) => (
              <TableRow key={e.id}>
                <TableCell>{format(new Date(e.date), "dd MMM yyyy")}</TableCell>
                <TableCell><StatusBadge status={e.category} /></TableCell>
                <TableCell>{e.description}</TableCell>
                <TableCell className="font-semibold">{formatCurrency(e.amount)}</TableCell>
                <TableCell>{e.mode}</TableCell>
                <TableCell>{e.enteredBy}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Card>
        <CardContent className="p-4">
          <h3 className="mb-1 text-sm font-semibold">This Month by Category</h3>
          <p className="mb-3 text-xs text-muted-foreground">Total: {formatCurrency(total)}</p>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" horizontal={false} />
              <XAxis type="number" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="category" width={90} fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip formatter={(v) => formatCurrency(Number(v))} />
              <Bar dataKey="amount" fill="#0891B2" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  )
}

function PaymentModal({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; onSaved: () => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-1.5 md:col-span-2">
            <Label>Patient</Label>
            <Select><SelectTrigger><SelectValue placeholder="Select patient" /></SelectTrigger>
              <SelectContent>{PATIENTS.slice(0, 10).map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Payment Date</Label><Input type="date" defaultValue={new Date().toISOString().slice(0, 10)} /></div>
          <div className="space-y-1.5"><Label>Amount *</Label><Input type="number" /></div>
          <div className="space-y-1.5">
            <Label>Mode</Label>
            <Select defaultValue="Cash"><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{(["Cash", "Card", "Bank Transfer", "Cheque"] as PaymentMode[]).map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Against</Label><Input placeholder="Advance or invoice no." /></div>
          <div className="space-y-1.5"><Label>Reference No.</Label><Input /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => { onSaved(); onOpenChange(false) }}>Save &amp; Print Receipt</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ReceiptModal({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; onSaved: () => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader><DialogTitle>New Receipt</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Patient</Label>
            <Select><SelectTrigger><SelectValue placeholder="Select patient" /></SelectTrigger>
              <SelectContent>{PATIENTS.slice(0, 10).map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select defaultValue="Advance Deposit"><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{(["Advance Deposit", "Refund", "Credit Note"] as ReceiptType[]).map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Amount</Label><Input type="number" /></div>
          <div className="space-y-1.5"><Label>Date</Label><Input type="date" defaultValue={new Date().toISOString().slice(0, 10)} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => { onSaved(); onOpenChange(false) }}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function TransferModal({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; onSaved: () => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader><DialogTitle>Record Transfer</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5"><Label>Date</Label><Input type="date" defaultValue={new Date().toISOString().slice(0, 10)} /></div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select defaultValue="Deposit"><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="Deposit">Deposit</SelectItem><SelectItem value="Withdrawal">Withdrawal</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Amount</Label><Input type="number" /></div>
          <div className="space-y-1.5"><Label>Description</Label><Input /></div>
          <div className="space-y-1.5"><Label>Bank</Label><Input defaultValue="Habib Bank Ltd" /></div>
          <div className="space-y-1.5"><Label>Reference</Label><Input /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => { onSaved(); onOpenChange(false) }}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
