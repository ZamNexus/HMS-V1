"use client"
import { PrintButtons } from "@/components/print/PrintButtons"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import type { Receipt } from "@/lib/services"
import { formatInstant } from "@/lib/session/hospital"
import { useHospital } from "@/lib/session/useHospital"
import { MODE_LABEL, RECEIPT_TYPE_LABEL, payerLabel, showMoney } from "./billingUi"


/**
 * A receipt (B4): the answer to a payment, an advance, a refund or a credit note, and what GET /payments/{id} returns for a reprint. It shows the SERVER's
 * figures only: what was received, what it settled charge by charge, what was kept as credit and the payer's account afterwards.
 */
export function ReceiptView({ receipt }: { receipt: Receipt }) {
  const { settings } = useHospital()
  const when = settings?.timezone ? formatInstant(receipt.receivedAt, settings.timezone) : receipt.receivedAt
  const h = receipt.hospital
  return (
    <div id="receipt-print" className="print-root space-y-4 text-sm" data-testid="receipt">
      <div className="text-center">
        <div className="text-lg font-black">{h.name}</div>
        {h.nameUr && <div className="text-base">{h.nameUr}</div>}
        {h.address && <div className="text-xs text-slate-500">{h.address}{h.phone ? ` · ${h.phone}` : ""}</div>}
        {h.printHeader && <div className="text-xs text-slate-500">{h.printHeader}</div>}
      </div>
      <div className="flex items-start justify-between gap-3 border-y border-slate-200 py-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{RECEIPT_TYPE_LABEL[receipt.type]}</div>
          <div className="font-mono text-base font-black" data-testid="receipt-no">{receipt.receiptNo}</div>
          <div className="text-xs text-slate-500">{when} · received by {receipt.receivedBy.name}</div>
        </div>
        <div className="text-right">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Amount</div>
          <div className="text-xl font-black tabular-nums" data-testid="receipt-amount">{showMoney(receipt.amount)}</div>
          <div className="text-xs text-slate-500">{receipt.mode ? MODE_LABEL[receipt.mode] : "No money moved"}</div>
        </div>
      </div>
      <div>
        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{receipt.type === "refund" ? "Refunded to" : "Received from"}</div>
        <div className="font-semibold" data-testid="receipt-payer">{payerLabel(receipt.payer)}</div>
        {receipt.invoice && <div className="text-xs text-slate-500">Invoice {receipt.invoice.invoiceNo}</div>}
        {receipt.reference && <div className="text-xs text-slate-500">Reference: {receipt.reference}</div>}
        {receipt.notes && <div className="text-xs text-slate-500">{receipt.notes}</div>}
      </div>
      {receipt.settled.length > 0 && (
        <table className="w-full text-xs" data-testid="receipt-settled">
          <thead><tr className="border-b text-left text-slate-500"><th className="py-1">Settled</th><th className="py-1">Invoice</th><th className="py-1 text-right">Amount</th></tr></thead>
          <tbody>{receipt.settled.map((s) => <tr key={s.chargeId} className="border-b border-slate-100"><td className="py-1">{s.description}</td><td className="py-1 font-mono">{s.invoiceNo}</td><td className="py-1 text-right tabular-nums">{showMoney(s.amount)}</td></tr>)}</tbody>
        </table>
      )}
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="rounded-lg bg-slate-50 px-3 py-2"><div className="text-slate-500">Kept as credit</div><div className="font-bold tabular-nums" data-testid="receipt-kept">{showMoney(receipt.keptAsCredit)}</div></div>
        <div className="rounded-lg bg-slate-50 px-3 py-2"><div className="text-slate-500">Still owed</div><div className="font-bold tabular-nums" data-testid="receipt-outstanding">{showMoney(receipt.account.outstanding)}</div></div>
        <div className="rounded-lg bg-slate-50 px-3 py-2"><div className="text-slate-500">Credit held</div><div className="font-bold tabular-nums" data-testid="receipt-credit">{showMoney(receipt.account.credit)}</div></div>
      </div>
    </div>
  )
}

export function ReceiptDialog({ receipt, onClose }: { receipt: Receipt; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg" data-testid="receipt-dialog">
        <DialogHeader><DialogTitle>Receipt</DialogTitle></DialogHeader>
        <ReceiptView receipt={receipt} />
        <PrintButtons papers={["a4", "thermal"]} onClose={onClose} />
      </DialogContent>
    </Dialog>
  )
}
