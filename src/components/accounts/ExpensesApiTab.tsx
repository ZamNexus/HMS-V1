"use client"
import * as React from "react"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { Plus, Receipt, Search } from "lucide-react"

import { showMoney } from "@/components/billing/billingUi"
import { EmptyState } from "@/components/shared/EmptyState"
import { ErrorState } from "@/components/shared/ErrorState"
import { Pagination } from "@/components/shared/Pagination"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { CACHE_CLASSES } from "@/lib/query/cacheClasses"
import { useDebouncedSearch } from "@/lib/query/useDebouncedSearch"
import { useScopedKey } from "@/lib/query/useScopedKey"
import { pageFromUrl, useUrlFilters } from "@/lib/query/useUrlFilters"
import { AC_MODES, accountsApiService, type AcExpense, type AcExpenseListOptions, type RpPeriod } from "@/lib/services"
import { useAccess } from "@/lib/session/useAccess"
import { useHospitalToday } from "@/lib/usePatientToday"
import { useBankAccounts, useExpenseCategories } from "@/lib/useReferenceData"
import { cn } from "@/lib/utils"
import { modeLabel, nameOf } from "./acUi"
import { ExpenseDetailDialog, ExpenseFormDialog, ExpenseVoidDialog, bankLabel } from "./ExpenseDialogs"

const PAGE_SIZE = 10
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const URL_KEYS = ["page", "category", "mode", "bank", "from", "to", "voided"] as const

/**
 * Expenses (X1, X2; handoff 8.10): GET /expenses, server-paged (10), filtered by dates, category, how it was paid, bank account, search, and "show voided"; the server's own total for the
 * view is shown as sent. Record, correct and void need accounts.write; reading needs accounts.read. \`period\` (Financial Statistics) fixes the dates and hides the date boxes.
 */
export function ExpensesApiTab({ period }: { period?: RpPeriod | null }) {
  const { can } = useAccess()
  const today = useHospitalToday()
  const url = useUrlFilters(URL_KEYS)
  const search = useDebouncedSearch()
  const readable = can("accounts.read")
  const writable = can("accounts.write")
  const categories = useExpenseCategories(readable)
  const banks = useBankAccounts(readable)
  const [open, setOpen] = React.useState<{ kind: "detail" | "edit" | "void"; expense: AcExpense } | { kind: "new" } | null>(null)

  const page = pageFromUrl(url.get("page"))
  const category = categories.items.find((c) => c.id === url.get("category"))?.id
  const bank = banks.items.find((b) => b.id === url.get("bank"))?.id
  const mode = AC_MODES.find((m) => m === url.get("mode"))
  const includeVoided = url.get("voided") === "true"
  const from = period !== undefined ? period?.dateFrom : DATE_RE.test(url.get("from") ?? "") ? (url.get("from") as string) : undefined
  const to = period !== undefined ? period?.dateTo : DATE_RE.test(url.get("to") ?? "") ? (url.get("to") as string) : undefined
  const rangeOk = !from || !to || from <= to
  const options: AcExpenseListOptions = {
    page, pageSize: PAGE_SIZE, search: search.term, categoryId: category, bankAccountId: bank, mode, includeVoided: includeVoided || undefined, dateFrom: rangeOk ? from : undefined, dateTo: rangeOk ? to : undefined,
  }
  const key = useScopedKey("accountsApi", "expenses", { ...options, search: search.term ?? null })
  const list = useQuery({ queryKey: key, queryFn: ({ signal }) => accountsApiService.listExpenses(options, signal), ...CACHE_CLASSES.register, placeholderData: keepPreviousData, enabled: readable && period !== null && rangeOk })
  const items = list.data?.items ?? []
  const categoryNames = React.useMemo(() => new Map(categories.items.map((c) => [c.id, c.name] as const)), [categories.items])
  const bankNames = React.useMemo(() => new Map(banks.items.map((b) => [b.id, bankLabel(b)] as const)), [banks.items])
  const setFilter = (patch: Partial<Record<(typeof URL_KEYS)[number], string | undefined>>) => url.set({ ...patch, page: undefined })
  const filtered = !!search.term || !!category || !!bank || !!mode || includeVoided || (period === undefined && (!!from || !!to))

  if (!readable) return <div className="p-6"><EmptyState icon={Receipt} title="Expenses are not shown to your role" subtitle="Expenses are visible to users who can read accounts." /></div>
  const catName = (e: AcExpense) => nameOf(e.category, categoryNames)
  const bankName = (e: AcExpense) => nameOf(e.bankAccount, bankNames)
  return (
    <div className="space-y-4 p-4" data-testid="expenses-tab">
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input aria-label="Search expenses" placeholder="Search description or reference…" value={search.input} maxLength={100} autoComplete="off" className="h-10 rounded-xl pl-10"
            onChange={(e) => { search.onChange(e.target.value); url.set({ page: undefined }) }} />
        </div>
        <Select value={category ?? "any"} onValueChange={(v) => setFilter({ category: v === "any" ? undefined : v })}>
          <SelectTrigger aria-label="Category" className="h-10 w-48 rounded-xl border-slate-200 bg-slate-50"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="any">Any category</SelectItem>{categories.items.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}{c.active === false ? " (inactive)" : ""}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={mode ?? "any"} onValueChange={(v) => setFilter({ mode: v === "any" ? undefined : v })}>
          <SelectTrigger aria-label="Paid by" className="h-10 w-40 rounded-xl border-slate-200 bg-slate-50"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="any">Any way of paying</SelectItem>{AC_MODES.map((m) => <SelectItem key={m} value={m}>{modeLabel(m)}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={bank ?? "any"} onValueChange={(v) => setFilter({ bank: v === "any" ? undefined : v })}>
          <SelectTrigger aria-label="Bank account" className="h-10 w-52 rounded-xl border-slate-200 bg-slate-50"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="any">Any bank account</SelectItem>{banks.items.map((b) => <SelectItem key={b.id} value={b.id}>{bankLabel(b)}</SelectItem>)}</SelectContent>
        </Select>
        {period === undefined && (
          <>
            <label className="flex flex-col text-[11px] font-bold uppercase tracking-wider text-slate-500">From
              <Input type="date" aria-label="From" className="mt-1 h-10 w-40 rounded-xl" value={from ?? ""} max={to} onChange={(e) => setFilter({ from: e.target.value || undefined })} /></label>
            <label className="flex flex-col text-[11px] font-bold uppercase tracking-wider text-slate-500">To
              <Input type="date" aria-label="To" className="mt-1 h-10 w-40 rounded-xl" value={to ?? ""} min={from} onChange={(e) => setFilter({ to: e.target.value || undefined })} /></label>
          </>
        )}
        <label className="flex h-10 items-center gap-2 text-sm font-medium"><input type="checkbox" aria-label="Show voided" checked={includeVoided} onChange={(e) => setFilter({ voided: e.target.checked ? "true" : undefined })} /> Show voided</label>
        {filtered && <Button variant="ghost" className="h-10 rounded-xl font-bold text-slate-500" onClick={() => { search.onChange(""); url.set({ category: undefined, mode: undefined, bank: undefined, from: undefined, to: undefined, voided: undefined, page: undefined }) }}>Clear filters</Button>}
        {writable && <Button className="ml-auto h-10 rounded-xl bg-[#0F2A4D] px-5 font-bold text-white hover:bg-[#16375F]" onClick={() => setOpen({ kind: "new" })}><Plus className="mr-2 h-4 w-4" /> Record expense</Button>}
      </div>

      {period === null ? <EmptyState icon={Receipt} title="Choose a valid period" subtitle="The list reads the period chosen above." />
        : !rangeOk ? <div data-testid="expenses-range-problem"><EmptyState icon={Receipt} title="Choose a valid period" subtitle="The start date is after the end date." /></div>
        : list.isError && !list.data ? <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        : list.isPending ? <div className="space-y-3" role="status" aria-label="Loading expenses">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}</div>
        : items.length === 0 ? <EmptyState icon={Receipt} title={filtered ? "No expense matches" : "No expenses recorded"} subtitle={filtered ? "Try different filters." : writable ? "Record the first expense with the button above." : undefined} />
        : (
          <>
            {list.data?.totalAmount && (
              <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm ring-1 ring-black/5" data-testid="expenses-total">
                <span className="text-slate-500">Total of the {list.data.total} {list.data.total === 1 ? "expense" : "expenses"} in this view </span><span className="font-black tabular-nums">{showMoney(list.data.totalAmount)}</span>
              </div>
            )}
            <div className="overflow-x-auto rounded-2xl ring-1 ring-black/5">
              <Table>
                <TableHeader><TableRow className="bg-slate-50/60 hover:bg-slate-50/60">
                  <TableHead className="px-4">Date</TableHead><TableHead>Description</TableHead><TableHead>Paid by</TableHead><TableHead>Reference</TableHead><TableHead className="pr-4 text-right">Amount</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {items.map((e) => (
                    <TableRow key={e.id} data-testid={`expense-row-${e.id}`} data-voided={e.voided ? "true" : undefined} className={cn("cursor-pointer hover:bg-slate-50", e.voided && "bg-slate-50/70 text-slate-400")} onClick={() => setOpen({ kind: "detail", expense: e })}>
                      <TableCell className="px-4"><button type="button" className="font-mono text-xs font-bold text-[#0891B2] hover:underline focus-visible:underline" onClick={(ev) => { ev.stopPropagation(); setOpen({ kind: "detail", expense: e }) }}>{e.date}</button></TableCell>
                      <TableCell><div className={cn("font-semibold", e.voided && "line-through")}>{e.description || "—"}</div><div className="text-xs text-slate-500">{catName(e) ?? "—"}{e.voided ? " · voided" : ""}</div></TableCell>
                      <TableCell><div>{modeLabel(e.mode)}</div>{bankName(e) && <div className="text-xs text-slate-500">{bankName(e)}</div>}</TableCell>
                      <TableCell className="font-mono text-xs">{e.referenceNo ?? "—"}</TableCell>
                      <TableCell className="pr-4 text-right font-semibold tabular-nums">{showMoney(e.amount)}{e.voided && <div><StatusBadge status="Voided" /></div>}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      {list.data && (items.length > 0 || page > 1) && <Pagination page={page} pageSize={PAGE_SIZE} total={list.data.total} onPageChange={(n) => url.set({ page: n === 1 ? undefined : String(n) })} itemLabel="expenses" />}

      {open?.kind === "detail" && <ExpenseDetailDialog expense={open.expense} categoryName={catName(open.expense)} bankName={bankName(open.expense)} canWrite={writable} onClose={() => setOpen(null)} onEdit={() => setOpen({ kind: "edit", expense: open.expense })} onVoid={() => setOpen({ kind: "void", expense: open.expense })} />}
      {open?.kind === "new" && <ExpenseFormDialog expense={null} categories={categories.items} banks={banks.items} today={today} onClose={() => setOpen(null)} onDone={() => undefined} />}
      {open?.kind === "edit" && <ExpenseFormDialog expense={open.expense} categories={categories.items} banks={banks.items} today={today} onClose={() => setOpen(null)} onDone={() => undefined} />}
      {open?.kind === "void" && <ExpenseVoidDialog expense={open.expense} onClose={() => setOpen(null)} onDone={() => undefined} />}
    </div>
  )
}


