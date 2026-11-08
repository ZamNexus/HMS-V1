"use client"
import * as React from "react"

import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/use-toast"
import { billingService, RECEIPT_MODES, type AppliedCredit, type InvoiceDetail, type Receipt, type ReceiptMode, moneySymbol } from "@/lib/services"
import { BillingActionDialog } from "./BillingActionDialog"
import { MODE_LABEL, showMoney } from "./billingUi"

// The money dialogs of Phase 8 (B4 to B7). What a user types is sent as the text it is; the SERVER decides whether it is too much, what it settles and what
// is left (handoff 8.6: never compute a balance in the browser). Each dialog makes one request.

const REASON_MIN = 3
const REASON_MAX = 500

export function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</Label>
      {children}
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  )
}
function ModeSelect({ id, value, onChange }: { id: string; value: ReceiptMode; onChange: (m: ReceiptMode) => void }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as ReceiptMode)}>
      <SelectTrigger id={id} aria-label="Payment mode" className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
      <SelectContent>{RECEIPT_MODES.map((m) => <SelectItem key={m} value={m}>{MODE_LABEL[m]}</SelectItem>)}</SelectContent>
    </Select>
  )
}
const amountInput = (id: string, value: string, set: (v: string) => void) => (
  <Input id={id} inputMode="decimal" autoComplete="off" placeholder="0.00" className="h-11 rounded-xl text-lg font-bold tabular-nums" value={value} onChange={(e) => set(e.target.value)} />
)

type Payer = { kind: "patient" | "panel"; id: string; name: string }

/** B4: take a payment. For a patient (against an invoice or in general) or for a panel. The response is the receipt. */
export function PaymentDialog({ payer, invoice, defaultAmount = "", onClose, onDone }: {
  payer: Payer
  invoice?: { id: string; invoiceNo: string }
  /** The server's own figure for what is owed, offered as the starting amount. */
  defaultAmount?: string
  onClose: () => void
  onDone: (receipt: Receipt | null) => void
}) {
  const [amount, setAmount] = React.useState(defaultAmount)
  const [mode, setMode] = React.useState<ReceiptMode>("cash")
  const [reference, setReference] = React.useState("")
  const [notes, setNotes] = React.useState("")
  const [excess, setExcess] = React.useState(false)
  return (
    <BillingActionDialog
      title="Take payment" confirmLabel="Record payment" pendingLabel="Recording…" canConfirm={amount.trim() !== ""} onClose={onClose} onDone={onDone}
      description={`${payer.kind === "panel" ? "From the panel" : "From"} ${payer.name}${invoice ? `, against invoice ${invoice.invoiceNo}` : ""}. The receipt is issued by the server.`}
      onConfirm={() => billingService.recordPayment({
        ...(payer.kind === "panel" ? { panelId: payer.id } : { patientId: payer.id }), invoiceId: invoice?.id, amount, mode, reference, notes, excessAsAdvance: excess,
      })}
    >
      <Field id="pay-amount" label={`Amount received (${moneySymbol()})`}>{amountInput("pay-amount", amount, setAmount)}</Field>
      <Field id="pay-mode" label="Mode"><ModeSelect id="pay-mode" value={mode} onChange={setMode} /></Field>
      <Field id="pay-reference" label="Reference (cheque or card slip number)"><Input id="pay-reference" maxLength={100} className="h-11 rounded-xl" value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
      <Field id="pay-notes" label="Notes"><Textarea id="pay-notes" maxLength={500} rows={2} className="rounded-xl" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      <div className="flex items-start gap-2">
        <Checkbox id="pay-excess" checked={excess} onCheckedChange={(v) => setExcess(v === true)} />
        <Label htmlFor="pay-excess" className="text-sm font-medium leading-snug">Keep any excess as an advance. Without this, paying more than is owed is refused.</Label>
      </div>
    </BillingActionDialog>
  )
}

/** B5: take an advance, held as credit for the patient. The response is the receipt. */
export function AdvanceDialog({ patient, onClose, onDone }: { patient: { id: string; name: string }; onClose: () => void; onDone: (receipt: Receipt | null) => void }) {
  const [amount, setAmount] = React.useState("")
  const [mode, setMode] = React.useState<ReceiptMode>("cash")
  const [reference, setReference] = React.useState("")
  const [notes, setNotes] = React.useState("")
  return (
    <BillingActionDialog
      title="Take advance" confirmLabel="Record advance" pendingLabel="Recording…" canConfirm={amount.trim() !== ""} onClose={onClose} onDone={onDone}
      description={`Held as credit for ${patient.name}. It can be applied to what they owe later.`}
      onConfirm={() => billingService.recordAdvance({ patientId: patient.id, amount, mode, reference, notes })}
    >
      <Field id="adv-amount" label={`Amount (${moneySymbol()})`}>{amountInput("adv-amount", amount, setAmount)}</Field>
      <Field id="adv-mode" label="Mode"><ModeSelect id="adv-mode" value={mode} onChange={setMode} /></Field>
      <Field id="adv-reference" label="Reference"><Input id="adv-reference" maxLength={100} className="h-11 rounded-xl" value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
      <Field id="adv-notes" label="Notes"><Textarea id="adv-notes" maxLength={500} rows={2} className="rounded-xl" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
    </BillingActionDialog>
  )
}

/** B5: apply the patient's credit to what they owe. No money moves, so there is no receipt. */
export function ApplyCreditDialog({ patient, invoice, onClose, onDone }: { patient: { id: string; name: string }; invoice?: { id: string; invoiceNo: string }; onClose: () => void; onDone: (applied: AppliedCredit | null) => void }) {
  const { toast } = useToast()
  const [amount, setAmount] = React.useState("")
  return (
    <BillingActionDialog
      title="Apply credit" confirmLabel="Apply credit" pendingLabel="Applying…" onClose={onClose} onDone={onDone}
      description={`Uses ${patient.name}'s credit against ${invoice ? `invoice ${invoice.invoiceNo}` : "what they owe"}. Leave the amount empty to apply as much as is possible. No money moves, so there is no receipt.`}
      onConfirm={async () => {
        const applied = await billingService.applyCredit(patient.id, { invoiceId: invoice?.id, amount })
        toast({ title: `Applied ${showMoney(applied.applied)}` })
        return applied
      }}
    >
      <Field id="apply-amount" label="Amount to apply (Rs., optional)">{amountInput("apply-amount", amount, setAmount)}</Field>
    </BillingActionDialog>
  )
}

/** B7: refund unused credit to the patient. The response is the receipt. */
export function RefundDialog({ patient, onClose, onDone }: { patient: { id: string; name: string }; onClose: () => void; onDone: (receipt: Receipt | null) => void }) {
  const [amount, setAmount] = React.useState("")
  const [mode, setMode] = React.useState<ReceiptMode>("cash")
  const [reference, setReference] = React.useState("")
  const [reason, setReason] = React.useState("")
  return (
    <BillingActionDialog
      title="Refund credit" destructive confirmLabel="Record refund" pendingLabel="Recording…" canConfirm={amount.trim() !== "" && reason.trim().length >= REASON_MIN} onClose={onClose} onDone={onDone}
      description={`Pays ${patient.name}'s unused credit back. Only unused credit can be refunded; money already used on a bill cannot.`}
      onConfirm={() => billingService.refund({ patientId: patient.id, amount, mode, reference, reason })}
    >
      <Field id="ref-amount" label={`Amount (${moneySymbol()})`}>{amountInput("ref-amount", amount, setAmount)}</Field>
      <Field id="ref-mode" label="Paid back by"><ModeSelect id="ref-mode" value={mode} onChange={setMode} /></Field>
      <Field id="ref-reference" label="Reference"><Input id="ref-reference" maxLength={100} className="h-11 rounded-xl" value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
      <Field id="ref-reason" label="Reason *" hint={`${REASON_MIN} to ${REASON_MAX} characters. Kept on file.`}><Textarea id="ref-reason" maxLength={REASON_MAX} rows={2} className="rounded-xl" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
    </BillingActionDialog>
  )
}

/** B7: a credit note, a concession or write-off against what a patient owes. No money moves; the response is the credit note receipt. */
export function CreditNoteDialog({ patient, invoice, onClose, onDone }: { patient: { id: string; name: string }; invoice?: { id: string; invoiceNo: string }; onClose: () => void; onDone: (receipt: Receipt | null) => void }) {
  const [amount, setAmount] = React.useState("")
  const [reason, setReason] = React.useState("")
  return (
    <BillingActionDialog
      title="Credit note" destructive confirmLabel="Issue credit note" pendingLabel="Issuing…" canConfirm={amount.trim() !== "" && reason.trim().length >= REASON_MIN} onClose={onClose} onDone={onDone}
      description={`A concession or write-off for ${patient.name}${invoice ? ` against invoice ${invoice.invoiceNo}` : ""}. It lowers what they owe; no money moves. It cannot be more than is owed.`}
      onConfirm={() => billingService.creditNote({ patientId: patient.id, invoiceId: invoice?.id, amount, reason })}
    >
      <Field id="cn-amount" label={`Amount (${moneySymbol()})`}>{amountInput("cn-amount", amount, setAmount)}</Field>
      <Field id="cn-reason" label="Reason *" hint={`${REASON_MIN} to ${REASON_MAX} characters. Kept on file.`}><Textarea id="cn-reason" maxLength={REASON_MAX} rows={2} className="rounded-xl" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
    </BillingActionDialog>
  )
}

/** B6: discount a bill, by amount or by percent. "Included in package" is 100%. */
export function DiscountDialog({ invoice, onClose, onDone }: { invoice: Pick<InvoiceDetail, "id" | "invoiceNo">; onClose: () => void; onDone: (saved: InvoiceDetail | null) => void }) {
  const [type, setType] = React.useState<"amount" | "percent">("percent")
  const [value, setValue] = React.useState("")
  const [reason, setReason] = React.useState("")
  return (
    <BillingActionDialog
      title="Discount" confirmLabel="Apply discount" pendingLabel="Applying…" canConfirm={value.trim() !== "" && reason.trim().length >= REASON_MIN} onClose={onClose} onDone={onDone}
      description={`On invoice ${invoice.invoiceNo}. The server works out the new totals; a discount larger than the bill is refused.`}
      onConfirm={() => billingService.discountInvoice(invoice.id, { type, value }, reason)}
    >
      <Field id="disc-type" label="Discount by">
        <Select value={type} onValueChange={(v) => setType(v as "amount" | "percent")}>
          <SelectTrigger id="disc-type" aria-label="Discount by" className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="percent">Percent</SelectItem><SelectItem value="amount">{`Amount (${moneySymbol()})`}</SelectItem></SelectContent>
        </Select>
      </Field>
      <Field id="disc-value" label={type === "percent" ? "Percent (1 to 100)" : `Amount (${moneySymbol()})`}>
        {amountInput("disc-value", value, setValue)}
        <button type="button" className="text-xs font-bold text-[#0891B2] hover:underline" onClick={() => { setType("percent"); setValue("100"); if (reason.trim() === "") setReason("Included in package") }}>Included in package (100%)</button>
      </Field>
      <Field id="disc-reason" label="Reason *" hint={`${REASON_MIN} to ${REASON_MAX} characters. Kept on file.`}><Textarea id="disc-reason" maxLength={REASON_MAX} rows={2} className="rounded-xl" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
    </BillingActionDialog>
  )
}

/** B6: void an invoice, or one charge on it. Nothing is deleted: the voided item stays on file with its reason. */
export function VoidDialog({ target, onClose, onDone }: {
  target: { kind: "invoice"; id: string; label: string } | { kind: "charge"; id: string; label: string }
  onClose: () => void
  onDone: (saved: InvoiceDetail | null) => void
}) {
  const [reason, setReason] = React.useState("")
  const invoice = target.kind === "invoice"
  return (
    <BillingActionDialog
      title={invoice ? "Void invoice" : "Void charge"} destructive confirmLabel={invoice ? "Void invoice" : "Void charge"} pendingLabel="Voiding…" canConfirm={reason.trim().length >= REASON_MIN} onClose={onClose} onDone={onDone}
      description={invoice ? `Void ${target.label}? It stays on file as voided with your reason. It cannot be voided while the visit is under way.` : `Void "${target.label}"? Only possible while no money is on it. It stays on the bill, struck through, with your reason.`}
      onConfirm={() => (invoice ? billingService.voidInvoice(target.id, reason) : billingService.voidCharge(target.id, reason))}
    >
      <Field id="void-reason" label="Reason *" hint={`${REASON_MIN} to ${REASON_MAX} characters. Kept on file.`}><Textarea id="void-reason" maxLength={REASON_MAX} rows={2} className="rounded-xl" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
    </BillingActionDialog>
  )
}
