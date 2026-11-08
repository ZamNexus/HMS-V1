"use client"
import * as React from "react"
import { keepPreviousData, useQuery } from "@tanstack/react-query"

import { BillingActionDialog } from "@/components/billing/BillingActionDialog"
import { showMoney } from "@/components/billing/billingUi"
import { ErrorState } from "@/components/shared/ErrorState"
import { Pagination } from "@/components/shared/Pagination"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { CACHE_CLASSES } from "@/lib/query/cacheClasses"
import { useScopedKey } from "@/lib/query/useScopedKey"
import { PM_LIMITS, PM_MOVEMENT_TYPES, pharmacyApiService, type PmBatch, type PmBatchReceipt, type PmMedicine, type PmMedicineDetail, type PmMedicinePatch, type PmMovementType, moneySymbol } from "@/lib/services"
import { formatInstant } from "@/lib/session/hospital"
import { useAccess } from "@/lib/session/useAccess"
import { useHospital } from "@/lib/session/useHospital"
import { PM_MOVEMENT_LABEL, wholeQuantity } from "./pmUi"

const Field = ({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) => (
  <div className="space-y-1.5">
    <Label htmlFor={id} className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</Label>
    {children}
    {hint && <p className="text-xs text-slate-500">{hint}</p>}
  </div>
)

/**
 * Add (PH2) or edit a medicine. Editing sends ONLY what changed (PATCH). Name, generic, category, unit, the sale rate, GST and the standing discount, and the reorder level. The medicine
 * holds no stock of its own: stock is received as batches. A name already taken is refused by the server (409 MEDICINE_NAME_TAKEN).
 */
export function MedicineFormDialog({ medicine, onClose, onDone }: { medicine: PmMedicine | null; onClose: () => void; onDone: (saved: PmMedicineDetail | null) => void }) {
  const editing = medicine !== null
  const [name, setName] = React.useState(medicine?.name ?? "")
  const [generic, setGeneric] = React.useState(medicine?.generic ?? "")
  const [category, setCategory] = React.useState(medicine?.category ?? "")
  const [unit, setUnit] = React.useState(medicine?.unit ?? "")
  const [saleRate, setSaleRate] = React.useState(medicine?.saleRate ?? "")
  const [gstPct, setGstPct] = React.useState(medicine?.gstPct ?? "")
  const [discountPct, setDiscountPct] = React.useState(medicine?.discountPct ?? "")
  const [reorder, setReorder] = React.useState(medicine ? String(medicine.reorderLevel) : "")
  const changed = (): PmMedicinePatch => {
    const m = medicine as PmMedicine
    const patch: PmMedicinePatch = {}
    if (name.trim() !== m.name) patch.name = name
    if (generic.trim() !== (m.generic ?? "")) patch.generic = generic
    if (category.trim() !== (m.category ?? "")) patch.category = category
    if (unit.trim() !== (m.unit ?? "")) patch.unit = unit
    if (saleRate.trim() !== m.saleRate) patch.saleRate = saleRate
    if (gstPct.trim() !== m.gstPct) patch.gstPct = gstPct
    if (discountPct.trim() !== m.discountPct) patch.discountPct = discountPct
    if (reorder.trim() !== String(m.reorderLevel)) patch.reorderLevel = wholeQuantity(reorder) ?? Number.NaN
    return patch
  }
  const ready = name.trim() !== "" && saleRate.trim() !== ""
  return (
    <BillingActionDialog
      wide title={editing ? `Edit ${medicine.name}` : "Add medicine"} confirmLabel={editing ? "Save changes" : "Add medicine"} pendingLabel="Saving…" canConfirm={ready} onClose={onClose} onDone={onDone}
      description={editing ? "Only what you change is sent." : "Stock is received afterwards, as batches with an expiry."}
      onConfirm={() => (editing ? pharmacyApiService.updateMedicine(medicine.id, changed()) : pharmacyApiService.createMedicine({
        name, generic, category, unit, saleRate, gstPct: gstPct || undefined, discountPct: discountPct || undefined, reorderLevel: reorder.trim() === "" ? undefined : (wholeQuantity(reorder) ?? Number.NaN),
      }))}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="med-name" label="Name *"><Input id="med-name" maxLength={PM_LIMITS.name} className="h-11 rounded-xl" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field id="med-generic" label="Generic name"><Input id="med-generic" maxLength={PM_LIMITS.generic} className="h-11 rounded-xl" value={generic} onChange={(e) => setGeneric(e.target.value)} /></Field>
        <Field id="med-category" label="Category"><Input id="med-category" maxLength={PM_LIMITS.category} className="h-11 rounded-xl" value={category} onChange={(e) => setCategory(e.target.value)} /></Field>
        <Field id="med-unit" label="Unit" hint="tablet, bottle, strip…"><Input id="med-unit" maxLength={PM_LIMITS.unit} className="h-11 rounded-xl" value={unit} onChange={(e) => setUnit(e.target.value)} /></Field>
        <Field id="med-rate" label={`Sale rate (${moneySymbol()}) *`}><Input id="med-rate" inputMode="decimal" className="h-11 rounded-xl tabular-nums" value={saleRate} onChange={(e) => setSaleRate(e.target.value)} /></Field>
        <Field id="med-reorder" label="Reorder level" hint="Low stock is flagged by the server at or below this."><Input id="med-reorder" inputMode="numeric" className="h-11 rounded-xl tabular-nums" value={reorder} onChange={(e) => setReorder(e.target.value)} /></Field>
        <Field id="med-gst" label="GST %"><Input id="med-gst" inputMode="decimal" className="h-11 rounded-xl tabular-nums" value={gstPct} onChange={(e) => setGstPct(e.target.value)} /></Field>
        <Field id="med-discount" label="Standing discount %"><Input id="med-discount" inputMode="decimal" className="h-11 rounded-xl tabular-nums" value={discountPct} onChange={(e) => setDiscountPct(e.target.value)} /></Field>
      </div>
    </BillingActionDialog>
  )
}

/** Receive stock (PH3): a delivery as a batch, with its expiry. The medicine's stock summary is the server's. */
export function ReceiveStockDialog({ medicine, onClose, onDone }: { medicine: Pick<PmMedicine, "id" | "name">; onClose: () => void; onDone: (saved: PmBatchReceipt | null) => void }) {
  const [batchNo, setBatchNo] = React.useState("")
  const [expiry, setExpiry] = React.useState("")
  const [quantity, setQuantity] = React.useState("")
  const [rate, setRate] = React.useState("")
  const [supplier, setSupplier] = React.useState("")
  const [received, setReceived] = React.useState("")
  return (
    <BillingActionDialog
      wide title={`Receive stock: ${medicine.name}`} confirmLabel="Receive stock" pendingLabel="Saving…" canConfirm={batchNo.trim() !== "" && expiry !== "" && quantity.trim() !== "" && rate.trim() !== ""} onClose={onClose} onDone={onDone}
      description="One batch per delivery. First-expire-first-out is the server's job."
      onConfirm={() => pharmacyApiService.receiveStock(medicine.id, { batchNo, expiryDate: expiry, quantity: wholeQuantity(quantity) ?? Number.NaN, purchaseRate: rate, supplier, receivedDate: received || undefined })}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="rcv-batch" label="Batch number *"><Input id="rcv-batch" maxLength={PM_LIMITS.batchNo} className="h-11 rounded-xl" value={batchNo} onChange={(e) => setBatchNo(e.target.value)} /></Field>
        <Field id="rcv-expiry" label="Expiry date *"><Input id="rcv-expiry" type="date" className="h-11 rounded-xl" value={expiry} onChange={(e) => setExpiry(e.target.value)} /></Field>
        <Field id="rcv-qty" label="Quantity *"><Input id="rcv-qty" inputMode="numeric" className="h-11 rounded-xl tabular-nums" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></Field>
        <Field id="rcv-rate" label={`Purchase rate (${moneySymbol()}) *`}><Input id="rcv-rate" inputMode="decimal" className="h-11 rounded-xl tabular-nums" value={rate} onChange={(e) => setRate(e.target.value)} /></Field>
        <Field id="rcv-supplier" label="Supplier"><Input id="rcv-supplier" maxLength={PM_LIMITS.supplier} className="h-11 rounded-xl" value={supplier} onChange={(e) => setSupplier(e.target.value)} /></Field>
        <Field id="rcv-date" label="Received on" hint="Today, if left empty."><Input id="rcv-date" type="date" className="h-11 rounded-xl" value={received} onChange={(e) => setReceived(e.target.value)} /></Field>
      </div>
    </BillingActionDialog>
  )
}

/** Write off damaged or expired stock, or correct a count after a stock-take (PH3). Both need a reason and are recorded as stock movements. */
export function BatchActionDialog({ batch, mode, onClose, onDone }: { batch: PmBatch; mode: "write_off" | "adjust"; onClose: () => void; onDone: (saved: PmBatchReceipt | null) => void }) {
  const [quantity, setQuantity] = React.useState("")
  const [reason, setReason] = React.useState("")
  const off = mode === "write_off"
  const parsed = off ? wholeQuantity(quantity) : (/^[+-]?\d{1,7}$/.test(quantity.trim()) ? Number(quantity.trim()) : null)
  return (
    <BillingActionDialog
      title={off ? `Write off from ${batch.batchNo}` : `Adjust ${batch.batchNo}`} destructive={off} confirmLabel={off ? "Write off" : "Save adjustment"} pendingLabel="Saving…"
      canConfirm={quantity.trim() !== "" && reason.trim().length >= PM_LIMITS.reason.min} onClose={onClose} onDone={onDone}
      description={off ? `Remove damaged or expired units from this batch (${batch.quantityRemaining} remaining as the server counts them).` : "A stock-take correction: type a plus or a minus. The change is recorded with your reason."}
      onConfirm={() => (off ? pharmacyApiService.writeOff(batch.id, { quantity: parsed ?? Number.NaN, reason }) : pharmacyApiService.adjust(batch.id, { quantity: parsed ?? Number.NaN, reason }))}
    >
      <Field id="batch-qty" label={off ? "Quantity to write off *" : "Quantity (+ or −) *"}><Input id="batch-qty" inputMode="numeric" className="h-11 rounded-xl tabular-nums" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></Field>
      <Field id="batch-reason" label="Reason *" hint={`${PM_LIMITS.reason.min} to ${PM_LIMITS.reason.max} characters. Kept on file.`}><Textarea id="batch-reason" maxLength={PM_LIMITS.reason.max} rows={2} className="rounded-xl" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
    </BillingActionDialog>
  )
}

/** The stock card (PH4): every stock movement of one medicine, newest first, server-paged. */
function StockCard({ medicineId }: { medicineId: string }) {
  const { settings } = useHospital()
  const [page, setPage] = React.useState(1)
  const [type, setType] = React.useState<PmMovementType | "any">("any")
  const options = { medicineId, page, pageSize: 10, type: type === "any" ? undefined : type }
  const key = useScopedKey("pharmacyApi", "movements", { ...options, type: options.type ?? null })
  const q = useQuery({ queryKey: key, queryFn: ({ signal }) => pharmacyApiService.movements(options, signal), ...CACHE_CLASSES.register, placeholderData: keepPreviousData })
  return (
    <div className="space-y-3" data-testid="stock-card">
      <Select value={type} onValueChange={(v) => { setType(v as PmMovementType | "any"); setPage(1) }}>
        <SelectTrigger aria-label="Movement type" className="h-9 w-48 rounded-lg"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="any">All movements</SelectItem>{PM_MOVEMENT_TYPES.map((t) => <SelectItem key={t} value={t}>{PM_MOVEMENT_LABEL[t]}</SelectItem>)}</SelectContent>
      </Select>
      {q.isError && !q.data ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : q.isPending ? <Skeleton className="h-24 w-full rounded-xl" role="status" aria-label="Loading the stock card" /> : q.data.items.length === 0 ? <p className="text-sm text-slate-500">No stock movements yet.</p> : (
        <>
          <Table>
            <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Type</TableHead><TableHead className="text-right">Qty</TableHead><TableHead>Batch</TableHead><TableHead>By</TableHead><TableHead>Why</TableHead></TableRow></TableHeader>
            <TableBody>
              {q.data.items.map((m) => (
                <TableRow key={m.id} data-testid={`movement-${m.id}`}>
                  <TableCell className="text-xs">{settings?.timezone ? formatInstant(m.occurredAt, settings.timezone) : m.occurredAt}</TableCell>
                  <TableCell className="text-xs font-bold">{PM_MOVEMENT_LABEL[m.type]}</TableCell>
                  <TableCell className="text-right tabular-nums">{m.quantity > 0 ? `+${m.quantity}` : m.quantity}</TableCell>
                  <TableCell className="font-mono text-xs">{m.batch.batchNo}</TableCell>
                  <TableCell className="text-xs">{m.by.name}</TableCell>
                  <TableCell className="text-xs text-slate-500">{m.dispense ? m.dispense.dispenseNo : m.reason ?? ""}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination page={page} pageSize={10} total={q.data.total} onPageChange={setPage} itemLabel="movements" />
        </>
      )}
    </div>
  )
}

/**
 * One medicine with its batches (PH1) and its stock card (PH4). The summary (on hand, expired, nearest expiry, level, value) is the server's; the batches are listed as sent. With
 * pharmacy.stock each batch can be written off or adjusted.
 */
export function MedicineDetailDialog({ id, onClose, onBatchAction }: { id: string; onClose: () => void; onBatchAction: (batch: PmBatch, mode: "write_off" | "adjust") => void }) {
  const { can } = useAccess()
  const key = useScopedKey("pharmacyApi", "detail", id)
  const q = useQuery({ queryKey: key, queryFn: ({ signal }) => pharmacyApiService.getMedicine(id, signal), ...CACHE_CLASSES.record })
  const [view, setView] = React.useState<"batches" | "card">("batches")
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl" data-testid="medicine-dialog">
        <DialogHeader><DialogTitle>{q.data ? q.data.name : "Medicine"}</DialogTitle></DialogHeader>
        {q.isPending ? <Skeleton className="h-40 w-full rounded-xl" role="status" aria-label="Loading the medicine" /> : q.isError ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="medicine-summary">
              <div className="rounded-xl bg-slate-50 px-3 py-2"><div className="text-[11px] font-bold uppercase text-slate-500">On hand</div><div className="text-lg font-black tabular-nums" data-testid="sum-onhand">{q.data.stock.onHand}</div></div>
              <div className="rounded-xl bg-slate-50 px-3 py-2"><div className="text-[11px] font-bold uppercase text-slate-500">Expired</div><div className="text-lg font-black tabular-nums" data-testid="sum-expired">{q.data.stock.expired}</div></div>
              <div className="rounded-xl bg-slate-50 px-3 py-2"><div className="text-[11px] font-bold uppercase text-slate-500">Nearest expiry</div><div className="text-sm font-bold" data-testid="sum-nearest">{q.data.stock.nearestExpiry ?? "—"}</div></div>
              <div className="rounded-xl bg-slate-50 px-3 py-2"><div className="text-[11px] font-bold uppercase text-slate-500">Stock value</div><div className="text-sm font-bold tabular-nums" data-testid="sum-value">{showMoney(q.data.stock.saleValue)}</div></div>
            </div>
            <div className="flex gap-2" role="tablist" aria-label="Medicine view">
              {(["batches", "card"] as const).map((v) => <Button key={v} role="tab" aria-selected={view === v} variant={view === v ? "default" : "outline"} className="h-9 rounded-lg px-4 text-xs font-bold" onClick={() => setView(v)}>{v === "batches" ? "Batches" : "Stock card"}</Button>)}
            </div>
            {view === "card" ? <StockCard medicineId={id} /> : q.data.batches.length === 0 ? <p className="text-sm text-slate-500" data-testid="no-batches">No stock has been received yet.</p> : (
              <Table data-testid="batches">
                <TableHeader><TableRow><TableHead>Batch</TableHead><TableHead>Expiry</TableHead><TableHead className="text-right">Received</TableHead><TableHead className="text-right">Remaining</TableHead><TableHead className="text-right">Cost</TableHead><TableHead>Supplier</TableHead><TableHead /></TableRow></TableHeader>
                <TableBody>
                  {q.data.batches.map((b) => (
                    <TableRow key={b.id} data-testid={`batch-${b.id}`} data-expired={b.expired ? "true" : undefined} className={b.expired ? "bg-red-50" : undefined}>
                      <TableCell className="font-mono text-xs font-bold">{b.batchNo}</TableCell>
                      <TableCell className="text-xs">{b.expiryDate}{b.expired && <span className="ml-1 rounded bg-red-600 px-1 text-[10px] font-black uppercase text-white">Expired</span>}</TableCell>
                      <TableCell className="text-right tabular-nums">{b.quantityReceived}</TableCell>
                      <TableCell className="text-right font-bold tabular-nums">{b.quantityRemaining}</TableCell>
                      <TableCell className="text-right tabular-nums">{showMoney(b.purchaseRate)}</TableCell>
                      <TableCell className="text-xs">{b.supplier ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        {can("pharmacy.stock") && (
                          <div className="flex justify-end gap-1">
                            <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs font-bold" aria-label={`Write off ${b.batchNo}`} onClick={() => onBatchAction(b, "write_off")}>Write off</Button>
                            <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs font-bold" aria-label={`Adjust ${b.batchNo}`} onClick={() => onBatchAction(b, "adjust")}>Adjust</Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
