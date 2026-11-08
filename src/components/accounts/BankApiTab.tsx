"use client"
import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { Landmark, Plus } from "lucide-react"

import { BillingActionDialog } from "@/components/billing/BillingActionDialog"
import { Field } from "@/components/billing/MoneyForms"
import { showMoney } from "@/components/billing/billingUi"
import { RecordsTable, ServerDocument } from "@/components/reportsApi/ServerDocument"
import { EmptyState } from "@/components/shared/EmptyState"
import { ErrorState } from "@/components/shared/ErrorState"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { isUlid } from "@/lib/api/convert"
import { CACHE_CLASSES } from "@/lib/query/cacheClasses"
import { useScopedKey } from "@/lib/query/useScopedKey"
import { AC_ENTERABLE_KINDS, AC_LIMITS, accountsApiService, moneySymbol, type AcBankKind, type RpPeriod } from "@/lib/services"
import { useAccess } from "@/lib/session/useAccess"
import { useHospitalToday } from "@/lib/usePatientToday"
import { useBankAccounts } from "@/lib/useReferenceData"
import { STATEMENT_PRIORITY, canVoidBankEntry, entryVoided, kindLabel } from "./acUi"
import { bankLabel } from "./ExpenseDialogs"

const monthStart = (day: string) => `${day.slice(0, 7)}-01`

/** The cash drawer's opening (X5): GET /cash-drawer/opening; the admin sets it ONCE at go-live (PUT, settings.write) and each day's cash is worked out from it by the server. */
function DrawerCard() {
  const { can } = useAccess()
  const today = useHospitalToday()
  const key = useScopedKey("accountsApi", "drawer")
  const q = useQuery({ queryKey: key, queryFn: ({ signal }) => accountsApiService.drawerOpening(signal), ...CACHE_CLASSES.register })
  const [setting, setSetting] = React.useState(false)
  const [amount, setAmount] = React.useState("")
  const [date, setDate] = React.useState("")
  return (
    <section aria-label="Cash drawer opening" className="rounded-2xl bg-white p-5 ring-1 ring-black/5" data-testid="drawer-card">
      <h2 className="text-sm font-black uppercase tracking-wider text-slate-500">Cash drawer opening</h2>
      {q.isPending ? <Skeleton className="mt-3 h-10 w-64 rounded-xl" role="status" aria-label="Loading the cash drawer" />
        : q.isError ? <div className="mt-3"><ErrorState error={q.error} onRetry={() => void q.refetch()} /></div>
        : q.data.isSet ? (
          <p className="mt-2 text-sm" data-testid="drawer-set">Opening cash <span className="font-black tabular-nums">{showMoney(q.data.amount as string)}</span>{q.data.date ? ` on ${q.data.date}` : ""}. It was set once; each day&apos;s cash is worked out from it. Nobody types today&apos;s cash.</p>
        ) : (
          <div className="mt-2 space-y-3">
            <p className="text-sm text-slate-600" data-testid="drawer-unset">The opening cash has not been set. The administrator sets it once at go-live; until then the cash drawer cannot be worked out.</p>
            {can("settings.write") && <Button className="rounded-xl bg-[#0F2A4D] font-bold text-white hover:bg-[#16375F]" onClick={() => { setAmount(""); setDate(today ?? ""); setSetting(true) }}>Set the opening cash</Button>}
          </div>
        )}
      {setting && (
        <BillingActionDialog
          title="Set the opening cash" confirmLabel="Set opening cash" pendingLabel="Saving…" canConfirm={amount.trim() !== "" && date !== ""} onClose={() => setSetting(false)} onDone={() => undefined}
          description="This is done once, at go-live. Once it is set it cannot be set again, and every day's cash is worked out from it."
          onConfirm={() => accountsApiService.setDrawerOpening({ amount, date })}
        >
          <Field id="drawer-amount" label={`Cash in the drawer (${moneySymbol()}) *`}><Input id="drawer-amount" inputMode="decimal" className="h-11 rounded-xl tabular-nums" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          <Field id="drawer-date" label="As of *"><Input id="drawer-date" type="date" className="h-11 rounded-xl" value={date} max={today ?? undefined} onChange={(e) => setDate(e.target.value)} /></Field>
        </BillingActionDialog>
      )}
    </section>
  )
}

/** Record an entry on a bank account (X4): deposit, withdrawal, other credit or debit, or an opening balance. The "expense" kind is posted by the server and is not offered. One request. */
function BankEntryDialog({ accountId, accounts, today, onClose }: { accountId: string; accounts: readonly { id: string; label: string }[]; today: string | null; onClose: () => void }) {
  const [account, setAccount] = React.useState(accountId)
  const [date, setDate] = React.useState(today ?? "")
  const [kind, setKind] = React.useState<AcBankKind>("deposit")
  const [amount, setAmount] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [reference, setReference] = React.useState("")
  return (
    <BillingActionDialog
      title="Record a bank entry" confirmLabel="Record entry" pendingLabel="Saving…" canConfirm={account !== "" && date !== "" && amount.trim() !== "" && description.trim() !== ""} onClose={onClose} onDone={() => undefined}
      description="A bank entry is never edited: if it is wrong, void it and enter it again. Expenses paid from the bank post their own entry."
      onConfirm={() => accountsApiService.createBankTransaction({ bankAccountId: account, date, kind, amount, description, referenceNo: reference })}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="bank-account" label="Account *">
          <Select value={account || undefined} onValueChange={setAccount}>
            <SelectTrigger id="bank-account" aria-label="Account" className="h-11 rounded-xl"><SelectValue placeholder="Choose an account" /></SelectTrigger>
            <SelectContent>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field id="bank-kind" label="Kind *">
          <Select value={kind} onValueChange={(v) => setKind(v as AcBankKind)}>
            <SelectTrigger id="bank-kind" aria-label="Kind" className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
            <SelectContent>{AC_ENTERABLE_KINDS.map((k) => <SelectItem key={k} value={k}>{kindLabel(k)}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field id="bank-date" label="Date *"><Input id="bank-date" type="date" className="h-11 rounded-xl" value={date} max={today ?? undefined} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field id="bank-amount" label={`Amount (${moneySymbol()}) *`}><Input id="bank-amount" inputMode="decimal" className="h-11 rounded-xl tabular-nums" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
      </div>
      <Field id="bank-description" label="Description *"><Textarea id="bank-description" maxLength={AC_LIMITS.description} rows={2} className="rounded-xl" value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
      <Field id="bank-reference" label="Reference"><Input id="bank-reference" maxLength={AC_LIMITS.reference} className="h-11 rounded-xl" value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
    </BillingActionDialog>
  )
}

function VoidEntryDialog({ id, summary, onClose }: { id: string; summary: string; onClose: () => void }) {
  const [reason, setReason] = React.useState("")
  return (
    <BillingActionDialog
      destructive title="Void bank entry" confirmLabel="Void entry" pendingLabel="Voiding…" canConfirm={reason.trim().length >= AC_LIMITS.reason.min} onClose={onClose} onDone={() => undefined}
      description={`${summary}. A voided entry stays on file, marked voided; enter it again if it was only wrong.`}
      onConfirm={() => accountsApiService.voidBankTransaction(id, reason)}
    >
      <Field id="bank-void-reason" label="Reason *"><Textarea id="bank-void-reason" maxLength={AC_LIMITS.reason.max} rows={2} className="rounded-xl" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
    </BillingActionDialog>
  )
}

/**
 * Bank (X3, X4; handoff 8.10): every account's balance and the total (GET /bank-balances), a statement for one account and period with its opening, entries with the running balance and
 * closing (GET /bank-accounts/{id}/statement), entering and voiding entries (accounts.write), and the cash drawer's opening. The statement is shown as the server sent it.
 * \`period\` (Financial Statistics) fixes the statement's dates.
 */
export function BankApiTab({ period }: { period?: RpPeriod | null }) {
  const { can } = useAccess()
  const today = useHospitalToday()
  const readable = can("accounts.read")
  const writable = can("accounts.write")
  const banks = useBankAccounts(readable)
  const [chosen, setChosen] = React.useState("")
  const [from, setFrom] = React.useState("")
  const [to, setTo] = React.useState("")
  const [dialog, setDialog] = React.useState<{ kind: "entry" } | { kind: "void"; id: string; summary: string } | null>(null)
  const account = banks.items.some((b) => b.id === chosen) ? chosen : (banks.items.find((b) => b.active) ?? banks.items[0])?.id ?? ""
  const dateFrom = period !== undefined ? period?.dateFrom : (from || (today ? monthStart(today) : ""))
  const dateTo = period !== undefined ? period?.dateTo : (to || today || "")
  const rangeOk = !!dateFrom && !!dateTo && dateFrom <= dateTo
  const balKey = useScopedKey("accountsApi", "balances")
  const balances = useQuery({ queryKey: balKey, queryFn: ({ signal }) => accountsApiService.bankBalances(signal), ...CACHE_CLASSES.register, enabled: readable })
  const stKey = useScopedKey("accountsApi", "statement", account, dateFrom ?? null, dateTo ?? null)
  const statement = useQuery({ queryKey: stKey, queryFn: ({ signal }) => accountsApiService.bankStatement(account, { dateFrom: dateFrom as string, dateTo: dateTo as string }, signal), ...CACHE_CLASSES.register, enabled: readable && account !== "" && rangeOk && period !== null })
  const accounts = banks.items.map((b) => ({ id: b.id, label: bankLabel(b) + (b.active ? "" : " (inactive)") }))
  if (!readable) return <div className="p-6"><EmptyState icon={Landmark} title="Bank is not shown to your role" subtitle="Bank accounts are visible to users who can read accounts." /></div>
  return (
    <div className="space-y-6 p-4" data-testid="bank-tab">
      {period === undefined && <DrawerCard />}

      <section aria-label="Bank balances" data-testid="bank-balances" className="space-y-3">
        <h2 className="text-sm font-black uppercase tracking-wider text-slate-500">Balances</h2>
        {balances.isPending ? <Skeleton className="h-24 w-full rounded-2xl" role="status" aria-label="Loading the balances" /> : balances.isError ? <ErrorState error={balances.error} onRetry={() => void balances.refetch()} /> : <ServerDocument data={balances.data} title="Bank balances" exportName="bank-balances" />}
      </section>

      <section aria-label="Statement" className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <h2 className="mr-auto text-sm font-black uppercase tracking-wider text-slate-500">Statement</h2>
          <Select value={account || undefined} onValueChange={setChosen}>
            <SelectTrigger aria-label="Statement account" className="h-10 w-64 rounded-xl border-slate-200 bg-slate-50"><SelectValue placeholder={banks.loading ? "Loading accounts…" : "No bank account"} /></SelectTrigger>
            <SelectContent>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>)}</SelectContent>
          </Select>
          {period === undefined && (
            <>
              <label className="flex flex-col text-[11px] font-bold uppercase tracking-wider text-slate-500">From<Input type="date" aria-label="Statement from" className="mt-1 h-10 w-40 rounded-xl" value={dateFrom ?? ""} max={dateTo} onChange={(e) => setFrom(e.target.value)} /></label>
              <label className="flex flex-col text-[11px] font-bold uppercase tracking-wider text-slate-500">To<Input type="date" aria-label="Statement to" className="mt-1 h-10 w-40 rounded-xl" value={dateTo ?? ""} min={dateFrom} onChange={(e) => setTo(e.target.value)} /></label>
            </>
          )}
          {writable && account !== "" && <Button className="h-10 rounded-xl bg-[#0F2A4D] px-5 font-bold text-white hover:bg-[#16375F]" onClick={() => setDialog({ kind: "entry" })}><Plus className="mr-2 h-4 w-4" /> Record entry</Button>}
        </div>
        {banks.items.length === 0 && !banks.loading ? <EmptyState icon={Landmark} title="No bank account yet" subtitle="Add one in Master Data > Banks." />
          : !rangeOk ? <EmptyState icon={Landmark} title="Choose a valid period" subtitle="The statement needs a start date that is not after the end date." />
          : statement.isPending ? <Skeleton className="h-40 w-full rounded-2xl" role="status" aria-label="Loading the statement" />
          : statement.isError ? <ErrorState error={statement.error} onRetry={() => void statement.refetch()} />
          : (
            <div className="space-y-4" data-testid="statement">
              {(statement.data.opening !== null || statement.data.closing !== null) && (
                <div className="grid grid-cols-2 gap-3">
                  {statement.data.opening !== null && <div className="rounded-2xl bg-white p-4 ring-1 ring-black/5"><p className="text-[11px] font-black uppercase tracking-wider text-slate-500">Opening</p><p className="mt-1 text-xl font-black tabular-nums" data-testid="statement-opening">{showMoney(statement.data.opening)}</p></div>}
                  {statement.data.closing !== null && <div className="rounded-2xl bg-white p-4 ring-1 ring-black/5"><p className="text-[11px] font-black uppercase tracking-wider text-slate-500">Closing</p><p className="mt-1 text-xl font-black tabular-nums" data-testid="statement-closing">{showMoney(statement.data.closing)}</p></div>}
                </div>
              )}
              {statement.data.entries === null ? <ServerDocument data={statement.data.raw} title="Statement" exportName="bank-statement" />
                : statement.data.entries.length === 0 ? <EmptyState icon={Landmark} title="No entries in this period" />
                : (
                  <RecordsTable rows={statement.data.entries} priority={STATEMENT_PRIORITY} testId="statement-entries"
                    renderAction={(row) => {
                      const id = typeof row.id === "string" && isUlid(row.id) ? row.id : null
                      const kind = String(row.kind ?? row.type ?? "")
                      if (!writable || !id || !canVoidBankEntry(kind, entryVoided(row))) return entryVoided(row) ? <span className="text-xs font-bold text-slate-400">Voided</span> : null
                      const summary = `${String(row.description ?? kindLabel(kind))}${typeof row.date === "string" ? ` on ${row.date}` : ""}`
                      return <Button variant="ghost" size="sm" className="h-8 text-xs font-bold" aria-label={`Void entry ${summary}`} onClick={() => setDialog({ kind: "void", id, summary })}>Void</Button>
                    }} />
                )}
            </div>
          )}
      </section>

      {dialog?.kind === "entry" && <BankEntryDialog accountId={account} accounts={accounts.filter((a) => !a.label.endsWith("(inactive)"))} today={today} onClose={() => setDialog(null)} />}
      {dialog?.kind === "void" && <VoidEntryDialog id={dialog.id} summary={dialog.summary} onClose={() => setDialog(null)} />}
    </div>
  )
}
