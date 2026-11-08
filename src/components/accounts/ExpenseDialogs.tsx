"use client"
import * as React from "react"

import { BillingActionDialog } from "@/components/billing/BillingActionDialog"
import { Field } from "@/components/billing/MoneyForms"
import { showMoney } from "@/components/billing/billingUi"
import { ServerDocument } from "@/components/reportsApi/ServerDocument"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { AC_LIMITS, AC_MODES, accountsApiService, moneySymbol, type AcExpense, type AcMode, type BankAccountRecord, type ExpenseCategoryRecord } from "@/lib/services"
import { canCorrectExpense, modeLabel } from "./acUi"

export const bankLabel = (b: Pick<BankAccountRecord, "bankName" | "accountNo">): string => `${b.bankName} (${b.accountNo})`

/**
 * Record or correct an expense (handoff 8.10). A new expense: date (not in the future), category, description, amount, how it was paid (cash, or a bank mode plus the bank account) and an
 * optional reference; ONE request, and a bank-paid expense posts its bank entry on the server in the same request. A correction changes only date, category, description, amount and
 * reference: how it was paid cannot change. The server refuses a date before the cash drawer's or the account's opening, an inactive category or account, and a stale edit.
 */
export function ExpenseFormDialog({ expense, categories, banks, today, onClose, onDone }: {
  expense: AcExpense | null
  categories: readonly ExpenseCategoryRecord[]
  banks: readonly BankAccountRecord[]
  today: string | null
  onClose: () => void
  onDone: (saved: AcExpense | null) => void
}) {
  const editing = expense !== null
  const [date, setDate] = React.useState(expense?.date ?? today ?? "")
  const [categoryId, setCategoryId] = React.useState(expense?.category.id ?? "")
  const [description, setDescription] = React.useState(expense?.description ?? "")
  const [amount, setAmount] = React.useState(expense?.amount ?? "")
  const [mode, setMode] = React.useState<AcMode>("cash")
  const [bankAccountId, setBankAccountId] = React.useState("")
  const [referenceNo, setReferenceNo] = React.useState(expense?.referenceNo ?? "")
  const activeCategories = categories.filter((c) => c.active !== false || c.id === categoryId)
  const activeBanks = banks.filter((b) => b.active)
  const bankPaid = mode !== "cash"
  const ready = date !== "" && categoryId !== "" && description.trim() !== "" && amount.trim() !== "" && (editing || !bankPaid || bankAccountId !== "")
  return (
    <BillingActionDialog
      wide title={editing ? "Correct expense" : "Record expense"} confirmLabel={editing ? "Save correction" : "Record expense"} pendingLabel="Saving…" canConfirm={ready} onClose={onClose} onDone={onDone}
      description={editing ? "Change the date, category, description, amount or reference. How it was paid cannot be changed; void it and record it again to do that." : "A bank-paid expense also posts its entry on the bank account."}
      onConfirm={() => (editing
        ? accountsApiService.updateExpense(expense, { date, categoryId, description, amount, referenceNo })
        : accountsApiService.createExpense({ date, categoryId, description, amount, mode, bankAccountId: bankPaid ? bankAccountId : undefined, referenceNo }))}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="exp-date" label="Date *"><Input id="exp-date" type="date" className="h-11 rounded-xl" value={date} max={today ?? undefined} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field id="exp-amount" label={`Amount (${moneySymbol()}) *`}><Input id="exp-amount" inputMode="decimal" className="h-11 rounded-xl tabular-nums" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field id="exp-category" label="Category *">
          <Select value={categoryId || undefined} onValueChange={setCategoryId}>
            <SelectTrigger id="exp-category" aria-label="Category" className="h-11 rounded-xl"><SelectValue placeholder="Choose a category" /></SelectTrigger>
            <SelectContent>{activeCategories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field id="exp-reference" label="Reference (cheque or slip number)"><Input id="exp-reference" maxLength={AC_LIMITS.reference} className="h-11 rounded-xl" value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} /></Field>
      </div>
      <Field id="exp-description" label="Description *"><Textarea id="exp-description" maxLength={AC_LIMITS.description} rows={2} className="rounded-xl" value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
      {editing ? (
        <p className="rounded-xl bg-slate-50 p-3 text-sm" data-testid="exp-paid-by">Paid by <strong>{modeLabel(expense.mode)}</strong>{expense.bankAccount?.name ? ` from ${expense.bankAccount.name}` : ""}. This cannot be changed.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="exp-mode" label="Paid by *">
            <Select value={mode} onValueChange={(v) => { setMode(v as AcMode); if (v === "cash") setBankAccountId("") }}>
              <SelectTrigger id="exp-mode" aria-label="Paid by" className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>{AC_MODES.map((m) => <SelectItem key={m} value={m}>{modeLabel(m)}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          {bankPaid && (
            <Field id="exp-bank" label="Bank account *" hint={activeBanks.length === 0 ? "No active bank account. Add one in Master Data > Banks." : undefined}>
              <Select value={bankAccountId || undefined} onValueChange={setBankAccountId}>
                <SelectTrigger id="exp-bank" aria-label="Bank account" className="h-11 rounded-xl"><SelectValue placeholder="Choose an account" /></SelectTrigger>
                <SelectContent>{activeBanks.map((b) => <SelectItem key={b.id} value={b.id}>{bankLabel(b)}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          )}
        </div>
      )}
    </BillingActionDialog>
  )
}

/** Void an expense with a reason (accounts.write). A bank-paid expense's bank entry is reversed by the server. One request. */
export function ExpenseVoidDialog({ expense, onClose, onDone }: { expense: AcExpense; onClose: () => void; onDone: (saved: AcExpense | null) => void }) {
  const [reason, setReason] = React.useState("")
  return (
    <BillingActionDialog
      destructive title="Void expense" confirmLabel="Void expense" pendingLabel="Voiding…" onClose={onClose} onDone={onDone}
      canConfirm={reason.trim().length >= AC_LIMITS.reason.min}
      description={`${showMoney(expense.amount)} on ${expense.date}${expense.description ? `: ${expense.description}` : ""}. A voided expense stays on file, marked voided, and is left out of the totals.`}
      onConfirm={() => accountsApiService.voidExpense(expense.id, reason)}
    >
      <Field id="exp-void-reason" label="Reason *"><Textarea id="exp-void-reason" maxLength={AC_LIMITS.reason.max} rows={2} className="rounded-xl" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
    </BillingActionDialog>
  )
}

/** Everything the server sent about one expense, with the actions. */
export function ExpenseDetailDialog({ expense, categoryName, bankName, canWrite, onClose, onEdit, onVoid }: {
  expense: AcExpense
  categoryName: string | null
  bankName: string | null
  canWrite: boolean
  onClose: () => void
  onEdit: () => void
  onVoid: () => void
}) {
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl" data-testid="expense-dialog">
        <DialogHeader>
          <DialogTitle>Expense of {showMoney(expense.amount)}</DialogTitle>
          <DialogDescription>{expense.date} · {categoryName ?? "No category name"} · {modeLabel(expense.mode)}{bankName ? ` · ${bankName}` : ""}</DialogDescription>
        </DialogHeader>
        {expense.voided && <p role="status" data-testid="expense-voided" className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-bold">Voided{expense.voidReason ? `: ${expense.voidReason}` : ""}</p>}
        <ServerDocument data={expense.raw} title="Expense" exportName="expense" />
        <div className="no-print flex flex-wrap justify-end gap-2">
          <Button variant="ghost" className="rounded-xl font-bold" onClick={onClose}>Close</Button>
          {canWrite && canCorrectExpense(expense) && <Button variant="outline" className="rounded-xl font-bold" onClick={onEdit}>Correct</Button>}
          {canWrite && canCorrectExpense(expense) && <Button variant="destructive" className="rounded-xl font-bold" onClick={onVoid}>Void</Button>}
        </div>
      </DialogContent>
    </Dialog>
  )
}
