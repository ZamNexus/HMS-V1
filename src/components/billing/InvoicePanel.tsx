"use client"
import Link from "next/link"

import { StatusBadge } from "@/components/shared/StatusBadge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type * as React from "react"
import type { InvoiceCharge, InvoiceDetail } from "@/lib/services"
import { formatInstant } from "@/lib/session/hospital"
import { cn } from "@/lib/utils"
import { INVOICE_STATUS_LABEL, PAYER_LABEL, SOURCE_LABEL, isCounterSale, partyName, showMoney } from "./billingUi"

function Figure({ label, value, strong, testId }: { label: string; value: string; strong?: boolean; testId?: string }) {
  return (
    <div className={cn("rounded-xl px-4 py-3", strong ? "bg-[#0F2A4D] text-white" : "bg-slate-50")}>
      <div className={cn("text-[11px] font-bold uppercase tracking-wider", strong ? "text-teal-100" : "text-slate-500")}>{label}</div>
      <div className="mt-1 text-lg font-black tabular-nums" data-testid={testId}>{showMoney(value)}</div>
    </div>
  )
}

/**
 * One invoice with its charges (B1 the visit's bill, B2 an invoice from the hub). It only SHOWS what the server sent: every figure is the server's string,
 * nothing is added up here, and a voided charge keeps its row (struck through, with the reason) so the bill still reads as it was.
 */
export function InvoicePanel({ invoice, timezone, showVisitLink = true, chargeAction }: { invoice: InvoiceDetail; timezone?: string; showVisitLink?: boolean; chargeAction?: (charge: InvoiceCharge) => React.ReactNode }) {
  const t = invoice.totals
  const when = (iso: string) => (timezone ? formatInstant(iso, timezone) : iso)
  return (
    <div className="space-y-5" data-testid="invoice-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h3 className="text-xl font-black text-[#0D1B2E]" data-testid="invoice-no">{invoice.invoiceNo}</h3>
            <StatusBadge status={INVOICE_STATUS_LABEL[invoice.status]} />
          </div>
          <p className="mt-1 text-sm font-medium text-slate-500">
            <span data-testid="invoice-party">{partyName(invoice)}</span>
            {invoice.patient && <> · {invoice.patient.mrNo}</>}
            {isCounterSale(invoice) && <> · counter sale</>} · issued {when(invoice.issuedAt)}
            {showVisitLink && invoice.encounter && <> · <Link className="font-bold text-[#0891B2] hover:underline" href={`/encounters/${invoice.encounter.id}`}>{invoice.encounter.encId}</Link></>}
          </p>
        </div>
      </div>

      {invoice.status === "voided" && (
        <div role="status" data-testid="invoice-voided" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
          This invoice was voided{invoice.voidedAt ? ` on ${when(invoice.voidedAt)}` : ""}{invoice.voidedReason ? `: ${invoice.voidedReason}` : "."}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="invoice-totals">
        <Figure label="Gross" value={t.gross} testId="total-gross" />
        <Figure label="Discount" value={t.discount} testId="total-discount" />
        <Figure label="Net" value={t.net} testId="total-net" />
        <Figure label="GST" value={t.gst} testId="total-gst" />
        <Figure label="Total" value={t.total} testId="total-total" />
        <Figure label="Received" value={t.received} testId="total-received" />
        <Figure label="Balance" value={t.balance} strong testId="total-balance" />
        <div className="grid grid-cols-2 gap-2">
          <Figure label="Patient owes" value={t.patientBalance} testId="total-patient" />
          <Figure label="Panel owes" value={t.panelBalance} testId="total-panel" />
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl ring-1 ring-black/5" data-testid="invoice-charges">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50/60 hover:bg-slate-50/60">
              <TableHead className="px-4">Charge</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Rate</TableHead>
              <TableHead className="text-right">Discount</TableHead>
              <TableHead className="text-right">GST</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Received</TableHead>
              <TableHead className="text-right">Outstanding</TableHead>
              <TableHead className="pr-4">Paid by</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoice.charges.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="py-8 text-center text-sm text-slate-500">No charges on this invoice.</TableCell></TableRow>
            ) : invoice.charges.map((c) => (
              <TableRow key={c.id} data-testid={`charge-${c.id}`} data-voided={c.voided ? "true" : undefined} className={cn(c.voided && "bg-slate-50/70 text-slate-400")}>
                <TableCell className="px-4">
                  <div className={cn("font-semibold", c.voided && "line-through")}>{c.description}</div>
                  <div className="text-xs text-slate-500">
                    {SOURCE_LABEL[c.sourceType]}{c.serviceDate ? ` · ${c.serviceDate}` : ""}
                    {c.voided && <span className="ml-1 font-bold text-red-700" data-testid={`charge-voided-${c.id}`}>· voided{c.voidedReason ? `: ${c.voidedReason}` : ""}</span>}
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">{c.qty}</TableCell>
                <TableCell className="text-right tabular-nums">{showMoney(c.rate)}</TableCell>
                <TableCell className="text-right tabular-nums">{showMoney(c.discountAmount)}{c.discountPct !== "0" && c.discountPct !== "0.00" ? <span className="block text-xs text-slate-500">{c.discountPct}%</span> : null}</TableCell>
                <TableCell className="text-right tabular-nums">{showMoney(c.gstAmount)}</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{showMoney(c.totalAmount)}</TableCell>
                <TableCell className="text-right tabular-nums">{showMoney(c.received)}</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{showMoney(c.outstanding)}</TableCell>
                <TableCell className="pr-4 text-sm">{c.payer === "panel" && c.panel ? `Panel: ${c.panel.name}` : PAYER_LABEL[c.payer]}{chargeAction ? <div>{chargeAction(c)}</div> : null}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
