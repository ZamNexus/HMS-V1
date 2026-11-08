"use client"
import * as React from "react"
import { useQuery } from "@tanstack/react-query"

import { BillingActionDialog } from "@/components/billing/BillingActionDialog"
import { PrintButtons } from "@/components/print/PrintButtons"
import { showMoney } from "@/components/billing/billingUi"
import { ErrorState } from "@/components/shared/ErrorState"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { useScopedKey } from "@/lib/query/useScopedKey"
import { PM_LIMITS, PM_PAY_MODES, pharmacyApiService, type PmDispense, type PmDispenseLine, type PmPayMode, type PmSlip } from "@/lib/services"
import { formatInstant } from "@/lib/session/hospital"
import { useHospital } from "@/lib/session/useHospital"
import { returnable, wholeQuantity } from "./pmUi"

const MODE_LABEL: Record<PmPayMode, string> = { cash: "Cash", card: "Card", bank_transfer: "Bank transfer" }

/** The slip to hand over: each line's batches (batch no., expiry) as the server picked them (first-expire-first-out), the total and what was received. */
export function SlipView({ slip, timezone }: { slip: PmSlip; timezone?: string }) {
  return (
    <div id="pm-print" className="print-root space-y-3 text-sm" data-testid="dispense-slip">
      <div className="text-center">
        <div className="text-lg font-black">{slip.hospital.name}</div>
        {slip.hospital.address && <div className="text-xs text-slate-500">{slip.hospital.address}{slip.hospital.phone ? ` · ${slip.hospital.phone}` : ""}</div>}
        {slip.hospital.printHeader && <div className="text-xs text-slate-500">{slip.hospital.printHeader}</div>}
      </div>
      <div className="grid grid-cols-2 gap-2 border-y border-slate-200 py-3 text-xs">
        <div><span className="text-slate-500">Slip </span><span className="font-mono font-bold" data-testid="slip-no">{slip.dispenseNo}</span></div>
        <div><span className="text-slate-500">Date </span>{timezone ? formatInstant(slip.dispensedAt, timezone) : slip.dispensedAt}</div>
        <div><span className="text-slate-500">For </span><span className="font-bold" data-testid="slip-customer">{slip.customer}</span>{slip.mrNo ? ` · ${slip.mrNo}` : ""}</div>
        <div><span className="text-slate-500">Dispensed by </span>{slip.dispensedBy}</div>
        {slip.doctor && <div className="col-span-2"><span className="text-slate-500">Doctor </span>{slip.doctor}{slip.encounterNo ? ` · ${slip.encounterNo}` : ""}</div>}
      </div>
      <table className="w-full text-xs">
        <thead><tr className="border-b text-left text-slate-500"><th className="py-1">Medicine</th><th className="text-right">Qty</th><th className="text-right">Amount</th></tr></thead>
        <tbody>
          {slip.lines.map((l, i) => (
            <tr key={i} className="border-b border-slate-100 align-top" data-testid={`slip-line-${i}`}>
              <td className="py-1.5"><div className="font-semibold">{l.name}</div>
                {l.instructions && <div className="text-slate-500">{l.instructions}</div>}
                <div className="text-[11px] text-slate-500">{l.batches.map((b) => `Batch ${b.batchNo}, exp ${b.expiryDate}`).join("; ")}</div></td>
              <td className="py-1.5 text-right tabular-nums">{l.quantity}</td>
              <td className="py-1.5 text-right tabular-nums">{showMoney(l.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex justify-between text-sm font-bold"><span>Total</span><span className="tabular-nums" data-testid="slip-total">{showMoney(slip.total)}</span></div>
      <div className="flex justify-between text-xs"><span className="text-slate-500">Received</span><span className="tabular-nums" data-testid="slip-received">{showMoney(slip.received)}</span></div>
      {slip.remarks && <p className="text-xs text-slate-500">{slip.remarks}</p>}
    </div>
  )
}

/** The slip, read fresh every time it is opened (a print is never cached) and printed alone. */
export function SlipDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const { settings } = useHospital()
  const key = useScopedKey("pharmacyApi", "slip", id)
  const q = useQuery({ queryKey: key, queryFn: ({ signal }) => pharmacyApiService.slip(id, signal), staleTime: 0, gcTime: 0 })
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg" data-testid="slip-dialog">
        <DialogHeader><DialogTitle>Dispense slip</DialogTitle></DialogHeader>
        {q.isPending ? <Skeleton className="h-48 w-full rounded-2xl" role="status" aria-label="Loading the slip" /> : q.isError ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : (
          <>
            <SlipView slip={q.data} timezone={settings?.timezone} />
            <PrintButtons papers={["a4", "thermal"]} onClose={onClose} />
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

/**
 * Return part of a dispensed line (PH8, pharmacy.dispense): a quantity up to what was dispensed and not yet returned, a reason, and whether the units go back on the shelf. The server re-charges
 * what is kept: money already paid becomes credit, and a counter customer is refunded at once (so the mode is asked only for a counter sale). One request.
 */
export function ReturnDialog({ dispense, line, onClose, onDone }: { dispense: PmDispense; line: PmDispenseLine; onClose: () => void; onDone: (saved: PmDispense | null) => void }) {
  const max = returnable(line)
  const counter = dispense.patient === null
  const [quantity, setQuantity] = React.useState(String(max))
  const [reason, setReason] = React.useState("")
  const [restock, setRestock] = React.useState(true)
  const [mode, setMode] = React.useState<PmPayMode>("cash")
  const q = wholeQuantity(quantity)
  return (
    <BillingActionDialog
      title={`Return ${line.name}`} confirmLabel="Record return" pendingLabel="Saving…" destructive canConfirm={q !== null && q > 0 && q <= max && reason.trim().length >= PM_LIMITS.reason.min} onClose={onClose} onDone={onDone}
      description={`${line.dispensed} dispensed, ${line.returned} already returned: up to ${max} can still come back. ${counter ? "The customer is refunded at once." : "Money already paid becomes credit for the patient."}`}
      onConfirm={() => pharmacyApiService.returnLine(dispense.id, line.id, { quantity: q ?? Number.NaN, reason, restock, refundMode: counter ? mode : undefined })}
    >
      <div className="space-y-1.5"><Label htmlFor="ret-qty" className="text-xs font-bold uppercase tracking-wider text-slate-500">Quantity *</Label><Input id="ret-qty" inputMode="numeric" className="h-11 rounded-xl tabular-nums" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></div>
      <div className="space-y-1.5"><Label htmlFor="ret-reason" className="text-xs font-bold uppercase tracking-wider text-slate-500">Reason *</Label><Textarea id="ret-reason" maxLength={PM_LIMITS.reason.max} rows={2} className="rounded-xl" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
      <div className="flex items-start gap-2"><Checkbox id="ret-restock" checked={restock} onCheckedChange={(v) => setRestock(v === true)} /><Label htmlFor="ret-restock" className="text-sm font-medium leading-snug">Put the units back on the shelf (restock). Leave it off for damaged or expired units.</Label></div>
      {counter && (
        <div className="space-y-1.5"><Label htmlFor="ret-mode" className="text-xs font-bold uppercase tracking-wider text-slate-500">Refund by</Label>
          <Select value={mode} onValueChange={(v) => setMode(v as PmPayMode)}><SelectTrigger id="ret-mode" aria-label="Refund mode" className="h-11 rounded-xl"><SelectValue /></SelectTrigger><SelectContent>{PM_PAY_MODES.map((m) => <SelectItem key={m} value={m}>{MODE_LABEL[m]}</SelectItem>)}</SelectContent></Select></div>
      )}
    </BillingActionDialog>
  )
}
