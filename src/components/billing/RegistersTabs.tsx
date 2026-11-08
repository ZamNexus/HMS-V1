"use client"
import * as React from "react"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { FileText } from "lucide-react"

import { EmptyState } from "@/components/shared/EmptyState"
import { ErrorState } from "@/components/shared/ErrorState"
import { Pagination } from "@/components/shared/Pagination"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { PrintButtons } from "@/components/print/PrintButtons"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { CACHE_CLASSES } from "@/lib/query/cacheClasses"
import { useScopedKey } from "@/lib/query/useScopedKey"
import { pageFromUrl, useUrlFilters } from "@/lib/query/useUrlFilters"
import {
  CHARGE_SOURCE_TYPES, RECEIPT_MODES, RECEIPT_TYPES, billingService, type ChargeListOptions, type ChargePayer, type ChargeRegisterRow, type PaymentListOptions, type PaymentRow, type ReceiptMode, type ReceiptType, type RpPeriod,
} from "@/lib/services"
import { formatInstant } from "@/lib/session/hospital"
import { useAccess } from "@/lib/session/useAccess"
import { useHospital } from "@/lib/session/useHospital"
import { useDoctors } from "@/lib/useReferenceData"
import { InvoiceDetailDialog } from "./InvoicesTab"
import { MODE_LABEL, PAYER_LABEL, RECEIPT_TYPE_LABEL, SOURCE_LABEL, partyName, payerLabel, showMoney } from "./billingUi"
import { ReceiptView } from "./ReceiptView"

const PAGE_SIZE = 10
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const CHARGE_PAYER_LIST: readonly ChargePayer[] = ["patient", "panel", "counter"]

function DateRange({ from, to, onChange }: { from?: string; to?: string; onChange: (patch: { from?: string; to?: string }) => void }) {
  return (
    <>
      <label className="flex flex-col text-[11px] font-bold uppercase tracking-wider text-slate-500">From
        <Input type="date" aria-label="From" className="mt-1 h-10 w-40 rounded-xl" value={from ?? ""} max={to} onChange={(e) => onChange({ from: e.target.value || undefined })} /></label>
      <label className="flex flex-col text-[11px] font-bold uppercase tracking-wider text-slate-500">To
        <Input type="date" aria-label="To" className="mt-1 h-10 w-40 rounded-xl" value={to ?? ""} min={from} onChange={(e) => onChange({ to: e.target.value || undefined })} /></label>
    </>
  )
}

/** A receipt read fresh from the server for a reprint (prints are never cached): billing.read or billing.collect_payment. */
function ReceiptLoaderDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const key = useScopedKey("payments", "receipt", id)
  const q = useQuery({ queryKey: key, queryFn: ({ signal }) => billingService.getReceipt(id as string, signal), staleTime: 0, gcTime: 0, enabled: !!id })
  return (
    <Dialog open={!!id} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg" data-testid="receipt-dialog">
        <DialogHeader><DialogTitle>Receipt</DialogTitle></DialogHeader>
        {q.isPending ? <Skeleton className="h-56 w-full rounded-2xl" role="status" aria-label="Loading the receipt" /> : q.isError ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : (
          <>
            <ReceiptView receipt={q.data} />
            <PrintButtons papers={["a4", "thermal"]} onClose={onClose} />
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

/**
 * The payments and receipts register (B8): GET /payments, server-paged (10), filtered by type, mode and dates; a row opens its receipt (read fresh, for a reprint).
 * The Payments tab starts on payments and the Receipts tab on advances (the prototype's "receipts"); the type filter reaches refunds and credit notes. billing.read.
 */
/**
 * `period` (Reports and Financial Statistics): the dates are the screen's own period, so the register hides its date boxes and reads only that period; `null` = the period is not valid yet, nothing is read.
 */
export function PaymentsRegisterTab({ defaultType, period }: { defaultType: ReceiptType; period?: RpPeriod | null }) {
  const { can } = useAccess()
  const { settings } = useHospital()
  const url = useUrlFilters(["page", "type", "mode", "from", "to"] as const)
  const [openId, setOpenId] = React.useState<string | null>(null)
  const allowed = can("billing.read")
  const page = pageFromUrl(url.get("page"))
  const typeParam = url.get("type")
  const type = RECEIPT_TYPES.find((t) => t === typeParam) ?? (typeParam === "all" ? undefined : defaultType)
  const mode = RECEIPT_MODES.find((m) => m === url.get("mode"))
  const from = period !== undefined ? period?.dateFrom : DATE_RE.test(url.get("from") ?? "") ? (url.get("from") as string) : undefined
  const to = period !== undefined ? period?.dateTo : DATE_RE.test(url.get("to") ?? "") ? (url.get("to") as string) : undefined
  const rangeOk = !from || !to || from <= to
  const options: PaymentListOptions = { page, pageSize: PAGE_SIZE, type, mode, dateFrom: rangeOk ? from : undefined, dateTo: rangeOk ? to : undefined }
  const key = useScopedKey("payments", "list", { ...options })
  const list = useQuery({ queryKey: key, queryFn: ({ signal }) => billingService.listPayments(options, signal), ...CACHE_CLASSES.register, placeholderData: keepPreviousData, enabled: allowed && period !== null })
  const items = list.data?.items ?? []
  const setFilter = (patch: Partial<Record<"type" | "mode" | "from" | "to", string | undefined>>) => url.set({ ...patch, page: undefined })
  if (!allowed) return <div className="p-6"><EmptyState icon={FileText} title="Payments are not shown to your role" subtitle="The registers are visible to users who can read billing." /></div>
  return (
    <div className="space-y-4 p-4" data-testid="payments-register">
      <div className="flex flex-wrap items-end gap-3">
        <Select value={type ?? "all"} onValueChange={(v) => setFilter({ type: v })}>
          <SelectTrigger aria-label="Receipt type" className="h-10 w-48 rounded-xl border-slate-200 bg-slate-50"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All types</SelectItem>{RECEIPT_TYPES.map((t) => <SelectItem key={t} value={t}>{RECEIPT_TYPE_LABEL[t]}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={mode ?? "any"} onValueChange={(v) => setFilter({ mode: v === "any" ? undefined : v })}>
          <SelectTrigger aria-label="Payment mode" className="h-10 w-44 rounded-xl border-slate-200 bg-slate-50"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="any">Any mode</SelectItem>{RECEIPT_MODES.map((m) => <SelectItem key={m} value={m}>{MODE_LABEL[m as ReceiptMode]}</SelectItem>)}</SelectContent>
        </Select>
        {period === undefined && <DateRange from={from} to={to} onChange={setFilter} />}
      </div>
      {period === null ? <EmptyState icon={FileText} title="Choose a valid period" subtitle="The register reads the period chosen above." />
        : list.isError && !list.data ? <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        : list.isPending ? <div className="space-y-3" role="status" aria-label="Loading payments">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}</div>
        : items.length === 0 ? <EmptyState icon={FileText} title="Nothing recorded" subtitle="Try a different type or dates." />
        : (
          <div className="overflow-x-auto rounded-2xl ring-1 ring-black/5">
            <Table>
              <TableHeader><TableRow className="bg-slate-50/60 hover:bg-slate-50/60">
                <TableHead className="px-4">Receipt</TableHead><TableHead>From / to</TableHead><TableHead>Invoice</TableHead><TableHead>Mode</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="pr-4">Received by</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {items.map((p: PaymentRow) => (
                  <TableRow key={p.id} data-testid={`payment-row-${p.id}`} className="cursor-pointer hover:bg-slate-50" onClick={() => setOpenId(p.id)}>
                    <TableCell className="px-4"><button type="button" className="font-mono text-xs font-bold text-[#0891B2] hover:underline focus-visible:underline" onClick={(e) => { e.stopPropagation(); setOpenId(p.id) }}>{p.receiptNo}</button><div className="text-xs text-slate-500">{settings?.timezone ? formatInstant(p.receivedAt, settings.timezone) : p.receivedAt}</div></TableCell>
                    <TableCell><div className="font-semibold">{payerLabel(p.payer)}</div><div className="mt-0.5"><StatusBadge status={RECEIPT_TYPE_LABEL[p.type]} /></div></TableCell>
                    <TableCell className="font-mono text-xs">{p.invoice ? p.invoice.invoiceNo : "—"}</TableCell>
                    <TableCell>{p.mode ? MODE_LABEL[p.mode] : "—"}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{showMoney(p.amount)}</TableCell>
                    <TableCell className="pr-4 text-sm">{p.receivedBy.name}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      {list.data && (items.length > 0 || page > 1) && <Pagination page={page} pageSize={PAGE_SIZE} total={list.data.total} onPageChange={(n) => url.set({ page: n === 1 ? undefined : String(n) })} itemLabel="receipts" />}
      <ReceiptLoaderDialog id={openId} onClose={() => setOpenId(null)} />
    </div>
  )
}

/**
 * Daily Transactions (B8): the charges register, GET /charges, server-paged (10), filtered by charge type, payer, doctor, dates and "show voided". A counter sale
 * shows its customer's name. billing.read.
 */
/** `period` as on the payments register; `lock` fixes the kind of charge (Financial Statistics: one tab per kind), so the charge-type box is not shown. */
export function ChargesRegisterTab({ period, lock }: { period?: RpPeriod | null; lock?: Pick<ChargeListOptions, "sourceType" | "diagnosticType" | "modality"> } = {}) {
  const { can } = useAccess()
  const { settings } = useHospital()
  const doctors = useDoctors()
  const url = useUrlFilters(["page", "source", "payer", "doctor", "from", "to", "voided"] as const)
  const [invoiceId, setInvoiceId] = React.useState<string | null>(null)
  const allowed = can("billing.read")
  const page = pageFromUrl(url.get("page"))
  const sourceType = lock ? lock.sourceType : CHARGE_SOURCE_TYPES.find((s) => s === url.get("source"))
  const payer = CHARGE_PAYER_LIST.find((p) => p === url.get("payer"))
  const doctorId = doctors.active.find((d) => d.id === url.get("doctor"))?.id
  const from = period !== undefined ? period?.dateFrom : DATE_RE.test(url.get("from") ?? "") ? (url.get("from") as string) : undefined
  const to = period !== undefined ? period?.dateTo : DATE_RE.test(url.get("to") ?? "") ? (url.get("to") as string) : undefined
  const includeVoided = url.get("voided") === "true"
  const rangeOk = !from || !to || from <= to
  const options: ChargeListOptions = { page, pageSize: PAGE_SIZE, sourceType, diagnosticType: lock?.diagnosticType, modality: lock?.modality, payer, doctorId, includeVoided: includeVoided || undefined, dateFrom: rangeOk ? from : undefined, dateTo: rangeOk ? to : undefined }
  const key = useScopedKey("charges", "list", { ...options })
  const list = useQuery({ queryKey: key, queryFn: ({ signal }) => billingService.listCharges(options, signal), ...CACHE_CLASSES.register, placeholderData: keepPreviousData, enabled: allowed && period !== null })
  const items = list.data?.items ?? []
  const setFilter = (patch: Partial<Record<"source" | "payer" | "doctor" | "from" | "to" | "voided", string | undefined>>) => url.set({ ...patch, page: undefined })
  if (!allowed) return <div className="p-6"><EmptyState icon={FileText} title="Transactions are not shown to your role" subtitle="The registers are visible to users who can read billing." /></div>
  return (
    <div className="space-y-4 p-4" data-testid="charges-register">
      <div className="flex flex-wrap items-end gap-3">
        {!lock && <Select value={sourceType ?? "any"} onValueChange={(v) => setFilter({ source: v === "any" ? undefined : v })}>
          <SelectTrigger aria-label="Charge type" className="h-10 w-44 rounded-xl border-slate-200 bg-slate-50"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="any">Any charge</SelectItem>{CHARGE_SOURCE_TYPES.map((s) => <SelectItem key={s} value={s}>{SOURCE_LABEL[s]}</SelectItem>)}</SelectContent>
        </Select>}
        <Select value={payer ?? "any"} onValueChange={(v) => setFilter({ payer: v === "any" ? undefined : v })}>
          <SelectTrigger aria-label="Payer" className="h-10 w-40 rounded-xl border-slate-200 bg-slate-50"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="any">Any payer</SelectItem>{CHARGE_PAYER_LIST.map((p) => <SelectItem key={p} value={p}>{PAYER_LABEL[p]}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={doctorId ?? "any"} onValueChange={(v) => setFilter({ doctor: v === "any" ? undefined : v })}>
          <SelectTrigger aria-label="Doctor" className="h-10 w-52 rounded-xl border-slate-200 bg-slate-50"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="any">Any doctor</SelectItem>{doctors.active.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
        </Select>
        {period === undefined && <DateRange from={from} to={to} onChange={setFilter} />}
        <label className="flex h-10 items-center gap-2 text-sm font-medium"><input type="checkbox" aria-label="Show voided" checked={includeVoided} onChange={(e) => setFilter({ voided: e.target.checked ? "true" : undefined })} /> Show voided</label>
      </div>
      {period === null ? <EmptyState icon={FileText} title="Choose a valid period" subtitle="The register reads the period chosen above." />
        : list.isError && !list.data ? <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        : list.isPending ? <div className="space-y-3" role="status" aria-label="Loading transactions">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}</div>
        : items.length === 0 ? <EmptyState icon={FileText} title="No transactions" subtitle="Try different filters." />
        : (
          <div className="overflow-x-auto rounded-2xl ring-1 ring-black/5">
            <Table>
              <TableHeader><TableRow className="bg-slate-50/60 hover:bg-slate-50/60">
                <TableHead className="px-4">Charge</TableHead><TableHead>Patient</TableHead><TableHead>Doctor</TableHead><TableHead>Invoice</TableHead><TableHead className="text-right">Total</TableHead><TableHead className="text-right">Received</TableHead><TableHead className="pr-4 text-right">Outstanding</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {items.map((c: ChargeRegisterRow) => (
                  <TableRow key={c.id} data-testid={`charge-row-${c.id}`} data-voided={c.voided ? "true" : undefined} className={c.voided ? "bg-slate-50/70 text-slate-400" : undefined}>
                    <TableCell className="px-4"><div className={c.voided ? "font-semibold line-through" : "font-semibold"}>{c.description}</div><div className="text-xs text-slate-500">{SOURCE_LABEL[c.sourceType]} · {settings?.timezone ? formatInstant(c.chargedAt, settings.timezone, { dateStyle: "medium" }) : c.chargedAt}{c.voided ? " · voided" : ""}</div></TableCell>
                    <TableCell><div className="font-semibold">{partyName(c)}</div><div className="text-xs text-slate-500">{c.patient ? c.patient.mrNo : "Counter sale"}{c.panel ? ` · ${c.panel.name}` : ""}</div></TableCell>
                    <TableCell className="text-sm">{c.doctor ? c.doctor.name : "—"}</TableCell>
                    <TableCell><button type="button" className="font-mono text-xs font-bold text-[#0891B2] hover:underline" onClick={() => setInvoiceId(c.invoice.id)}>{c.invoice.invoiceNo}</button></TableCell>
                    <TableCell className="text-right tabular-nums">{showMoney(c.totalAmount)}</TableCell>
                    <TableCell className="text-right tabular-nums">{showMoney(c.received)}</TableCell>
                    <TableCell className="pr-4 text-right font-semibold tabular-nums">{showMoney(c.outstanding)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      {list.data && (items.length > 0 || page > 1) && <Pagination page={page} pageSize={PAGE_SIZE} total={list.data.total} onPageChange={(n) => url.set({ page: n === 1 ? undefined : String(n) })} itemLabel="charges" />}
      <InvoiceDetailDialog id={invoiceId} onClose={() => setInvoiceId(null)} />
    </div>
  )
}
