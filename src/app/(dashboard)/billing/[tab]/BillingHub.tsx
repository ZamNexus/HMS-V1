"use client"
import * as React from "react"
import Link from "next/link"
import dynamic from "next/dynamic"
import { useParams } from "next/navigation"
import type { BillingTab } from "./tabs"
import { format } from "date-fns"
import { AlertTriangle, Plus, Wallet, TrendingUp, TrendingDown, Receipt as ReceiptIcon, CreditCard, PiggyBank } from "lucide-react"

import {
  DEFAULT_PAGE_SIZE, FINANCE_OPERATION_LABELS, bankTransactionsService, consultationInvoicesService, dataSource, errorSummary, expensesService, financeContractStatus,
  formatMoneyString, isPositiveMoney, moneyFromInputNumber, paymentsService, receiptsService, servicesInvoicesService,
  subMoney, sumMoney, viewState,
  type BankStatementRow, type BillingPaymentRecord, type BillingReceiptRecord, type BillingReceiptType, type ConsultationInvoiceRecord, type ExpenseRecord,
  type ExpenseMode, type FinanceOperation, type ListOptions, type ListResult, type PatientRecord, type ServicesInvoiceRecord, type ViewState,
} from "@/lib/services"
import { listAll } from "@/lib/services/reference/listAll"
import { useBankAccounts, useDoctors, useExpenseCategories, usePatients } from "@/lib/useReferenceData"
import { useResource } from "@/lib/useResource"
import type { PaymentMode } from "@/types"
import { cn } from "@/lib/utils"
import { ContractPending } from "@/components/shared/ContractPending"
import { PatientRecordPicker } from "@/components/shared/PatientPicker"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { EmptyState } from "@/components/shared/EmptyState"
import { Pagination } from "@/components/shared/Pagination"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { useToast } from "@/components/ui/use-toast"
import { failedChecks, validationToast } from "@/lib/validation"

// Only the Expenses tab has a chart; load recharts on demand so the other tabs don't pay for it
const ExpenseByCategoryChart = dynamic(() => import("./ExpenseChart").then((m) => m.ExpenseByCategoryChart), {
  ssr: false,
  loading: () => <div className="h-full animate-pulse rounded-xl bg-slate-50" />,
})

const TABS = [
  { key: "consultations", label: "Consultations", icon: ReceiptIcon },
  { key: "services", label: "Services", icon: CreditCard },
  { key: "payments", label: "Payments", icon: Wallet },
  { key: "receipts", label: "Receipts", icon: ReceiptIcon },
  { key: "expenses", label: "Expenses", icon: TrendingDown },
  { key: "bank", label: "Bank", icon: PiggyBank },
] as const satisfies readonly { key: BillingTab; label: string; icon: unknown }[]

const DATE_RANGES = ["Today", "Yesterday", "This Week", "This Month", "Custom"] as const

const inputClass = "h-11 rounded-xl bg-slate-50 border-slate-200 focus:bg-white focus:ring-2 focus:ring-[#1CC0CE]/20 focus:border-[#1CC0CE] transition-all"
const selectClass = "h-11 rounded-xl bg-slate-50 border-slate-200 focus:bg-white focus:ring-2 focus:ring-[#1CC0CE]/20 focus:border-[#1CC0CE] transition-all"

/**
 * In API mode an operation is offered only when its endpoint is configured (from the OpenAPI spec). Until then the screens say
 * the contract is missing, disable the action and send no request. Mock mode is always connected to its demo data.
 */
const contract = financeContractStatus(dataSource)
const PENDING_HINT = "Awaiting the backend API contract"
const awaiting = (ops: readonly FinanceOperation[]) => ops.map((o) => FINANCE_OPERATION_LABELS[o])
const todayIso = () => new Date().toISOString().slice(0, 10)
/** Display only: "10.00" -> "10". Never used for arithmetic. */
const pctText = (value: string) => String(Number(value))
const nameOf = (patient: PatientRecord | undefined, loading: boolean, failed: boolean) => patient?.name ?? (loading ? "…" : failed ? "—" : "Unknown Patient")

// Each list tab: one page at a time through its service. The loaders are module-level so they stay stable for useResource.
type Loader<T> = (opts: ListOptions) => Promise<ListResult<T>>
const loadConsultations: Loader<ConsultationInvoiceRecord> = (o) => consultationInvoicesService.list(o)
const loadServices: Loader<ServicesInvoiceRecord> = (o) => servicesInvoicesService.list(o)
const loadPayments: Loader<BillingPaymentRecord> = (o) => paymentsService.list(o)
const loadReceipts: Loader<BillingReceiptRecord> = (o) => receiptsService.list(o)
const loadExpenses: Loader<ExpenseRecord> = (o) => expensesService.list(o)
const loadStatement: Loader<BankStatementRow> = (o) => bankTransactionsService.statement(o)

function usePaged<T>(enabled: boolean, loader: Loader<T>) {
  const [page, setPage] = React.useState(1)
  const load = React.useCallback(
    (signal: AbortSignal) => (enabled ? loader({ page, pageSize: DEFAULT_PAGE_SIZE, signal }) : Promise.resolve({ items: [] as T[], total: 0 })),
    [enabled, loader, page]
  )
  const resource = useResource(load)
  const rows = resource.data?.items ?? []
  const view = viewState({ data: resource.data, error: resource.error, loading: resource.loading, rowCount: rows.length })
  return { ...resource, rows, view, page, setPage, total: resource.data?.total ?? 0 }
}

export default function BillingHubPage() {
  const params = useParams()
  const tab = (params?.tab as string) || "consultations"
  const [dateRange, setDateRange] = React.useState<(typeof DATE_RANGES)[number]>("This Month")
  // Bumped after any save so the header tiles reload.
  const [version, setVersion] = React.useState(0)
  const changed = React.useCallback(() => setVersion((v) => v + 1), [])

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

      {contract.pending && (
        <div role="status" data-testid="billing-not-connected" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-500/30">
          <p className="font-bold">Billing, Expenses and Bank are not connected to the backend</p>
          <p className="mt-1">
            The API contract for consultation and services invoices, payments, receipts, expenses, expense categories, bank accounts and bank transactions
            (routes and request/response schemas) has not been provided to the frontend, so nothing can be loaded or saved here. In API mode no request
            is sent and no demo data is shown; the figures below read “—” rather than zero.
          </p>
        </div>
      )}

      <Tiles version={version} />

      {/* ─── TABS NAVIGATION ─────────────────────────────────────────── */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
        {TABS.map((t) => {
          const isActive = tab === t.key
          return (
            <Link href={`/billing/${t.key}`}
              key={t.key}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex items-center gap-2 shrink-0 rounded-xl px-5 py-3 text-sm font-bold transition-all duration-200",
                isActive
                  ? "bg-white text-[#0891B2] shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-black/5 scale-[1.02]"
                  : "text-slate-500 hover:text-slate-800 hover:bg-slate-100"
              )}
            >
              <t.icon className={cn("h-4 w-4", isActive ? "text-[#1CC0CE]" : "text-slate-400")} />
              {t.label}
            </Link>
          )
        })}
      </div>

      {/* ─── TAB CONTENT ─────────────────────────────────────────────── */}
      {tab === "consultations" && <ConsultationsTab />}
      {tab === "services" && <ServicesTab />}
      {tab === "payments" && <PaymentsTab onChanged={changed} />}
      {tab === "receipts" && <ReceiptsTab onChanged={changed} />}
      {tab === "expenses" && <ExpensesTab onChanged={changed} />}
      {tab === "bank" && <BankTab onChanged={changed} />}
    </div>
  )
}

/**
 * The four header tiles. Mock mode only: they are totals of the demo lists, and "Net Income = consultations + services −
 * expenses" is the screen's own demo formula (not a documented rule). In API mode they read "—" until the backend's totals
 * contract is known (the Task List says a Revenue report already exists; its shape is not published).
 */
function Tiles({ version }: { version: number }) {
  const enabled = dataSource === "mock"
  const load = React.useCallback(async () => {
    if (!enabled) return null
    const [consultations, services, expenses] = await Promise.all([
      listAll((o) => consultationInvoicesService.list(o)), listAll((o) => servicesInvoicesService.list(o)), expensesService.totals(),
    ])
    const consultTotal = sumMoney(consultations.items.map((c) => c.netTotal))
    const servicesTotal = sumMoney(services.items.map((s) => s.netTotal))
    return { consultTotal, servicesTotal, expenseTotal: expenses.total, net: subMoney(sumMoney([consultTotal, servicesTotal]), expenses.total) }
    // `version` only forces a reload after a save
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, version])
  const { data, error, loading } = useResource(load)
  const show = (pick: (d: NonNullable<typeof data>) => string) => (!enabled || error ? "—" : data ? formatMoneyString(pick(data)) : loading ? "…" : "—")

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <div className="rounded-[1.5rem] bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-black/5 relative overflow-hidden group">
        <div className="absolute right-0 top-0 p-4 opacity-10 transition-opacity group-hover:opacity-20"><TrendingUp className="h-12 w-12 text-[#0891B2]" /></div>
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Consultations</p>
        <p className="text-2xl font-black text-[#0D1B2E] whitespace-nowrap">{show((d) => d.consultTotal)}</p>
      </div>
      <div className="rounded-[1.5rem] bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-black/5 relative overflow-hidden group">
        <div className="absolute right-0 top-0 p-4 opacity-10 transition-opacity group-hover:opacity-20"><CreditCard className="h-12 w-12 text-[#0891B2]" /></div>
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Services</p>
        <p className="text-2xl font-black text-[#0D1B2E] whitespace-nowrap">{show((d) => d.servicesTotal)}</p>
      </div>
      <div className="rounded-[1.5rem] bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-black/5 relative overflow-hidden group">
        <div className="absolute right-0 top-0 p-4 opacity-10 transition-opacity group-hover:opacity-20"><TrendingDown className="h-12 w-12 text-danger-500" /></div>
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Expenses</p>
        <p className="text-2xl font-black text-danger-600 whitespace-nowrap">{show((d) => d.expenseTotal)}</p>
      </div>
      <div className="rounded-[1.5rem] bg-gradient-to-br from-[#0A1B33] to-[#16375F] p-5 shadow-lg ring-1 ring-black/5 relative overflow-hidden group">
        <div className="absolute right-0 top-0 p-4 opacity-20 transition-opacity group-hover:opacity-40"><Wallet className="h-12 w-12 text-[#1CC0CE]" /></div>
        <p className="text-xs font-bold uppercase tracking-wider text-[#7FA3C8] mb-1">Net Income</p>
        <p className="text-2xl font-black text-white whitespace-nowrap">{show((d) => d.net)}</p>
      </div>
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

/** One list body: the contract-pending panel, or the error / loading / empty state, or the table. */
function ListBody({ ops, title, testId, view, error, reload, emptyTitle, children, footer }: {
  ops: readonly FinanceOperation[]; title: string; testId: string; view: ViewState; error: unknown; reload: () => void; emptyTitle: string
  children: React.ReactNode; footer?: React.ReactNode
}) {
  const missing = contract.missingOf(ops)
  if (missing.length > 0) return <div className="p-6"><ContractPending title={title} awaiting={awaiting(missing)} testId={testId} /></div>
  if (view === "error") {
    return (
      <div className="p-10" role="alert">
        <EmptyState icon={AlertTriangle} title="Couldn't load this list" subtitle={errorSummary(error)} action={<Button variant="outline" className="rounded-xl font-bold" onClick={reload}>Try again</Button>} />
      </div>
    )
  }
  if (view === "loading") return <div className="space-y-3 p-6" role="status" aria-label="Loading"><Skeleton className="h-14 w-full rounded-xl" /><Skeleton className="h-14 w-full rounded-xl" /><Skeleton className="h-14 w-full rounded-xl" /></div>
  if (view === "empty") return <EmptyState icon={ReceiptIcon} title={emptyTitle} />
  return <>{children}{footer}</>
}

function PageFooter({ page, total, onPageChange, label }: { page: number; total: number; onPageChange: (p: number) => void; label: string }) {
  if (total <= DEFAULT_PAGE_SIZE) return null
  return <div className="border-t border-slate-100 bg-slate-50/50 p-4"><Pagination page={page} pageSize={DEFAULT_PAGE_SIZE} total={total} onPageChange={onPageChange} itemLabel={label} /></div>
}

function CreateLink({ href, allowed, children }: { href: string; allowed: boolean; children: React.ReactNode }) {
  const className = "rounded-xl h-10 px-6 bg-[#0F2A4D] hover:bg-[#16375F] text-white font-bold shadow-lg shadow-[#0F2A4D]/20 border-0"
  if (!allowed) return <Button className={className} disabled title={PENDING_HINT}>{children}</Button>
  return <Button className={className} asChild><Link href={href}>{children}</Link></Button>
}

const th = "font-bold text-slate-500 py-4 h-auto"

function ConsultationsTab() {
  const paged = usePaged(contract.can("consultationInvoices.list"), loadConsultations)
  const patients = usePatients(paged.rows.map((r) => r.patientId))
  const doctors = useDoctors(contract.can("consultationInvoices.list"))
  return (
    <TabWrap actions={<CreateLink href="/billing/consultations/new" allowed={contract.can("consultationInvoices.create")}><Plus className="h-4 w-4 mr-2" /> New Consultation</CreateLink>}>
      <ListBody ops={["consultationInvoices.list"]} title="Consultation invoices are unavailable" testId="billing-consultations-pending" view={paged.view} error={paged.error} reload={paged.reload}
        emptyTitle="No consultation invoices" footer={<PageFooter page={paged.page} total={paged.total} onPageChange={paged.setPage} label="invoices" />}>
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50/50 border-b border-slate-100 hover:bg-slate-50/50">
              <TableHead className={cn(th, "px-6")}>Invoice No.</TableHead>
              <TableHead className={th}>Date</TableHead>
              <TableHead className={th}>Patient</TableHead>
              <TableHead className={th}>Doctor</TableHead>
              <TableHead className={th}>Fee</TableHead>
              <TableHead className={th}>Discount</TableHead>
              <TableHead className={th}>Net</TableHead>
              <TableHead className={th}>Mode</TableHead>
              <TableHead className={cn(th, "px-6")}>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.rows.map((c) => (
              <TableRow key={c.id} className="transition-colors hover:bg-slate-50 border-b border-slate-50 last:border-0">
                <TableCell className="px-6 py-4 font-mono font-medium text-slate-500 whitespace-nowrap">{c.invoiceNo}</TableCell>
                <TableCell className="py-4 text-sm font-medium text-slate-600 whitespace-nowrap">{format(new Date(c.date), "dd MMM yyyy")}</TableCell>
                <TableCell className="py-4 font-bold text-[#0D1B2E]">{nameOf(patients.lookup.get(c.patientId), patients.loading, patients.failed)}</TableCell>
                <TableCell className="py-4 text-sm font-medium text-slate-600">{doctors.lookup.get(c.doctorId)?.name ?? "—"}</TableCell>
                <TableCell className="py-4 text-sm font-medium text-slate-600">{formatMoneyString(c.fee)}</TableCell>
                <TableCell className="py-4 text-sm font-medium text-slate-500">{c.discountType === "percent" ? `${pctText(c.discount)}%` : formatMoneyString(c.discount)}</TableCell>
                <TableCell className="py-4 font-black text-slate-900">{formatMoneyString(c.netTotal)}</TableCell>
                <TableCell className="py-4 text-sm font-medium text-slate-600">{c.paymentMode}</TableCell>
                <TableCell className="px-6 py-4"><StatusBadge status={c.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ListBody>
    </TabWrap>
  )
}

function ServicesTab() {
  const paged = usePaged(contract.can("servicesInvoices.list"), loadServices)
  const patients = usePatients(paged.rows.map((r) => r.patientId))
  return (
    <TabWrap actions={<CreateLink href="/billing/services/new" allowed={contract.can("servicesInvoices.create")}><Plus className="h-4 w-4 mr-2" /> New Services Invoice</CreateLink>}>
      <ListBody ops={["servicesInvoices.list"]} title="Services invoices are unavailable" testId="billing-services-pending" view={paged.view} error={paged.error} reload={paged.reload}
        emptyTitle="No services invoices" footer={<PageFooter page={paged.page} total={paged.total} onPageChange={paged.setPage} label="invoices" />}>
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50/50 border-b border-slate-100 hover:bg-slate-50/50">
              <TableHead className={cn(th, "px-6")}>Invoice No.</TableHead>
              <TableHead className={th}>Date</TableHead>
              <TableHead className={th}>Patient</TableHead>
              <TableHead className={th}>Items</TableHead>
              <TableHead className={th}>Net</TableHead>
              <TableHead className={th}>Mode</TableHead>
              <TableHead className={cn(th, "px-6")}>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.rows.map((s) => (
              <TableRow key={s.id} className="transition-colors hover:bg-slate-50 border-b border-slate-50 last:border-0">
                <TableCell className="px-6 py-4 font-mono font-medium text-slate-500 whitespace-nowrap">{s.invoiceNo}</TableCell>
                <TableCell className="py-4 text-sm font-medium text-slate-600 whitespace-nowrap">{format(new Date(s.date), "dd MMM yyyy")}</TableCell>
                <TableCell className="py-4 font-bold text-[#0D1B2E]">{nameOf(patients.lookup.get(s.patientId), patients.loading, patients.failed)}</TableCell>
                <TableCell className="py-4 text-sm font-medium text-slate-600">{s.lines.map((l) => l.name).join(", ")}</TableCell>
                <TableCell className="py-4 font-black text-slate-900">{formatMoneyString(s.netTotal)}</TableCell>
                <TableCell className="py-4 text-sm font-medium text-slate-600">{s.paymentMode}</TableCell>
                <TableCell className="px-6 py-4"><StatusBadge status={s.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ListBody>
    </TabWrap>
  )
}

function PaymentsTab({ onChanged }: { onChanged: () => void }) {
  const [modalOpen, setModalOpen] = React.useState(false)
  const paged = usePaged(contract.can("payments.list"), loadPayments)
  const patients = usePatients(paged.rows.map((r) => r.patientId))
  const canCreate = contract.can("payments.create")
  return (
    <>
      <TabWrap
        actions={
          <Button className="rounded-xl h-10 px-6 bg-slate-800 hover:bg-slate-900 text-white font-bold shadow-lg" disabled={!canCreate} title={canCreate ? undefined : PENDING_HINT} onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> Record Payment
          </Button>
        }
      >
        <ListBody ops={["payments.list"]} title="Payments are unavailable" testId="billing-payments-pending" view={paged.view} error={paged.error} reload={paged.reload}
          emptyTitle="No payments recorded" footer={<PageFooter page={paged.page} total={paged.total} onPageChange={paged.setPage} label="payments" />}>
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/50 border-b border-slate-100 hover:bg-slate-50/50">
                <TableHead className={cn(th, "px-6")}>Receipt No.</TableHead>
                <TableHead className={th}>Date</TableHead>
                <TableHead className={th}>Patient</TableHead>
                <TableHead className={th}>Against</TableHead>
                <TableHead className={th}>Amount</TableHead>
                <TableHead className={th}>Mode</TableHead>
                <TableHead className={cn(th, "px-6")}>Received By</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.rows.map((p) => (
                <TableRow key={p.id} className="transition-colors hover:bg-slate-50 border-b border-slate-50 last:border-0">
                  <TableCell className="px-6 py-4 font-mono font-medium text-slate-500 whitespace-nowrap">{p.receiptNo}</TableCell>
                  <TableCell className="py-4 text-sm font-medium text-slate-600 whitespace-nowrap">{format(new Date(p.date), "dd MMM yyyy")}</TableCell>
                  <TableCell className="py-4 font-bold text-[#0D1B2E]">{nameOf(patients.lookup.get(p.patientId), patients.loading, patients.failed)}</TableCell>
                  <TableCell className="py-4 text-sm font-medium text-slate-600">{p.against}</TableCell>
                  <TableCell className="py-4 font-black text-success-600">{formatMoneyString(p.amount)}</TableCell>
                  <TableCell className="py-4 text-sm font-medium text-slate-600">{p.mode}</TableCell>
                  <TableCell className="px-6 py-4 text-sm font-medium text-slate-500">{p.receivedBy}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ListBody>
      </TabWrap>
      <PaymentModal open={modalOpen} onOpenChange={setModalOpen} onSaved={() => { paged.reload(); onChanged() }} />
    </>
  )
}

function ReceiptsTab({ onChanged }: { onChanged: () => void }) {
  const [modalOpen, setModalOpen] = React.useState(false)
  const paged = usePaged(contract.can("receipts.list"), loadReceipts)
  const patients = usePatients(paged.rows.map((r) => r.patientId))
  const canCreate = contract.can("receipts.create")
  return (
    <>
      <TabWrap
        actions={
          <Button className="rounded-xl h-10 px-6 bg-slate-800 hover:bg-slate-900 text-white font-bold shadow-lg" disabled={!canCreate} title={canCreate ? undefined : PENDING_HINT} onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> New Receipt
          </Button>
        }
      >
        <ListBody ops={["receipts.list"]} title="Receipts are unavailable" testId="billing-receipts-pending" view={paged.view} error={paged.error} reload={paged.reload}
          emptyTitle="No receipts" footer={<PageFooter page={paged.page} total={paged.total} onPageChange={paged.setPage} label="receipts" />}>
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/50 border-b border-slate-100 hover:bg-slate-50/50">
                <TableHead className={cn(th, "px-6")}>Receipt No.</TableHead>
                <TableHead className={th}>Date</TableHead>
                <TableHead className={th}>Patient</TableHead>
                <TableHead className={th}>Type</TableHead>
                <TableHead className={th}>Amount</TableHead>
                <TableHead className={cn(th, "px-6")}>Balance Remaining</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.rows.map((r) => (
                <TableRow key={r.id} className="transition-colors hover:bg-slate-50 border-b border-slate-50 last:border-0">
                  <TableCell className="px-6 py-4 font-mono font-medium text-slate-500 whitespace-nowrap">{r.receiptNo}</TableCell>
                  <TableCell className="py-4 text-sm font-medium text-slate-600 whitespace-nowrap">{format(new Date(r.date), "dd MMM yyyy")}</TableCell>
                  <TableCell className="py-4 font-bold text-[#0D1B2E]">{nameOf(patients.lookup.get(r.patientId), patients.loading, patients.failed)}</TableCell>
                  <TableCell className="py-4"><StatusBadge status={r.type} /></TableCell>
                  <TableCell className="py-4 font-black text-slate-900">{formatMoneyString(r.amount)}</TableCell>
                  <TableCell className="px-6 py-4 font-medium text-slate-500">{formatMoneyString(r.balanceRemaining)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ListBody>
      </TabWrap>
      <ReceiptModal open={modalOpen} onOpenChange={setModalOpen} onSaved={() => { paged.reload(); onChanged() }} />
    </>
  )
}

function BankTab({ onChanged }: { onChanged: () => void }) {
  const [modalOpen, setModalOpen] = React.useState(false)
  const paged = usePaged(contract.can("bankTransactions.statement"), loadStatement)
  const canCreate = contract.canAll(["bankTransactions.create", "bankAccounts.list"])
  return (
    <>
      <TabWrap
        actions={
          <Button className="rounded-xl h-10 px-6 bg-[#0F2A4D] hover:bg-[#16375F] text-white font-bold shadow-lg" disabled={!canCreate} title={canCreate ? undefined : PENDING_HINT} onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> Record Transfer
          </Button>
        }
      >
        <ListBody ops={["bankTransactions.statement"]} title="The bank statement is unavailable" testId="billing-bank-pending" view={paged.view} error={paged.error} reload={paged.reload}
          emptyTitle="No bank transactions" footer={<PageFooter page={paged.page} total={paged.total} onPageChange={paged.setPage} label="transactions" />}>
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/50 border-b border-slate-100 hover:bg-slate-50/50">
                <TableHead className={cn(th, "px-6")}>Date</TableHead>
                <TableHead className={th}>Description</TableHead>
                <TableHead className={th}>Debit</TableHead>
                <TableHead className={th}>Credit</TableHead>
                <TableHead className={cn(th, "px-6")}>Running Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.rows.map(({ transaction: t, balance }) => (
                <TableRow key={t.id} className="transition-colors hover:bg-slate-50 border-b border-slate-50 last:border-0">
                  <TableCell className="px-6 py-4 text-sm font-medium text-slate-600 whitespace-nowrap">{format(new Date(t.date), "dd MMM yyyy")}</TableCell>
                  <TableCell className="py-4 font-medium text-[#0D1B2E]">{t.description}</TableCell>
                  <TableCell className="py-4 font-mono font-bold text-danger-600">{isPositiveMoney(t.debit) ? formatMoneyString(t.debit) : "—"}</TableCell>
                  <TableCell className="py-4 font-mono font-bold text-success-600">{isPositiveMoney(t.credit) ? formatMoneyString(t.credit) : "—"}</TableCell>
                  <TableCell className="px-6 py-4 font-black text-slate-900">{formatMoneyString(balance)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ListBody>
      </TabWrap>
      <TransferModal open={modalOpen} onOpenChange={setModalOpen} onSaved={() => { paged.reload(); onChanged() }} />
    </>
  )
}

const loadExpenseTotals = (signal: AbortSignal) => expensesService.totals({ signal })

function ExpensesTab({ onChanged }: { onChanged: () => void }) {
  const [modalOpen, setModalOpen] = React.useState(false)
  const [nonce, setNonce] = React.useState(0)
  const paged = usePaged(contract.can("expenses.list"), loadExpenses)
  const totalsEnabled = contract.can("expenses.totals")
  const loadTotals = React.useCallback(
    (signal: AbortSignal) => (totalsEnabled ? loadExpenseTotals(signal) : Promise.resolve(null)),
    // `nonce` only forces a reload after a save
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [totalsEnabled, nonce]
  )
  const totals = useResource(loadTotals)
  const canCreate = contract.canAll(["expenses.create", "expenseCategories.list"])
  // Display only: the chart library needs numbers. The totals themselves come from the service as money strings.
  const chartData = (totals.data?.byCategory ?? []).map((c) => ({ category: c.categoryName, amount: Number(c.total) }))

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button className="rounded-xl h-10 px-6 bg-danger-600 hover:bg-danger-700 text-white font-bold shadow-lg shadow-danger-500/20" disabled={!canCreate} title={canCreate ? undefined : PENDING_HINT} onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> Record Expense
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[65%_1fr]">
        <div className="rounded-[1.5rem] border-none bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-black/5 overflow-hidden">
          <div className="overflow-x-auto">
            <ListBody ops={["expenses.list"]} title="Expenses are unavailable" testId="billing-expenses-pending" view={paged.view} error={paged.error} reload={paged.reload}
              emptyTitle="No expenses recorded" footer={<PageFooter page={paged.page} total={paged.total} onPageChange={paged.setPage} label="expenses" />}>
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/50 border-b border-slate-100 hover:bg-slate-50/50">
                    <TableHead className={cn(th, "px-6")}>Date</TableHead>
                    <TableHead className={th}>Category</TableHead>
                    <TableHead className={th}>Description</TableHead>
                    <TableHead className={th}>Amount</TableHead>
                    <TableHead className={th}>Mode</TableHead>
                    <TableHead className={cn(th, "px-6")}>Entered By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paged.rows.map((e) => (
                    <TableRow key={e.id} className="transition-colors hover:bg-slate-50 border-b border-slate-50 last:border-0">
                      <TableCell className="px-6 py-4 text-sm font-medium text-slate-600 whitespace-nowrap">{format(new Date(e.date), "dd MMM yyyy")}</TableCell>
                      <TableCell className="py-4"><StatusBadge status={e.categoryName} /></TableCell>
                      <TableCell className="py-4 font-medium text-[#0D1B2E]">{e.description}</TableCell>
                      <TableCell className="py-4 font-black text-danger-600">{formatMoneyString(e.amount)}</TableCell>
                      <TableCell className="py-4 text-sm font-medium text-slate-600">{e.mode}</TableCell>
                      <TableCell className="px-6 py-4 text-sm font-medium text-slate-500">{e.enteredBy}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ListBody>
          </div>
        </div>

        <Card className="rounded-[1.5rem] border-none bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-black/5 overflow-hidden h-fit">
          <CardContent className="p-6">
            <h3 className="mb-1 text-lg font-bold text-[#0D1B2E]">This Month by Category</h3>
            {!totalsEnabled ? (
              <ContractPending title="Expense totals are unavailable" awaiting={awaiting(["expenses.totals"])} testId="billing-expense-totals-pending" />
            ) : totals.error && !totals.data ? (
              <p role="alert" className="text-sm text-red-600">Couldn&apos;t load expense totals: {errorSummary(totals.error)}</p>
            ) : (
              <>
                <p className="mb-6 text-sm font-medium text-slate-500">Total: <span className="font-bold text-danger-600">{totals.data ? formatMoneyString(totals.data.total) : "…"}</span></p>
                <div className="h-[280px]">
                  <ExpenseByCategoryChart data={chartData} />
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
      <ExpenseModal open={modalOpen} onOpenChange={setModalOpen} onSaved={() => { paged.reload(); setNonce((n) => n + 1); onChanged() }} />
    </div>
  )
}

function ExpenseModal({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; onSaved: () => void }) {
  const uid = React.useId()
  const { toast } = useToast()
  const heads = useExpenseCategories(contract.can("expenseCategories.list"))
  const [categoryId, setCategoryId] = React.useState<string | undefined>(undefined)
  const [description, setDescription] = React.useState("")
  const [amount, setAmount] = React.useState(0)
  const [mode, setMode] = React.useState<ExpenseMode>("Cash")
  const [date, setDate] = React.useState(todayIso)
  const [saving, setSaving] = React.useState(false)
  const canCreate = contract.can("expenses.create")

  // Start each entry afresh when the dialog opens (derived during render rather than in an effect).
  const [seenOpen, setSeenOpen] = React.useState(open)
  if (seenOpen !== open) {
    setSeenOpen(open)
    if (open) { setCategoryId(undefined); setDescription(""); setAmount(0); setMode("Cash"); setDate(todayIso()) }
  }
  const chosenCategory = categoryId ?? heads.items[0]?.id

  const save = async () => {
    if (!canCreate) return
    const money = moneyFromInputNumber(amount)
    const problems = failedChecks([
      [chosenCategory, "Category is required"], [description.trim(), "Description is required"],
      [money !== null && isPositiveMoney(money), "Amount must be greater than 0, with at most two decimals"],
    ])
    if (problems.length || money === null || !chosenCategory) { toast(validationToast(problems)); return }
    setSaving(true)
    try {
      await expensesService.create({ date, categoryId: chosenCategory, description: description.trim(), amount: money, mode })
      toast({ title: `Expense of ${formatMoneyString(money)} recorded` })
      onSaved()
      onOpenChange(false)
    } catch (err) {
      toast({ variant: "destructive", title: "Could not record the expense", description: errorSummary(err) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] rounded-[1.5rem]">
        <DialogHeader><DialogTitle>Add Expense</DialogTitle></DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5"><Label htmlFor={`${uid}-date`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Date</Label><Input id={`${uid}-date`} type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label htmlFor={`${uid}-category`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Category</Label>
            <Select value={chosenCategory} onValueChange={setCategoryId} disabled={heads.loading || heads.items.length === 0}>
              <SelectTrigger id={`${uid}-category`} className={selectClass}><SelectValue placeholder={heads.loading ? "Loading categories…" : "No categories"} /></SelectTrigger>
              <SelectContent>{heads.items.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
            {Boolean(heads.error) && <p role="alert" className="text-xs text-red-600">Categories unavailable: {errorSummary(heads.error)}</p>}
          </div>
          <div className="space-y-1.5"><Label htmlFor={`${uid}-description`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Description *</Label><Input id={`${uid}-description`} className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label htmlFor={`${uid}-amount`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Amount *</Label><Input id={`${uid}-amount`} type="number" className={inputClass} value={amount || ""} onChange={(e) => setAmount(Number(e.target.value))} /></div>
            <div className="space-y-1.5">
              <Label htmlFor={`${uid}-mode`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Mode</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as ExpenseMode)}>
                <SelectTrigger id={`${uid}-mode`} className={selectClass}><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="Cash">Cash</SelectItem><SelectItem value="Bank">Bank</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0 mt-4">
          <Button variant="ghost" className="rounded-xl font-bold h-11" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="rounded-xl h-11 px-6 bg-danger-600 hover:bg-danger-700 text-white font-bold" disabled={saving || !canCreate} title={canCreate ? undefined : PENDING_HINT} onClick={save}>Save Expense</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PaymentModal({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; onSaved: () => void }) {
  const uid = React.useId()
  const { toast } = useToast()
  const [patient, setPatient] = React.useState<PatientRecord | null>(null)
  const [date, setDate] = React.useState(todayIso)
  const [amount, setAmount] = React.useState(0)
  const [mode, setMode] = React.useState<PaymentMode>("Cash")
  const [against, setAgainst] = React.useState("")
  const [referenceNo, setReferenceNo] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  const canCreate = contract.can("payments.create")

  const [seenOpen, setSeenOpen] = React.useState(open)
  if (seenOpen !== open) {
    setSeenOpen(open)
    if (open) { setPatient(null); setDate(todayIso()); setAmount(0); setMode("Cash"); setAgainst(""); setReferenceNo("") }
  }

  const save = async () => {
    if (!canCreate) return
    const money = moneyFromInputNumber(amount)
    const problems = failedChecks([[patient, "Patient is required"], [money !== null && isPositiveMoney(money), "Amount must be greater than 0, with at most two decimals"]])
    if (problems.length || !patient || money === null) { toast(validationToast(problems)); return }
    setSaving(true)
    try {
      await paymentsService.create({ patientId: patient.id, date, amount: money, mode, against: against.trim() || undefined, referenceNo: referenceNo.trim() || undefined })
      toast({ title: "Payment recorded" })
      onSaved()
      onOpenChange(false)
    } catch (err) {
      toast({ variant: "destructive", title: "Could not record the payment", description: errorSummary(err) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] rounded-[1.5rem]">
        <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 pt-2">
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor={`${uid}-patient`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Patient *</Label>
            <PatientRecordPicker id={`${uid}-patient`} value={patient} onChange={setPatient} />
          </div>
          <div className="space-y-1.5"><Label htmlFor={`${uid}-payment-date`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Payment Date</Label><Input id={`${uid}-payment-date`} type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor={`${uid}-amount`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Amount *</Label><Input id={`${uid}-amount`} type="number" className={inputClass} value={amount || ""} onChange={(e) => setAmount(Number(e.target.value))} /></div>
          <div className="space-y-1.5">
            <Label htmlFor={`${uid}-mode`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Mode</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as PaymentMode)}><SelectTrigger id={`${uid}-mode`} className={selectClass}><SelectValue /></SelectTrigger>
              <SelectContent>{(["Cash", "Card", "Bank Transfer", "Cheque"] as PaymentMode[]).map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label htmlFor={`${uid}-against`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Against</Label><Input id={`${uid}-against`} className={inputClass} placeholder="Advance or invoice no." value={against} onChange={(e) => setAgainst(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor={`${uid}-reference-no`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Reference No.</Label><Input id={`${uid}-reference-no`} className={inputClass} value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} /></div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0 mt-4">
          <Button variant="ghost" className="rounded-xl font-bold h-11" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="rounded-xl h-11 px-6 bg-slate-800 hover:bg-slate-900 text-white font-bold" disabled={saving || !canCreate} title={canCreate ? undefined : PENDING_HINT} onClick={save}>Save &amp; Print Receipt</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ReceiptModal({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; onSaved: () => void }) {
  const uid = React.useId()
  const { toast } = useToast()
  const [patient, setPatient] = React.useState<PatientRecord | null>(null)
  const [type, setType] = React.useState<BillingReceiptType>("Advance Deposit")
  const [amount, setAmount] = React.useState(0)
  const [date, setDate] = React.useState(todayIso)
  const [saving, setSaving] = React.useState(false)
  const canCreate = contract.can("receipts.create")

  const [seenOpen, setSeenOpen] = React.useState(open)
  if (seenOpen !== open) {
    setSeenOpen(open)
    if (open) { setPatient(null); setType("Advance Deposit"); setAmount(0); setDate(todayIso()) }
  }

  const save = async () => {
    if (!canCreate) return
    const money = moneyFromInputNumber(amount)
    const problems = failedChecks([[patient, "Patient is required"], [money !== null && isPositiveMoney(money), "Amount must be greater than 0, with at most two decimals"]])
    if (problems.length || !patient || money === null) { toast(validationToast(problems)); return }
    setSaving(true)
    try {
      await receiptsService.create({ patientId: patient.id, type, amount: money, date })
      toast({ title: "Receipt recorded" })
      onSaved()
      onOpenChange(false)
    } catch (err) {
      toast({ variant: "destructive", title: "Could not record the receipt", description: errorSummary(err) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] rounded-[1.5rem]">
        <DialogHeader><DialogTitle>New Receipt</DialogTitle></DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor={`${uid}-patient`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Patient *</Label>
            <PatientRecordPicker id={`${uid}-patient`} value={patient} onChange={setPatient} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${uid}-type`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as BillingReceiptType)}><SelectTrigger id={`${uid}-type`} className={selectClass}><SelectValue /></SelectTrigger>
              <SelectContent>{(["Advance Deposit", "Refund", "Credit Note"] as BillingReceiptType[]).map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label htmlFor={`${uid}-amount`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Amount *</Label><Input id={`${uid}-amount`} type="number" className={inputClass} value={amount || ""} onChange={(e) => setAmount(Number(e.target.value))} /></div>
          <div className="space-y-1.5"><Label htmlFor={`${uid}-date`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Date</Label><Input id={`${uid}-date`} type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} /></div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0 mt-4">
          <Button variant="ghost" className="rounded-xl font-bold h-11" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="rounded-xl h-11 px-6 bg-slate-800 hover:bg-slate-900 text-white font-bold" disabled={saving || !canCreate} title={canCreate ? undefined : PENDING_HINT} onClick={save}>Save Receipt</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function TransferModal({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; onSaved: () => void }) {
  const uid = React.useId()
  const { toast } = useToast()
  const accounts = useBankAccounts(contract.can("bankAccounts.list"))
  const active = accounts.items.filter((b) => b.active)
  const [date, setDate] = React.useState(todayIso)
  const [type, setType] = React.useState<"Deposit" | "Withdrawal">("Deposit")
  const [amount, setAmount] = React.useState(0)
  const [description, setDescription] = React.useState("")
  const [bankId, setBankId] = React.useState<string | undefined>(undefined)
  const [reference, setReference] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  const canCreate = contract.can("bankTransactions.create")

  const [seenOpen, setSeenOpen] = React.useState(open)
  if (seenOpen !== open) {
    setSeenOpen(open)
    if (open) { setDate(todayIso()); setType("Deposit"); setAmount(0); setDescription(""); setBankId(undefined); setReference("") }
  }
  const chosenBank = bankId ?? active[0]?.id

  const save = async () => {
    if (!canCreate) return
    const money = moneyFromInputNumber(amount)
    const problems = failedChecks([
      [chosenBank, "Bank is required"], [money !== null && isPositiveMoney(money), "Amount must be greater than 0, with at most two decimals"], [description.trim(), "Description is required"],
    ])
    if (problems.length || money === null || !chosenBank) { toast(validationToast(problems)); return }
    setSaving(true)
    try {
      await bankTransactionsService.create({ date, bankAccountId: chosenBank, direction: type, amount: money, description: description.trim(), referenceNo: reference.trim() || undefined })
      toast({ title: "Bank transfer recorded" })
      onSaved()
      onOpenChange(false)
    } catch (err) {
      toast({ variant: "destructive", title: "Could not record the transfer", description: errorSummary(err) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] rounded-[1.5rem]">
        <DialogHeader><DialogTitle>Record Transfer</DialogTitle></DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5"><Label htmlFor={`${uid}-date`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Date</Label><Input id={`${uid}-date`} type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label htmlFor={`${uid}-type`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as "Deposit" | "Withdrawal")}><SelectTrigger id={`${uid}-type`} className={selectClass}><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="Deposit">Deposit</SelectItem><SelectItem value="Withdrawal">Withdrawal</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label htmlFor={`${uid}-amount`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Amount *</Label><Input id={`${uid}-amount`} type="number" className={inputClass} value={amount || ""} onChange={(e) => setAmount(Number(e.target.value))} /></div>
          <div className="space-y-1.5"><Label htmlFor={`${uid}-description`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Description *</Label><Input id={`${uid}-description`} className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label htmlFor={`${uid}-bank`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Bank</Label>
            <Select value={chosenBank} onValueChange={setBankId} disabled={accounts.loading || active.length === 0}><SelectTrigger id={`${uid}-bank`} className={selectClass}><SelectValue placeholder={accounts.loading ? "Loading accounts…" : "No active accounts"} /></SelectTrigger>
              <SelectContent>{active.map((b) => <SelectItem key={b.id} value={b.id}>{b.bankName} — {b.accountNo}</SelectItem>)}</SelectContent>
            </Select>
            {Boolean(accounts.error) && <p role="alert" className="text-xs text-red-600">Accounts unavailable: {errorSummary(accounts.error)}</p>}
          </div>
          <div className="space-y-1.5"><Label htmlFor={`${uid}-reference`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Reference</Label><Input id={`${uid}-reference`} className={inputClass} value={reference} onChange={(e) => setReference(e.target.value)} /></div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0 mt-4">
          <Button variant="ghost" className="rounded-xl font-bold h-11" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="rounded-xl h-11 px-6 bg-[#0F2A4D] hover:bg-[#16375F] text-white font-bold" disabled={saving || !canCreate} title={canCreate ? undefined : PENDING_HINT} onClick={save}>Save Transfer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
