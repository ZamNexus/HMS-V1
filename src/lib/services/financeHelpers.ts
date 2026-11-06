import type { MoneyString } from "@/lib/api/types"
import type { PaymentStatus } from "@/types"
import { addMoney, compareMoney, floorAtZero, isZeroMoney, multiplyMoney, percentOfMoney, subMoney, sumMoney } from "./moneyMath"
import type { BankStatementRow, BankTransactionRecord, DiscountType, ExpenseRecord, ExpenseTotals } from "./types"

// Pure helpers for the Billing / Expenses / Bank screens (unit-tested; no React, no data access). They reproduce, with exact
// decimal arithmetic, the demo rules the screens have always used. NONE of them is a documented backend rule: the Task List
// says consultation / services billing is "already covered" but publishes no calculation, rounding, status or balance rule.
// Where the server decides (totals, balance, status, running balance) is CONTRACT REQUIRED — see the handoff document.

export interface InvoiceTotals {
  subtotal: MoneyString
  afterDiscount: MoneyString
  gst: MoneyString
  netTotal: MoneyString
  balance: MoneyString
  status: PaymentStatus
}

/** Flat discount is an amount, percent discount is a percentage of the subtotal; the result never goes below zero. */
export function applyDiscount(subtotal: MoneyString, discountType: DiscountType, discount: string): MoneyString {
  return discountType === "flat" ? floorAtZero(subMoney(subtotal, discount)) : floorAtZero(subMoney(subtotal, percentOfMoney(subtotal, discount)))
}

/** The form's status rule: nothing owing is paid, something received is partial, otherwise unpaid. Demo rule — the backend's is unknown. */
export function paymentStatusFor(balance: MoneyString, amountReceived: MoneyString): PaymentStatus {
  if (isZeroMoney(balance)) return "paid"
  return compareMoney(amountReceived, "0.00") > 0 ? "partial" : "unpaid"
}

export function invoiceTotals(p: { subtotal: MoneyString; discountType: DiscountType; discount: string; gstPct: string; amountReceived: MoneyString }): InvoiceTotals {
  const afterDiscount = applyDiscount(p.subtotal, p.discountType, p.discount)
  const gst = percentOfMoney(afterDiscount, p.gstPct)
  const netTotal = addMoney(afterDiscount, gst)
  const balance = floorAtZero(subMoney(netTotal, p.amountReceived))
  return { subtotal: p.subtotal, afterDiscount, gst, netTotal, balance, status: paymentStatusFor(balance, p.amountReceived) }
}

/** A consultation invoice's subtotal is the fee, or nothing when the consultation is included in a package. */
export function consultationTotals(p: { fee: MoneyString; includedInPackage: boolean; discountType: DiscountType; discount: string; gstPct: string; amountReceived: MoneyString }): InvoiceTotals {
  return invoiceTotals({ ...p, subtotal: p.includedInPackage ? "0.00" : p.fee })
}

/** rate × quantity, less the line discount percentage. */
export function serviceLineAmount(rate: MoneyString, qty: number, discountPct: string): MoneyString {
  const gross = multiplyMoney(rate, String(qty))
  return subMoney(gross, percentOfMoney(gross, discountPct))
}

export function servicesTotals(p: { lines: readonly { amount: MoneyString }[]; discountType: DiscountType; discount: string; gstPct: string; amountReceived: MoneyString }): InvoiceTotals {
  return invoiceTotals({ ...p, subtotal: sumMoney(p.lines.map((l) => l.amount)) })
}

/**
 * Statement rows with a running balance (credits add, debits subtract), in the order given. This is what the MOCK adapter
 * returns as the "statement"; in API mode the balance comes from the backend ("a statement with running balance") and the
 * screen never computes it. Which side a deposit lands on, and the statement's scope (per account or combined), are CONTRACT REQUIRED.
 */
export function bankStatementRows(transactions: readonly BankTransactionRecord[]): BankStatementRow[] {
  let balance: MoneyString = "0.00"
  return transactions.map((transaction) => {
    balance = addMoney(subMoney(balance, transaction.debit), transaction.credit)
    return { transaction, balance }
  })
}

/** Totals by head, in the order the heads are given; heads with nothing spent are left out (as the chart always did). */
export function expenseTotalsFor(expenses: readonly ExpenseRecord[], heads: readonly { id: string; name: string }[]): ExpenseTotals {
  const byCategory = heads
    .map((h) => ({ categoryId: h.id, categoryName: h.name, total: sumMoney(expenses.filter((e) => e.categoryId === h.id).map((e) => e.amount)) }))
    .filter((c) => !isZeroMoney(c.total))
  return { total: sumMoney(expenses.map((e) => e.amount)), byCategory }
}
