"use client"
import * as React from "react"

import { Button } from "@/components/ui/button"
import type { InvoiceDetail, Receipt } from "@/lib/services"
import { useAccess } from "@/lib/session/useAccess"
import { INVOICE_ACTION_LABEL, chargeVoidState, invoiceActionStates, type InvoiceActionKey } from "./billingUi"
import { InvoicePanel } from "./InvoicePanel"
import { ChargeServicesDialog } from "./ChargeServicesDialog"
import { CreditNoteDialog, DiscountDialog, PaymentDialog, VoidDialog } from "./MoneyForms"
import { ReceiptDialog } from "./ReceiptView"

type Open =
  | { kind: InvoiceActionKey }
  | { kind: "void_charge"; id: string; label: string }
  | null

/**
 * An invoice with the money actions the user may take on it (B4 payment, B6 discount and void, B7 credit note). The buttons follow handoff 5: no permission
 * or a counter sale (COUNTER_SALE): not shown; permitted but the invoice's state forbids it (voided, or still under way for a void): shown OFF with the
 * reason. Every action is one request; afterwards the bill, the lists and the accounts are read again by the service, so this view just closes the dialog.
 * "Add services" (B3) charges catalogue services onto this invoice.
 */
export function InvoiceView({ invoice, timezone, showVisitLink = true }: { invoice: InvoiceDetail; timezone?: string; showVisitLink?: boolean }) {
  const { can } = useAccess()
  const [open, setOpen] = React.useState<Open>(null)
  const [receipt, setReceipt] = React.useState<Receipt | null>(null)
  const close = () => setOpen(null)
  const states = invoiceActionStates(invoice, can)
  const patient = invoice.patient
  const ref = { id: invoice.id, invoiceNo: invoice.invoiceNo }
  const voidCharge = (c: InvoiceDetail["charges"][number]) => {
    const s = chargeVoidState(invoice, c, can)
    if (!s) return null
    return (
      <span title={s.reason ?? undefined} className="inline-flex">
        <Button type="button" variant="ghost" size="sm" disabled={!s.enabled} title={s.reason ?? undefined} data-reason={s.reason ?? undefined} aria-label={`Void charge ${c.description}`} className="h-7 rounded-lg px-2 text-xs font-bold text-red-700 hover:bg-red-50" onClick={() => setOpen({ kind: "void_charge", id: c.id, label: c.description })}>Void</Button>
      </span>
    )
  }
  return (
    <div className="space-y-4">
      {states.length > 0 && (
        <div className="flex flex-wrap gap-2" data-testid="invoice-actions">
          {states.map((s) => (
            <span key={s.action} title={s.reason ?? undefined} className="inline-flex">
              <Button type="button" variant="outline" disabled={!s.enabled} title={s.reason ?? undefined} data-reason={s.reason ?? undefined} className="h-10 rounded-xl font-bold" onClick={() => setOpen({ kind: s.action })}>
                {INVOICE_ACTION_LABEL[s.action]}
              </Button>
            </span>
          ))}
        </div>
      )}
      <InvoicePanel invoice={invoice} timezone={timezone} showVisitLink={showVisitLink} chargeAction={voidCharge} />

      {open?.kind === "add_services" && <ChargeServicesDialog invoice={ref} onClose={close} onDone={() => undefined} />}
      {open?.kind === "pay" && patient && <PaymentDialog payer={{ kind: "patient", id: patient.id, name: patient.name }} invoice={ref} defaultAmount={invoice.totals.patientBalance} onClose={close} onDone={(r) => { if (r) setReceipt(r) }} />}
      {open?.kind === "discount" && <DiscountDialog invoice={ref} onClose={close} onDone={() => undefined} />}
      {open?.kind === "credit_note" && patient && <CreditNoteDialog patient={{ id: patient.id, name: patient.name }} invoice={ref} onClose={close} onDone={(r) => { if (r) setReceipt(r) }} />}
      {open?.kind === "void" && <VoidDialog target={{ kind: "invoice", id: invoice.id, label: invoice.invoiceNo }} onClose={close} onDone={() => undefined} />}
      {open?.kind === "void_charge" && <VoidDialog target={{ kind: "charge", id: open.id, label: open.label }} onClose={close} onDone={() => undefined} />}
      {receipt && <ReceiptDialog receipt={receipt} onClose={() => setReceipt(null)} />}
    </div>
  )
}
