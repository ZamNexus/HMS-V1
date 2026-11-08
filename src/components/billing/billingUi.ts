import { formatMoneyString, type ChargePayer, type ChargeSourceType, type InvoiceStatus, type ReceiptMode, type ReceiptPayer, type ReceiptType } from "@/lib/services"

// Pure helpers for the billing screens (unit-tested). Amounts are the decimal strings the server sent: this file only DISPLAYS them. It never adds,
// compares or rounds an amount (handoff 8.6: paid, partial, unpaid and every balance are derived on the server).

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = { unpaid: "Unpaid", partial: "Partial", paid: "Paid", voided: "Voided" }
export const SOURCE_LABEL: Record<ChargeSourceType, string> = { consultation: "Consultation", service: "Service", diagnostic: "Lab / imaging", pharmacy: "Pharmacy", room: "Room" }
export const PAYER_LABEL: Record<ChargePayer, string> = { patient: "Patient", panel: "Panel", counter: "Counter sale" }

/** The hub's two invoice tabs are the invoice's charge source (handoff 8.6: `sourceType=consultation` / `service`). */
export const HUB_SOURCE: Record<"consultations" | "services", "consultation" | "service"> = { consultations: "consultation", services: "service" }

/** "Rs. 1,500" for a 2-decimal money string; anything the formatter cannot show exactly (more decimals) is shown as sent, never rounded. */
export function showMoney(value: string): string {
  try {
    return formatMoneyString(value)
  } catch {
    return `Rs. ${value}`
  }
}

/** A counter sale (a pharmacy walk-in) has no patient: its customer name is shown wherever a patient name would be (handoff 8.6). */
export function isCounterSale(inv: { patient: unknown | null }): boolean {
  return inv.patient === null
}
export function partyName(inv: { patient: { name: string } | null; counterCustomer: string | null }): string {
  return inv.patient ? inv.patient.name : inv.counterCustomer?.trim() || "Counter sale"
}

export const MODE_LABEL: Record<ReceiptMode, string> = { cash: "Cash", card: "Card", bank_transfer: "Bank transfer", cheque: "Cheque", insurance: "Insurance", on_account: "On account" }
export const RECEIPT_TYPE_LABEL: Record<ReceiptType, string> = { payment: "Payment receipt", advance: "Advance receipt", refund: "Refund", credit_note: "Credit note" }

export function payerLabel(p: ReceiptPayer): string {
  if (p.kind === "patient") return `${p.name} (${p.mrNo})`
  if (p.kind === "panel") return `${p.name} (panel)`
  return `${p.name} (counter sale)`
}

type Can = (permission: string) => boolean
export type InvoiceActionKey = "add_services" | "pay" | "discount" | "credit_note" | "void"
/** A button on an invoice: shown to a user who has the permission; OFF with the reason while the invoice's state forbids it (handoff 5). */
export interface BillingActionState {
  action: InvoiceActionKey
  enabled: boolean
  reason: string | null
}
export const INVOICE_ACTION_LABEL: Record<InvoiceActionKey, string> = { add_services: "Add services", pay: "Take payment", discount: "Discount", credit_note: "Credit note", void: "Void invoice" }

/**
 * The money actions on an invoice. A counter sale (no patient) has NONE (COUNTER_SALE). Charging needs billing.charge, taking money billing.collect_payment,
 * a discount, a credit note or a void billing.write. A voided invoice allows nothing; it cannot be voided while its visit is under way (handoff 8.6).
 */
export function invoiceActionStates(inv: { status: InvoiceStatus; patient: unknown | null; encounter: { status: string | null } | null }, can: Can): BillingActionState[] {
  if (inv.patient === null) return []
  const voided = inv.status === "voided"
  const visitOpen = inv.encounter?.status === "open"
  const VOIDED = "This invoice is voided."
  const out: BillingActionState[] = []
  const add = (action: InvoiceActionKey, allowed: boolean, enabled: boolean, reason: string) => { if (allowed) out.push({ action, enabled, reason: enabled ? null : reason }) }
  add("add_services", can("billing.charge"), !voided, VOIDED)
  add("pay", can("billing.collect_payment"), !voided, VOIDED)
  add("discount", can("billing.write"), !voided, VOIDED)
  add("credit_note", can("billing.write"), !voided, VOIDED)
  add("void", can("billing.write"), !voided && !visitOpen, voided ? VOIDED : "An invoice cannot be voided while the visit is under way.")
  return out
}

/** The Void button on one charge, or null when the user may not (or there is nothing to void). Lab, imaging and medicine charges are changed at their source. */
export function chargeVoidState(
  inv: { status: InvoiceStatus; patient: unknown | null },
  charge: { sourceType: ChargeSourceType; voided: boolean },
  can: Can,
): { enabled: boolean; reason: string | null } | null {
  if (inv.patient === null || charge.voided || !can("billing.write")) return null
  if (inv.status === "voided") return { enabled: false, reason: "This invoice is voided." }
  if (charge.sourceType === "diagnostic" || charge.sourceType === "pharmacy") return { enabled: false, reason: "This charge is changed where it came from: cancel the test or return the medicine." }
  return { enabled: true, reason: null }
}
