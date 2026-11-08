import type { AcBankKind, AcExpense, AcMode, AcRef } from "@/lib/services"

// Pure rules of the expense, bank and cash-drawer screens (handoff 8.10).
export const MODE_LABEL: Record<AcMode, string> = { cash: "Cash", bank_transfer: "Bank transfer", cheque: "Cheque", card: "Card" }
export const KIND_LABEL: Record<AcBankKind | "expense", string> = {
  opening_balance: "Opening balance", deposit: "Deposit", withdrawal: "Withdrawal", other_credit: "Other credit", other_debit: "Other debit", expense: "Expense (posted automatically)",
}
export const modeLabel = (mode: string): string => (mode in MODE_LABEL ? MODE_LABEL[mode as AcMode] : mode || "—")
export const kindLabel = (kind: string): string => (kind in KIND_LABEL ? KIND_LABEL[kind as AcBankKind | "expense"] : kind || "—")

/** A name for a reference: the one the server sent, else the one in the list the screen already holds, else nothing (never a made-up label). */
export function nameOf(r: AcRef | null, lookup: ReadonlyMap<string, string>): string | null {
  if (!r) return null
  if (r.name) return r.name
  return r.id ? (lookup.get(r.id) ?? null) : null
}

/** An expense that is voided can be neither corrected nor voided again; a cash/bank mode cannot change after the fact (handoff 8.10). */
export const canCorrectExpense = (e: Pick<AcExpense, "voided">): boolean => !e.voided
export const canVoidExpense = canCorrectExpense

/**
 * A bank entry can be voided and re-entered, never edited. The \`expense\` kind is the one posted by a bank-paid expense: it is reversed by voiding THE EXPENSE
 * (the server refuses a direct void, VOID_THROUGH_EXPENSE), so the button is not offered for it.
 */
export const canVoidBankEntry = (kind: string, voided: boolean): boolean => !voided && kind !== "expense"

/** The columns a statement shows first when the server sends them; the rest follow in the order they arrived. */
export const STATEMENT_PRIORITY = ["date", "kind", "type", "description", "referenceNo", "reference", "debit", "credit", "amount", "runningBalance", "balance"] as const

/** Is an entry of a statement voided, by any of the usual markers? */
export const entryVoided = (e: Record<string, unknown>): boolean => e.voided === true || (typeof e.voidedAt === "string" && e.voidedAt !== "") || e.status === "voided"
