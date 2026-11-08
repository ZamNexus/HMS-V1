"use client"
import * as React from "react"

import { PaymentDialog } from "@/components/billing/MoneyForms"
import { ReceiptDialog } from "@/components/billing/ReceiptView"
import { Button } from "@/components/ui/button"
import type { Receipt } from "@/lib/services"

/**
 * Take the patient's payment for the medicines just dispensed. A pharmacist holds billing.collect_payment but NOT billing.read (handoff 5, 8.9), so the invoice itself cannot be opened
 * (GET /invoices/{id} needs billing.read); POST /payments needs only billing.collect_payment and answers with the receipt, which is shown here. The server refuses an overpayment and says what is owed.
 */
export function PayBill({ patient, invoice }: { patient: { id: string; name: string }; invoice: { id: string; invoiceNo: string } }) {
  const [paying, setPaying] = React.useState(false)
  const [receipt, setReceipt] = React.useState<Receipt | null>(null)
  return (
    <>
      <Button variant="outline" className="rounded-xl font-bold" data-testid="take-payment" onClick={() => setPaying(true)}>Take payment ({invoice.invoiceNo})</Button>
      {paying && <PaymentDialog payer={{ kind: "patient", id: patient.id, name: patient.name }} invoice={invoice} onClose={() => setPaying(false)} onDone={(r) => { if (r) setReceipt(r) }} />}
      {receipt && <ReceiptDialog receipt={receipt} onClose={() => setReceipt(null)} />}
    </>
  )
}
