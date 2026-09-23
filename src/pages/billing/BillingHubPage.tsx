import * as React from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { format } from "date-fns"
import { Plus, Wallet, TrendingUp, TrendingDown, Receipt as ReceiptIcon, CreditCard, PiggyBank, ArrowUpRight, ArrowDownRight } from "lucide-react"
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import {
  CONSULTATION_INVOICES, SERVICES_INVOICES, PAYMENTS, RECEIPTS, EXPENSES, EXPENSE_CATEGORIES, BANK_TRANSACTIONS, bankRunningBalance,
} from "@/data/billing"
import { BANKS } from "@/data/settings"
import { PATIENTS } from "@/data/patients"
import { DOCTORS } from "@/data/doctors"
import type { PaymentMode, ReceiptType } from "@/types"
import { cn, formatCurrency } from "@/lib/utils"
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

const TABS = [
  { key: "consultations", label: "Consultations", icon: ReceiptIcon },
  { key: "services", label: "Services", icon: CreditCard },
  { key: "payments", label: "Payments", icon: Wallet },
  { key: "receipts", label: "Receipts", icon: ReceiptIcon },
  { key: "expenses", label: "Expenses", icon: TrendingDown },
  { key: "bank", label: "Bank", icon: PiggyBank },
] as const

const DATE_RANGES = ["Today", "Yesterday", "This Week", "This Month", "Custom"] as const

function patientName(id: number) {
  return PATIENTS.find((p) => p.id === id)?.name ?? "—"
}
function doctorName(id: number | null) {
  if (id === null) return "—"
  return DOCTORS.find((d) => d.userId === id)?.name ?? "—"
}

const inputClass = "h-11 rounded-xl bg-slate-50 border-slate-200 focus:bg-white focus:ring-2 focus:ring-[#1CC0CE]/20 focus:border-[#1CC0CE] transition-all"
const selectClass = "h-11 rounded-xl bg-slate-50 border-slate-200 focus:bg-white focus:ring-2 focus:ring-[#1CC0CE]/20 focus:border-[#1CC0CE] transition-all"

export function BillingHubPage() {
  const { tab = "consultations" } = useParams()
  const navigate = useNavigate()
  const { toast } = useToast()
  const [dateRange, setDateRange] = React.useState<(typeof DATE_RANGES)[number]>("This Month")
  const [paymentModalOpen, setPaymentModalOpen] = React.useState(false)
  const [receiptModalOpen, setReceiptModalOpen] = React.useState(false)
  const [transferModalOpen, setTransferModalOpen] = React.useState(false)
  const [, forceUpdate] = React.useReducer((x) => x + 1, 0)

  const consultTotal = CONSULTATION_INVOICES.reduce((s, c) => s + c.netTotal, 0)
  const servicesTotal = SERVICES_INVOICES.reduce((s, c) => s + c.netTotal, 0)
  const expenseTotal = EXPENSES.reduce((s, e) => s + e.amount, 0)
  const net = consultTotal + servicesTotal - expenseTotal

  return (
    <div className="space-y-6 pb-10 max-w-7xl mx-auto">
      {/* ─── PREMIUM PAGE HEADER ─────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-[#0D1B2E] tracking-tight">Billing & Finance</h1>
          <p className="mt-1 text-sm font-medium text-slate-500">
            Manage invoices, expenses, and financial reports
          </p>
        </div>
        
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          <div className="flex h-11 items-center gap-1 rounded-xl bg-white p-1 shadow-sm ring-1 ring-black/5">
            {DATE_RANGES.map((r) => {
              const isActive = dateRange === r
              return (
                <button
                  key={r}
                  onClick={() => setDateRange(r)}
                  className={cn(
                    "rounded-lg px-4 py-1.5 text-xs font-bold transition-all duration-200 whitespace-nowrap",
                    isActive
                      ? "bg-[#1CC0CE] text-white shadow-sm"
                      : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                  )}
                >
                  {r}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* ─── STATS DASHBOARD ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-[1.5rem] bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-black/5 relative overflow-hidden group">
          <div className="absolute right-0 top-0 p-4 opacity-10 transition-opacity group-hover:opacity-20"><TrendingUp className="h-12 w-12 text-[#0891B2]" /></div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Consultations</p>
          <p className="text-2xl font-black text-[#0D1B2E] whitespace-nowrap">{formatCurrency(consultTotal)}</p>
        </div>
        <div className="rounded-[1.5rem] bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-black/5 relative overflow-hidden group">
          <div className="absolute right-0 top-0 p-4 opacity-10 transition-opacity group-hover:opacity-20"><CreditCard className="h-12 w-12 text-[#0891B2]" /></div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Services</p>
          <p className="text-2xl font-black text-[#0D1B2E] whitespace-nowrap">{formatCurrency(servicesTotal)}</p>
        </div>
        <div className="rounded-[1.5rem] bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-black/5 relative overflow-hidden group">
          <div className="absolute right-0 top-0 p-4 opacity-10 transition-opacity group-hover:opacity-20"><TrendingDown className="h-12 w-12 text-danger-500" /></div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Expenses</p>
          <p className="text-2xl font-black text-danger-600 whitespace-nowrap">{formatCurrency(expenseTotal)}</p>
        </div>
        <div className="rounded-[1.5rem] bg-gradient-to-br from-[#0A1B33] to-[#16375F] p-5 shadow-lg ring-1 ring-black/5 relative overflow-hidden group">
          <div className="absolute right-0 top-0 p-4 opacity-20 transition-opacity group-hover:opacity-40"><Wallet className="h-12 w-12 text-[#1CC0CE]" /></div>
          <p className="text-xs font-bold uppercase tracking-wider text-[#7FA3C8] mb-1">Net Income</p>
          <p className="text-2xl font-black text-white whitespace-nowrap">{formatCurrency(net)}</p>
        </div>
      </div>

      {/* ─── TABS NAVIGATION ─────────────────────────────────────────── */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
        {TABS.map((t) => {
          const isActive = tab === t.key
          return (
            <button
              key={t.key}
              onClick={() => navigate(`/billing/${t.key}`)}
              className={cn(
                "flex items-center gap-2 shrink-0 rounded-xl px-5 py-3 text-sm font-bold transition-all duration-200",
                isActive
                  ? "bg-white text-[#0891B2] shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-black/5 scale-[1.02]"
                  : "text-slate-500 hover:text-slate-800 hover:bg-slate-100"
              )}
            >
              <t.icon className={cn("h-4 w-4", isActive ? "text-[#1CC0CE]" : "text-slate-400")} />
              {t.label}
            </button>
          )
        })}
      </div>

      {/* ─── TAB CONTENT ─────────────────────────────────────────────── */}
      {tab === "consultations" && (
        <TabWrap 
          actions={
            <Button className="rounded-xl h-10 px-6 bg-[#0F2A4D] hover:bg-[#16375F] text-white font-bold shadow-lg shadow-[#0F2A4D]/20 border-0" asChild>
              <Link to="/billing/consultations/new"><Plus className="h-4 w-4 mr-2" /> New Consultation</Link>
            </Button>
          }
        >
          {CONSULTATION_INVOICES.length === 0 ? <EmptyState icon={ReceiptIcon} title="No consultation invoices" /> : (
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/50 border-b border-slate-100 hover:bg-slate-50/50">
                  <TableHead className="font-bold text-slate-500 py-4 px-6 h-auto">Invoice No.</TableHead>
                  <TableHead className="font-bold text-slate-500 py-4 h-auto">Date</TableHead>
                  <TableHead className="font-bold text-slate-500 py-4 h-auto">Patient</TableHead>
                  <TableHead className="font-bold text-slate-500 py-4 h-auto">Doctor</TableHead>
                  <TableHead className="font-bold text-slate-500 py-4 h-auto">Fee</TableHead>
                  <TableHead className="font-bold text-slate-500 py-4 h-auto">Discount</TableHead>
                  <TableHead className="font-bold text-slate-500 py-4 h-auto">Net</TableHead>
                  <TableHead className="font-bold text-slate-500 py-4 h-auto">Mode</TableHead>
                  <TableHead className="font-bold text-slate-500 py-4 px-6 h-auto">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {CONSULTATION_INVOICES.map((c) => (
                  <TableRow key={c.id} className="transition-colors hover:bg-slate-50 border-b border-slate-50 last:border-0">
                    <TableCell className="px-6 py-4 font-mono font-medium text-slate-500">{c.invoiceNo}</TableCell>
                    <TableCell className="py-4 text-sm font-medium text-slate-600 whitespace-nowrap">{format(new Date(c.date), "dd MMM yyyy")}</TableCell>
                    <TableCell className="py-4 font-bold text-[#0D1B2E]">{patientName(c.patientId)}</TableCell>
                    <TableCell className="py-4 text-sm font-medium text-slate-600">{doctorName(c.doctorId)}</TableCell>
                    <TableCell className="py-4 text-sm font-medium text-slate-600">{formatCurrency(c.fee)}</TableCell>
                    <TableCell className="py-4 text-sm font-medium text-slate-500">{c.discountType === "percent" ? `${c.discount}%` : formatCurrency(c.discount)}</TableCell>
                    <TableCell className="py-4 font-black text-slate-900">{formatCurrency(c.netTotal)}</TableCell>
                    <TableCell className="py-4 text-sm font-medium text-slate-600">{c.paymentMode}</TableCell>
                    <TableCell className="px-6 py-4"><StatusBadge status={c.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabWrap>
      )}

      {tab === "services" && (
        <TabWrap 
          actions={
            <Button className="rounded-xl h-10 px-6 bg-[#0F2A4D] hover:bg-[#16375F] text-white font-bold shadow-lg shadow-[#0F2A4D]/20 border-0" asChild>
              <Link to="/billing/services/new"><Plus className="h-4 w-4 mr-2" /> New Services Invoice</Link>
            </Button>
          }
        >
          {SERVICES_INVOICES.length === 0 ? <EmptyState icon={ReceiptIcon} title="No services invoices" /> : (
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/50 border-b border-slate-100 hover:bg-slate-50/50">
                  <TableHead className="font-bold text-slate-500 py-4 px-6 h-auto">Invoice No.</TableHead>
                  <TableHead className="font-bold text-slate-500 py-4 h-auto">Date</TableHead>
                  <TableHead className="font-bold text-slate-500 py-4 h-auto">Patient</TableHead>
                  <TableHead className="font-bold text-slate-500 py-4 h-auto">Items</TableHead>
                  <TableHead className="font-bold text-slate-500 py-4 h-auto">Net</TableHead>
                  <TableHead className="font-bold text-slate-500 py-4 h-auto">Mode</TableHead>
                  <TableHead className="font-bold text-slate-500 py-4 px-6 h-auto">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {SERVICES_INVOICES.map((s) => (
                  <TableRow key={s.id} className="transition-colors hover:bg-slate-50 border-b border-slate-50 last:border-0">
                    <TableCell className="px-6 py-4 font-mono font-medium text-slate-500">{s.invoiceNo}</TableCell>
                    <TableCell className="py-4 text-sm font-medium text-slate-600 whitespace-nowrap">{format(new Date(s.date), "dd MMM yyyy")}</TableCell>
                    <TableCell className="py-4 font-bold text-[#0D1B2E]">{patientName(s.patientId)}</TableCell>
                    <TableCell className="py-4 text-sm font-medium text-slate-600">{s.lines.map((l) => l.name).join(", ")}</TableCell>
                    <TableCell className="py-4 font-black text-slate-900">{formatCurrency(s.netTotal)}</TableCell>
                    <TableCell className="py-4 text-sm font-medium text-slate-600">{s.paymentMode}</TableCell>
                    <TableCell className="px-6 py-4"><StatusBadge status={s.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabWrap>
      )}

      {tab === "payments" && (
        <TabWrap 
          actions={
            <Button className="rounded-xl h-10 px-6 bg-slate-800 hover:bg-slate-900 text-white font-bold shadow-lg" onClick={() => setPaymentModalOpen(true)}>
              <Plus className="h-4 w-4 mr-2" /> Record Payment
            </Button>
          }
        >
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/50 border-b border-slate-100 hover:bg-slate-50/50">
                <TableHead className="font-bold text-slate-500 py-4 px-6 h-auto">Receipt No.</TableHead>
                <TableHead className="font-bold text-slate-500 py-4 h-auto">Date</TableHead>
                <TableHead className="font-bold text-slate-500 py-4 h-auto">Patient</TableHead>
                <TableHead className="font-bold text-slate-500 py-4 h-auto">Against</TableHead>
                <TableHead className="font-bold text-slate-500 py-4 h-auto">Amount</TableHead>
                <TableHead className="font-bold text-slate-500 py-4 h-auto">Mode</TableHead>
                <TableHead className="font-bold text-slate-500 py-4 px-6 h-auto">Received By</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {PAYMENTS.map((p) => (
                <TableRow key={p.id} className="transition-colors hover:bg-slate-50 border-b border-slate-50 last:border-0">
                  <TableCell className="px-6 py-4 font-mono font-medium text-slate-500">{p.receiptNo}</TableCell>
                  <TableCell className="py-4 text-sm font-medium text-slate-600 whitespace-nowrap">{format(new Date(p.date), "dd MMM yyyy")}</TableCell>
                  <TableCell className="py-4 font-bold text-[#0D1B2E]">{patientName(p.patientId)}</TableCell>
                  <TableCell className="py-4 text-sm font-medium text-slate-600">{p.against}</TableCell>
                  <TableCell className="py-4 font-black text-success-600">{formatCurrency(p.amount)}</TableCell>
                  <TableCell className="py-4 text-sm font-medium text-slate-600">{p.mode}</TableCell>
                  <TableCell className="px-6 py-4 text-sm font-medium text-slate-500">{p.receivedBy}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabWrap>
      )}

      {tab === "receipts" && (
        <TabWrap 
          actions={
            <Button className="rounded-xl h-10 px-6 bg-slate-800 hover:bg-slate-900 text-white font-bold shadow-lg" onClick={() => setReceiptModalOpen(true)}>
              <Plus className="h-4 w-4 mr-2" /> New Receipt
            </Button>
          }
        >
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/50 border-b border-slate-100 hover:bg-slate-50/50">
                <TableHead className="font-bold text-slate-500 py-4 px-6 h-auto">Receipt No.</TableHead>
                <TableHead className="font-bold text-slate-500 py-4 h-auto">Date</TableHead>
                <TableHead className="font-bold text-slate-500 py-4 h-auto">Patient</TableHead>
                <TableHead className="font-bold text-slate-500 py-4 h-auto">Type</TableHead>
                <TableHead className="font-bold text-slate-500 py-4 h-auto">Amount</TableHead>
                <TableHead className="font-bold text-slate-500 py-4 px-6 h-auto">Balance Remaining</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {RECEIPTS.map((r) => (
                <TableRow key={r.id} className="transition-colors hover:bg-slate-50 border-b border-slate-50 last:border-0">
                  <TableCell className="px-6 py-4 font-mono font-medium text-slate-500">{r.receiptNo}</TableCell>
                  <TableCell className="py-4 text-sm font-medium text-slate-600 whitespace-nowrap">{format(new Date(r.date), "dd MMM yyyy")}</TableCell>
                  <TableCell className="py-4 font-bold text-[#0D1B2E]">{patientName(r.patientId)}</TableCell>
                  <TableCell className="py-4"><StatusBadge status={r.type} /></TableCell>
                  <TableCell className="py-4 font-black text-slate-900">{formatCurrency(r.amount)}</TableCell>
                  <TableCell className="px-6 py-4 font-medium text-slate-500">{formatCurrency(r.balanceRemaining)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabWrap>
      )}

      {tab === "expenses" && <ExpensesTab />}

      {tab === "bank" && (
        <TabWrap 
          actions={
            <Button className="rounded-xl h-10 px-6 bg-[#0F2A4D] hover:bg-[#16375F] text-white font-bold shadow-lg" onClick={() => setTransferModalOpen(true)}>
              <Plus className="h-4 w-4 mr-2" /> Record Transfer
            </Button>
          }
        >
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/50 border-b border-slate-100 hover:bg-slate-50/50">
                <TableHead className="font-bold text-slate-500 py-4 px-6 h-auto">Date</TableHead>
                <TableHead className="font-bold text-slate-500 py-4 h-auto">Description</TableHead>
                <TableHead className="font-bold text-slate-500 py-4 h-auto">Debit</TableHead>
                <TableHead className="font-bold text-slate-500 py-4 h-auto">Credit</TableHead>
                <TableHead className="font-bold text-slate-500 py-4 px-6 h-auto">Running Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bankRunningBalance().map(({ transaction: t, balance }) => (
                <TableRow key={t.id} className="transition-colors hover:bg-slate-50 border-b border-slate-50 last:border-0">
                  <TableCell className="px-6 py-4 text-sm font-medium text-slate-600 whitespace-nowrap">{format(new Date(t.date), "dd MMM yyyy")}</TableCell>
                  <TableCell className="py-4 font-medium text-[#0D1B2E]">{t.description}</TableCell>
                  <TableCell className="py-4 font-mono font-bold text-danger-600">{t.debit > 0 ? formatCurrency(t.debit) : "—"}</TableCell>
                  <TableCell className="py-4 font-mono font-bold text-success-600">{t.credit > 0 ? formatCurrency(t.credit) : "—"}</TableCell>
                  <TableCell className="px-6 py-4 font-black text-slate-900">{formatCurrency(balance)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabWrap>
      )}

      <PaymentModal open={paymentModalOpen} onOpenChange={setPaymentModalOpen} onSaved={() => { forceUpdate(); toast({ title: "Payment recorded" }) }} />
      <ReceiptModal open={receiptModalOpen} onOpenChange={setReceiptModalOpen} onSaved={() => { forceUpdate(); toast({ title: "Receipt recorded" }) }} />
      <TransferModal open={transferModalOpen} onOpenChange={setTransferModalOpen} onSaved={() => { forceUpdate(); toast({ title: "Bank transfer recorded" }) }} />
    </div>
  )
}

function TabWrap({ children, actions }: { children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">{actions}</div>
      <div className="rounded-[1.5rem] border-none bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-black/5 overflow-hidden">
        <div className="overflow-x-auto">
          {children}
        </div>
      </div>
    </div>
  )
}

function ExpensesTab() {
  const [, forceUpdate] = React.useReducer((x) => x + 1, 0)
  const [modalOpen, setModalOpen] = React.useState(false)
  const chartData = EXPENSE_CATEGORIES.map((cat) => ({
    category: cat,
    amount: EXPENSES.filter((e) => e.category === cat).reduce((s, e) => s + e.amount, 0),
  })).filter((d) => d.amount > 0)
  const total = EXPENSES.reduce((s, e) => s + e.amount, 0)

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button className="rounded-xl h-10 px-6 bg-danger-600 hover:bg-danger-700 text-white font-bold shadow-lg shadow-danger-500/20" onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> Record Expense
        </Button>
      </div>
      
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[65%_1fr]">
        <div className="rounded-[1.5rem] border-none bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-black/5 overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/50 border-b border-slate-100 hover:bg-slate-50/50">
                  <TableHead className="font-bold text-slate-500 py-4 px-6 h-auto">Date</TableHead>
                  <TableHead className="font-bold text-slate-500 py-4 h-auto">Category</TableHead>
                  <TableHead className="font-bold text-slate-500 py-4 h-auto">Description</TableHead>
                  <TableHead className="font-bold text-slate-500 py-4 h-auto">Amount</TableHead>
                  <TableHead className="font-bold text-slate-500 py-4 h-auto">Mode</TableHead>
                  <TableHead className="font-bold text-slate-500 py-4 px-6 h-auto">Entered By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {EXPENSES.map((e) => (
                  <TableRow key={e.id} className="transition-colors hover:bg-slate-50 border-b border-slate-50 last:border-0">
                    <TableCell className="px-6 py-4 text-sm font-medium text-slate-600 whitespace-nowrap">{format(new Date(e.date), "dd MMM yyyy")}</TableCell>
                    <TableCell className="py-4"><StatusBadge status={e.category} /></TableCell>
                    <TableCell className="py-4 font-medium text-[#0D1B2E]">{e.description}</TableCell>
                    <TableCell className="py-4 font-black text-danger-600">{formatCurrency(e.amount)}</TableCell>
                    <TableCell className="py-4 text-sm font-medium text-slate-600">{e.mode}</TableCell>
                    <TableCell className="px-6 py-4 text-sm font-medium text-slate-500">{e.enteredBy}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        <Card className="rounded-[1.5rem] border-none bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-black/5 overflow-hidden h-fit">
          <CardContent className="p-6">
            <h3 className="mb-1 text-lg font-bold text-[#0D1B2E]">This Month by Category</h3>
            <p className="mb-6 text-sm font-medium text-slate-500">Total: <span className="font-bold text-danger-600">{formatCurrency(total)}</span></p>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
                  <XAxis type="number" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `Rs.${v/1000}k`} />
                  <YAxis type="category" dataKey="category" width={90} fontSize={11} tickLine={false} axisLine={false} tick={{fill: '#64748B', fontWeight: 600}} />
                  <Tooltip formatter={(v) => formatCurrency(Number(v))} cursor={{fill: '#F8FAFC'}} />
                  <Bar dataKey="amount" fill="#F43F5E" radius={[0, 4, 4, 0]} barSize={24} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
      <ExpenseModal open={modalOpen} onOpenChange={setModalOpen} onSaved={forceUpdate} />
    </div>
  )
}

function ExpenseModal({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; onSaved: () => void }) {
  const { toast } = useToast()
  const [category, setCategory] = React.useState(EXPENSE_CATEGORIES[0])
  const [description, setDescription] = React.useState("")
  const [amount, setAmount] = React.useState(0)
  const [mode, setMode] = React.useState<"Cash" | "Bank">("Cash")
  const [date, setDate] = React.useState(new Date().toISOString().slice(0, 10))

  React.useEffect(() => {
    if (open) { setCategory(EXPENSE_CATEGORIES[0]); setDescription(""); setAmount(0); setMode("Cash"); setDate(new Date().toISOString().slice(0, 10)) }
  }, [open])

  const save = () => {
    if (!description.trim() || amount <= 0) return
    EXPENSES.push({
      id: Math.max(0, ...EXPENSES.map((e) => e.id)) + 1,
      date, category, description, amount, mode, enteredBy: "Ali Hassan",
    })
    toast({ title: `Expense of ${formatCurrency(amount)} recorded` })
    onSaved()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] rounded-[1.5rem]">
        <DialogHeader><DialogTitle>Add Expense</DialogTitle></DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5"><Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Date</Label><Input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className={selectClass}><SelectValue /></SelectTrigger>
              <SelectContent>{EXPENSE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Description *</Label><Input className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Amount *</Label><Input type="number" className={inputClass} value={amount || ""} onChange={(e) => setAmount(Number(e.target.value))} /></div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Mode</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as "Cash" | "Bank")}>
                <SelectTrigger className={selectClass}><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="Cash">Cash</SelectItem><SelectItem value="Bank">Bank</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0 mt-4">
          <Button variant="ghost" className="rounded-xl font-bold h-11" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="rounded-xl h-11 px-6 bg-danger-600 hover:bg-danger-700 text-white font-bold" onClick={save}>Save Expense</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PaymentModal({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; onSaved: () => void }) {
  const [patientId, setPatientId] = React.useState<string>("")
  const [date, setDate] = React.useState(new Date().toISOString().slice(0, 10))
  const [amount, setAmount] = React.useState(0)
  const [mode, setMode] = React.useState<PaymentMode>("Cash")
  const [against, setAgainst] = React.useState("")
  const [referenceNo, setReferenceNo] = React.useState("")

  React.useEffect(() => {
    if (open) { setPatientId(""); setDate(new Date().toISOString().slice(0, 10)); setAmount(0); setMode("Cash"); setAgainst(""); setReferenceNo("") }
  }, [open])

  const save = () => {
    if (!patientId || amount <= 0) return
    PAYMENTS.unshift({
      id: Math.max(0, ...PAYMENTS.map((p) => p.id)) + 1,
      receiptNo: `PAY-2024-${String(PAYMENTS.length + 1).padStart(4, "0")}`,
      patientId: Number(patientId), date, amount, mode,
      against: against.trim() || "Advance", referenceNo: referenceNo.trim() || undefined,
      receivedBy: "Ali Hassan",
    })
    onSaved()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] rounded-[1.5rem]">
        <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 pt-2">
          <div className="space-y-1.5 md:col-span-2">
            <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Patient *</Label>
            <Select value={patientId} onValueChange={setPatientId}><SelectTrigger className={selectClass}><SelectValue placeholder="Select patient" /></SelectTrigger>
              <SelectContent>{PATIENTS.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name} — {p.mrNo}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Payment Date</Label><Input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div className="space-y-1.5"><Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Amount *</Label><Input type="number" className={inputClass} value={amount || ""} onChange={(e) => setAmount(Number(e.target.value))} /></div>
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Mode</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as PaymentMode)}><SelectTrigger className={selectClass}><SelectValue /></SelectTrigger>
              <SelectContent>{(["Cash", "Card", "Bank Transfer", "Cheque"] as PaymentMode[]).map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Against</Label><Input className={inputClass} placeholder="Advance or invoice no." value={against} onChange={(e) => setAgainst(e.target.value)} /></div>
          <div className="space-y-1.5"><Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Reference No.</Label><Input className={inputClass} value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} /></div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0 mt-4">
          <Button variant="ghost" className="rounded-xl font-bold h-11" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="rounded-xl h-11 px-6 bg-slate-800 hover:bg-slate-900 text-white font-bold" onClick={save}>Save &amp; Print Receipt</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ReceiptModal({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; onSaved: () => void }) {
  const [patientId, setPatientId] = React.useState<string>("")
  const [type, setType] = React.useState<ReceiptType>("Advance Deposit")
  const [amount, setAmount] = React.useState(0)
  const [date, setDate] = React.useState(new Date().toISOString().slice(0, 10))

  React.useEffect(() => {
    if (open) { setPatientId(""); setType("Advance Deposit"); setAmount(0); setDate(new Date().toISOString().slice(0, 10)) }
  }, [open])

  const save = () => {
    if (!patientId || amount <= 0) return
    RECEIPTS.unshift({
      id: Math.max(0, ...RECEIPTS.map((r) => r.id)) + 1,
      receiptNo: `RCT-2024-${String(RECEIPTS.length + 1).padStart(4, "0")}`,
      patientId: Number(patientId), type, amount, date, balanceRemaining: 0,
    })
    onSaved()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] rounded-[1.5rem]">
        <DialogHeader><DialogTitle>New Receipt</DialogTitle></DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Patient *</Label>
            <Select value={patientId} onValueChange={setPatientId}><SelectTrigger className={selectClass}><SelectValue placeholder="Select patient" /></SelectTrigger>
              <SelectContent>{PATIENTS.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name} — {p.mrNo}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as ReceiptType)}><SelectTrigger className={selectClass}><SelectValue /></SelectTrigger>
              <SelectContent>{(["Advance Deposit", "Refund", "Credit Note"] as ReceiptType[]).map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Amount *</Label><Input type="number" className={inputClass} value={amount || ""} onChange={(e) => setAmount(Number(e.target.value))} /></div>
          <div className="space-y-1.5"><Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Date</Label><Input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} /></div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0 mt-4">
          <Button variant="ghost" className="rounded-xl font-bold h-11" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="rounded-xl h-11 px-6 bg-slate-800 hover:bg-slate-900 text-white font-bold" onClick={save}>Save Receipt</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function TransferModal({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; onSaved: () => void }) {
  const [date, setDate] = React.useState(new Date().toISOString().slice(0, 10))
  const [type, setType] = React.useState<"Deposit" | "Withdrawal">("Deposit")
  const [amount, setAmount] = React.useState(0)
  const [description, setDescription] = React.useState("")
  const [bank, setBank] = React.useState(BANKS[0]?.bankName ?? "")
  const [reference, setReference] = React.useState("")

  React.useEffect(() => {
    if (open) { setDate(new Date().toISOString().slice(0, 10)); setType("Deposit"); setAmount(0); setDescription(""); setBank(BANKS[0]?.bankName ?? ""); setReference("") }
  }, [open])

  const save = () => {
    if (!description.trim() || amount <= 0) return
    BANK_TRANSACTIONS.push({
      id: Math.max(0, ...BANK_TRANSACTIONS.map((b) => b.id)) + 1,
      date, description: `${description} — ${bank}`,
      debit: type === "Withdrawal" ? amount : 0,
      credit: type === "Deposit" ? amount : 0,
      bank, referenceNo: reference.trim() || undefined,
    })
    onSaved()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] rounded-[1.5rem]">
        <DialogHeader><DialogTitle>Record Transfer</DialogTitle></DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5"><Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Date</Label><Input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as "Deposit" | "Withdrawal")}><SelectTrigger className={selectClass}><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="Deposit">Deposit</SelectItem><SelectItem value="Withdrawal">Withdrawal</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Amount *</Label><Input type="number" className={inputClass} value={amount || ""} onChange={(e) => setAmount(Number(e.target.value))} /></div>
          <div className="space-y-1.5"><Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Description *</Label><Input className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Bank</Label>
            <Select value={bank} onValueChange={setBank}><SelectTrigger className={selectClass}><SelectValue /></SelectTrigger>
              <SelectContent>{BANKS.filter((b) => b.active).map((b) => <SelectItem key={b.id} value={b.bankName}>{b.bankName} — {b.accountNo}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Reference</Label><Input className={inputClass} value={reference} onChange={(e) => setReference(e.target.value)} /></div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0 mt-4">
          <Button variant="ghost" className="rounded-xl font-bold h-11" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="rounded-xl h-11 px-6 bg-[#0F2A4D] hover:bg-[#16375F] text-white font-bold" onClick={save}>Save Transfer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
